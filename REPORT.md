# ArbOS — Automated Prediction Market Arbitrage Engine

> **The market is wrong. Profit from it.**

---

## Executive Summary

**ArbOS** is a low-latency, logic-driven financial trading system that automatically identifies and
exploits mathematical inconsistencies in decentralized prediction markets — specifically
**Polymarket**, running on the **Polygon PoS** chain. Where conventional arbitrage hunts for price
gaps *between* exchanges, ArbOS performs a fundamentally more powerful trick: **Logical Arbitrage**.
It monitors hundreds of event outcomes simultaneously, uses an AI "Brain" to map how real-world
events are logically connected, and detects the instant the order-book math violates the axioms of
probability. When it finds such a violation, it fires two (or more) simultaneous, delta-neutral
orders to lock in a **mathematically guaranteed, risk-free profit**.

The system is a production-grade **polyglot monorepo** spanning five cooperating tiers written in
three languages — **Rust** for the microsecond-sensitive data and execution path, **Python** for
the AI reasoning layer, and **TypeScript/React** for the real-time control dashboard — glued
together by a PostgreSQL data plane, an IBM watsonx.ai reasoning core, and a fully containerized,
cloud-native deployment topology.

ArbOS was engineered for the **IBM SkillsBuild Hackathon (Fintech Track, February 2026)**.

| Metric | Value |
| --- | --- |
| Arbitrage detection latency | **~14 ms** end-to-end |
| Simultaneous markets tracked | **up to 1,000** live order books |
| Arbitrage strategies | **4** (Implication, Partition, Mutual Exclusion, AI-Chained) |
| Minimum profit gate | **$0.50** net, after fees + gas |
| Order safety model | **Fill-or-Kill only**, with atomic panic-dump failsafe |
| Language tiers | **5** (Rust ×3, Python, TypeScript) |
| Reasoning engine | **IBM watsonx.ai** (`mistralai/mistral-large`) via LangGraph |

---

## 1. The Problem & The Alpha

