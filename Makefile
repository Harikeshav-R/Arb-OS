.PHONY: help up down restart build logs shell db db-shell clean ps test brain-logs

# Default to help
.DEFAULT_GOAL := help

# Colors for terminal output
COLOR_CYAN=\033[0;36m
COLOR_GREEN=\033[0;32m
COLOR_YELLOW=\033[0;33m
COLOR_NC=\033[0m

help: ## Show this help message
	@echo ""
	@echo "  ${COLOR_GREEN}ArbOS Docker Commands${COLOR_NC}"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  ${COLOR_CYAN}%-18s${COLOR_NC} %s\n", $$1, $$2}'
	@echo ""

# ── Lifecycle ─────────────────────────────────────────────────────────────────

up: ## Start all services in the background
	docker compose up -d
	@echo "\n  ${COLOR_GREEN}✓ Services started.${COLOR_NC}  Run ${COLOR_CYAN}make ps${COLOR_NC} to check status.\n"

down: ## Stop and remove all containers and networks
	docker compose down

restart: ## Restart all services (or one: make restart S=brain)
	docker compose restart $(S)

build: ## Rebuild all images and start services
	docker compose up -d --build

pull: ## Pull latest base images
	docker compose pull

# ── Observability ─────────────────────────────────────────────────────────────

ps: ## Show running containers and their health status
	docker compose ps

logs: ## Tail logs for all services (or one: make logs S=brain)
	docker compose logs -f $(S)

brain-logs: ## Tail only Brain service logs
	docker compose logs -f brain

# ── Shell Access ──────────────────────────────────────────────────────────────

shell: ## Open a shell in a service (usage: make shell S=brain)
	docker compose exec $(S) sh

db: ## Connect to the Postgres database using psql locally
	psql postgresql://postgres:password@localhost:5432/arbos

db-shell: ## Open psql inside the postgres container
	docker compose exec postgres psql -U postgres -d arbos



# ── Testing ───────────────────────────────────────────────────────────────────

test-rust: ## Run Rust tests (engine, ingestor, core)
	cargo test

test-brain: ## Run Brain Python tests
	cd services/brain && WATSONX_APIKEY=test WATSONX_PROJECT_ID=test uv run pytest tests/ -v

test: test-rust test-brain ## Run all tests

# ── Cleanup ───────────────────────────────────────────────────────────────────

clean: ## Stop services and remove volumes (⚠️  deletes DB data)
	@echo "  ${COLOR_YELLOW}WARNING: This will delete all persisted data.${COLOR_NC}"
	docker compose down -v

prune: ## Remove all stopped containers, unused images, and build cache
	docker system prune -f
