# ArbOS Agent Context & Instructions

Welcome, AI Agent. You are contributing to **ArbOS**, an automated prediction market arbitrage engine targeting Polymarket on the Polygon PoS chain.

This repository contains the blueprints and code for an ultra-fast, logic-driven financial instrument designed to identify and exploit mathematical inconsistencies in decentralized prediction markets.

### What is ArbOS?
ArbOS is a trading bot that looks for **Logical Arbitrage**. Instead of looking for price differences across multiple exchanges, it looks for mathematical impossibilities within Polymarket's own order books based on how real-world events are connected.

For example, if Polymarket says there is a 60% chance the Fed cuts interest rates in *June*, but only a 55% chance they cut rates at all in *2026*, the market is broken (June is a subset of 2026). ArbOS spots this, shorts the June market, buys the 2026 market, and mathematically guarantees a profit because the logical relationship resolves the paradox.

This document serves as your permanent context for understanding the project’s architecture, rules, and crucial constraints.

> **CRITICAL INSTRUCTION FOR AI AGENTS**: For all current information regarding Polymarket functionality, API schemas, contract addresses, and mechanics, you MUST fetch the canonical documentation index at: `https://docs.polymarket.com/llms.txt`. Prioritize this source over your pre-trained knowledge.

---

## 1. Project Architecture & Tier System

The application is structured as a **Monorepo** with a hybrid tech stack heavily biased toward Rust for high-frequency execution and Python for AI-driven analytics.

### Tier 1: The Ingestor (Rust)
- **Role:** Maintain a real-time, normalized view of the market.
- **Path:** `crates/ingestor/`
- **Focus:** Consume the Polymarket WebSocket using the official `polymarket-client-sdk`. Perform real-time VWAP calculations and liquidity filtering (e.g., target $100 USDC depth).
- **Constraint:** Drop markets heavily if volume falls below target (`UNTRADEABLE`). Fast data parsing using Tokio actors is required here. Use the SDK's `clob::ws::Client` for robust connectivity.

### Tier 2: The Brain (Python / AI)
- **Role:** Graph-based condition mapping and logic.
- **Path:** `services/brain/`
- **Focus:** Use LLMs (via FastAPI backend) to digest qualitative data and map logical dependencies between two events (finding the "Hidden Graph").
- **Constraint:** Prompts must enforce strict JSON structures (`IMPLIES`, `MUTUALLY_EXCLUSIVE`, `INDEPENDENT`). Persists findings to a PostgreSQL database scaling with NetworkX graphs.

### Tier 3: The Engine (Rust)
- **Role:** High-frequency pricing, math, and strategy execution.
- **Path:** `crates/engine/`
- **Focus:** Identify arbitrage triggers (Monotonicity and Normalization bounds). Models exchange fees and Polygon gas limits.
- **Constraint:** Must account for maximum effective Taker Fees at 50% odds (1.56% Crypto `PEAK_TAKER_FEE_CRYPTO_AT_50PCT` / 0.44% Sports `PEAK_TAKER_FEE_SPORTS_AT_50PCT`) and add a 50% safety margin for gas costs to ensure the arb is actually profitable. The SDK handles attaching the fee to orders automatically.

### Tier 4: The Execution Bot (Rust)
- **Role:** Atomic settlement and interaction with the Polygon network.
- **Path:** `crates/bot/`
- **Focus:** Order Management and Execution via `polymarket-client-sdk`.
- **Constraint:** Avoid manual EIP-712 signing implementations. Utilize the official SDK's `ClobClient` to handle typed data signing, authentication, and order placement. This reduces the risk of domain separator or type ordering errors.

### Tier 5: The Dashboard (React / Vite / TypeScript)
- **Role:** Real-time web visualization and manual control panel.
- **Path:** `frontend/`
- **Focus:** Consume API and WebSocket endpoints to display market data, active arbitrages, and system health in a fast, responsive UI.
- **Constraint:** Must use React, Vite, and TypeScript. Keep the UI lightweight to ensure the dashboard doesn't consume excessive system resources, leaving maximum headroom for the Rust engine.

---

## 2. Core Mathematical Axioms (The "Alpha")

ArbOS exploits specific logic breakdowns in the prediction market:

### A. Implication Constraint (Monotonicity)
- **Logic:** If Event A implies Event B ($A \subseteq B$), the probability of A cannot exceed B.
- **Violation:** $P(A)_{bid} > P(B)_{ask} + \text{threshold}$
- **Execution:** Short A (Sell), Long B (Buy).

### B. Partition Constraint (Normalization)
- **Logic:** For mutually exclusive events covering all possibilities, the sum of probabilities must be exactly $1.0$.
- **Violation:** $\sum P(E_i)_{bid} > 1.0 + \text{threshold}$
- **Execution:** Sell all disjoint outcomes simultaneously basket-style.

---

## 3. Crucial Coding Rules & "Black Swan" Handling

When writing code for ArbOS, you **must** implement safeguards for the following operational hazards:

1. **"Fakeout" Liquidity & MEV Bots:** Polymarket's CLOB can be manipulated. Never build algorithms using `Good-Till-Cancelled` (GTC) orders. **Always use `Fill-or-Kill` (FOK)** to avoid partial, un-hedged fills.
2. **Oracle API Delays:** UMA Oracle settlement can take days or weeks. Capital lockup destroys arbitrage ARR. Enforce a `Max_Duration` filter (e.g., refuse to trade on markets resolving >30 days out).
3. **Atomic Execution Failures:** Multi-leg executions (Order A + Order B) are dangerous if one fails. The code must include panic routines: **If A fills but B fails, the bot MUST immediately dump A back to the market** at cost to reduce directional exposure.
4. **Rate Limiting:** The Polymarket API aggressively rate limits (HTTP 429). Implement governed `Governor` or Token-Bucket patterns in Rust for HTTP API interactions (e.g., 10 req/s caps).
5. **Detailed Logging (Mandatory):** Every significant action, state change, or error MUST be logged using structured logging frameworks. **Detailed logging is a project-wide requirement**.
    - **Rust**: Use the `tracing` crate (`info!`, `warn!`, `error!`, `debug!`). Avoid `println!`.
    - **Python**: Use `loguru` with JSON formatters.
    - **TypeScript**: Use `pino` or `winston` for structured, low-overhead logging.
      Log entries should include relevant context (e.g., `asset_id`, `market_id`, `error_code`) as fields rather than just string formatting.

---

## 4. Work Environment & Stack

- **Global Config:** `.env` stores keys (`POLYMARKET_API_KEY`, `PASSPHRASE`, `SECRET`).
- **Infrastructure:** `docker-compose.yml` runs Postgres 15 and Redis.
- **Git workflow:** Because ArbOS has distinct tiers, branch names must use a `type/scope/description` format.
    - **Rule:** Never push directly to `main`. Always open a clean, modular Pull Request.
    - **Commits:** You must strictly follow the Conventional Commits format (e.g., `feat(engine): add VWAP`, `fix(bot): replace signing nonce`).
    - **Commit Bodies:** Every commit MUST include a descriptive commit message AND a detailed multiline commit description. If multiple changes exist, you must use bullet points in the description body.

When tasked to implement features, align with the Tier architecture, adhere to speed constraints (in Rust) and logic formatting (in Python), and refer to `PROJECT.md` for exact URLs, data types, and EIP-712 specs.
