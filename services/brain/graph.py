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

from langchain_core.messages import (
    HumanMessage,
    SystemMessage,
)
from langchain_ibm import ChatWatsonx
from langgraph.constants import END, START
from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph
from loguru import logger
from sqlalchemy import select
from sqlmodel.ext.asyncio.session import AsyncSession

from config import BrainSettings
from gamma_client import GammaClient
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


# ── Chat Graph ────────────────────────────────────────────────────────────────


class ChatState(TypedDict, total=False):
    """Shared state flowing through the chat graph."""

    # Inputs
    message: str
    history: list[dict]

    # Populated during graph execution
    intent: str | None
    search_keywords: list[str]
    context_data: str | None  # Stringified context for response generation
    markets_found: int
    graph_updated: bool
    response: str | None
    error: str | None


async def parse_intent(
    state: ChatState,
    *,
    llm: ChatWatsonx,
) -> dict:
    """Classify user intent from their chat message."""
    from prompts import CHAT_INTENT_PROMPT

    user_message = state["message"]
    intent_prompt = CHAT_INTENT_PROMPT.format(message=user_message)

    try:
        from models import ChatIntent as ChatIntentModel

        structured_llm = llm.with_structured_output(ChatIntentModel)
        result = await structured_llm.ainvoke([
            SystemMessage(content="Classify the user's intent."),
            HumanMessage(content=intent_prompt),
        ])
        logger.bind(
            intent=result.intent,
            keywords=result.search_keywords,
        ).info("chat_intent_parsed")
        return {
            "intent": result.intent,
            "search_keywords": result.search_keywords,
        }
    except Exception:
        logger.exception("chat_intent_parse_failed")
        # Fallback: treat as general question
        return {
            "intent": "GENERAL_QUESTION",
            "search_keywords": [],
        }


async def _sync_from_gamma(
        keywords: list[str],
        session: AsyncSession,
        settings: BrainSettings
    ) -> list[Market]:
    """Fetch markets matching the keywords from Gamma and ingest them."""
    if not keywords:
        return []

    query = " ".join(keywords).lower()
    logger.bind(query=query).info("chat_gamma_sync_triggered")

    gc = GammaClient(settings.brain_gamma_api_base_url)
    try:
        raw_markets = await gc.fetch_markets(query=query, limit=20)
    except Exception:
        logger.exception("chat_gamma_sync_failed")
        return []
    finally:
        await gc.aclose()

    if not raw_markets:
        return []

    now = datetime.now()
    ingested = []

    for raw in raw_markets:
        condition_id = raw.get("conditionId") or raw.get("condition_id")
        if not condition_id:
            continue

        result = await session.execute(
            select(Market).where(Market.condition_id == condition_id)
        )
        existing = result.scalars().first()

        clob_token_ids: list[str] = []
        tokens = raw.get("tokens") or raw.get("clobTokenIds")
        if isinstance(tokens, list):
            for t in tokens:
                if isinstance(t, dict):
                    token_id = t.get("token_id") or t.get("tokenId")
                    if token_id:
                        clob_token_ids.append(str(token_id))
                elif isinstance(t, str):
                    clob_token_ids.append(t)

        def parse_bool(val, default):
            if isinstance(val, bool):
                return val
            if isinstance(val, str):
                return val.lower() in ("true", "1", "yes")
            return bool(val) if val is not None else default

        market_data = {
            "question": raw.get("question", ""),
            "question_id": raw.get("questionID") or raw.get("question_id"),
            "description": raw.get("description"),
            "slug": raw.get("slug"),
            "neg_risk": parse_bool(raw.get("negRisk"), False),
            "active": parse_bool(raw.get("active"), True),
            "closed": parse_bool(raw.get("closed"), False),
            "volume": float(raw.get("volume", 0) or 0),
            "end_date": raw.get("endDate") or raw.get("end_date"),
            "event_id": raw.get("eventId") or raw.get("event_id"),
            "event_title": raw.get("eventTitle") or raw.get("event_title")
            or raw.get("groupItemTitle"),
            "clob_token_ids": clob_token_ids,
            "updated_at": now,
        }

        if existing:
            for key, value in market_data.items():
                setattr(existing, key, value)
            ingested.append(existing)
        else:
            new_market = Market(condition_id=condition_id, **market_data)
            session.add(new_market)
            ingested.append(new_market)

    await session.commit()
    return ingested


