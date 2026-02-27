"""Tests for Pydantic API schemas in models.py."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from models import (
    AnalyzePairRequest,
    GraphStats,
    MarketRead,
    RelationshipOutput,
    RelationshipRead,
    ImplicationMapping,
    PartitionMapping,
    ContradictionMapping,
    BrainStatePayload,
)


class TestRelationshipOutput:
    """Validate structured output schema for LLM responses."""

    def test_valid_implies(self):
        out = RelationshipOutput(
            relation="IMPLIES",
            direction="A_TO_B",
            confidence=0.95,
            reasoning="A is a subset of B.",
        )
        assert out.relation == "IMPLIES"
        assert out.direction == "A_TO_B"
        assert out.confidence == 0.95

    def test_valid_mutually_exclusive(self):
        out = RelationshipOutput(
            relation="MUTUALLY_EXCLUSIVE",
            direction="NONE",
            confidence=0.8,
            reasoning="Both cannot happen simultaneously.",
        )
        assert out.relation == "MUTUALLY_EXCLUSIVE"

    def test_valid_independent(self):
        out = RelationshipOutput(
            relation="INDEPENDENT",
            direction="NONE",
            confidence=0.3,
            reasoning="No logical connection.",
        )
        assert out.relation == "INDEPENDENT"

    def test_invalid_relation_type(self):
        with pytest.raises(ValidationError):
            RelationshipOutput(
                relation="CAUSED_BY",
                direction="NONE",
                confidence=0.5,
                reasoning="Invalid type.",
            )

    def test_invalid_direction(self):
        with pytest.raises(ValidationError):
            RelationshipOutput(
                relation="IMPLIES",
                direction="LEFT",
                confidence=0.5,
                reasoning="Invalid direction.",
            )

    def test_confidence_below_zero(self):
        with pytest.raises(ValidationError):
            RelationshipOutput(
                relation="INDEPENDENT",
                direction="NONE",
                confidence=-0.1,
                reasoning="Negative confidence.",
            )

    def test_confidence_above_one(self):
        with pytest.raises(ValidationError):
            RelationshipOutput(
                relation="INDEPENDENT",
                direction="NONE",
                confidence=1.5,
                reasoning="Over 100%.",
            )

    def test_serialization_round_trip(self):
        out = RelationshipOutput(
            relation="IMPLIES",
            direction="B_TO_A",
            confidence=0.85,
            reasoning="Test reasoning.",
        )
        data = out.model_dump()
        restored = RelationshipOutput(**data)
        assert restored == out


class TestMarketRead:
    def test_basic_serialization(self):
        m = MarketRead(
            condition_id="0xabc",
            question="Will it rain?",
            description="Rain forecast market",
            event_title="Weather",
            volume=5000.0,
            neg_risk=False,
        )
        assert m.condition_id == "0xabc"
        assert m.volume == 5000.0


class TestRelationshipRead:
    def test_basic_serialization(self):
        r = RelationshipRead(
            id=uuid.uuid4(),
            parent_condition_id="0xabc",
            child_condition_id="0xdef",
            logic_type="IMPLIES",
            direction="A_TO_B",
            confidence=0.9,
            reasoning="Test",
            is_active=True,
        )
        assert r.logic_type == "IMPLIES"


class TestGraphStats:
    def test_zeroed_stats(self):
        stats = GraphStats(
            total_markets=0,
            total_relationships=0,
            total_implies=0,
            total_mutually_exclusive=0,
            connected_components=0,
        )
        assert stats.total_markets == 0


class TestAnalyzePairRequest:
    def test_basic(self):
        req = AnalyzePairRequest(
            condition_id_a="0xabc",
            condition_id_b="0xdef",
        )
        assert req.condition_id_a == "0xabc"


class TestBrainStateModels:
    def test_implication_mapping(self):
        m = ImplicationMapping(parent_asset_id="A", child_asset_id="B", confidence=0.9)
        assert m.parent_asset_id == "A"

    def test_partition_mapping(self):
        p = PartitionMapping(condition_id="C", expected_outcomes_count=2,
                             assets=["A", "B"], confidence=1.0)
        assert p.expected_outcomes_count == 2

    def test_contradiction_mapping(self):
        c = ContradictionMapping(asset_a="A", asset_b="B", confidence=0.8)
        assert c.asset_b == "B"

    def test_brain_state_payload(self):
        payload = BrainStatePayload(
            implications=[],
            partitions=[],
            contradictions=[],
            asset_end_timestamps={"A": 1234567890}
        )
        assert payload.asset_end_timestamps["A"] == 1234567890