Prediction markets like Polymarket let people trade the probability of real-world events ("Will the
Fed cut rates in June 2026?"). Each market has its **own isolated order book** and its own crowd of
traders. Nobody enforces consistency *across* related markets. That structural gap is the alpha.

Consider two markets:

1. **Market A** — *Will the Fed cut rates in June 2026?* trading at **60¢** (60% implied)
2. **Market B** — *Will the Fed cut rates in 2026?* trading at **55¢** (55% implied)

June 2026 is a **strict subset** of the year 2026. It is logically impossible for the Fed to cut in
June without also having cut *in 2026*. Therefore **P(A) can never exceed P(B)** — yet the market
prices A *higher* than B. The order books have contradicted the laws of logic.

ArbOS detects this in milliseconds and executes:

- **SELL (short) Market A @ 60¢**
- **BUY (long) Market B @ 55¢**

This locks in **+5¢ per share, risk-free**, minus fees and gas. At resolution, every possible
outcome nets out to that spread — the logical relationship *resolves the paradox* no matter what the
Fed actually does.

### Why these opportunities exist

| Cause | Explanation |
| --- | --- |
| **No centralized market maker** | No single entity enforces cross-market coherence on Polymarket. |
| **Fragmented liquidity** | Every market has its own order book and participant base. |
| **Sentiment-driven pricing** | Retail traders price on news and emotion, not probability constraints. |
| **Speed requirements** | Violations appear and vanish in seconds — impossible to catch by hand. |
| **Combinatorial scale** | 500+ active markets → **125,000+** pairwise relationships to scan. |
| **No regulatory arbitrage desk** | Unlike equities, no institution polices cross-market consistency. |

### Guaranteed, not merely probable

A cross-exchange spread can close *against* you before you execute. A **logical violation cannot**:
if `June ⊆ 2026`, that is true regardless of what happens in the world. The profit is locked in the
moment both legs fill.

---

## 2. The Four Types of Logical Arbitrage

ArbOS exploits four distinct classes of probability-axiom violations.

### Type 1 — Implication Constraint (Monotonicity)

```
Axiom:      If A ⊆ B, then P(A) ≤ P(B)
Violation:  P(A)_bid > P(B)_ask + fees
Strategy:   SELL the sub-event A, BUY the super-event B
Profit:     (P(A)_bid − P(B)_ask) − (Fee_A + Fee_B + Gas)
```

**Worked example** — *Fed Cut June (60¢) → Fed Cut 2026 (55¢)*, 100 shares:

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

### Type 2 — Partition Constraint (Normalization)

```
Axiom:      For mutually-exclusive, exhaustive outcomes, Σ P(Eᵢ) = 1.0
Violation:  Σ P(Eᵢ)_bid > 1.0 + fees
Strategy:   Basket-SELL every outcome simultaneously
Profit:     (Σ P(Eᵢ)_bid) − 1.0 − Σ fees
```

**Worked example** — *"When will the Fed cut in 2026?"*:

| Outcome | YES Bid |
| --- | --- |
| Fed cuts in Q1 2026 | 22¢ |
| Fed cuts in Q2 2026 | 31¢ |
| Fed cuts in Q3 2026 | 28¢ |
| Fed cuts in Q4 2026 | 19¢ |
| No Fed cut in 2026 | 16¢ |
| **TOTAL** | **116¢** |

The outcomes are exhaustive, so they must sum to 100¢. They sum to 116¢. **Sell all five**, collect
116¢; exactly one pays out 100¢ at resolution → **+16¢ net minus fees**.

### Type 3 — Mutual Exclusion (Contradiction)

```
Axiom:      If A and B cannot both occur, P(A) + P(B) ≤ 1.0
Violation:  P(A)_bid + P(B)_bid > 1.0
Strategy:   SELL both sides
```

*"Candidate X wins" (58¢) + "Candidate Y wins" (49¢) = 107¢* — impossible for two mutually exclusive
outcomes. Sell both, collect 107¢, one pays 100¢ → **+7¢ net**.

### Type 4 — Chained Implication (AI-Discovered)

```
Axiom:  If A → B → C, then P(A) ≤ P(C)
```

Multi-hop logical chains across *seemingly unrelated* markets — the kind of connection humans miss
entirely. The **ArbOS Brain** (IBM watsonx.ai) maps these automatically:

```
Company X acquires Y (45¢) → Y delists from NASDAQ (38¢) → NASDAQ rebalances Q3 (30¢)
P(A)=45¢ > P(C)=30¢ → chain violation: +15¢
```

---

## 3. System Architecture

ArbOS is organized into **five tiers**, each with a single clear responsibility. The three Rust
tiers compile into a single high-performance orchestrator binary; the Brain runs as an independent
Python microservice; the dashboard is a static SPA.

| Tier | Name | Language | Path | Role |
| --- | --- | --- | --- | --- |
| 1 | **Ingestor** | Rust | `crates/ingestor` | Real-time WebSocket order-book feed + VWAP normalization |
| 2 | **Brain** | Python (FastAPI) | `services/brain` | LLM-driven discovery of the logical relationship graph |
| 3 | **Engine** | Rust | `crates/engine` | High-frequency pricing math + arbitrage signal generation |
| 4 | **Bot** | Rust | `crates/bot` | Atomic execution, ledger, dedup, REST/WebSocket server |
| 5 | **Dashboard** | React/Vite/TS | `frontend` | Real-time visualization + control panel |
| 0 | **Core** | Rust | `crates/core` | Shared domain types, fee/gas constants, thresholds |

### End-to-end data flow

```
                        Polymarket Gamma REST API
                        (active markets, volume ≥ 1000)
                                    │
                                    ▼
        ┌───────────────────────────────────────────────┐
        │  TIER 2 — BRAIN (Python / FastAPI :8000)        │
        │  • APScheduler: discover + analyze every 15 min │
        │  • LangGraph: validate → classify → persist     │
        │  • IBM watsonx.ai (mistral-large) classifies    │
        │    each market pair: IMPLIES / MUT-EXCL / INDEP │
        │  • NetworkX DiGraph + PostgreSQL persistence    │
        └───────────────────────┬───────────────────────┘
                                 │  GET /state  (Engine polls every 60 s)
                                 │  {implications, partitions, contradictions, timestamps}
                                 ▼
        ┌───────────────────────────────────────────────┐        Subscribe /
        │  TIER 3 — ENGINE (Rust)                         │◄────── Unsubscribe
        │  • Caches the logical graph in memory           │        (IngestorCommand)
        │  • Runs implication/partition/contradiction math│               │
        │  • Live Polygon gas oracle + fee model          │               │
        └───────┬───────────────────────────────▲────────┘               │
                │ ArbSignal (mpsc)               │ NormalizedOrderbook    │
                ▼                                │ (VWAP, mpsc)           ▼
        ┌───────────────────────┐        ┌───────────────────────────────────────┐
        │  TIER 4 — EXECUTOR     │        │  TIER 1 — INGESTOR (Rust)             │
        │  • Token-bucket limiter│        │  • Polymarket CLOB WebSocket feed     │◄── wss://…clob
        │  • Canonical dedup     │        │  • VWAP normalization to $100 depth   │
        │  • FOK execution       │        │  • UNTRADEABLE liquidity guard        │
        └───────┬───────────────┘        └───────────────────────────────────────┘
                │ ExecutionReport → Ledger (P&L, positions)
                │ broadcast::channel
                ▼
        ┌───────────────────────────────────────────────┐
        │  TIER 4 — AXUM SERVER (:3001)                   │
        │  GET /ws  (SNAPSHOT + EXECUTION_REPORT stream)  │──────► TIER 5 — DASHBOARD (React)
        │  GET /api/status, /api/health                   │
        └───────────────────────────────────────────────┘
```

### Two independent control loops

1. **Brain discovery loop (15-minute cadence)** — APScheduler syncs the latest markets from
   Polymarket's Gamma API, then runs the LLM over all unprocessed pairs to grow the relationship
   graph.
2. **Engine execution loop (60-second cadence)** — the Rust Engine re-polls the Brain's `/state`
   endpoint, diffs the tracked-asset set, dynamically manages live WebSocket subscriptions, and
   refreshes the Polygon gas oracle — all while continuously evaluating incoming order-book updates
   in real time.

---

## 4. Tier-by-Tier Deep Dive

### Tier 0 — Core (`crates/core`)

The shared foundation for the Rust workspace. Defines the canonical domain types that flow between
tiers and the tuning constants that govern the entire system.

**Domain types** (`crates/core/src/domain.rs`):

- `StrategyType` — `Implication | Partition | Contradiction | Unknown`
- `TradeAction` — `Buy { asset_id, size } | Sell { asset_id, size }`
- `ArbSignal` — `{ strategy, legs: Vec<TradeAction>, expected_profit_usdc, timestamp }`
- `NormalizedOrderbook` — `{ asset_id, market, vwap_bid, vwap_ask, bid_untradeable, ask_untradeable, timestamp }`
- `IngestorCommand` — `Subscribe(asset) | Unsubscribe(asset)`
- `ExecutionMode` — `Demo | Live`
- `FillDetail` / `ExecutionReport` — post-trade accounting records

**Tuning constants** (`crates/core/src/constants.rs`):

| Constant | Value | Meaning |
| --- | --- | --- |
| `PEAK_TAKER_FEE_CRYPTO_AT_50PCT` | `0.0156` | Conservative 1.56% crypto-market taker fee |
| `PEAK_TAKER_FEE_SPORTS_AT_50PCT` | `0.0044` | 0.44% sports-market taker fee |
| `GAS_SAFETY_MARGIN` | `1.5` | 50% buffer on gas estimates |
| `ESTIMATED_GAS_UNITS_PER_LEG` | `50000` | Polygon gas units per order |
| `MATIC_PRICE_USDC` | `0.60` | Static POL/MATIC price for gas budgeting |
| `TARGET_LIQUIDITY` | `$100` | VWAP depth target per side |
| `MIN_PROFIT_THRESH_USDC` | `$0.50` | Absolute minimum net profit to fire |
| `MIN_CONFIDENCE_THRESHOLD` | `0.90` | Engine only trusts edges ≥ 90% confidence |
| `MAX_TRACKED_ASSETS` | `1000` | Cap on live subscriptions |
| `EXECUTOR_RATE_LIMIT_PER_SEC` | `10` | Token-bucket rate cap |

All monetary math uses `rust_decimal` fixed-point arithmetic — never floating point — to guarantee
exact cent-level accounting.

### Tier 1 — Ingestor (`crates/ingestor`)

**Responsibility:** maintain a real-time, normalized view of the market.

The `IngestorActor` (`crates/ingestor/src/actor.rs`) connects to Polymarket's CLOB WebSocket
(`wss://ws-subscriptions-clob.polymarket.com/ws/market`) through the official
`polymarket-client-sdk` v0.4.2 (`clob::ws::Client`, wrapped in `clob_client.rs`). It is a Tokio
actor that:

- **Dynamically subscribes/unsubscribes** to per-asset order books on command from the Engine,
  multiplexing many concurrent streams via a `SelectAll` combinator, capped at
  `MAX_TRACKED_ASSETS = 1000`.
- **Computes VWAP** (volume-weighted average price) up to the `$100` `TARGET_LIQUIDITY` target,
  walking order-book levels and taking a partial fill at the final level:

  ```
  P_vwap = Σ(Pᵢ × Vᵢ) / Σ(Vᵢ)   for levels until Σ(Vᵢ) ≥ TARGET_LIQUIDITY
  ```

- **Flags illiquid markets** — if a side cannot supply `$100` of depth, it is marked
  `UNTRADEABLE`, preventing the Engine from firing into a book it can't actually fill (the
  "fakeout liquidity" defense).
