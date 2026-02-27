"""Tests for the async Polymarket Gamma API client."""

from __future__ import annotations

import pytest
import httpx

from gamma_client import GammaClient, GammaClientError


@pytest.fixture
def gamma_client():
    return GammaClient(base_url="https://gamma-api.polymarket.com")


class TestFetchActiveEvents:
    async def test_returns_list(self, gamma_client, httpx_mock):
        httpx_mock.add_response(
            url="https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=10&offset=0",
            json=[
                {"id": "1", "title": "Event 1", "volume": "5000"},
                {"id": "2", "title": "Event 2", "volume": "3000"},
            ],
        )

        events = await gamma_client.fetch_active_events(limit=10, offset=0)

        assert len(events) == 2
        assert events[0]["id"] == "1"

    async def test_empty_response(self, gamma_client, httpx_mock):
        httpx_mock.add_response(
            url="https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=10&offset=0",
            json=[],
        )

        events = await gamma_client.fetch_active_events(limit=10, offset=0)
        assert events == []


class TestFetchMarkets:
    async def test_returns_markets(self, gamma_client, httpx_mock):
        httpx_mock.add_response(
            url="https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=5&offset=0",
            json=[
                {"conditionId": "0xabc", "question": "Market 1", "volume": "2000"},
            ],
        )

        markets = await gamma_client.fetch_markets(active=True, closed=False, limit=5, offset=0)
        assert len(markets) == 1
        assert markets[0]["conditionId"] == "0xabc"


class TestFetchAllActiveMarkets:
    async def test_filters_by_min_volume(self, gamma_client, httpx_mock):
        httpx_mock.add_response(
            url="https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=0",
            json=[
                {"conditionId": "0x1", "question": "High vol", "volume": "5000"},
                {"conditionId": "0x2", "question": "Low vol", "volume": "100"},
                {"conditionId": "0x3", "question": "Med vol", "volume": "2000"},
            ],
        )

        markets = await gamma_client.fetch_all_active_markets(min_volume=1000)

        assert len(markets) == 2
        ids = [m["conditionId"] for m in markets]
        assert "0x1" in ids
        assert "0x3" in ids
        assert "0x2" not in ids

    async def test_handles_pagination(self, gamma_client, httpx_mock):
        # First page returns 100 items (full page) → triggers next page
        page1 = [{"conditionId": f"0x{i}", "volume": "5000"} for i in range(100)]
        # Second page returns < 100 items → stops
        page2 = [{"conditionId": "0xfinal", "volume": "5000"}]

        httpx_mock.add_response(
            url="https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=0",
            json=page1,
        )
        httpx_mock.add_response(
            url="https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=100",
            json=page2,
        )

        markets = await gamma_client.fetch_all_active_markets(min_volume=1000)
        assert len(markets) == 101


class TestRateLimiting:
    async def test_raises_on_429(self, gamma_client, httpx_mock):
        httpx_mock.add_response(
            url="https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=10&offset=0",
            status_code=429,
        )

        with pytest.raises(GammaClientError, match="rate limit"):
            await gamma_client.fetch_active_events(limit=10, offset=0)

    async def test_raises_on_server_error(self, gamma_client, httpx_mock):
        httpx_mock.add_response(
            url="https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=10&offset=0",
            status_code=500,
        )

        with pytest.raises(httpx.HTTPStatusError):
            await gamma_client.fetch_active_events(limit=10, offset=0)
