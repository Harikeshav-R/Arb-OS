"""Async Polymarket Gamma API client.

Fetches event and market data from ``https://gamma-api.polymarket.com``.
All data endpoints are public — no authentication is required.
"""

from __future__ import annotations

import httpx
from loguru import logger


class GammaClientError(Exception):
    """Raised when the Gamma API returns an unexpected response."""


class GammaClient:
    """Lightweight async wrapper around the Polymarket Gamma API."""

    def __init__(self, base_url: str = "https://gamma-api.polymarket.com") -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()

    # ── Public Methods ────────────────────────────────────────────────────────

    async def fetch_active_events(
            self,
            limit: int = 100,
            offset: int = 0,
    ) -> list[dict]:
        """Return active, non-closed events ordered by 24h volume (desc)."""
        params: dict[str, str | int | bool] = {
            "active": "true",
            "closed": "false",
            "order": "volume_24hr",
            "ascending": "false",
            "limit": limit,
            "offset": offset,
        }
        return await self._get("/events", params)

    async def fetch_event_by_id(self, event_id: str) -> dict:
        """Fetch a single event by its ID."""
        result = await self._get(f"/events/{event_id}")
        if isinstance(result, list):
            if len(result) == 0:
                raise GammaClientError(f"Event {event_id} not found")
            return result[0]
        return result

    async def fetch_markets(
            self,
            *,
            active: bool = True,
            closed: bool = False,
            limit: int = 100,
            offset: int = 0,
    ) -> list[dict]:
        """Return markets matching the given filters."""
        params: dict[str, str | int | bool] = {
            "active": str(active).lower(),
            "closed": str(closed).lower(),
            "limit": limit,
            "offset": offset,
        }
        return await self._get("/markets", params)

    async def fetch_all_active_markets(
            self,
            min_volume: int = 1000,
            fetch_limit: int = 100,
    ) -> list[dict]:
        """Paginate through all active, open markets above *min_volume*.

        Gamma API max page size is 100, so we paginate until we receive fewer
        results than the limit.
        """
        all_markets: list[dict] = []
        offset = 0

        while True:
            page = await self.fetch_markets(
                active=True,
                closed=False,
                limit=fetch_limit,
                offset=offset
            )
            if not page:
                break

            for market in page:
                volume = float(market.get("volume", 0) or 0)
                if volume >= min_volume:
                    all_markets.append(market)

            if len(page) < fetch_limit:
                break
            offset += fetch_limit

        logger.bind(
            total=len(all_markets),
            min_volume=min_volume,
        ).info("gamma_markets_fetched")
        return all_markets

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> list[dict] | dict:
        """Perform an HTTP GET and return parsed JSON."""
        url = f"{self._base_url}{path}"
        logger.bind(method="GET", url=url, params=params).debug("gamma_request")
        response = await self._client.get(url, params=params)

        if response.status_code == 429:
            logger.bind(url=url).warning("gamma_rate_limited")
            raise GammaClientError("Gamma API rate limit exceeded (HTTP 429)")

        response.raise_for_status()
        data = response.json()
        logger.bind(
            url=url,
            items=len(data) if isinstance(data, list) else 1
        ).debug("gamma_response")
        return data