async def execute_action(
    state: ChatState,
    *,
    session: AsyncSession,
    graph_manager: object,
    settings: BrainSettings,
) -> dict:
    """Execute the action based on classified intent."""
    intent = state.get("intent", "GENERAL_QUESTION")
    keywords = state.get("search_keywords", [])

    if intent == "SEARCH_MARKETS":
        # Search for markets matching keywords
        keyword_filter = " ".join(keywords).lower() if keywords else ""
        result = await session.execute(
            select(Market)
            .where(Market.active.is_(True), Market.closed.is_(False))
            .order_by(Market.volume.desc())
            .limit(50)
        )
        all_markets = result.scalars().all()

        # Filter locally by keywords for flexible matching
        matched = []
        for m in all_markets:
            searchable = f"{m.question} {m.description or ''} {m.event_title or ''}".lower()
            if not keyword_filter or all(kw.lower() in searchable for kw in keywords):
                matched.append(m)

        logger.bind(keywords=keywords, locals_matched=len(matched)).info("chat_local_market_search")

        if not matched and keywords:
            # Sync directly from Gamma if local DB misses the keywords
            matched = await _sync_from_gamma(keywords, session, settings)

        if not matched:
            matched = all_markets[:10]  # Fallback to top markets

        market_summaries = []
        for m in matched[:15]:
            market_summaries.append(
                f"- {m.question} (vol: ${m.volume:,.0f}, id: {m.condition_id[:12]}…)"
            )

        context = f"Found {len(matched)} markets"
        if keywords:
            context += f" matching '{' '.join(keywords)}'"
        context += ":\n" + "\n".join(market_summaries)

        return {
            "context_data": context,
            "markets_found": len(matched),
        }

    elif intent == "SCAN_RELATIONSHIPS":
        # Return current scan info + relationship summary
        stats = await graph_manager.get_stats()
        rels = await graph_manager.get_all_relationships()

        rel_summaries = []
        for r in rels[:10]:
            rel_summaries.append(
                f"- {r['parent_condition_id'][:12]}… → "
                f"{r['child_condition_id'][:12]}… "
                f"({r['logic_type']}, conf: {r['confidence']:.2f})"
            )

        context = (
            f"Graph has {stats.total_markets} markets, "
            f"{stats.total_relationships} relationships "
            f"({stats.total_implies} IMPLIES, "
            f"{stats.total_mutually_exclusive} MUTUALLY_EXCLUSIVE), "
            f"{stats.connected_components} connected components.\n"
        )
        if rel_summaries:
            context += "Recent relationships:\n" + "\n".join(rel_summaries)
        else:
            context += "No relationships discovered yet. Trigger a scan to find some."

        return {
            "context_data": context,
            "graph_updated": False,
        }

    elif intent == "GRAPH_STATUS":
        stats = await graph_manager.get_stats()
        context = (
            f"Current graph status:\n"
            f"- Total markets tracked: {stats.total_markets}\n"
            f"- Total relationships: {stats.total_relationships}\n"
            f"- Implication edges: {stats.total_implies}\n"
            f"- Mutual exclusion edges: {stats.total_mutually_exclusive}\n"
            f"- Connected components: {stats.connected_components}"
        )
        return {"context_data": context}

    else:
        # GENERAL_QUESTION — no action needed, LLM will answer directly
        return {"context_data": None}


async def generate_response(
    state: ChatState,
    *,
    llm: ChatWatsonx,
) -> dict:
    """Generate a natural-language response using the LLM with context data."""
    from prompts import CHAT_SYSTEM_PROMPT

    messages = [SystemMessage(content=CHAT_SYSTEM_PROMPT)]

    # Include conversation history
    for msg in state.get("history", []):
        if msg.get("role") == "user":
            messages.append(HumanMessage(content=msg["text"]))
        elif msg.get("role") == "ai":
            from langchain_core.messages import AIMessage
            messages.append(AIMessage(content=msg["text"]))

    # Build contextual user message
    user_text = state["message"]
    context = state.get("context_data")
    if context:
        user_text += f"\n\n[System context — use this data in your response]:\n{context}"

    messages.append(HumanMessage(content=user_text))

    try:
        response = await llm.ainvoke(messages)
        logger.bind(intent=state.get("intent")).info("chat_response_generated")
        return {"response": response.content}
    except Exception:
        logger.exception("chat_response_generation_failed")
        return {
            "response": "I encountered an error generating a response. "
                        "Please check that the WatsonX API is configured correctly.",
            "error": "LLM response generation failed",
        }


def build_chat_graph(
    settings: BrainSettings,
    session: AsyncSession,
    graph_manager: object,
) -> CompiledStateGraph:
    """Construct and compile the chat LangGraph.

    Pipeline: START → parse_intent → execute_action → generate_response → END
    """
    llm = ChatWatsonx(
        model_id=settings.watsonx_model_id,
        url=settings.watsonx_url,
        project_id=settings.watsonx_project_id,
        apikey=settings.watsonx_apikey.get_secret_value() if settings.watsonx_apikey else None,
        params={
            "temperature": 0.3,  # Slightly creative for chat
            "max_tokens": settings.brain_llm_max_tokens,
        },
    )

    async def _parse_intent(state: ChatState) -> dict:
        return await parse_intent(state, llm=llm)

    async def _execute_action(state: ChatState) -> dict:
        return await execute_action(
            state, session=session, graph_manager=graph_manager, settings=settings
        )

    async def _generate_response(state: ChatState) -> dict:
        return await generate_response(state, llm=llm)

    builder = StateGraph(ChatState)
    builder.add_node("parse_intent", _parse_intent)
    builder.add_node("execute_action", _execute_action)
    builder.add_node("generate_response", _generate_response)

    builder.add_edge(START, "parse_intent")
    builder.add_edge("parse_intent", "execute_action")
    builder.add_edge("execute_action", "generate_response")
    builder.add_edge("generate_response", END)

    return builder.compile()