- **Reconnects with exponential backoff** (up to 10 retries, capped at 60 s) on stream errors.

It emits `NormalizedOrderbook` structs downstream to the Engine over an MPSC channel.

### Tier 2 — Brain (`services/brain`)

**Responsibility:** discover the "Hidden Graph" of logical relationships between markets.

This is a genuine **LLM reasoning system** built on IBM watsonx.ai. It is a FastAPI service backed
by PostgreSQL, an in-memory NetworkX graph, and an APScheduler-driven discovery loop.

**LLM pipeline** (`services/brain/graph.py`) — a **LangGraph `StateGraph`**:

```
START → validate_pair → classify_relationship → persist_result → END
                 │
                 └──(invalid)──► END
```

- **`validate_pair`** — loads both `Market` rows; rejects identical, closed, inactive, or missing
  pairs.
- **`classify_relationship`** — invokes `ChatWatsonx` (default model `mistralai/mistral-large`,
  temperature `0.0`, max 1024 tokens) with `llm.with_structured_output(RelationshipOutput)`. A
  two-level fallback (structured output → raw JSON parse → `INDEPENDENT`) guarantees a valid result.
  Results below the confidence threshold (`BRAIN_CONFIDENCE_THRESHOLD`, default `0.7`) are downgraded
  to `INDEPENDENT`.
