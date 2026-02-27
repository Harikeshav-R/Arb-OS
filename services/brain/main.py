"""ArbOS Brain Service — FastAPI entrypoint.

Tier 2 of the ArbOS architecture.  Discovers the "Hidden Graph" of logical
relationships between Polymarket prediction markets using LLM-powered analysis
orchestrated by a LangGraph StateGraph.
"""

from __future__ import annotations

import hashlib
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Security
from fastapi.security import APIKeyHeader
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import close_db, get_session, init_db
from gamma_client import GammaClient
from graph import AnalysisState, build_analysis_graph
from models import (
    AnalyzePairRequest,
    AnalyzePairResponse,
    BrainStatePayload,
    GraphStats,
    HealthResponse,
    ImplicationMapping,
    PartitionMapping,
    ContradictionMapping,
    Market,
    MarketRead,
    Relationship,
    RelationshipOutput,
    RelationshipRead,
)
from relationship_graph import RelationshipGraphManager

# ── Logging Setup (loguru with JSON format per AGENTS.md) ─────────────────────

logger.remove()
logger.add(
    sys.stderr,
    format="{time:YYYY-MM-DDTHH:mm:ss.SSSZ} | {level:<8} | {name}:{function}:{line} | {message}",
    level="DEBUG",
    serialize=True,
)

# ── Application State ────────────────────────────────────────────────────────

_graph_manager = RelationshipGraphManager()
_gamma_client: GammaClient | None = None
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def _verify_admin(api_key: str | None = Security(_api_key_header)) -> None:
    """Verify the admin API key for protected endpoints."""
    settings = get_settings()
    if not settings.admin_api_key:
        return  # Auth disabled if no admin key is configured

    if api_key != settings.admin_api_key.get_secret_value():
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing X-API-Key header",
        )


def _parse_bool(val: Any, default: bool) -> bool:
    """Parse a boolean carefully to avoid 'false' string turning into True."""
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        val_lower = val.lower()
        if val_lower in ("true", "1", "yes"):
            return True
        if val_lower in ("false", "0", "no"):
            return False
    # Fallback for None or unrecognized strings/ints
    return bool(val) if val is not None else default


# ── Lifespan ──────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    global _gamma_client  # noqa: PLW0603

    settings = get_settings()

    # Startup
    logger.bind(model=settings.watsonx_model_id).info("brain_starting")
    await init_db(settings)
    _gamma_client = GammaClient(base_url=settings.brain_gamma_api_base_url)

    # Load existing relationships into the in-memory graph
    async for session in get_session():
        await _graph_manager.load_from_db(session)

    logger.info("brain_ready")
    yield

    # Shutdown
    if _gamma_client:
        await _gamma_client.aclose()
    await close_db()
    logger.info("brain_shutdown")


app = FastAPI(
    title="ArbOS Brain",
    description="AI-driven logical relationship discovery for Polymarket",
    version="0.1.0",
    lifespan=lifespan,
)


# ── Health ────────────────────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
async def health(session: AsyncSession = Depends(get_session)):
    """Health check endpoint."""
    db_connected = False
    try:
        await session.execute(select(func.now()))
        db_connected = True
    except Exception:
        logger.exception("health_db_check_failed")

    settings = get_settings()
    llm_configured = bool(
        settings.watsonx_apikey.get_secret_value() and settings.watsonx_project_id
    )

    return HealthResponse(
        status="ok" if db_connected else "degraded",
        db_connected=db_connected,
        llm_configured=llm_configured,
    )


# ── Market Sync ───────────────────────────────────────────────────────────────


