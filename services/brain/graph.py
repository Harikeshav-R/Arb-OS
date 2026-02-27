"""LangGraph StateGraph for pairwise market relationship analysis.

Implements a 3-node pipeline:

    START → validate_pair → classify_relationship → persist_result → END

Each node is a plain async function that receives and returns state updates.
The graph is compiled per analysis request (or per pair during a scan)
via ``build_analysis_graph`` to capture the current DB session and settings.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ibm import ChatWatsonx
from langgraph.constants import END, START
from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import BrainSettings
from models import Market, Relationship, RelationshipOutput
from prompts import SYSTEM_PROMPT, format_user_prompt


# ── State Schema ──────────────────────────────────────────────────────────────


class AnalysisState(TypedDict, total=False):
    """Shared state flowing through the analysis graph."""

    # Inputs (set before invocation)
    condition_id_a: str
    condition_id_b: str

    # Populated during graph execution
    market_a: dict | None
    market_b: dict | None
    relationship: dict | None  # serialised RelationshipOutput
    error: str | None
    persisted: bool


# ── Node Functions ────────────────────────────────────────────────────────────


async def validate_pair(state: AnalysisState, *, session: AsyncSession) -> dict:
    """Fetch both markets from the DB and validate the pair.

    Sets ``error`` if the pair is invalid (missing, closed, identical).
    """
    cid_a = state["condition_id_a"]
    cid_b = state["condition_id_b"]

    if cid_a == cid_b:
        logger.bind(condition_id=cid_a).warning("validate_pair_identical")
        return {"error": "Cannot analyse a market against itself."}

    result_a = await session.execute(select(Market).where(Market.condition_id == cid_a))
    market_a = result_a.scalars().first()

    result_b = await session.execute(select(Market).where(Market.condition_id == cid_b))
    market_b = result_b.scalars().first()

    if market_a is None:
        return {"error": f"Market {cid_a} not found in local DB. Sync markets first."}
    if market_b is None:
        return {"error": f"Market {cid_b} not found in local DB. Sync markets first."}

    if not market_a.active or market_a.closed:
        return {"error": f"Market {cid_a} is closed or inactive."}
    if not market_b.active or market_b.closed:
        return {"error": f"Market {cid_b} is closed or inactive."}

    logger.bind(
        condition_id_a=cid_a,
        condition_id_b=cid_b,
        question_a=market_a.question,
        question_b=market_b.question,
    ).info("validate_pair_ok")

    return {
        "market_a": {
            "condition_id": market_a.condition_id,
            "question": market_a.question,
            "description": market_a.description,
            "volume": market_a.volume,
        },
        "market_b": {
            "condition_id": market_b.condition_id,
            "question": market_b.question,
            "description": market_b.description,
            "volume": market_b.volume,
        },
        "error": None,
    }


async def classify_relationship(
        state: AnalysisState,
        *,
        llm: ChatWatsonx,
        confidence_threshold: float,
) -> dict:
    """Invoke the LLM to classify the logical relationship between two markets."""
    market_a = state["market_a"]
    market_b = state["market_b"]

    if market_a is None or market_b is None:
        return {"error": "Markets not loaded — validation may have been skipped."}

    user_prompt = format_user_prompt(
        question_a=market_a["question"],
        description_a=market_a.get("description"),
        question_b=market_b["question"],
        description_b=market_b.get("description"),
    )

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ]

    logger.bind(
        question_a=market_a["question"][:80],
        question_b=market_b["question"][:80],
    ).info("classify_invoking_llm")

    try:
        structured_llm = llm.with_structured_output(RelationshipOutput)
        result: RelationshipOutput = await structured_llm.ainvoke(messages)
    except Exception:
        logger.exception("classify_llm_error")
        # Fallback: raw text invocation + manual parse
        try:
            raw_response = await llm.ainvoke(messages)
            try:
                result = RelationshipOutput.model_validate_json(raw_response.content)
            except Exception:
                logger.bind(content=raw_response.content[:200]).error("classify_parse_fallback_failed")
                return {
                    "relationship": RelationshipOutput(
                        relation="INDEPENDENT",
                        direction="NONE",
                        confidence=0.0,
                        reasoning="LLM output could not be parsed.",
                    ).model_dump(),
                }
        except Exception:
            logger.exception("classify_raw_llm_failed_completely")
            return {
                "relationship": RelationshipOutput(
                    relation="INDEPENDENT",
                    direction="NONE",
                    confidence=0.0,
                    reasoning="LLM API completely failed.",
                ).model_dump(),
            }

    # Enforce confidence threshold
    if result.confidence < confidence_threshold:
        logger.bind(
            confidence=result.confidence,
            threshold=confidence_threshold,
        ).info("classify_below_threshold")
        result = RelationshipOutput(
            relation="INDEPENDENT",
            direction="NONE",
            confidence=result.confidence,
            reasoning=f"Below confidence threshold "
                      f"({result.confidence:.2f} < "
                      f"{confidence_threshold:.2f}). Original: {result.reasoning}",
        )

    logger.bind(
        relation=result.relation,
        direction=result.direction,
        confidence=result.confidence,
    ).info("classify_result")

    return {"relationship": result.model_dump()}


async def persist_result(state: AnalysisState, *, session: AsyncSession) -> dict:
    """Upsert the classified relationship into the database.

    Skips persistence for ``INDEPENDENT`` classifications.
    """
    rel_data = state.get("relationship")
    if rel_data is None:
        return {"persisted": False}

    relation = rel_data["relation"]
    if relation == "INDEPENDENT":
        logger.info("persist_skipped_independent")
        return {"persisted": False}

    cid_a = state["condition_id_a"]
    cid_b = state["condition_id_b"]

    # Determine canonical parent/child ordering based on direction
    direction = rel_data["direction"]
    persisted_direction = direction
    if direction == "B_TO_A":
        parent_cid, child_cid = cid_b, cid_a
        persisted_direction = "A_TO_B"
    elif direction == "NONE":
        # Canonicalize undirected relationships so (A, B) and (B, A) are treated the same
        parent_cid, child_cid = sorted([cid_a, cid_b])
    else:
        parent_cid, child_cid = cid_a, cid_b

    # Check for existing relationship
    existing_result = await session.execute(
        select(Relationship).where(
            Relationship.parent_condition_id == parent_cid,
            Relationship.child_condition_id == child_cid,
        )
    )
    existing = existing_result.scalars().first()

    now = datetime.now(UTC)

    if existing:
        existing.logic_type = relation
        existing.direction = persisted_direction
        existing.confidence = rel_data["confidence"]
        existing.reasoning = rel_data["reasoning"]
        existing.is_active = True
        existing.updated_at = now
        logger.bind(parent=parent_cid, child=child_cid).info("persist_updated")
    else:
        new_rel = Relationship(
            parent_condition_id=parent_cid,
            child_condition_id=child_cid,
            logic_type=relation,
            direction=persisted_direction,
            confidence=rel_data["confidence"],
            reasoning=rel_data["reasoning"],
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        session.add(new_rel)
        logger.bind(parent=parent_cid, child=child_cid).info("persist_created")

    await session.commit()
    return {"persisted": True}


# ── Routing ───────────────────────────────────────────────────────────────────


def route_after_validation(state: AnalysisState) -> str:
    """Conditional edge: skip LLM if validation failed."""
    if state.get("error"):
        return END
    return "classify_relationship"


# ── Graph Builder ─────────────────────────────────────────────────────────────


def build_analysis_graph(
        settings: BrainSettings,
        session: AsyncSession,
) -> CompiledStateGraph:
    """Construct and compile the relationship analysis LangGraph.

    The *session* and *llm* are closed over by the node functions so that the
    compiled graph can be invoked with just the ``AnalysisState`` input.
    """
    llm = ChatWatsonx(
        model_id=settings.watsonx_model_id,
        url=settings.watsonx_url,
        project_id=settings.watsonx_project_id,
        apikey=settings.watsonx_apikey.get_secret_value() if settings.watsonx_apikey else None,
        params={
            "temperature": settings.brain_llm_temperature,
            "max_tokens": settings.brain_llm_max_tokens,
        },
    )

    # Wrap node functions with closed-over dependencies
    async def _validate(state: AnalysisState) -> dict:
        return await validate_pair(state, session=session)

    async def _classify(state: AnalysisState) -> dict:
        return await classify_relationship(
            state,
            llm=llm,
            confidence_threshold=settings.brain_confidence_threshold,
        )

    async def _persist(state: AnalysisState) -> dict:
        return await persist_result(state, session=session)

    builder = StateGraph(AnalysisState)
    builder.add_node("validate_pair", _validate)
    builder.add_node("classify_relationship", _classify)
    builder.add_node("persist_result", _persist)

    builder.add_edge(START, "validate_pair")
    builder.add_conditional_edges(
        "validate_pair",
        route_after_validation,
        {"classify_relationship": "classify_relationship", END: END},
    )
    builder.add_edge("classify_relationship", "persist_result")
    builder.add_edge("persist_result", END)

    return builder.compile()