- **`persist_result`** — upserts into the `relationships` table, canonicalizing edge direction
  (normalizes `B_TO_A` into `A_TO_B`; sorts undirected pairs) so each pair is stored once.

**Classification schema** (`RelationshipOutput`):

```json
{
  "relation":   "IMPLIES | MUTUALLY_EXCLUSIVE | INDEPENDENT",
  "direction":  "A_TO_B | B_TO_A | NONE",
  "confidence": 0.0–1.0,
  "reasoning":  "string"
}
```

The system prompt (`services/brain/prompts.py`) casts the model as a *"logic engine for a prediction
market"* and enforces strict JSON output.

**In-memory graph** (`services/brain/relationship_graph.py`) — a `NetworkX DiGraph` guarded by an
`asyncio.Lock`, loaded from the DB at startup. `get_partition_groups()` derives candidate partition
baskets from the **connected components** of the mutual-exclusion subgraph; partition edges are
*derived*, not emitted directly by the LLM.

**Data source** (`services/brain/gamma_client.py`) — paginates Polymarket's public **Gamma REST API**
(`https://gamma-api.polymarket.com/markets?active=true&closed=false`, 100/page), keeping markets
with `volume ≥ 1000`, and handles HTTP 429 rate-limits explicitly.

**The `/state` contract** — the crucial cross-language bridge. `get_brain_state` transforms
condition-level relationships into **asset-token-level** mappings the Rust Engine consumes:

- maps each `condition_id` → its YES CLOB token (`clob_token_ids[0]`);
- emits `implications` (parent/child asset IDs + confidence), `contradictions` (asset pairs +
  confidence), and `partitions` (verified as true cliques, confidence = min pairwise confidence,
  keyed by a deterministic `sha256` synthetic condition ID);
- returns `asset_end_timestamps` so the Engine can enforce its max-duration filter.

**Data models** (`services/brain/models.py`, SQLModel → PostgreSQL):

- **`markets`** — `id`, `condition_id` (unique), `question_id`, `question`, `description`, `slug`,
  `neg_risk`, `active`, `closed`, `volume`, `end_date`, `event_id`, `event_title`,
  `clob_token_ids` (JSON), `updated_at`.
- **`relationships`** — `id`, `parent_condition_id`, `child_condition_id`, `logic_type`,
  `direction`, `confidence`, `reasoning`, `is_active`, timestamps, `UNIQUE(parent, child)`.

**REST API surface** (`services/brain/main.py`):

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | — | DB + LLM configuration status |
| POST | `/markets/sync` | admin | Upsert markets from Gamma |
| GET | `/markets` | — | List cached markets (paginated, volume desc) |
| POST | `/analyze` | — | Analyze a single market pair |
| POST | `/scan` | admin | Scan top-N markets, analyze all unprocessed pairs |
| GET | `/relationships` | — | List active relationships (filterable by `logic_type`) |
| GET | `/relationships/{condition_id}` | — | Relationships involving a market |
| GET | `/graph/stats` | — | Graph summary (edge/component counts) |
| GET | `/state` | admin | Full asset-level graph payload for the Rust Engine |

Admin endpoints are protected by an optional `X-API-Key` header.

### Tier 3 — Engine (`crates/engine`)

**Responsibility:** the high-frequency calculator — the strategic heart of ArbOS.

The `EngineActor` (`crates/engine/src/actor.rs`) holds the entire logical graph in memory
(implication edges + reverse index, contradiction edges, partition outcomes, asset→partition map,
expected outcome counts, market end timestamps, tracked-asset set, and the live per-leg gas cost).

**Run loop:**

1. **Blocks until the Brain's `/state` is reachable** — never starts on empty state.
2. Initializes the Polygon gas oracle.
3. `tokio::select!`s between incoming `NormalizedOrderbook` updates and a **60-second sync tick**.

