"""Tests for individual LangGraph node functions."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock


from graph import classify_relationship, persist_result, route_after_validation, validate_pair
from models import Market, RelationshipOutput


# ── Helpers ───────────────────────────────────────────────────────────────────





def _make_market(condition_id: str, question: str, description: str = "desc") -> Market:
    return Market(
        condition_id=condition_id,
        question=question,
        description=description,
        volume=5000.0,
    )


# ── validate_pair tests ──────────────────────────────────────────────────────


class TestValidatePair:
    async def test_identical_ids_returns_error(self):
        session = AsyncMock()
        state = {"condition_id_a": "0xabc", "condition_id_b": "0xabc"}

        result = await validate_pair(state, session=session)

        assert result["error"] is not None
        assert "itself" in result["error"]

    async def test_missing_market_returns_error(self):
        session = AsyncMock()
        # Both queries return None
        empty_result = MagicMock()
        empty_scalars = MagicMock()
        empty_scalars.first.return_value = None
        empty_result.scalars.return_value = empty_scalars
        session.execute = AsyncMock(return_value=empty_result)

        state = {"condition_id_a": "0xabc", "condition_id_b": "0xdef"}
        result = await validate_pair(state, session=session)

        assert result["error"] is not None
        assert "not found" in result["error"]

    async def test_valid_pair_returns_market_data(self):
        market_a = _make_market("0xabc", "Will it rain?", "Rain market")
        market_b = _make_market("0xdef", "Will it snow?", "Snow market")

        session = AsyncMock()

        # First call returns market_a, second returns market_b
        result_a = MagicMock()
        scalars_a = MagicMock()
        scalars_a.first.return_value = market_a
        result_a.scalars.return_value = scalars_a

        result_b = MagicMock()
        scalars_b = MagicMock()
        scalars_b.first.return_value = market_b
        result_b.scalars.return_value = scalars_b

        session.execute = AsyncMock(side_effect=[result_a, result_b])

        state = {"condition_id_a": "0xabc", "condition_id_b": "0xdef"}
        result = await validate_pair(state, session=session)

        assert result["error"] is None
        assert result["market_a"]["condition_id"] == "0xabc"
        assert result["market_b"]["condition_id"] == "0xdef"


# ── classify_relationship tests ───────────────────────────────────────────────


class TestClassifyRelationship:
    async def test_returns_relationship(self):
        mock_llm = MagicMock()
        expected = RelationshipOutput(
            relation="IMPLIES",
            direction="A_TO_B",
            confidence=0.95,
            reasoning="A is a subset of B.",
        )

        structured_llm = MagicMock()
        structured_llm.ainvoke = AsyncMock(return_value=expected)
        mock_llm.with_structured_output = MagicMock(return_value=structured_llm)

        state = {
            "condition_id_a": "0xabc",
            "condition_id_b": "0xdef",
            "market_a": {
                "condition_id": "0xabc",
                "question": "Will it rain in June?",
                "description": "June rain market",
            },
            "market_b": {
                "condition_id": "0xdef",
                "question": "Will it rain in 2026?",
                "description": "2026 rain market",
            },
        }

        result = await classify_relationship(state, llm=mock_llm, confidence_threshold=0.7)

        assert result["relationship"]["relation"] == "IMPLIES"
        assert result["relationship"]["confidence"] == 0.95

    async def test_below_threshold_returns_independent(self):
        mock_llm = MagicMock()
        low_confidence = RelationshipOutput(
            relation="IMPLIES",
            direction="A_TO_B",
            confidence=0.3,
            reasoning="Weak connection.",
        )

        structured_llm = MagicMock()
        structured_llm.ainvoke = AsyncMock(return_value=low_confidence)
        mock_llm.with_structured_output = MagicMock(return_value=structured_llm)

        state = {
            "market_a": {"condition_id": "0xabc", "question": "Q1", "description": "D1"},
            "market_b": {"condition_id": "0xdef", "question": "Q2", "description": "D2"},
        }

        result = await classify_relationship(state, llm=mock_llm, confidence_threshold=0.7)

        assert result["relationship"]["relation"] == "INDEPENDENT"
        assert result["relationship"]["confidence"] == 0.3

    async def test_none_markets_returns_error(self):
        mock_llm = MagicMock()
        state = {"market_a": None, "market_b": None}

        result = await classify_relationship(state, llm=mock_llm, confidence_threshold=0.7)

        assert result["error"] is not None


# ── route_after_validation tests ──────────────────────────────────────────────


class TestRouteAfterValidation:
    def test_routes_to_end_on_error(self):
        state = {"error": "Something went wrong"}
        assert route_after_validation(state) == "__end__"

    def test_routes_to_classify_on_success(self):
        state = {"error": None}
        assert route_after_validation(state) == "classify_relationship"

    def test_routes_to_classify_when_no_error_key(self):
        state = {}
        assert route_after_validation(state) == "classify_relationship"


# ── persist_result tests ──────────────────────────────────────────────────────


class TestPersistResult:
    async def test_skips_independent(self):
        session = AsyncMock()
        state = {
            "condition_id_a": "0xabc",
            "condition_id_b": "0xdef",
            "relationship": {
                "relation": "INDEPENDENT",
                "direction": "NONE",
                "confidence": 0.2,
                "reasoning": "No connection.",
            },
        }

        result = await persist_result(state, session=session)

        assert result["persisted"] is False
        session.commit.assert_not_called()

    async def test_creates_new_relationship(self):
        session = AsyncMock()
        # No existing relationship
        empty_result = MagicMock()
        empty_scalars = MagicMock()
        empty_scalars.first.return_value = None
        empty_result.scalars.return_value = empty_scalars
        session.execute = AsyncMock(return_value=empty_result)

        state = {
            "condition_id_a": "0xabc",
            "condition_id_b": "0xdef",
            "relationship": {
                "relation": "IMPLIES",
                "direction": "A_TO_B",
                "confidence": 0.95,
                "reasoning": "A implies B.",
            },
        }

        result = await persist_result(state, session=session)

        assert result["persisted"] is True
        session.add.assert_called_once()
        session.commit.assert_called_once()

    async def test_no_relationship_data(self):
        session = AsyncMock()
        state = {"condition_id_a": "0xabc", "condition_id_b": "0xdef"}

        result = await persist_result(state, session=session)

        assert result["persisted"] is False
