# ArbOS: Automated Prediction Market Arbitrage Engine

**Target**: Polymarket (Polygon PoS Chain)
**Objective**: To engineer a low-latency, logic-driven financial instrument that identifies and exploits mathematical inconsistencies in decentralized prediction markets through high-frequency execution and AI-assisted relationship mapping.

---

## What This Project Does

ArbOS is an automated trading system designed to find guaranteed, risk-less profits (arbitrage) on Polymarket. It monitors hundreds of event outcomes simultaneously and uses an AI "Brain" to understand how different world events are logically connected.

Unlike traditional crypto arbitrage (buying low on Exchange A, selling high on Exchange B), ArbOS performs **Logical Arbitrage** entirely within Polymarket by finding situations where the math of the order books breaks the rules of logic.

### Example: How it Works

Imagine two Polymarket betting markets:
1. **Market A:** Will the Federal Reserve cut interest rates in June 2026? (Trading at 60¢ / 60%)
2. **Market B:** Will the Federal Reserve cut interest rates in 2026? (Trading at 55¢ / 55%)

**The Logic Flaw:** June 2026 is a subset of the year 2026. It is impossible for the Fed to cut rates in June without *also* having cut rates in 2026. Therefore, Market B's probability must always logically be equal to or higher than Market A's probability.

**The ArbOS Action:**
ArbOS detects this logical violation in milliseconds. It will instantly execute two simultaneous trades:
1. **Sell (Short) Market A at 60¢**
2. **Buy (Long) Market B at 55¢**

ArbOS locks in an immediate risk-free profit of 5¢ per share, minus Exchange and Gas fees. If the Fed cuts rates in June, both bets win (and the short offsets the long). If the Fed cuts rates in December, the short wins and the long wins. The math guarantees a payout because the logical relationship resolves the paradox.

---

## 1. Project Structure (Monorepo)

```text
arbos/
├── Cargo.toml                  # Workspace definition
├── .env.example                # Config template
├── docker-compose.yml          # Local infra (Redis, Postgres)
├── README.md
├── crates/
│   ├── core/                   # Shared types, logging, error handling
│   │   ├── src/
│   │   │   ├── domain.rs       # Market, OrderBook, Trade structs
│   │   │   ├── constants.rs    # Fee schedules, contract addresses
│   │   │   └── logging.rs      # Structured logging initialization (tracing)
│   ├── ingestor/               # Tier 1: WebSocket Data Feed
│   │   ├── src/
│   │   │   ├── clob_client.rs  # Wrapper for official polymarket-client-sdk WS
│   │   │   └── actor.rs        # Tokio Actor for state management
│   ├── engine/                 # Tier 3: Pricing & Strategy
│   │   ├── src/
│   │   │   ├── calculator.rs   # VWAP & Spread logic
│   │   │   └── strategies/     # Implication.rs, Partition.rs
│   └── bot/                    # Tier 4: Execution
│       ├── src/
│           └── executor.rs     # Order placement using official SDK
├── services/
│   └── brain/                  # Tier 2: AI Logic (Python)
│       ├── main.py             # FastAPI entrypoint
│       ├── prompts.py          # LLM Prompt Templates
│       └── graph.py            # NetworkX / Postgres interface
└── frontend/                   # Tier 5: Web Dashboard (React/Vite/TS)
    ├── package.json
    └── src/
        ├── components/
        └── hooks/
```

---

## 2. Theoretical Foundations (The "Alpha")

### 2.1. Axiomatic Logical Arbitrage

#### A. The Implication Constraint (Monotonicity)
*   **Axiom**: If event $A \subseteq B$, then $P(A) \le P(B)$.
*   **Violation**: $P(A)_{bid} > P(B)_{ask} + \delta$.
*   **Formula**:
    $$ \text{Profit} = (P(A)_{bid} - P(B)_{ask}) - (\text{Fee}_A + \text{Fee}_B + \text{Gas}) $$
*   **Strategy**: Sell $A$ (Short Sub-event), Buy $B$ (Long Super-event).

#### B. The Partition Constraint (Normalization)
*   **Axiom**: $\sum P(E_i) = 1.0$.
*   **Violation**: $\sum P(E_i)_{bid} > 1.0 + \delta$.
*   **Formula**:
    $$ \text{Profit} = (\sum P(E_i)_{bid}) - 1.0 - \sum \text{Fees} $$