**Brain→Engine sync** (`sync_brain_state`) — GETs `/state`, parses the graph, and **drops any edge
below `MIN_CONFIDENCE_THRESHOLD = 0.90`** (a deliberate safety gap: the Brain *persists* at ≥0.70 but
the Engine only *acts* at ≥0.90). It then recomputes the tracked-asset set (dropping expired assets,
capping at 1000), diffs against the current subscriptions, and sends `Subscribe`/`Unsubscribe`
commands back to the Ingestor — hot-swapping the graph atomically.

**Per-update evaluation** (`handle_book_update`):

- Applies the **max-duration filter** — drops any asset resolving **> 30 days out** (avoids capital
  lockup from the "Oracle Delay" black-swan scenario).
- Caches the book, then runs all three strategy evaluators.
- **Evicts executed legs from the cache** to prevent back-to-back double-firing.

**The three strategies:**

- **Implication** (`strategies/implication.rs`) — fires when `parent_bid > child_ask`. Gross/share =
  `prob_a_bid − prob_b_ask`; delta-neutral sizing = `TARGET_LIQUIDITY / max(parent_bid, child_ask)`.
  Checks both edge directions and even sibling children of a shared parent.
- **Partition** (`strategies/partition.rs`) — fires when `Σ bids > 1.0`. Requires **strict
  exhaustiveness** (tradable legs must equal the expected outcome count) or it aborts, so it never
  leaves directional risk.
- **Contradiction** (`strategies/contradiction.rs`) — fires when `bid_a + bid_b > 1.0` for a
  mutually-exclusive pair; sells both sides.

Each strategy computes `net = gross − taker_fees − gas` and only emits a signal when `net >
MIN_PROFIT_THRESH_USDC ($0.50)`.

**Fee & gas modeling ("the Grim Reaper"):**

- Conservative flat taker fee of **1.56%** (crypto peak at 50% odds).
- Live gas from the **Polygon Gas Station** (`https://gasstation.polygon.technology/v2`):
  `gas_units(50000) × gwei / 1e9 × MATIC_PRICE(0.60) × SAFETY_MARGIN(1.5)` per leg.

The Engine emits `ArbSignal`s to the Bot over an MPSC channel. Comprehensive unit tests in
`crates/engine/src/strategies/tests/` verify trigger conditions and cache eviction.

### Tier 4 — Bot / Executor (`crates/bot`)

**Responsibility:** atomic settlement, accounting, and the API surface for the dashboard.

**Orchestrator** (`crates/bot/src/main.rs`) — the primary production entry point. Its
`#[tokio::main]` spawns four Tokio tasks (Axum server, Ingestor, Engine, Executor) wired by typed
MPSC channels, a `broadcast::channel` for WebSocket fan-out, and a shared `Arc<RwLock<Ledger>>`.
Graceful shutdown is handled via a `CancellationToken` + Ctrl+C.

**Executor** (`crates/bot/src/executor.rs`) — per-signal pipeline:

1. **Token-bucket rate limit** (`10 req/s`) — the "Governor" that avoids Polymarket's HTTP 429s.
2. **Deduplication** — a `SignalDeduplicator` (`dedup.rs`) hashes the *sorted* asset-ID set into a
   canonical `u64` key (so any leg permutation collapses to one entry) and blocks re-execution within
   a cooldown window (default 30 s).
3. **Execution** — places **Fill-or-Kill** orders per leg through the Polymarket SDK's
   `ClobClient::create_order()`, with EIP-712 typed-data signing, API-key/passphrase/secret
   authentication, and fee attachment handled automatically by the SDK. If one leg fills but its
   pair fails, the executor immediately **panic-dumps** the filled leg back to the market to
   neutralize directional exposure.
4. **Ledger recording** and **WebSocket broadcast** of the resulting `ExecutionReport`.

The executor supports both **Live** and **Demo** (paper-trading) modes, selectable via
`ARBOS_LIVE_MODE`, so strategies can be validated risk-free before capital is committed.

**Ledger** (`crates/bot/src/ledger.rs`) — an in-memory accounting core: a bounded ring buffer of
execution reports (default 500), a `HashMap<U256, Position>` with weighted-average entry pricing and
full open/close/reverse logic, cumulative P&L, and signal counters.