@app.post("/markets/sync", response_model=dict, dependencies=[Depends(_verify_admin)])
async def sync_markets(session: AsyncSession = Depends(get_session)):
    """Fetch active markets from the Gamma API and upsert into the local DB."""
    if _gamma_client is None:
        raise HTTPException(status_code=503, detail="Gamma client not initialised")

    settings = get_settings()
    raw_markets = await _gamma_client.fetch_all_active_markets(
        min_volume=settings.brain_gamma_min_volume,
        fetch_limit=settings.brain_gamma_fetch_limit,
    )

    created = 0
    updated = 0

    for raw in raw_markets:
        condition_id = raw.get("conditionId") or raw.get("condition_id")
        if not condition_id:
            continue

        result = await session.execute(
            select(Market).where(Market.condition_id == condition_id)
        )
        existing = result.scalars().first()

        now = datetime.now(UTC)

        # Extract token IDs from the market data
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

        market_data = {
            "question": raw.get("question", ""),
            "question_id": raw.get("questionID") or raw.get("question_id"),
            "description": raw.get("description"),
            "slug": raw.get("slug"),
            "neg_risk": _parse_bool(raw.get("negRisk"), False),
            "active": _parse_bool(raw.get("active"), True),
            "closed": _parse_bool(raw.get("closed"), False),
            "volume": float(raw.get("volume", 0) or 0),
            "end_date": raw.get("endDate") or raw.get("end_date"),
            "event_id": raw.get("eventId") or raw.get("event_id"),
            "event_title": raw.get("eventTitle")
                           or raw.get("event_title")
                           or raw.get("groupItemTitle"),
            "clob_token_ids": clob_token_ids,
            "updated_at": now,
        }

        if existing:
            for key, value in market_data.items():
                setattr(existing, key, value)
            updated += 1
        else:
            new_market = Market(condition_id=condition_id, **market_data)
            session.add(new_market)
            created += 1

    await session.commit()
    logger.bind(
        total_fetched=len(raw_markets),
        created=created,
        updated=updated,
    ).info("markets_synced")
    return {"created": created, "updated": updated, "total_fetched": len(raw_markets)}


@app.get("/markets", response_model=list[MarketRead])
async def list_markets(
        limit: int = Query(default=50, le=200),
        offset: int = Query(default=0, ge=0),
        session: AsyncSession = Depends(get_session),
):
    """List cached markets."""
    result = await session.execute(
        select(Market).order_by(Market.volume.desc()).limit(limit).offset(offset)
    )
    markets = result.scalars().all()
    return [
        MarketRead(
            condition_id=m.condition_id,
            question=m.question,
            description=m.description,
            event_title=m.event_title,
            volume=m.volume,
            neg_risk=m.neg_risk,
        )
        for m in markets
    ]


# ── Analysis ──────────────────────────────────────────────────────────────────


@app.post("/analyze", response_model=AnalyzePairResponse)
async def analyze_pair(
        request: AnalyzePairRequest,
        session: AsyncSession = Depends(get_session),
):
    """Analyze a single pair of markets for logical relationships."""
    settings = get_settings()
    compiled_graph = build_analysis_graph(settings, session)

    initial_state: AnalysisState = {
        "condition_id_a": request.condition_id_a,
        "condition_id_b": request.condition_id_b,
    }

    logger.bind(
        c_a=request.condition_id_a,
        c_b=request.condition_id_b,
    ).info("analyze_request")

    result = await compiled_graph.ainvoke(initial_state)

    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    rel_data = result.get("relationship")
    if rel_data is None:
        raise HTTPException(status_code=500, detail="Analysis produced no result.")

    rel = RelationshipOutput(**rel_data)

    # Determine canonical parent/child
    if rel.direction == "B_TO_A":
        parent = request.condition_id_b
        child = request.condition_id_a
    elif rel.direction == "NONE":
        # Canonicalize undirected pairs alphabetically
        parent, child = sorted([request.condition_id_a, request.condition_id_b])
    else:
        parent = request.condition_id_a
        child = request.condition_id_b

    # Update in-memory graph
    if rel.relation != "INDEPENDENT":
        await _graph_manager.add_relationship(parent, child, rel.relation, rel.confidence)

    return AnalyzePairResponse(
        relationship=rel,
        parent_condition_id=parent,
        child_condition_id=child,
    )


# ── Scan ──────────────────────────────────────────────────────────────────────