*   **Strategy**: Sell All Outcomes in the basket.

---

## 3. Tier 1: The Ingestor (Rust)

**Responsibility**: Maintain a real-time, normalized view of the world.

### 3.1. WebSocket Integration
*   **Library**: `polymarket-client-sdk`
*   **Endpoint**: `wss://ws-subscriptions-clob.polymarket.com/ws/market`
*   **Usage**: Leverages `clob::ws::Client` for streamlined market data subscriptions.

### 3.2. Normalization Logic
*   **VWAP Calculation**:
    $$ P_{vwap} = \frac{\sum (P_i \times V_i)}{\sum V_i} $$
    *   *Constraint*: Only calculate up to `TARGET_LIQUIDITY` ($100 USDC).
    *   *Panic*: If `sum(V_i) < TARGET_LIQUIDITY`, mark market as `UNTRADEABLE`.

---

## 4. Tier 2: The Brain (Python/AI)

**Responsibility**: Discover the "Hidden Graph" of market relationships.

### 4.1. LLM Prompt Strategy (The "Oracle")
**File**: `services/brain/prompts.py`

```python
SYSTEM_PROMPT = """
You are a logic engine for a prediction market. Your goal is to map logical dependencies between two events.
Output strictly JSON:
{
  "relation": "IMPLIES" | "MUTUALLY_EXCLUSIVE" | "INDEPENDENT",
  "direction": "A_TO_B" | "B_TO_A" | "NONE",
  "confidence": 0.0-1.0,
  "reasoning": "string"
}
"""

USER_PROMPT_TEMPLATE = """
Event A: "{title_a}" (Description: {desc_a})
Event B: "{title_b}" (Description: {desc_b})
"""
```

### 4.2. Gamma API Integration
*   **Endpoint**: `https://gamma-api.polymarket.com/events`
*   **Filter**: `closed = false`, `volume > 1000`.

---

## 5. Tier 3: The Engine (Rust)

**Responsibility**: The high-frequency calculator.

### 5.1. Fee Modeling (The "Grim Reaper")
*   **Exchange Fee**: Polymarket uses a dynamic Taker fee curve based on shares and probability. There are no fees on most markets, but some sport and crypto markets have fees.
    *   *Conservative Assumption*: Always model peak effective Taker fees at 50% odds: **1.56% for Crypto** (`PEAK_TAKER_FEE_CRYPTO_AT_50PCT`) / **0.44% for Sports** (`PEAK_TAKER_FEE_SPORTS_AT_50PCT`).
    *   *Note*: The official CLOB SDK client automatically fetches and attaches `feeRateBps` to the payload.
*   **Gas Estimation**:
    *   Cost = `GasUnits * GasPrice * MATIC_Price`.
    *   Buffer: Add 50% safety margin.

### 5.2. Signal Generation
*   **Trigger**:
    ```rust
    if (bid_a - ask_b) > (bid_a * 0.02 + ask_b * 0.02 + GAS_CONST) {
        emit(ArbSignal { ... });
    }
    ```

---

## 6. Tier 4: The Execution Bot (Rust)

**Responsibility**: Atomic settlement.

### 6.1. Official SDK Integration
ArbOS uses the `polymarket-client-sdk` to handle all interactions with the Polymarket CLOB.

**Key Benefits**:
*   **Built-in Signing**: Handles EIP-712 Typed Data Signing automatically for orders.
*   **Authentication**: Manages API Key, Passphrase, and Secret headers.
*   **Robustness**: Reduces errors in complex order type definitions.

### 6.2. Atomic Execution Loop
1.  **Prepare Order A** (Sell Side).
2.  **Prepare Order B** (Buy Side).
3.  **Execute via SDK**: Use `ClobClient.create_order()` for high-reliability placement.
4.  **Verify Fills**:
    *   If A fills & B fails -> **PANIC DUMP A**.
    *   If A fails & B fills -> **PANIC DUMP B**.

---

## 7. Tier 5: The Dashboard (React/Vite/TS)

**Responsibility**: Real-time visualization and control.