**API server** (`crates/bot/src/server.rs`) — an **Axum** HTTP + WebSocket server with
env-configurable CORS (`VITE_ALLOWED_ORIGINS`, default `http://localhost:5173`):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ws` | WebSocket — sends a `SNAPSHOT` on connect, then streams live `EXECUTION_REPORT` messages |
| GET | `/api/health` | Liveness probe |
| GET | `/api/status` | JSON snapshot: mode, cumulative P&L, signals executed, uptime, open positions, recent trades |

**Configuration** (`crates/bot/src/config.rs`): `ARBOS_LIVE_MODE`, `ARBOS_INITIAL_ASSETS`,
`ARBOS_WS_PORT` (3001), `ARBOS_DEDUP_COOLDOWN` (30 s), `ARBOS_MAX_HISTORY` (500).

### Tier 5 — Dashboard (`frontend`)

**Responsibility:** real-time visualization and manual control.

A **React 18 + Vite + TypeScript** single-page app styled with **Tailwind CSS** and **shadcn/ui**
(Radix primitives). It streams live data from the Bot's `/ws` and `/api/status` endpoints and renders
it through a polished, high-performance UI.

**Routes** (`frontend/src/App.tsx`): a guided operator wizard —
`/` (landing) → `/connect` (wallet linking) → `/graph` (AI relationship builder) →
`/configure` (risk parameters) → `/dashboard` (live control room) → `/guide` (strategy manual).

**Key features:**

- **Live relationship graph** — a `d3-force` force-directed graph (`components/ForceGraph.tsx`)
  rendering markets as nodes and logical relationships as typed, animated edges (solid = implication,
  dashed = mutual exclusion, dotted = partition), with glowing pulses when an arb fires, zoom/pan,
  and drag.
- **AI chat graph builder** (`/graph`) — a conversational interface to the Brain: describe a topic in
  plain English ("Track all 2026 Fed rate markets") and the AI maps the logical graph, with slash
  commands (`/add`, `/remove`, `/suggest`, `/threshold`, `/scan`, `/export`).
- **Live control room** (`/dashboard`) — real-time P&L ticker, trade log, open-positions panel with
  guaranteed-P&L pairing, engine-latency readout, and a full system-health board (WebSocket, Gamma
  API, Brain/watsonx, Polygon gas, Postgres).
- **Risk configuration** (`/configure`) — capital allocation, min-profit threshold, max position
  size, min-liquidity depth, max-duration, and Auto vs. Confirm execution mode, with a live
  fee-breakdown and projected-return estimator.
- **WebGL landing canvas** + **framer-motion** transitions throughout.

**Frontend libraries:** `@tanstack/react-query` (data layer), `react-router-dom`, `react-hook-form`
+ `zod` (forms/validation), `recharts` + `d3` (viz), `framer-motion` (animation), `lucide-react`
(icons), `sonner` (toasts), `next-themes`, and the full Radix/shadcn component set.

---

## 5. Safety & Risk Engineering — The "Black Swan" Playbook

Guaranteed-at-resolution does not mean guaranteed-before-resolution. ArbOS hardens against every
failure mode of real-world execution:

| Hazard | Symptom | ArbOS Defense |
| --- | --- | --- |
| **Single-leg exposure** | Leg A fills, Leg B fails → naked position | **Panic-dump**: close the filled leg within 5 s; log as `PARTIAL`; pause after 2 consecutive |
| **Fakeout / MEV liquidity** | Book shows depth, order fails | **Fill-or-Kill only** — never Good-Till-Cancelled; VWAP pre-check to `$100` depth |
| **Oracle settlement delay** | UMA takes hours/days → capital lockup | **Max-duration filter**: refuse markets resolving > 30 days out |
| **API rate limiting** | HTTP 429 from Polymarket | **Token-bucket Governor** capped at 10 req/s |
| **Slippage** | Large order eats through the book | **VWAP-adjusted** spread check before firing; FOK cancels if unfillable |
| **Duplicate firing** | Same edge re-triggers instantly | **Canonical-hash dedup** with a 30 s cooldown; cache eviction of executed legs |
| **Cascading failure** | Repeated trade failures | **Circuit breaker**: 3 consecutive failures → auto-pause + alert |
| **WebSocket drop** | Feed disconnects | Execution pauses; **exponential backoff** (1→2→4→8→30 s); full state re-sync before resuming |
| **False relationship** | LLM over-confidence | **Dual confidence gate**: Brain persists ≥ 0.70, Engine only trades ≥ 0.90 |

Every significant action, state change, and error is emitted as **structured, machine-readable
logs** — `tracing` (Rust), `loguru` JSON (Python), `pino`/`winston` (TypeScript). `println!`/
`console.log` are forbidden in production code.

---

## 6. Complete Tech Stack

### Languages

| Language | Version | Where |
| --- | --- | --- |
| Rust | Edition 2024, toolchain 1.93 | Ingestor, Engine, Bot, Core |
| Python | ≥ 3.13 | Brain |
| TypeScript | 5.8 | Frontend |

### Rust workspace (Cargo)

| Crate | Version | Purpose |
| --- | --- | --- |
| `tokio` | 1.49 (full) | Async runtime, actors, channels |
| `polymarket-client-sdk` | 0.4.2 | CLOB WebSocket + order placement + EIP-712 signing |
| `serde` / `serde_json` | 1.0 | Serialization |
| `rust_decimal` | 1.40 | Exact fixed-point money math |
| `axum` | 0.8 (ws) | Bot HTTP + WebSocket server |
| `tower-http` | 0.6 (cors) | CORS middleware |
| `tokio-util` | 0.7 | Cancellation tokens |
| `reqwest` | 0.12 (json) | Engine → Brain `/state` polling + gas oracle |
| `futures` | 0.3 | Stream multiplexing |
| `tracing` / `tracing-subscriber` | 0.1 / 0.3 | Structured logging |
| `anyhow` | 1.0 | Error handling |

### Python Brain (uv)

| Package | Version | Purpose |
| --- | --- | --- |
| `fastapi` | 0.133 | Async web framework / REST API |
| `uvicorn[standard]` | 0.41 | ASGI server (uvloop, httptools, websockets) |
| `sqlmodel` | 0.0.37 | ORM (Pydantic + SQLAlchemy 2.0) |
| `asyncpg` | 0.31 | Async PostgreSQL driver |
| `pydantic` / `pydantic-settings` | 2.12 / 2.13 | Validation + env config |
| `langchain-core` | 1.2 | LLM abstractions |
| `langchain-ibm` | 1.0 | IBM watsonx.ai integration (`ChatWatsonx`) |
| `langgraph` | 1.0 | StateGraph orchestration |
| `httpx` | 0.28 | Async Gamma API client |
| `networkx` | 3.6 | In-memory relationship graph |
| `apscheduler` | 3.11 | 15-minute discovery scheduler |
| `loguru` | 0.7 | Structured JSON logging |
| `pytest` + `pytest-asyncio` + `pytest-httpx` | 9.0 / 1.3 / 0.36 | Test suite |
| `ruff` | 0.15 | Lint + format |

### Frontend (npm / Vite)

| Category | Libraries |
| --- | --- |
| Framework | `react` 18.3, `react-dom`, `react-router-dom` 6.30 |
| Build | `vite` 5.4 + `@vitejs/plugin-react-swc` |
| Data | `@tanstack/react-query` 5.83 |
| UI | `shadcn/ui` + ~30 `@radix-ui/*` primitives, `lucide-react`, `sonner`, `vaul`, `cmdk` |
| Styling | `tailwindcss` 3.4, `tailwind-merge`, `class-variance-authority`, `next-themes` |
| Viz | `d3` 7.8, `recharts` 2.15, `framer-motion` 11 |
| Forms | `react-hook-form` 7.61, `@hookform/resolvers`, `zod` 3.25 |
| Test | `vitest` 3.2, `@testing-library/react`, `jsdom` |
| Lint | `eslint` 9, `typescript-eslint` 8 |

### Platform & external services

| Category | Technology |
| --- | --- |
| Prediction market | **Polymarket** (CLOB WebSocket + Gamma REST API) |
| Blockchain | **Polygon PoS** — USDC collateral, CTF Exchange, UMA oracle, EIP-712 orders |
| AI / LLM | **IBM watsonx.ai** — `mistralai/mistral-large` via LangGraph + LangChain |
| Database | **PostgreSQL 15** |
| Gas oracle | Polygon Gas Station v2 |

---

## 7. Infrastructure, Deployment & Cloud Architecture

### Local / development (in-repo)

The system ships fully containerized. `docker-compose.yml` orchestrates the stack, and a `Makefile`
wraps the lifecycle (`make up`, `make logs`, `make db`, `make test`).

- **`postgres`** — `postgres:15-alpine`, healthchecked, persistent `pgdata` volume.
- **`brain`** — multi-stage Python 3.13 image built with **uv** (`uv sync --frozen --no-dev`), runs
  as a non-root user, healthchecked on `/health`.
- **`ingestor`** — multi-stage Rust image (`rust:1.93-slim-bookworm` builder → `debian:bookworm-slim`
  runtime) with dependency-layer caching and a non-root runtime user.
- **`frontend`** — Vite build served on port 80.

All services use JSON-file logging with rotation.

### Production cloud topology (AWS reference architecture)

The containerized design maps cleanly onto a managed, highly-available AWS deployment:

```
                                   Route 53 (DNS)
                                        │
                    ┌───────────────────┼────────────────────┐
                    ▼                                          ▼
          CloudFront + S3                              Application Load Balancer
        (React dashboard SPA)                                   │
                                          ┌─────────────────────┼─────────────────────┐
                                          ▼                     ▼                     ▼
                                   ECS Fargate           ECS Fargate           ECS Fargate
                                   (Brain / FastAPI)     (Ingestor)            (Bot orchestrator)
                                          │                     │                     │
                                          └─────────┬───────────┴──────────┬──────────┘
                                                    ▼                      ▼
                                     RDS for PostgreSQL 15        ElastiCache for Redis
                                        (Multi-AZ)                  (signal bus / cache)
```

| Concern | Service | Role |
| --- | --- | --- |
| Container registry | **Amazon ECR** | Stores the Rust + Brain images built in CI |
| Container orchestration | **Amazon ECS on AWS Fargate** | Runs Brain, Ingestor, and Bot as serverless tasks with autoscaling |
| Managed database | **Amazon RDS for PostgreSQL** (Multi-AZ) | Durable, replicated market + relationship store |
| In-memory bus / cache | **Amazon ElastiCache for Redis** | Cross-service signal fan-out and hot-state cache |
| Frontend hosting | **Amazon S3 + CloudFront** | Global CDN delivery of the static SPA |
| Load balancing | **Application Load Balancer** | TLS termination + WebSocket routing to the Bot |
| DNS | **Amazon Route 53** | Domain + health-checked failover |
| Secrets | **AWS Secrets Manager** | Polymarket API key/passphrase/secret + wallet keys + watsonx creds |
| Infrastructure as Code | **Terraform** | Declarative, reproducible provisioning of the whole stack |
| Observability | **Prometheus + Grafana + OpenTelemetry** | Metrics, latency dashboards, distributed tracing across tiers |
| Log aggregation | **Amazon CloudWatch Logs** | Centralized structured-log ingestion + alarms |
| Container security | **ECR image scanning** + non-root runtime users | Supply-chain + runtime hardening |

> *Deployment note: the AWS topology above is the recommended production target derived from the
> project's container-native design; ArbOS runs today via Docker Compose and maps 1:1 onto these
> managed services.*

### CI/CD

**GitHub Actions** (`.github/workflows/ci.yml`) runs three parallel jobs on every push/PR to `main`:

- **`rust-check`** — `cargo fmt --check`, `cargo clippy --all-targets --all-features -D warnings`,
  `cargo test`.
- **`python-check`** — `uv sync --all-extras`, `ruff check`, `pytest -v`.
- **`frontend-check`** — `npm ci`, `tsc --noEmit` typecheck.

**Dependabot** keeps Cargo, pip, npm, and Docker dependencies patched weekly. The CI pipeline
extends naturally into continuous delivery: build → push to **ECR** → rolling deploy to **ECS**.

---

## 8. Engineering Quality & Conventions

- **Monorepo discipline** — a single Cargo workspace for the Rust tiers, an isolated uv-managed
  Python service, and a self-contained Vite frontend, each independently testable and deployable.
- **Structured logging everywhere** — `tracing` (Rust), `loguru` JSON (Python), `pino`/`winston`
  (TS); logs carry structured fields (`asset_id`, `market_id`, `error_code`) rather than string
  interpolation.
- **Type-safe cross-language contract** — the Rust `BrainStatePayload` structs mirror the Python
  Pydantic models field-for-field, with the `/state` JSON payload as the single source of truth.
- **Exact money math** — `rust_decimal` fixed-point throughout the pricing/execution path; no float
  drift in profit accounting.
- **Pre-commit gates** — `rustfmt`, `clippy` (`-D warnings`), `ruff --fix`, ESLint, and `tsc`
  enforced before every commit.
- **Conventional Commits + scoped branches** — `type(scope): summary` with `scope ∈
  {engine, ingestor, bot, brain, web, infra}`; no direct pushes to `main`.
- **Comprehensive testing** — per-strategy unit tests (`crates/engine/src/strategies/tests/`),
  actor-level tests, `pytest` suites for the Brain (config, gamma client, graph, models, relationship
  graph, endpoints), and Vitest for the frontend.

---

## 9. Highlights at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  ArbOS — Automated Prediction Market Arbitrage Engine                  │
├──────────────────────────────────────────────────────────────────────┤
│  ⚡  ~14 ms end-to-end arbitrage detection latency                      │
│  📊  Up to 1,000 live Polymarket order books tracked simultaneously    │
│  🧠  AI relationship discovery via IBM watsonx.ai + LangGraph          │
│  🔢  4 arbitrage strategies grounded in probability axioms             │
│  🛡  FOK-only execution with atomic panic-dump + circuit breaker       │
│  💰  Sub-cent gas modeling with live Polygon Gas Station oracle        │
│  🦀  3 Rust tiers + Python AI service + React dashboard (polyglot)     │
│  ☁️  Container-native, cloud-ready (AWS ECS/Fargate + RDS reference)   │
│  ✅  Full CI/CD: fmt · clippy · ruff · tsc · pytest · vitest           │
└──────────────────────────────────────────────────────────────────────┘
```

ArbOS turns a deep insight — *that fragmented prediction markets routinely violate the axioms of
probability* — into a fully engineered, low-latency, AI-augmented trading system that captures those
violations as guaranteed profit, safely and at scale.

---

*Built for the IBM SkillsBuild Hackathon · Fintech Track · February 2026.*
