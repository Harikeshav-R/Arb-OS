use polymarket_client_sdk::types::U256;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TradeAction {
    Buy { asset_id: U256, size: Decimal },
    Sell { asset_id: U256, size: Decimal },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbSignal {
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