@app.post("/scan", response_model=dict, dependencies=[Depends(_verify_admin)])
async def scan_markets(
        limit: int = Query(default=20, le=100, description="Max markets to compare"),
        session: AsyncSession = Depends(get_session),
):
    """Trigger a scan: fetch top markets and analyze unprocessed pairs.

    This is a heavy endpoint — it iterates over C(n,2) pairs and invokes
    the LLM for each.  Use ``limit`` to control blast radius.
    """
    settings = get_settings()

    # Get top markets by volume
    result = await session.execute(
        select(Market)
        .where(Market.active.is_(True), Market.closed.is_(False))
        .order_by(Market.volume.desc())
        .limit(limit)
    )
    markets = result.scalars().all()

    logger.bind(
        active_markets=len(markets),
        admin=True,
    ).info("scan_started")

    if len(markets) < 2:
        return {"analyzed": 0, "message": "Not enough markets to compare. Sync markets first."}

    # Pre-compile the graph once per request to avoid O(n^2) overhead
    compiled_graph = build_analysis_graph(settings, session)

    analyzed = 0
    skipped = 0
    errors = 0

    for i, market_a in enumerate(markets):
        for market_b in markets[i + 1:]:
            # Skip already-analyzed pairs (even if inactive right now, unless we want
            # to re-scan them)
            existing = await session.execute(
                select(Relationship).where(
                    Relationship.is_active.is_(True),
                    (
                            (Relationship.parent_condition_id == market_a.condition_id)
                            & (Relationship.child_condition_id == market_b.condition_id)
                    )
                    | (
                            (Relationship.parent_condition_id == market_b.condition_id)
                            & (Relationship.child_condition_id == market_a.condition_id)
                    )
                )
            )
            if existing.scalars().first() is not None:
                skipped += 1
                continue

            logger.bind(
                a=market_a.condition_id,
                b=market_b.condition_id,
            ).info("scan_pair")
            try:
                state: AnalysisState = {
                    "condition_id_a": market_a.condition_id,
                    "condition_id_b": market_b.condition_id,
                }
                graph_result = await compiled_graph.ainvoke(state)

                if not graph_result.get("error"):
                    rel_data = graph_result.get("relationship")
                    if rel_data and rel_data["relation"] != "INDEPENDENT":
                        direction = rel_data["direction"]
                        if direction == "B_TO_A":
                            parent, child = market_b.condition_id, market_a.condition_id
                        elif direction == "NONE":
                            parent, child = sorted([market_a.condition_id, market_b.condition_id])
                        else:
                            parent, child = market_a.condition_id, market_b.condition_id

                        await _graph_manager.add_relationship(
                            parent,
                            child,
                            rel_data["relation"],
                            rel_data["confidence"],
                        )
                    analyzed += 1
                else:
                    errors += 1
                    logger.bind(error=graph_result["error"]).warning("scan_pair_error")
            except Exception:
                errors += 1
                logger.bind(
                    a=market_a.condition_id,
                    b=market_b.condition_id,
                ).exception("scan_pair_exception")

    logger.bind(
        analyzed=analyzed,
        skipped=skipped,
        errors=errors,
    ).info("scan_complete")
    return {"analyzed": analyzed, "errors": errors, "total_markets": len(markets)}


# ── Relationships ─────────────────────────────────────────────────────────────


@app.get("/relationships", response_model=list[RelationshipRead])
async def list_relationships(
        logic_type: str | None = Query(default=None),
        limit: int = Query(default=50, le=200),
        offset: int = Query(default=0, ge=0),
        session: AsyncSession = Depends(get_session),
):
    """List all active relationships with optional filtering."""
    query = select(Relationship).where(Relationship.is_active.is_(True))

    if logic_type:
        query = query.where(Relationship.logic_type == logic_type.upper())

    query = query.order_by(Relationship.confidence.desc()).limit(limit).offset(offset)

    result = await session.execute(query)
    relationships = result.scalars().all()

    return [
        RelationshipRead(
            id=r.id,
            parent_condition_id=r.parent_condition_id,
            child_condition_id=r.child_condition_id,
            logic_type=r.logic_type,
            direction=r.direction,
            confidence=r.confidence,
            reasoning=r.reasoning,
            is_active=r.is_active,
        )
        for r in relationships
    ]


@app.get("/relationships/{condition_id}", response_model=list[RelationshipRead])
async def get_relationships_for_market(
        condition_id: str,
        session: AsyncSession = Depends(get_session),
):
    """Get all active relationships involving a specific market."""
    result = await session.execute(
        select(Relationship).where(
            Relationship.is_active.is_(True),
            (Relationship.parent_condition_id == condition_id)
            | (Relationship.child_condition_id == condition_id),
        )
    )
    relationships = result.scalars().all()

    return [
        RelationshipRead(
            id=r.id,
            parent_condition_id=r.parent_condition_id,
            child_condition_id=r.child_condition_id,
            logic_type=r.logic_type,
            direction=r.direction,
            confidence=r.confidence,
            reasoning=r.reasoning,
            is_active=r.is_active,
        )
        for r in relationships
    ]