### 7.1. Frontend Stack
*   **Framework**: React (for reactive UI).
*   **Build Tool**: Vite (for rapid HMR and unbundled dev).
*   **Language**: TypeScript (for strong typing and safety).

### 7.2. Core Features
*   **Market View**: Real-time graphs of tracked markets and VWAP.
*   **Arb Ledger**: Live feed of discovered edges and atomic settlement statuses.
*   **System Health**: Redis/Postgres connection status, Rust engine latency.

---

## 8. Infrastructure & Deployment

### 8.1. `docker-compose.yml`

```yaml
version: '3.8'
services:
  redis:
    image: redis:alpine
    ports: ["6379:6379"]
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: arbos
      POSTGRES_PASSWORD: password
  brain:
    build: ./services/brain
    env_file: .env
  ingestor:
    build:
      context: .
      dockerfile: crates/ingestor/Dockerfile
    network_mode: host
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    environment:
      - VITE_API_URL=http://localhost:8000
```

### 8.2. Database Schema (PostgreSQL)

```sql
CREATE TABLE relationships (
    id UUID PRIMARY KEY,
    parent_condition_id TEXT,
    child_condition_id TEXT,
    logic_type VARCHAR(20), -- 'IMPLIES', 'PARTITION'
    confidence FLOAT,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(parent_condition_id, child_condition_id)
);
```

---

## 9. Operational Playbook ("Black Swan" Scenarios)

### Scenario A: The "Fakeout" Liquidity
*   **Symptom**: Order book shows 500 shares @ 0.90, but order fails.
*   **Cause**: MEV bots or "Ghost" orders.
*   **Fix**: Implement `Fill-or-Kill` (FOK) only. Do not use `Good-Till-Cancelled`.

### Scenario B: The Oracle Delay
*   **Symptom**: Event happens, but UMA (Oracle) doesn't resolve for 2 hours.
*   **Risk**: Capital lockup.
*   **Fix**: Strategy Engine must enforce a `Max_Duration` filter. Do not trade markets resolving > 30 days out.

### Scenario C: API Rate Limit
*   **Symptom**: HTTP 429.
*   **Fix**: Implement `Governor` in Rust for token-bucket rate limiting (e.g., 10 req/sec).

---

## 10. Git Workflow & Collaboration

Because ArbOS has distinct tiers (Rust crates, Python services, React frontend), branch names should immediately indicate what is being worked on and where. Use a `type/scope/description` format.

**Types**:
*   `feat/` (New features)
*   `fix/` (Bug fixes)
*   `chore/` (Config, Docker, dependency updates)
*   `refactor/` (Code restructuring without behavior changes)

**Scopes (Based on Architecture)**:
*   `engine` (Rust tier 3)
*   `ingestor` (Rust tier 1)
*   `bot` (Rust tier 4)
*   `brain` (Python tier 2)
*   `web` (React tier 5)
*   `infra` (Docker, CI/CD)

**Examples**:
*   `feat/ingestor/vwap-calculator`
*   `fix/brain/gamma-api-filter`
*   `chore/infra/postgres-schema-update`

---

## 11. Project Conventions & Quality Standards

### 11.1. Structured Logging (Required)
Every tier in ArbOS must implement structured, machine-readable logging. Standard `println!` or `console.log` statements are forbidden for production code.
- **Rust**: Use the `tracing` crate. Logs must be structured as fields (e.g., `info!(asset_id = %id, "Message")`).
- **Python**: Use `loguru` with JSON-formatted structured logging.
- **TypeScript**: Use `pino` or `winston` for high-performance structured logs.

---

## 12. Launch Checklist

1.  [ ] **Keys**: Generate a fresh Polygon wallet. Fund with 10 MATIC (Gas) + 100 USDC (Collateral).
2.  [ ] **Approve**: Call `setApprovalForAll` on the CTF Exchange Contract for your USDC.
3.  [ ] **Env**: Fill `.env` with `POLYMARKET_API_KEY`, `PASSPHRASE`, `SECRET`.
4.  [ ] **Test**: Run `cargo test` to verify EIP-712 signing matches Etherscan's signature tool.
5.  [ ] **Live**: Start `docker-compose up`. Watch the logs.
