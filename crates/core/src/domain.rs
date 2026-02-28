use polymarket_client_sdk::types::U256;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// The type of arbitrage strategy that generated a signal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrategyType {
    Implication,
    Partition,
    Contradiction,
    Unknown,
}

impl std::fmt::Display for StrategyType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Implication => write!(f, "IMPLICATION"),
            Self::Partition => write!(f, "PARTITION"),
            Self::Contradiction => write!(f, "CONTRADICTION"),
            Self::Unknown => write!(f, "UNKNOWN"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TradeAction {
    Buy { asset_id: U256, size: Decimal },
    Sell { asset_id: U256, size: Decimal },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbSignal {
    pub strategy: StrategyType,
    pub legs: Vec<TradeAction>,
    pub expected_profit_usdc: Decimal,
    pub timestamp: i64,
}

/// The internal state representation of a market that the Ingestor computes.
/// This is passed to the Engine tier via MPSC channels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedOrderbook {
    pub asset_id: U256,
    pub market: polymarket_client_sdk::types::B256,
    pub vwap_bid: Decimal,
    pub vwap_ask: Decimal,
    pub bid_untradeable: bool,
    pub ask_untradeable: bool,
    pub timestamp: i64,
}

/// Commands sent to the Ingestor to manage dynamic subscriptions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IngestorCommand {
    Subscribe(U256),
    Unsubscribe(U256),
}

/// Execution mode for the Bot tier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionMode {
    /// Simulated execution — logs trades, tracks mock P&L. No real orders.
    Demo,
    /// Live execution — places real FOK orders via Polymarket SDK.
    Live,
}

/// Details of a single leg fill within an execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillDetail {
    pub asset_id: U256,
    pub side: String,
    pub size: Decimal,
    pub price: Decimal,
    pub filled: bool,
}

/// Result of attempting to execute an ArbSignal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionReport {
    pub signal: ArbSignal,
    pub mode: ExecutionMode,
    pub success: bool,
    pub fill_details: Vec<FillDetail>,
    pub pnl_usdc: Decimal,
    pub executed_at: i64,
}
