"""Async SQLModel database engine and session management."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from config import BrainSettings

# Module-level engine reference, initialised by ``init_db``.
_engine = None


def _make_async_url(url: str) -> str:
    """Convert a ``postgresql://`` DSN to ``postgresql+asyncpg://``."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


async def init_db(settings: BrainSettings) -> None:
    """Create the async engine and ensure all tables exist."""
    global _engine  # noqa: PLW0603

    async_url = _make_async_url(settings.database_url)
    _engine = create_async_engine(async_url, echo=False, pool_size=5, max_overflow=10)

    async with _engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    logger.bind(url=async_url.split("@")[-1]).info("database_initialised")


async def close_db() -> None:
    """Dispose of the async engine."""
    global _engine  # noqa: PLW0603
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        logger.info("database_closed")


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session — intended as a FastAPI dependency."""
    if _engine is None:
        raise RuntimeError("Database not initialised. Call init_db() first.")

    async_session_factory = sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session_factory() as session:
        yield session
