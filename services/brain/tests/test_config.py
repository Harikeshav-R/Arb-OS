"""Tests for the BrainSettings configuration module."""

from __future__ import annotations


import pytest

from config import BrainSettings


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Ensure a clean environment for each test."""
    # Remove any cached settings singleton
    from config import get_settings
    get_settings.cache_clear()


class TestBrainSettings:
    """Validate BrainSettings loads and validates correctly."""

    def test_loads_from_env(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
        monkeypatch.setenv("WATSONX_APIKEY", "test-key")
        monkeypatch.setenv("WATSONX_PROJECT_ID", "proj-123")

        settings = BrainSettings()  # type: ignore[call-arg]

        assert settings.database_url == "postgresql://localhost/test"
        assert settings.watsonx_apikey.get_secret_value() == "test-key"
        assert settings.watsonx_project_id == "proj-123"

    def test_default_values(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
        monkeypatch.setenv("WATSONX_APIKEY", "test-key")
        monkeypatch.setenv("WATSONX_PROJECT_ID", "proj-123")

        settings = BrainSettings()  # type: ignore[call-arg]

        assert settings.watsonx_url == "https://us-south.ml.cloud.ibm.com"
        assert settings.watsonx_model_id == "mistralai/mistral-large"
        assert settings.brain_llm_temperature == 0.0
        assert settings.brain_llm_max_tokens == 1024
        assert settings.brain_confidence_threshold == 0.7
        assert settings.brain_gamma_api_base_url == "https://gamma-api.polymarket.com"
        assert settings.brain_gamma_min_volume == 1000
        assert settings.brain_gamma_fetch_limit == 100

    def test_custom_values_override_defaults(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
        monkeypatch.setenv("WATSONX_APIKEY", "test-key")
        monkeypatch.setenv("WATSONX_PROJECT_ID", "proj-123")
        monkeypatch.setenv("WATSONX_MODEL_ID", "meta-llama/llama-3-1-70b-instruct")
        monkeypatch.setenv("BRAIN_LLM_TEMPERATURE", "0.5")
        monkeypatch.setenv("BRAIN_CONFIDENCE_THRESHOLD", "0.9")

        settings = BrainSettings()  # type: ignore[call-arg]

        assert settings.watsonx_model_id == "meta-llama/llama-3-1-70b-instruct"
        assert settings.brain_llm_temperature == 0.5
        assert settings.brain_confidence_threshold == 0.9

    def test_missing_required_fields_raises(self, monkeypatch):
        # DATABASE_URL is required
        monkeypatch.setenv("WATSONX_APIKEY", "test-key")
        monkeypatch.setenv("WATSONX_PROJECT_ID", "proj-123")
        monkeypatch.delenv("DATABASE_URL", raising=False)

        with pytest.raises(Exception):
            BrainSettings()  # type: ignore[call-arg]

    def test_secret_str_hides_value(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
        monkeypatch.setenv("WATSONX_APIKEY", "super-secret")
        monkeypatch.setenv("WATSONX_PROJECT_ID", "proj-123")

        settings = BrainSettings()  # type: ignore[call-arg]

        # str() representation should NOT expose the secret
        assert "super-secret" not in str(settings.watsonx_apikey)
        # But get_secret_value() should
        assert settings.watsonx_apikey.get_secret_value() == "super-secret"
