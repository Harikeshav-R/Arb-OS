# Contributing to ArbOS

First off, thank you for considering contributing to ArbOS!

Before you start, please read the `AGENTS.md` and `PROJECT.MD` files thoroughly to understand the project architecture, mathematical bounds, and operational constraints.

## Development Workflow

1. **Branch Naming**: We use a `type/scope/description` format.
    - Types: `feat/`, `fix/`, `chore/`, `refactor/`
    - Scopes: `engine`, `ingestor`, `bot`, `brain`, `web`, `infra`
    - Example: `feat/ingestor/vwap-calculator`
2. **Commit Format**: All commits MUST follow the Conventional Commits format and include a descriptive body. Check `AGENTS.md` for specific rules (e.g., bulleted lists for multiple changes).
3. **Pre-commit Hooks**: We use `pre-commit` to ensure code quality. Make sure you run `pre-commit install` in your local repository.
4. **Pull Requests**: Do not push directly to `main`. Always open a clean, modular Pull Request utilizing the `.github/pull_request_template.md`.

## Setting up your environment

1. **Rust (Tier 1, 3, 4)**: Ensure you have `cargo` installed.
2. **Python (Tier 2)**: Use `uv` for dependency management (`uv sync`).
3. **Frontend (Tier 5)**: Use `pnpm` (`pnpm install`).
4. **Infra**: Run `docker-compose up -d --build` to spin up Redis and PostgreSQL.

Always keep the "Black Swan" operational playbooks in mind when writing any execution logic!
