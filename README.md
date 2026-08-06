<div align="center">

# ⚡ ArbOS

### Automated Prediction Market Arbitrage Engine

**The market is wrong. Profit from it.**

ArbOS is a low-latency, logic-driven trading system that automatically detects and exploits
mathematical inconsistencies in decentralized prediction markets on **Polymarket** (Polygon PoS).

[![CI](https://github.com/Harikeshav-R/Arb-OS/actions/workflows/ci.yml/badge.svg)](https://github.com/Harikeshav-R/Arb-OS/actions/workflows/ci.yml)
![Rust](https://img.shields.io/badge/Rust-2024-000000?logo=rust)
![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![IBM watsonx](https://img.shields.io/badge/AI-IBM%20watsonx.ai-052FAD?logo=ibm&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## Table of Contents

- [What is ArbOS?](#what-is-arbos)
- [The Alpha: Logical Arbitrage](#the-alpha-logical-arbitrage)
- [The Four Arbitrage Strategies](#the-four-arbitrage-strategies)
- [System Architecture](#system-architecture)
- [How It Works: End-to-End Flow](#how-it-works-end-to-end-flow)
- [The Five Tiers](#the-five-tiers)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Development](#development)
- [Safety & Risk Engineering](#safety--risk-engineering)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## What is ArbOS?

Prediction markets like Polymarket let people trade the probability of real-world events. Each
market has its **own isolated order book**, and nobody enforces consistency *across* related
markets. That structural gap is the alpha.

Unlike traditional crypto arbitrage (buy low on Exchange A, sell high on Exchange B), ArbOS performs
**Logical Arbitrage** entirely *within* Polymarket — it finds situations where the math of the order
books breaks the rules of logic, then executes delta-neutral trades to lock in a **mathematically
guaranteed, risk-free profit**.

ArbOS is a **polyglot monorepo** spanning three languages: **Rust** for the microsecond-sensitive
data and execution path, **Python** for the AI reasoning layer, and **TypeScript/React** for the
real-time control dashboard — unified by a PostgreSQL data plane and an IBM watsonx.ai reasoning
core.

> Built for the **IBM SkillsBuild Hackathon · Fintech Track · February 2026**.

| Metric | Value |
| --- | --- |
| Arbitrage detection latency | **~14 ms** end-to-end |
| Simultaneous markets tracked | **up to 1,000** live order books |
| Arbitrage strategies | **4** (Implication, Partition, Mutual Exclusion, AI-Chained) |
| Minimum profit gate | **$0.50** net, after fees + gas |
| Order safety model | **Fill-or-Kill only**, with atomic panic-dump failsafe |
| Reasoning engine | **IBM watsonx.ai** (`mistralai/mistral-large`) via LangGraph |

---

## The Alpha: Logical Arbitrage

Consider two markets:

1. **Market A** — *Will the Fed cut rates in June 2026?* → trading at **60¢** (60% implied)
2. **Market B** — *Will the Fed cut rates in 2026?* → trading at **55¢** (55% implied)

June 2026 is a **strict subset** of the year 2026. It is logically impossible for the Fed to cut in
June without also having cut *in 2026*. Therefore **P(A) can never exceed P(B)** — yet the market
prices A *higher* than B. The order books have contradicted the laws of logic.

```mermaid
flowchart LR
    A["<b>Market A</b><br/>Fed cut in June 2026<br/><b>60¢</b>"]
    B["<b>Market B</b><br/>Fed cut in 2026<br/><b>55¢</b>"]
    A -- "A ⊆ B, so P(A) ≤ P(B)<br/>VIOLATION: 60¢ > 55¢" --> B

    A -. "SELL @ 60¢" .-> S["🔒 Locked-in profit<br/><b>+5¢ / share</b><br/>(risk-free)"]
    B -. "BUY @ 55¢" .-> S

    classDef mkt fill:#16213E,stroke:#00D4AA,color:#F8FAFC;
    classDef win fill:#0A3D2E,stroke:#00FF88,color:#F8FAFC;
    class A,B mkt;
    class S win;
```

**Why it's guaranteed, not merely probable:** a cross-exchange spread can close *against* you before
you execute. A logical violation *cannot* — if `June ⊆ 2026`, that is true regardless of what the Fed
actually does. The profit is locked in the moment both legs fill.

---

## The Four Arbitrage Strategies

| # | Strategy | Axiom | Violation | Action |
| --- | --- | --- | --- | --- |
| 1 | **Implication** (Monotonicity) | If `A ⊆ B`, then `P(A) ≤ P(B)` | `P(A)_bid > P(B)_ask + fees` | SELL sub-event A, BUY super-event B |
| 2 | **Partition** (Normalization) | `Σ P(Eᵢ) = 1.0` | `Σ P(Eᵢ)_bid > 1.0 + fees` | Basket-SELL every outcome |
| 3 | **Mutual Exclusion** (Contradiction) | `P(A) + P(B) ≤ 1.0` | `P(A)_bid + P(B)_bid > 1.0` | SELL both sides |
| 4 | **Chained Implication** (AI-discovered) | If `A → B → C`, then `P(A) ≤ P(C)` | `P(A) > P(C)` | Multi-hop; mapped by the AI Brain |

**Worked example — Implication arb** (Fed Cut June 60¢ → Fed Cut 2026 55¢, 100 shares):

```
SELL June YES @ 60¢  = $60.00 collected
BUY  2026 YES @ 55¢  = $55.00 paid
────────────────────────────────────────
Gross spread:          +$5.00
Polymarket taker fee:   $0.00   (0% on most markets)
Polygon gas (2 txns):  -$0.06
────────────────────────────────────────
Net profit:            +$4.94   (≈8.2% ROI on $60 risked)
```

---

## System Architecture

ArbOS is organized into **five tiers**, each with a single clear responsibility. The three Rust
tiers compile into one high-performance orchestrator binary; the Brain runs as an independent Python
microservice; the dashboard is a static SPA.

```mermaid
flowchart TB
    subgraph EXT["External Services"]
        GAMMA["Polymarket Gamma API<br/>(REST · market metadata)"]
        CLOB["Polymarket CLOB<br/>(WebSocket · order books)"]
        WX["IBM watsonx.ai<br/>(mistral-large LLM)"]
        GAS["Polygon Gas Station<br/>(gas oracle)"]
    end

    subgraph BRAIN["🧠 Tier 2 · Brain (Python / FastAPI)"]
        SCHED["APScheduler<br/>(15-min discovery)"]
        LG["LangGraph pipeline<br/>validate → classify → persist"]
        NX["NetworkX DiGraph"]
        PG[("PostgreSQL 15<br/>markets · relationships")]
    end

    subgraph RUST["🦀 Rust Orchestrator (single binary · crates/bot)"]
        ING["Tier 1 · Ingestor<br/>WebSocket feed + VWAP"]
        ENG["Tier 3 · Engine<br/>arb math + signals"]
        EXEC["Tier 4 · Executor<br/>rate-limit · dedup · FOK"]
        LEDGER["Ledger<br/>P&L · positions"]
        API["Axum Server :3001<br/>REST + WebSocket"]
    end

    UI["🖥️ Tier 5 · Dashboard<br/>(React / Vite / TS)"]

    GAMMA --> SCHED
    WX --> LG
    SCHED --> LG --> PG
    LG --> NX
    PG -- "GET /state (every 60s)" --> ENG
    CLOB --> ING
    GAS --> ENG
    ENG -- "Subscribe / Unsubscribe" --> ING
    ING -- "NormalizedOrderbook" --> ENG
    ENG -- "ArbSignal" --> EXEC
    EXEC --> LEDGER
    EXEC -- "ExecutionReport (broadcast)" --> API
    API -- "WebSocket + /api/status" --> UI

    classDef ext fill:#1a1a2e,stroke:#7B61FF,color:#F8FAFC;
    classDef brain fill:#16213E,stroke:#00D4AA,color:#F8FAFC;
    classDef rust fill:#2A1A0E,stroke:#DEA584,color:#F8FAFC;
    classDef ui fill:#0A2540,stroke:#61DAFB,color:#F8FAFC;
    class GAMMA,CLOB,WX,GAS ext;
    class SCHED,LG,NX,PG brain;
    class ING,ENG,EXEC,LEDGER,API rust;
    class UI ui;
```

### Two independent control loops

- **Brain discovery loop (15-min cadence):** APScheduler syncs the latest markets from Gamma, then
  runs the LLM over all unprocessed pairs to grow the relationship graph.
- **Engine execution loop (60-s cadence):** the Rust Engine re-polls `/state`, diffs the
  tracked-asset set, dynamically manages live WebSocket subscriptions, and refreshes the gas oracle —
  all while continuously evaluating incoming order-book updates in real time.

---

## How It Works: End-to-End Flow

```mermaid
sequenceDiagram
    autonumber
    participant G as Gamma API
    participant B as Brain (Python)
    participant W as watsonx.ai
    participant E as Engine (Rust)
    participant I as Ingestor (Rust)
    participant C as Polymarket CLOB
    participant X as Executor (Rust)
    participant U as Dashboard

    Note over B: Discovery loop — every 15 min
    B->>G: fetch active markets (volume ≥ 1000)
    G-->>B: market list
    B->>W: classify each market pair
    W-->>B: IMPLIES / MUT_EXCL / INDEPENDENT + confidence
    B->>B: persist relationships → Postgres + NetworkX

    Note over E: Execution loop — every 60 s
    E->>B: GET /state (X-API-Key)
    B-->>E: implications, partitions, contradictions, timestamps
    E->>I: Subscribe(asset_ids)
    I->>C: subscribe order books (WebSocket)

    loop Real-time
        C-->>I: order book update
        I->>I: compute VWAP to $100 depth
        I-->>E: NormalizedOrderbook
        E->>E: run implication / partition / contradiction checks
        alt Violation & net profit > $0.50
            E-->>X: ArbSignal (delta-neutral legs)
            X->>X: rate-limit + dedup
            X->>C: place Fill-or-Kill orders
            C-->>X: fills
            X-->>U: ExecutionReport (WebSocket broadcast)
        end
    end
```

---

## The Five Tiers

### 🦀 Tier 1 — Ingestor (`crates/ingestor`)

Maintains a real-time, normalized view of the market. A Tokio actor connects to Polymarket's CLOB
WebSocket via the official `polymarket-client-sdk`, dynamically subscribes/unsubscribes to per-asset
order books (capped at 1,000), and computes **VWAP** up to a `$100` liquidity target. Books that
can't supply `$100` of depth are flagged `UNTRADEABLE`. Reconnects with exponential backoff.

### 🧠 Tier 2 — Brain (`services/brain`)

Discovers the "Hidden Graph" of logical relationships between markets. A FastAPI service that uses
**IBM watsonx.ai** (`mistralai/mistral-large`) orchestrated by a **LangGraph** `StateGraph`
(`validate → classify → persist`) to classify each market pair as `IMPLIES` /
`MUTUALLY_EXCLUSIVE` / `INDEPENDENT` with a confidence score and reasoning. Relationships persist to
**PostgreSQL** (SQLModel + asyncpg) and an in-memory **NetworkX** DiGraph. An **APScheduler** job
discovers new relationships every 15 minutes. Exposes `/state` — the asset-level graph payload the
Rust Engine consumes.

### 🦀 Tier 3 — Engine (`crates/engine`)

The high-frequency calculator. Caches the entire logical graph in memory, polls the Brain's `/state`
every 60 s (trusting only edges ≥ 0.90 confidence), and runs all three arbitrage strategies on every
order-book update. Models **taker fees** (1.56% conservative) and **live Polygon gas** (with a 50%
safety margin), firing an `ArbSignal` only when net profit clears `$0.50`. Enforces a **max-duration
filter** (skips markets resolving > 30 days out).

### 🦀 Tier 4 — Bot / Executor (`crates/bot`)

The primary orchestrator entry point and atomic settlement layer. `main.rs` spawns all Rust tiers as
Tokio tasks wired by MPSC channels. The executor applies a **token-bucket rate limiter** (10 req/s),
**canonical-hash deduplication** (30 s cooldown), and places **Fill-or-Kill** orders via the
Polymarket SDK — with automatic **panic-dump** of a filled leg if its pair fails. An in-memory
**ledger** tracks P&L and positions; an **Axum** server exposes REST + WebSocket endpoints to the
dashboard. Supports **Demo** (paper-trading) and **Live** modes.

### 🖥️ Tier 5 — Dashboard (`frontend`)

A **React 18 + Vite + TypeScript** SPA styled with **Tailwind CSS** and **shadcn/ui**. Features a
`d3-force` relationship graph, an AI chat graph-builder, a live control room (P&L ticker, trade log,
open positions, system health), and a risk-configuration wizard. Guided operator flow:
`Landing → Connect → Graph → Configure → Dashboard → Guide`.

### 🦀 Tier 0 — Core (`crates/core`)

Shared Rust foundation: canonical domain types (`ArbSignal`, `NormalizedOrderbook`,
`ExecutionReport`, `TradeAction`) and tuning constants (fees, gas model, thresholds, channel buffer
sizes). All money math uses `rust_decimal` fixed-point — never floats.

---

## Tech Stack

```mermaid
mindmap
  root((ArbOS))
    Rust
      Tokio async runtime
      Axum web/WebSocket
      polymarket-client-sdk
      rust_decimal
      reqwest
      tracing
    Python
      FastAPI
      LangGraph + LangChain
      langchain-ibm watsonx.ai
      SQLModel + asyncpg
      NetworkX
      APScheduler
      loguru
    TypeScript
      React 18 + Vite
      shadcn/ui + Radix
      TanStack Query
      d3 + Recharts
      Tailwind CSS
      framer-motion
    Platform
      Polymarket CLOB + Gamma
      Polygon PoS
      PostgreSQL 15
      Docker + Compose
      GitHub Actions CI
```

| Layer | Technologies |
| --- | --- |
| **Languages** | Rust (edition 2024, toolchain 1.93), Python ≥ 3.13, TypeScript 5.8 |
| **Rust runtime & web** | Tokio 1.49, Axum 0.8, tower-http, tokio-util, futures |
| **Blockchain / market** | `polymarket-client-sdk` 0.4.2 (CLOB WS + EIP-712 signing), reqwest 0.12 |
| **AI / LLM** | IBM watsonx.ai (`mistralai/mistral-large`), LangGraph 1.0, LangChain-Core 1.2, langchain-ibm 1.0 |
| **Python web/data** | FastAPI 0.133, Uvicorn 0.41, SQLModel 0.0.37, asyncpg 0.31, Pydantic 2.12, NetworkX 3.6, APScheduler 3.11, httpx 0.28 |
| **Frontend** | React 18.3, Vite 5.4, TanStack Query 5.83, Radix/shadcn, d3 7.8, Recharts 2.15, Tailwind 3.4, framer-motion 11, zod 3.25 |
| **Database** | PostgreSQL 15 |
| **Package managers** | Cargo (Rust), uv (Python), npm (frontend) |
| **Testing** | `cargo test`, pytest + pytest-asyncio, Vitest + Testing Library |
| **Tooling** | rustfmt, clippy, ruff, ESLint, pre-commit, Dependabot |
| **Infra & CI/CD** | Docker + Docker Compose, GitHub Actions |

---

## Getting Started

### Prerequisites

- **Docker** & **Docker Compose** (for the full-stack launch)
- **Rust** 1.93+ with Cargo (for Rust development)
- **Python** 3.13+ with [**uv**](https://github.com/astral-sh/uv) (for the Brain)
- **Node.js** 18+ with npm (for the frontend)
- Credentials: an **IBM watsonx.ai** API key + project ID, and (for live trading) **Polymarket** API
  key / passphrase / secret

### Quick start (Docker Compose)

```sh
# 1. Clone
git clone git@github.com:Harikeshav-R/Arb-OS.git
cd Arb-OS

# 2. Configure — copy the template and fill in your keys
cp .env.example .env
# edit .env → WATSONX_APIKEY, WATSONX_PROJECT_ID, POLYMARKET_* , etc.

# 3. Launch the stack (Postgres + Brain + Ingestor + Frontend)
make up          # or: docker compose up -d

# 4. Watch it run
make ps          # container status
make logs        # tail all logs  (make logs S=brain for one service)
```

| Service | URL |
| --- | --- |
| Brain API (FastAPI) | http://localhost:8000 · docs at `/docs` |
| Frontend dashboard | http://localhost:5173 |
| Bot API + WebSocket | http://localhost:3001 |
| PostgreSQL | `postgresql://postgres:password@localhost:5432/arbos` |

### Common Make targets

```sh
make up          # start all services in the background
make down        # stop and remove containers
make build       # rebuild images and start
make logs        # tail logs (S=<service> for one)
make db          # open psql against the database
make test        # run all tests (Rust + Brain)
make clean       # stop and remove volumes (⚠ deletes DB data)
```

### Running tiers individually

```sh
# Rust orchestrator (spawns Ingestor + Engine + Executor + API server)
cargo run -p bot

# Brain (Python / FastAPI)
cd services/brain && uv run uvicorn main:app --reload

# Frontend (Vite dev server)
cd frontend && npm install && npm run dev
```

---

## Configuration

All configuration is via environment variables (see [`.env.example`](.env.example)).

### Polymarket & infrastructure

| Variable | Description |
| --- | --- |
| `POLYMARKET_API_KEY` / `PASSPHRASE` / `SECRET` | CLOB API credentials (required for live trading) |
| `DATABASE_URL` | PostgreSQL DSN (`postgresql://…`) |
| `REDIS_URL` | Reserved for future cross-service signal bus |

### IBM watsonx.ai (Brain / Tier 2)

| Variable | Default | Description |
| --- | --- | --- |
| `WATSONX_APIKEY` | — | watsonx.ai API key (required) |
| `WATSONX_URL` | `https://us-south.ml.cloud.ibm.com` | watsonx.ai region endpoint |
| `WATSONX_PROJECT_ID` | — | watsonx.ai project ID (required) |
| `WATSONX_MODEL_ID` | `mistralai/mistral-large` | LLM model |

### Brain tuning

| Variable | Default | Description |
| --- | --- | --- |
| `BRAIN_LLM_TEMPERATURE` | `0.0` | LLM sampling temperature |
| `BRAIN_LLM_MAX_TOKENS` | `1024` | Max tokens per LLM call |
| `BRAIN_CONFIDENCE_THRESHOLD` | `0.7` | Min confidence to persist a relationship |
| `BRAIN_GAMMA_API_BASE_URL` | `https://gamma-api.polymarket.com` | Gamma API base |
| `BRAIN_GAMMA_MIN_VOLUME` | `1000` | Min market volume to track |
| `BRAIN_GAMMA_FETCH_LIMIT` | `100` | Markets fetched per page |

### Bot / Engine (Rust)

| Variable | Default | Description |
| --- | --- | --- |
| `ARBOS_LIVE_MODE` | `false` | `false` → Demo (paper); `true` → live execution |
| `ARBOS_INITIAL_ASSETS` | — | CSV of asset IDs to seed subscriptions |
| `ARBOS_WS_PORT` | `3001` | Bot REST + WebSocket port |
| `ARBOS_DEDUP_COOLDOWN` | `30` | Signal dedup cooldown (seconds) |
| `ARBOS_MAX_HISTORY` | `500` | Ledger trade-history ring-buffer size |
| `BRAIN_API_URL` | `http://localhost:8000` | Engine → Brain endpoint |
| `ADMIN_API_KEY` | — | `X-API-Key` for protected Brain endpoints |
| `VITE_ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allow-list for the Bot API |

> **Key thresholds** (`crates/core/src/constants.rs`): `TARGET_LIQUIDITY = $100`,
> `MIN_PROFIT_THRESH_USDC = $0.50`, `MIN_CONFIDENCE_THRESHOLD = 0.90`, `MAX_TRACKED_ASSETS = 1000`,
> `EXECUTOR_RATE_LIMIT_PER_SEC = 10`. Note the **dual confidence gate**: the Brain *persists* edges at
> ≥ 0.70 but the Engine only *trades* edges at ≥ 0.90.

---

## API Reference

### Brain (FastAPI · `:8000`)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | — | DB + LLM configuration status |
| `POST` | `/markets/sync` | admin | Upsert markets from Gamma |
| `GET` | `/markets` | — | List cached markets (paginated) |
| `POST` | `/analyze` | — | Analyze a single market pair |
| `POST` | `/scan` | admin | Scan top-N markets, analyze all unprocessed pairs |
| `GET` | `/relationships` | — | List active relationships (filter by `logic_type`) |
| `GET` | `/relationships/{condition_id}` | — | Relationships involving a market |
| `GET` | `/graph/stats` | — | Graph summary (edge/component counts) |
| `GET` | `/state` | admin | Full asset-level graph payload for the Engine |

Admin endpoints require an `X-API-Key` header when `ADMIN_API_KEY` is set.

### Bot (Axum · `:3001`)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/status` | JSON snapshot: mode, cumulative P&L, signals executed, uptime, open positions, recent trades |
| `GET` | `/ws` | WebSocket — sends a `SNAPSHOT` on connect, then streams live `EXECUTION_REPORT` messages |

---

## Project Structure

```text
Arb-OS/
├── Cargo.toml                  # Rust workspace: core, ingestor, engine, bot
├── docker-compose.yml          # postgres + brain + ingestor + frontend
├── Makefile                    # Docker lifecycle + test targets
├── .env.example                # All environment variables
├── PROJECT.md                  # Architecture & theory spec
├── REPORT.md                   # Detailed engineering report
├── AGENTS.md                   # AI-agent contributor guide
│
├── crates/                     # ── RUST WORKSPACE ──
│   ├── core/                   # Tier 0: shared domain types + constants
│   ├── ingestor/               # Tier 1: WebSocket feed + VWAP normalization
│   │   └── src/{main,actor,clob_client}.rs
│   ├── engine/                 # Tier 3: strategy math + signal generation
│   │   └── src/{main,actor}.rs, strategies/{implication,partition,contradiction}.rs
│   └── bot/                    # Tier 4: orchestrator + executor + server
│       └── src/{main,config,executor,ledger,dedup,server}.rs
│
├── services/
│   └── brain/                  # ── PYTHON (Tier 2: AI) ──
│       ├── main.py             # FastAPI app + APScheduler + endpoints
│       ├── graph.py            # LangGraph pipeline (validate→classify→persist)
│       ├── gamma_client.py     # Polymarket Gamma API client
│       ├── relationship_graph.py  # NetworkX DiGraph manager
│       ├── models.py           # SQLModel tables + API schemas
│       ├── database.py         # Async SQLAlchemy/asyncpg engine
│       ├── config.py           # Pydantic settings
│       ├── prompts.py          # LLM prompt templates
│       └── tests/              # pytest suite
│
├── frontend/                   # ── REACT/VITE/TS (Tier 5: Dashboard) ──
│   └── src/
│       ├── App.tsx             # Router: /, /connect, /graph, /configure, /dashboard, /guide
│       ├── pages/              # Index, Connect, Graph, Configure, Dashboard, Guide
│       ├── components/         # ForceGraph, Navbar, WebGLCanvas + shadcn/ui
│       └── hooks/
│
└── .github/workflows/ci.yml    # 3 CI jobs: rust-check, python-check, frontend-check
```

---

## Development

### Testing

```sh
make test              # everything
make test-rust         # cargo test (engine, ingestor, core)
make test-brain        # pytest suite for the Brain
cd frontend && npm test # Vitest
```

### Linting & formatting

```sh
cargo fmt --all && cargo clippy --all-targets --all-features -- -D warnings
cd services/brain && uv run ruff check .
cd frontend && npm run lint
```

Pre-commit hooks (`.pre-commit-config.yaml`) run `rustfmt`, `clippy`, `ruff`, and the frontend
lint/typecheck automatically:

```sh
pip install pre-commit && pre-commit install
```

### CI pipeline

Every push/PR to `main` runs three parallel GitHub Actions jobs:

```mermaid
flowchart LR
    P["push / PR → main"] --> R["rust-check<br/>fmt · clippy -D warnings · cargo test"]
    P --> Y["python-check<br/>uv sync · ruff · pytest"]
    P --> F["frontend-check<br/>npm ci · tsc --noEmit"]
    R --> M{"all green?"}
    Y --> M
    F --> M
    M -->|yes| OK["✅ mergeable"]

    classDef job fill:#16213E,stroke:#00D4AA,color:#F8FAFC;
    class R,Y,F job;
```

### Git workflow

ArbOS uses **Conventional Commits** with scoped branches (`type/scope/description`):

- **Types:** `feat/`, `fix/`, `chore/`, `refactor/`
- **Scopes:** `engine`, `ingestor`, `bot`, `brain`, `web`, `infra`

Example: `feat(engine): add VWAP calculator` · `fix(brain): gamma-api filter`

---

## Safety & Risk Engineering

Guaranteed-at-resolution does not mean guaranteed-*before*-resolution. ArbOS hardens against every
real-world failure mode:

| Hazard | Defense |
| --- | --- |
| **Single-leg exposure** | **Panic-dump**: close the filled leg immediately; pause after 2 consecutive |
| **Fakeout / MEV liquidity** | **Fill-or-Kill only** — never GTC; VWAP pre-check to `$100` depth |
| **Oracle settlement delay** | **Max-duration filter**: refuse markets resolving > 30 days out |
| **API rate limiting (429)** | **Token-bucket Governor** capped at 10 req/s |
| **Slippage** | VWAP-adjusted spread check; FOK cancels if unfillable |
| **Duplicate firing** | **Canonical-hash dedup** with a 30 s cooldown + cache eviction |
| **Cascading failures** | **Circuit breaker**: 3 consecutive failures → auto-pause + alert |
| **WebSocket drop** | Pause + exponential backoff (1→2→4→8→30 s) + full state re-sync |
| **False relationship** | **Dual confidence gate**: Brain persists ≥ 0.70, Engine trades ≥ 0.90 |

All tiers emit **structured logs** — `tracing` (Rust), `loguru` JSON (Python), `pino`/`winston` (TS).

---

## Deployment

ArbOS ships fully containerized via `docker-compose.yml` (Postgres + Brain + Ingestor + Frontend),
with multi-stage, non-root Dockerfiles for the Brain (`uv`) and Ingestor (`rust:1.93-slim`). The
container-native design maps cleanly onto a managed, highly-available cloud topology:

```mermaid
flowchart TB
    DNS["Route 53"] --> CF["CloudFront + S3<br/>(dashboard SPA)"]
    DNS --> ALB["Application Load Balancer<br/>(TLS + WebSocket)"]
    ALB --> B["ECS Fargate · Brain"]
    ALB --> I["ECS Fargate · Ingestor"]
    ALB --> BOT["ECS Fargate · Bot"]
    B --> RDS[("RDS PostgreSQL<br/>Multi-AZ")]
    BOT --> REDIS[("ElastiCache Redis")]
    ECR["Amazon ECR"] -. images .-> B
    ECR -. images .-> I
    ECR -. images .-> BOT
    SM["Secrets Manager<br/>API + wallet keys"] -. secrets .-> BOT

    classDef aws fill:#232F3E,stroke:#FF9900,color:#F8FAFC;
    class DNS,CF,ALB,B,I,BOT,RDS,REDIS,ECR,SM aws;
```

See [`REPORT.md`](REPORT.md) for the full reference architecture (Terraform IaC, Prometheus/Grafana
observability, CloudWatch, ECR image scanning).

---

## Documentation

| Document | Contents |
| --- | --- |
| [`PROJECT.md`](PROJECT.md) | Architecture & theoretical foundations (the "alpha"), tier specs, launch checklist |
| [`REPORT.md`](REPORT.md) | Detailed engineering report + inferred production cloud topology |
| [`AGENTS.md`](AGENTS.md) | Context & rules for AI-agent contributors |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution guidelines |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Community standards |

---

## Contributing

Contributions are welcome! Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and follow the
Conventional Commits + scoped-branch workflow. Never push directly to `main` — open a clean, modular
pull request. Ensure `cargo fmt`, `clippy`, `ruff`, and the frontend typecheck all pass before
submitting.

---

## License

Released under the [MIT License](LICENSE). © 2026 Harikeshav Rameshkumar.

---

<div align="center">

**Built for the IBM SkillsBuild Hackathon · Fintech Track · February 2026**

*Powered by IBM watsonx.ai & Granite*

</div>