# ── Graph Stats ───────────────────────────────────────────────────────────────


@app.get("/graph/stats", response_model=GraphStats)
async def graph_stats():
    """Return high-level statistics about the in-memory relationship graph."""
    return await _graph_manager.get_stats()


# ── Graph Sync Endpoint ────────────────────────────────────────────────────────

@app.get("/state", response_model=BrainStatePayload, dependencies=[Depends(_verify_admin)])
async def get_brain_state(session: AsyncSession = Depends(get_session)):
    """Return the entire synchronized graph state for the Rust Engine to poll."""

    # 1. Fetch metadata (tokens and timestamps)
    result = await session.execute(
        select(Market.condition_id, Market.end_date, Market.clob_token_ids)
        .where(Market.active.is_(True), Market.closed.is_(False))
    )

    asset_end_timestamps = {}
    condition_to_yes_token = {}

    for condition_id, end_date, clob_token_ids in result.all():
        if not clob_token_ids or len(clob_token_ids) == 0:
            continue

        # The YES token is almost always the first element in the array for binary markets
        yes_token = clob_token_ids[0]
        condition_to_yes_token[condition_id] = yes_token

        if end_date:
            try:
                # End dates from Polymarket are usually ISO8601 strings
                dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                asset_end_timestamps[yes_token] = int(dt.timestamp())
            except Exception as e:
                (logger.bind(condition_id=condition_id, end_date=end_date, error=str(e))
                 .warning("failed_to_parse_end_date"))

    # 2. Implications and Contradictions
    implications_dicts = await _graph_manager.get_all_relationships()
    implications = []
    contradictions = []

    for rel in implications_dicts:
        parent_token = condition_to_yes_token.get(rel["parent_condition_id"])
        child_token = condition_to_yes_token.get(rel["child_condition_id"])

        if not parent_token or not child_token:
            continue

        if rel["logic_type"] == "IMPLIES":
            implications.append(
                ImplicationMapping(
                    parent_asset_id=parent_token,
                    child_asset_id=child_token,
                    confidence=rel["confidence"],
                )
            )
        elif rel["logic_type"] == "MUTUALLY_EXCLUSIVE":
            contradictions.append(
                ContradictionMapping(
                    asset_a=parent_token,
                    asset_b=child_token,
                    confidence=rel["confidence"],
                )
            )

    # 3. Partitions
    partitions_lists = await _graph_manager.get_partition_groups()
    partitions = []

    # Build a lookup for mutual exclusion confidences
    me_confidences = {}
    for rel in implications_dicts:
        if rel["logic_type"] == "MUTUALLY_EXCLUSIVE":
            c1, c2 = rel["parent_condition_id"], rel["child_condition_id"]
            me_confidences[f"{c1}|{c2}"] = rel["confidence"]
            me_confidences[f"{c2}|{c1}"] = rel["confidence"]

    for i, group in enumerate(partitions_lists):
        if len(group) >= 2:
            group_tokens = []
            for cid in group:
                tok = condition_to_yes_token.get(cid)
                if tok:
                    group_tokens.append(tok)

            if len(group_tokens) >= 2:
                # Calculate minimum confidence among mutually exclusive edges within the group
                group_confs = []
                for j in range(len(group)):
                    for k in range(j + 1, len(group)):
                        conf = me_confidences.get(f"{group[j]}|{group[k]}")
                        if conf is not None:
                            group_confs.append(conf)

                partition_confidence = min(group_confs) if group_confs else 1.0

                # Hash the sorted assets to get a deterministic B256-like condition ID
                hash_input = "v1_" + "_".join(sorted(group_tokens))
                hash_id = hashlib.sha256(hash_input.encode()).hexdigest()
                partitions.append(
                    PartitionMapping(
                        condition_id=f"0x{hash_id}",
                        expected_outcomes_count=len(group),
                        assets=group_tokens,
                        confidence=partition_confidence
                    )
                )

    return BrainStatePayload(
        implications=implications,
        partitions=partitions,
        contradictions=contradictions,
        asset_end_timestamps=asset_end_timestamps
    )
