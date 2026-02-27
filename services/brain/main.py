"""ArbOS Brain Service — FastAPI entrypoint.

Tier 2 of the ArbOS architecture.  Discovers the "Hidden Graph" of logical
relationships between Polymarket prediction markets using LLM-powered analysis
orchestrated by a LangGraph StateGraph.
"""

from __future__ import annotations

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
    GraphStats,
    HealthResponse,
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


def _verify_admin(api_key: str = Security(_api_key_header)) -> None:
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
    logger.info("brain_starting", model=settings.watsonx_model_id)
    await init_db(settings)
    _gamma_client = GammaClient(base_url=settings.brain_gamma_api_base_url)

    # Load existing relationships into the in-memory graph
    async for session in get_session():
        await _graph_manager.load_from_db(session)

    logger.info("brain_ready")
    yield

    # Shutdown
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


@app.post("/markets/sync", response_model=dict)
async def sync_markets(session: AsyncSession = Depends(get_session)):
    """Fetch active markets from the Gamma API and upsert into the local DB."""
    if _gamma_client is None:
        raise HTTPException(status_code=503, detail="Gamma client not initialised")

    settings = get_settings()
    raw_markets = await _gamma_client.fetch_all_active_markets(
        min_volume=settings.brain_gamma_min_volume,
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
    logger.info("markets_synced", created=created, updated=updated)
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
    else:
        parent = request.condition_id_a
        child = request.condition_id_b

    # Update in-memory graph
    if rel.relation != "INDEPENDENT":
        _graph_manager.add_relationship(parent, child, rel.relation, rel.confidence)

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

    if len(markets) < 2:
        return {"analyzed": 0, "message": "Not enough markets to compare. Sync markets first."}

    analyzed = 0
    errors = 0

    for i, market_a in enumerate(markets):
        for market_b in markets[i + 1:]:
            # Skip already-analyzed pairs (even if inactive right now, unless we want
            # to re-scan them)
            # PR Comment asked:
            # "If inactive relationships should be reprocessed, add
            # Relationship.is_active.is_(True) to this query."
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
                continue

            try:
                compiled_graph = build_analysis_graph(settings, session)
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
                            _graph_manager.add_relationship(
                                market_b.condition_id,
                                market_a.condition_id,
                                rel_data["relation"],
                                rel_data["confidence"],
                            )
                        else:
                            _graph_manager.add_relationship(
                                market_a.condition_id,
                                market_b.condition_id,
                                rel_data["relation"],
                                rel_data["confidence"],
                            )
                    analyzed += 1
                else:
                    errors += 1
                    logger.warning("scan_pair_error", error=graph_result["error"])
            except Exception:
                errors += 1
                logger.exception("scan_pair_exception")

    logger.info("scan_complete", analyzed=analyzed, errors=errors)
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
    return _graph_manager.get_stats()
