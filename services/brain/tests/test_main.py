"""Integration tests for FastAPI endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from models import GraphStats


@pytest.fixture
def _mock_env(monkeypatch):
    """Set required env vars for settings initialisation."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/arbos")
    monkeypatch.setenv("WATSONX_APIKEY", "test-key")
    monkeypatch.setenv("WATSONX_PROJECT_ID", "test-project")

    # Clear cached settings
    from config import get_settings

    get_settings.cache_clear()


@pytest.fixture
async def client(_mock_env):
    """Yield an httpx AsyncClient wired to the FastAPI app with mocked DB."""
    from database import get_session
    from main import app

    # Create a mock session
    mock_session = AsyncMock()
    # Make session.execute return a mock result (for health check's SELECT now())
    mock_exec_result = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_exec_result)

    # Override the FastAPI dependency
    async def _override_get_session():
        yield mock_session

    app.dependency_overrides[get_session] = _override_get_session

    # Patch lifespan DB calls so the app starts without a real DB
    with (
        patch("main.init_db", new_callable=AsyncMock),
        patch("main.close_db", new_callable=AsyncMock),
        patch("main._graph_manager") as mock_graph_mgr,
    ):
        mock_graph_mgr.load_from_db = AsyncMock()
        mock_graph_mgr.get_stats.return_value = GraphStats(
            total_markets=0,
            total_relationships=0,
            total_implies=0,
            total_mutually_exclusive=0,
            connected_components=0,
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    # Clean up overrides
    app.dependency_overrides.clear()


class TestHealthEndpoint:
    async def test_health_returns_ok(self, client):
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["db_connected"] is True
        assert data["llm_configured"] is True


class TestGraphStatsEndpoint:
    async def test_returns_stats(self, client):
        response = await client.get("/graph/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_markets" in data
        assert "total_relationships" in data
        assert data["total_markets"] == 0
