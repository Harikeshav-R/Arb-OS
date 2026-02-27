"""SQLModel database models and Pydantic API schemas for the Brain service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from sqlmodel import JSON, Column, Field as SQLField, SQLModel, UniqueConstraint


# ── Database Tables ───────────────────────────────────────────────────────────


class Market(SQLModel, table=True):
    """Cached Polymarket market data from the Gamma API."""

    __tablename__ = "markets"

    id: uuid.UUID = SQLField(default_factory=uuid.uuid4, primary_key=True)
    condition_id: str = SQLField(unique=True, index=True)
    question_id: str | None = SQLField(default=None)
    question: str
    description: str | None = SQLField(default=None)
    slug: str | None = SQLField(default=None)
    neg_risk: bool = SQLField(default=False)
    active: bool = SQLField(default=True)
    closed: bool = SQLField(default=False)
    volume: float = SQLField(default=0.0)
    end_date: str | None = SQLField(default=None)
    event_id: str | None = SQLField(default=None)
    event_title: str | None = SQLField(default=None)
    clob_token_ids: list[str] = SQLField(default_factory=list, sa_column=Column(JSON))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))


class Relationship(SQLModel, table=True):
    """Logical relationship between two Polymarket markets discovered by the LLM."""

    __tablename__ = "relationships"

    id: uuid.UUID = SQLField(default_factory=uuid.uuid4, primary_key=True)
    parent_condition_id: str = SQLField(index=True)
    child_condition_id: str = SQLField(index=True)
    logic_type: str  # IMPLIES, MUTUALLY_EXCLUSIVE, PARTITION, INDEPENDENT
    direction: str  # A_TO_B, B_TO_A, NONE
    confidence: float = SQLField(default=0.0)
    reasoning: str = SQLField(default="")
    is_active: bool = SQLField(default=True)
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(UTC))

    __table_args__ = (
        UniqueConstraint("parent_condition_id", "child_condition_id"),
    )


# ── Pydantic API Schemas ─────────────────────────────────────────────────────


class RelationshipOutput(BaseModel):
    """Structured output schema for the LLM's classification."""

    relation: Literal["IMPLIES", "MUTUALLY_EXCLUSIVE", "INDEPENDENT"]
    direction: Literal["A_TO_B", "B_TO_A", "NONE"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str

    @model_validator(mode="after")
    def enforce_direction(self) -> RelationshipOutput:
        """Enforce directional constraints based on logic type."""
        if self.relation in ("MUTUALLY_EXCLUSIVE", "INDEPENDENT"):
            if self.direction != "NONE":
                raise ValueError(
                    f"direction must be 'NONE' for relation '{self.relation}'"
                )
        elif self.relation == "IMPLIES":
            if self.direction == "NONE":
                raise ValueError(
                    "direction must be 'A_TO_B' or 'B_TO_A' for 'IMPLIES'"
                )
        return self


class AnalyzePairRequest(BaseModel):
    """Request body for the /analyze endpoint."""

    condition_id_a: str
    condition_id_b: str


class AnalyzePairResponse(BaseModel):
    """Response body for the /analyze endpoint."""

    relationship: RelationshipOutput
    parent_condition_id: str
    child_condition_id: str


class RelationshipRead(BaseModel):
    """Read-only representation of a relationship for API responses."""

    id: uuid.UUID
    parent_condition_id: str
    child_condition_id: str
    logic_type: str
    direction: str
    confidence: float
    reasoning: str
    is_active: bool


class MarketRead(BaseModel):
    """Read-only representation of a market for API responses."""

    condition_id: str
    question: str
    description: str | None
    event_title: str | None
    volume: float
    neg_risk: bool


class GraphStats(BaseModel):
    """High-level statistics about the relationship graph."""

    total_markets: int
    total_relationships: int
    total_implies: int
    total_mutually_exclusive: int
    connected_components: int


class HealthResponse(BaseModel):
    """Response body for the /health endpoint."""

    status: str
    db_connected: bool
    llm_configured: bool


class ImplicationMapping(BaseModel):
    """An implication edge between two markets."""
    parent_asset_id: str
    child_asset_id: str
    confidence: float


class PartitionMapping(BaseModel):
    """A group of mutually exclusive markets representing options to a question."""
    condition_id: str
    expected_outcomes_count: int
    assets: list[str]
    confidence: float


class ContradictionMapping(BaseModel):
    """A pair of mutually exclusive markets."""
    asset_a: str
    asset_b: str
    confidence: float


class BrainStatePayload(BaseModel):
    """The aggregate graph state polled by the Rust Engine."""
    implications: list[ImplicationMapping]
    partitions: list[PartitionMapping]
    contradictions: list[ContradictionMapping]
    asset_end_timestamps: dict[str, int]
