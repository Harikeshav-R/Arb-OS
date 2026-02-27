"""Brain service configuration via Pydantic Settings.

All settings are read from environment variables (with optional `.env` file fallback).
"""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class BrainSettings(BaseSettings):
    """Central configuration for the Brain service."""

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str

    # ── IBM watsonx.ai ────────────────────────────────────────────────────────
    watsonx_apikey: SecretStr
    watsonx_url: str = "https://us-south.ml.cloud.ibm.com"
    watsonx_project_id: str
    watsonx_model_id: str = "mistralai/mistral-large"

    # ── LLM tuning ────────────────────────────────────────────────────────────
    brain_llm_temperature: float = 0.0
    brain_llm_max_tokens: int = 1024
    brain_confidence_threshold: float = 0.7

    # ── Polymarket Gamma API ──────────────────────────────────────────────────
    brain_gamma_api_base_url: str = "https://gamma-api.polymarket.com"
    brain_gamma_min_volume: int = 1000
    brain_gamma_fetch_limit: int = 100

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> BrainSettings:
    """Return a cached singleton of the application settings."""
    return BrainSettings()  # type: ignore[call-arg]
