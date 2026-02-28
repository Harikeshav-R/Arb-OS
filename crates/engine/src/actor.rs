use arbos_core::domain::{
    ArbSignal, IngestorCommand, NormalizedOrderbook, StrategyType, TradeAction,
};
use polymarket_client_sdk::types::U256;
use rust_decimal::Decimal;
use std::collections::{HashMap, HashSet};
use tokio::sync::mpsc::{Receiver, Sender};
use tracing::{debug, error, info, warn};

use crate::strategies::implication::ImplicationStrategy;
// Ensure we use constants for fees and gas
use arbos_core::constants::{
    ESTIMATED_GAS_UNITS_PER_LEG, ESTIMATED_GWEI_PRICE, GAS_SAFETY_MARGIN, MATIC_PRICE_USDC,
    MAX_TRACKED_ASSETS, MIN_CONFIDENCE_THRESHOLD, PEAK_TAKER_FEE_CRYPTO_AT_50PCT,
};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct BrainStatePayload {
    pub implications: Vec<ImplicationMapping>,
    pub partitions: Vec<PartitionMapping>,
    pub contradictions: Vec<ContradictionMapping>,
    pub asset_end_timestamps: HashMap<String, i64>,
}

#[derive(Debug, Deserialize)]
pub struct ImplicationMapping {
    pub parent_asset_id: String,
    pub child_asset_id: String,
    pub confidence: f64,
}

#[derive(Debug, Deserialize)]
pub struct PartitionMapping {
    pub condition_id: String,
    pub expected_outcomes_count: usize,
    pub assets: Vec<String>,
    pub confidence: f64,
}

#[derive(Debug, Deserialize)]
pub struct ContradictionMapping {
    pub asset_a: String,
    pub asset_b: String,
    pub confidence: f64,
}

pub struct EngineActor {
    // State Caches
    pub orderbook_cache: HashMap<U256, NormalizedOrderbook>,
    // Map of relation edges: Parent -> List of Children that it implies
    pub implication_edges: HashMap<U256, Vec<U256>>,
    // Map of relation edges: Child -> List of Parents that imply it
    pub implication_reverse_edges: HashMap<U256, Vec<U256>>,

    // Map of undirected contradicting mutually-exclusive peers (A implies NOT B, etc.)
    pub contradiction_edges: HashMap<U256, Vec<(U256, Decimal)>>, // Peer -> (Peer ID, Default Weight 1.0)

    // Map of Partition ID -> Set of Asset IDs (Outcomes)
    pub partition_outcomes: HashMap<String, HashSet<U256>>,

    // Map of Asset ID -> Partition ID (for O(1) partition lookups)
    pub asset_to_partition: HashMap<U256, String>,

    // Map of Partition ID -> Required Number of Outcomes for Exhaustiveness
    pub partition_expected_outcome_counts: HashMap<String, usize>,

    // Map of Asset ID -> Resolution Deadline (Timestamp in seconds)
    pub market_end_timestamps: HashMap<U256, i64>,

    // Set of all assets we are actively tracking (for diffing)
    pub tracked_assets: HashSet<U256>,

    // The live calculated gas per leg (updated periodically)
    pub current_gas_usdc_per_leg: Decimal,

    // Reusable HTTP Client for API calls
    pub api_client: reqwest::Client,
}

pub type PartitionParseResult = (
    HashMap<String, HashSet<U256>>,
    HashMap<U256, String>,
    HashMap<String, usize>,
);

impl Default for EngineActor {
    fn default() -> Self {
        Self::new()
    }
}

impl EngineActor {
    pub fn new() -> Self {
        let api_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("Failed to initialize Engine reqwest client");

        Self {
            orderbook_cache: HashMap::new(),
            implication_edges: HashMap::new(),
            implication_reverse_edges: HashMap::new(),
            contradiction_edges: HashMap::new(),
            partition_outcomes: HashMap::new(),
            asset_to_partition: HashMap::new(),
            partition_expected_outcome_counts: HashMap::new(),
            market_end_timestamps: HashMap::new(),
            tracked_assets: HashSet::new(),
            current_gas_usdc_per_leg: (ESTIMATED_GAS_UNITS_PER_LEG * ESTIMATED_GWEI_PRICE)
                / Decimal::from(10_u64.pow(9))
                * MATIC_PRICE_USDC
                * GAS_SAFETY_MARGIN,
            api_client,
        }
    }

    /// The main event loop consuming `NormalizedOrderbook` updates from Ingestor
    /// and emitting `ArbSignal` to the Bot.
    pub async fn run(
        &mut self,
        mut ingestor_rx: Receiver<NormalizedOrderbook>,
        bot_tx: Sender<ArbSignal>,
        ingestor_cmd_tx: Sender<IngestorCommand>,
    ) -> anyhow::Result<()> {
        info!("EngineActor started, synchronizing Brain API...");

        // Wait for Brain API to be ready before starting the engine event loop to avoid starting with empty state
        loop {
            if let Err(e) = self.sync_brain_state(&ingestor_cmd_tx).await {
                warn!("Waiting for Brain API to become ready: {:?}", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            } else {
                info!("Brain API synchronized successfully.");
                break;
            }
        }

        // Initialize Gas Oracle
        if let Err(e) = self.sync_gas_oracle().await {
            warn!("Failed initial fetch for live Polygon Gas: {:?}", e);
        }

        info!("EngineActor ready. Waiting for stream updates...");

        // Polling interval for syncing graph relations from Tier 2 Brain and live gas
        let mut sync_interval = tokio::time::interval(std::time::Duration::from_secs(60));
        sync_interval.tick().await; // Consume the first immediate tick since we just proactively synced

        let fee_rate = PEAK_TAKER_FEE_CRYPTO_AT_50PCT;

        loop {
            tokio::select! {
                state_opt = ingestor_rx.recv() => {
                    match state_opt {
                        Some(book) => {
                            let gas_per_leg_usdc = self.current_gas_usdc_per_leg;
                            self.handle_book_update(book, &bot_tx, fee_rate, gas_per_leg_usdc).await;
                        }
                        None => {
                            error!("Ingestor stream channel closed. Shutting down EngineActor.");
                            break;
                        }
                    }
                }
                // Periodic Sync Logic
                _ = sync_interval.tick() => {
                    if let Err(e) = self.sync_brain_state(&ingestor_cmd_tx).await {
                        warn!("Failed to sync with Brain API: {:?}", e);
                    }
                    if let Err(e) = self.sync_gas_oracle().await {
                        warn!("Failed to fetch live Polygon Gas: {:?}", e);
                    }
                }
            }
        }
        Ok(())
    }

    async fn handle_book_update(
        &mut self,
        book: NormalizedOrderbook,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
    ) {
        let asset_id = book.asset_id;

        // Max_Duration constraint filters out markets that resolve too far in the future
        if self.violates_max_duration(asset_id) {
            debug!(asset_id = %asset_id, "Market dropped due to Max_Duration constraint");
            return;
        }

        self.orderbook_cache.insert(asset_id, book.clone());

        self.evaluate_implications(&book, bot_tx, fee_rate, gas_per_leg_usdc)
            .await;
        self.evaluate_partitions(&book, bot_tx, fee_rate, gas_per_leg_usdc)
            .await;
        self.evaluate_contradictions(&book, bot_tx, fee_rate, gas_per_leg_usdc)
            .await;
    }

    async fn evaluate_implications(
        &mut self,
        book: &NormalizedOrderbook,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
    ) {
        let mut executed_pairs = Vec::new();

        self.evaluate_parent_implications(
            book,
            bot_tx,
            fee_rate,
            gas_per_leg_usdc,
            &mut executed_pairs,
        )
        .await;
        self.evaluate_child_implications(
            book,
            bot_tx,
            fee_rate,
            gas_per_leg_usdc,
            &mut executed_pairs,
        )
        .await;

        // Clear executed legs from cache to prevent back-to-back double fires
        for (p_id, c_id) in executed_pairs {
            self.orderbook_cache.remove(&p_id);
            self.orderbook_cache.remove(&c_id);
        }
    }

    async fn evaluate_parent_implications(
        &self,
        book: &NormalizedOrderbook,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
        executed_pairs: &mut Vec<(U256, U256)>,
    ) {
        let parent_id = book.asset_id;

        // 1. Check if this market is a parent in an implies relationship
        let children = match self.implication_edges.get(&parent_id) {
            Some(c) => c,
            None => return,
        };

        for &child_id in children {
            self.evaluate_single_child_implication(
                book,
                child_id,
                bot_tx,
                fee_rate,
                gas_per_leg_usdc,
                executed_pairs,
            )
            .await;
        }
    }

    async fn evaluate_single_child_implication(
        &self,
        parent_book: &NormalizedOrderbook,
        child_id: U256,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
        executed_pairs: &mut Vec<(U256, U256)>,
    ) {
        let child_book = match self.orderbook_cache.get(&child_id) {
            Some(b) => b,
            None => return,
        };

        if parent_book.bid_untradeable || child_book.ask_untradeable {
            return;
        }

        let parent_bid = parent_book.vwap_bid;
        let child_ask = child_book.vwap_ask;

        if parent_bid <= Decimal::ZERO || child_ask <= Decimal::ZERO {
            return;
        }

        if self
            .check_and_send_implication(
                parent_book.asset_id,
                parent_bid,
                child_id,
                child_ask,
                parent_book.timestamp,
                bot_tx,
                fee_rate,
                gas_per_leg_usdc,
            )
            .await
        {
            executed_pairs.push((parent_book.asset_id, child_id));
        }
    }

    async fn evaluate_child_implications(
        &self,
        book: &NormalizedOrderbook,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
        executed_pairs: &mut Vec<(U256, U256)>,
    ) {
        let child_id = book.asset_id;

        // 2. Check if this market is a child of some parent that is currently cached
        let parents = match self.implication_reverse_edges.get(&child_id) {
            Some(p) => p,
            None => return,
        };

        for &parent_id_candidate in parents {
            self.evaluate_parent_candidate_for_child(
                parent_id_candidate,
                book,
                bot_tx,
                fee_rate,
                gas_per_leg_usdc,
                executed_pairs,
            )
            .await;
        }
    }

    async fn evaluate_parent_candidate_for_child(
        &self,
        parent_id_candidate: U256,
        child_book: &NormalizedOrderbook,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
        executed_pairs: &mut Vec<(U256, U256)>,
    ) {
        let parent_book = match self.orderbook_cache.get(&parent_id_candidate) {
            Some(b) => b,
            None => return,
        };

        if parent_book.bid_untradeable || child_book.ask_untradeable {
            return;
        }

        let parent_bid = parent_book.vwap_bid;
        let child_ask = child_book.vwap_ask;

        if parent_bid <= Decimal::ZERO || child_ask <= Decimal::ZERO {
            return;
        }

        let child_id = child_book.asset_id;

        if self
            .check_and_send_implication(
                parent_id_candidate,
                parent_bid,
                child_id,
                child_ask,
                child_book.timestamp,
                bot_tx,
                fee_rate,
                gas_per_leg_usdc,
            )
            .await
        {
            executed_pairs.push((parent_id_candidate, child_id));
            self.evaluate_siblings_for_parent(
                parent_id_candidate,
                parent_bid,
                child_book,
                bot_tx,
                fee_rate,
                gas_per_leg_usdc,
                executed_pairs,
            )
            .await;
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn evaluate_siblings_for_parent(
        &self,
        parent_id: U256,
        parent_bid: Decimal,
        trigger_child_book: &NormalizedOrderbook,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
        executed_pairs: &mut Vec<(U256, U256)>,
    ) {
        let siblings = match self.implication_edges.get(&parent_id) {
            Some(s) => s,
            None => return,
        };

        for &sibling_id in siblings {
            if sibling_id == trigger_child_book.asset_id {
                continue;
            }

            let sibling_book = match self.orderbook_cache.get(&sibling_id) {
                Some(b) => b,
                None => continue,
            };

            if sibling_book.ask_untradeable {
                continue;
            }

            let sibling_ask = sibling_book.vwap_ask;
            if sibling_ask <= Decimal::ZERO {
                continue;
            }

            if self
                .check_and_send_implication(
                    parent_id,
                    parent_bid,
                    sibling_id,
                    sibling_ask,
                    trigger_child_book.timestamp,
                    bot_tx,
                    fee_rate,
                    gas_per_leg_usdc,
                )
                .await
            {
                executed_pairs.push((parent_id, sibling_id));
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn check_and_send_implication(
        &self,
        parent_id: U256,
        parent_bid: Decimal,
        child_id: U256,
        child_ask: Decimal,
        timestamp: i64,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
    ) -> bool {
        // An Implication strategy executes exactly 2 legs: Sell Parent, Buy Child
        let total_est_gas_usdc = gas_per_leg_usdc * Decimal::from(2);
        if let Some(profit) = ImplicationStrategy::check(
            parent_id,
            parent_bid,
            child_id,
            child_ask,
            fee_rate,
            total_est_gas_usdc,
        ) {
            // Delta-neutral execution: we must deploy the SAME amount of shares on both legs
            // Using max(parent, child) price ensures we do not exceed TARGET_LIQUIDITY capital deployment on either leg
            let highest_price = parent_bid.max(child_ask);
            let consistent_size_shares = arbos_core::constants::TARGET_LIQUIDITY / highest_price;

            let signal = ArbSignal {
                strategy: StrategyType::Implication,
                legs: vec![
                    TradeAction::Sell {
                        asset_id: parent_id,
                        size: consistent_size_shares,
                    },
                    TradeAction::Buy {
                        asset_id: child_id,
                        size: consistent_size_shares,
                    },
                ],
                expected_profit_usdc: profit,
                timestamp,
            };

            info!(parent = %parent_id, child = %child_id, profit = %profit, "Routing Implication ArbSignal to Bot");
            if let Err(e) = bot_tx.send(signal).await {
                error!(
                    "Failed to route Implication ArbSignal to Bot channel: {}",
                    e
                );
            }
            return true;
        }
        false
    }

    async fn evaluate_partitions(
        &mut self,
        book: &NormalizedOrderbook,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
    ) {
        let asset_id = book.asset_id;

        let partition_id = match self.asset_to_partition.get(&asset_id) {
            Some(pid) => pid.clone(),
            None => return,
        };

        let bids = match self.get_partition_bids(&partition_id) {
            Some(b) => b,
            None => return,
        };

        if !self.is_partition_exhaustively_tradable(&partition_id, &bids) {
            return;
        }

        self.check_and_send_partition(
            partition_id,
            bids,
            book.timestamp,
            bot_tx,
            fee_rate,
            gas_per_leg_usdc,
        )
        .await;
    }

    fn get_partition_bids(&self, partition_id: &str) -> Option<Vec<(U256, Decimal)>> {
        let outcome_assets = self.partition_outcomes.get(partition_id)?;
        let mut bids = Vec::new();

        for asset in outcome_assets {
            let cached_book = self.orderbook_cache.get(asset)?;

            if cached_book.bid_untradeable || cached_book.vwap_bid <= Decimal::ZERO {
                return None; // Missing liquidity or untradeable leg, abort partition evaluation entirely
            }
            bids.push((*asset, cached_book.vwap_bid));
        }

        // Sort by asset ID to ensure deterministic order of generated legs
        bids.sort_by(|a, b| a.0.cmp(&b.0));

        Some(bids)
    }

    fn is_partition_exhaustively_tradable(
        &self,
        partition_id: &str,
        bids: &[(U256, Decimal)],
    ) -> bool {
        // Enforce strict exhaustiveness: Are we receiving the EXACT number of outcomes for this partition?
        let required_outcome_count = self
            .partition_expected_outcome_counts
            .get(partition_id)
            .copied()
            .unwrap_or(0);

        if required_outcome_count == 0 || bids.len() != required_outcome_count {
            return false; // Incomplete basket, shorting this would leave us with directional risk
        }

        // A partition Arb logically needs at least 2 legs
        bids.len() >= 2
    }

    async fn check_and_send_partition(
        &mut self,
        partition_id: String,
        bids: Vec<(U256, Decimal)>,
        timestamp: i64,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
    ) {
        // For partition, we short all outcomes uniformly, so gas is scaled by the number of active outcomes in the basket
        let total_gas_for_legs = gas_per_leg_usdc * Decimal::from(bids.len() as u64);

        if let Some(profit) = crate::strategies::partition::PartitionStrategy::check(
            &bids,
            fee_rate,
            total_gas_for_legs,
        ) {
            // Create basket short signal
            let mut legs = Vec::new();
            let sum_bids: Decimal = bids.iter().map(|(_, bid)| bid).sum();
            let position_size_shares = arbos_core::constants::TARGET_LIQUIDITY / sum_bids;

            for (asset, _bid) in &bids {
                legs.push(TradeAction::Sell {
                    asset_id: *asset,
                    size: position_size_shares,
                });
            }

            let signal = ArbSignal {
                strategy: StrategyType::Partition,
                legs,
                expected_profit_usdc: profit,
                timestamp,
            };

            info!(partition_id = %partition_id, leg_count = bids.len(), profit = %profit, "Routing Partition ArbSignal to Bot");
            if let Err(e) = bot_tx.send(signal).await {
                error!("Failed to route Partition ArbSignal to Bot channel: {}", e);
            }

            // Clear evaluated legs
            for (asset, _) in bids {
                self.orderbook_cache.remove(&asset);
            }
        }
    }

    async fn evaluate_contradictions(
        &mut self,
        book: &NormalizedOrderbook,
        bot_tx: &Sender<ArbSignal>,
        fee_rate: Decimal,
        gas_per_leg_usdc: Decimal,
    ) {
        let asset_id = book.asset_id;

        let peers_len = match self.contradiction_edges.get(&asset_id) {
            Some(p) => p.len(),
            None => return,
        };

        let mut executed_peer = None;

        for i in 0..peers_len {
            let (peer_id, weight) = {
                let peers = self.contradiction_edges.get(&asset_id).unwrap();
                peers[i]
            };

            let peer_book = match self.orderbook_cache.get(&peer_id) {
                Some(b) => b,
                None => continue,
            };

            if book.bid_untradeable || peer_book.bid_untradeable {
                continue;
            }

            let bid_a = book.vwap_bid;
            let bid_b = peer_book.vwap_bid;

            if bid_a <= Decimal::ZERO || bid_b <= Decimal::ZERO {
                continue;
            }

            // A Contradiction strategy also executes exactly 2 legs (Sell A, Sell B)
            let total_est_gas_usdc = gas_per_leg_usdc * Decimal::from(2);

            // Weight logic: for binary markets, usually 1.0 vs 1.0. The tier 2 brain assigns 1.0 for mutually exclusive currently.
            let weight_a = Decimal::ONE;
            let weight_b = weight;

            if let Some(profit) = crate::strategies::contradiction::ContradictionStrategy::check(
                asset_id,
                bid_a,
                weight_a,
                peer_id,
                bid_b,
                weight_b,
                fee_rate,
                total_est_gas_usdc,
            ) {
                // Sizing follows logic from strategy: TARGET_LIQUIDITY / sum_bids
                let sum_bids = bid_a + bid_b;
                let consistent_size_shares = arbos_core::constants::TARGET_LIQUIDITY / sum_bids;

                let signal = ArbSignal {
                    strategy: StrategyType::Contradiction,
                    legs: vec![
                        TradeAction::Sell {
                            asset_id,
                            size: consistent_size_shares,
                        },
                        TradeAction::Sell {
                            asset_id: peer_id,
                            size: consistent_size_shares,
                        },
                    ],
                    expected_profit_usdc: profit,
                    timestamp: book.timestamp,
                };

                info!(
                    asset_a = %asset_id,
                    asset_b = %peer_id,
                    profit = %profit,
                    "Routing Contradiction ArbSignal to Bot"
                );
                if let Err(e) = bot_tx.send(signal).await {
                    error!(
                        "Failed to route Contradiction ArbSignal to Bot channel: {}",
                        e
                    );
                }

                // Defer ejection
                executed_peer = Some(peer_id);

                // Break after executing one contradiction for this asset to avoid double-spend
                // on the same loop tick if it contradicts multiple peers
                break;
            }
        }

        if let Some(peer_id) = executed_peer {
            self.orderbook_cache.remove(&asset_id);
            self.orderbook_cache.remove(&peer_id);
        }
    }

    /// The Max_Duration filter. Markets resolving $>30$ days out trap capital if the Oracle takes weeks.
    fn violates_max_duration(&self, asset_id: U256) -> bool {
        if let Some(end_ts) = self.market_end_timestamps.get(&asset_id) {
            let current_ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;

            let thirty_days_secs = 30 * 24 * 60 * 60;
            if *end_ts - current_ts > thirty_days_secs {
                return true;
            }
        }
        false
    }

    /// Periodically queries the Tier 2 Brain API (Python/FastAPI) to sync latest discovery edges.
    /// Diff-checks the payload against `tracked_assets` to automatically emit
    /// Sub/Unsub commands to the Ingestor and flush untracked assets from mem-cache.
    /// Dynamically synchronizes state from the Tier 2 Python logic.
    /// Note: `tokio::select!` in the `run` loop ensures that branches are polled sequentially.
    /// `handle_book_update` inherently cannot run concurrently while `sync_brain_state`
    /// is iterating, parsing, or hot-swapping these Maps. This prevents any race conditions
    /// between cache insertions/evictions and Brain payload application.
    async fn sync_brain_state(&mut self, cmd_tx: &Sender<IngestorCommand>) -> anyhow::Result<()> {
        let payload = self.fetch_brain_payload().await?;

        // 1. Parse Graph Edges
        let (new_imp_edges, new_imp_rev) = Self::parse_implications(&payload.implications);
        let (new_partition_outcomes, new_asset_to_partition, new_partition_expected) =
            Self::parse_partitions(&payload.partitions);
        let new_contradictions = Self::parse_contradictions(&payload.contradictions);
        let new_timestamps = Self::parse_timestamps(&payload.asset_end_timestamps);

        // 2. Compute Tracked Assets (with Expiry GC and MAX_TRACKED limits)
        let new_tracked_assets = Self::compute_tracked_assets(
            &new_imp_edges,
            &new_contradictions,
            &new_partition_outcomes,
            &new_timestamps,
        );

        // 3. Diff & Command Ingestor
        self.apply_asset_diffs(&new_tracked_assets, cmd_tx).await;

        // 4. Hot Swap State
        self.tracked_assets = new_tracked_assets;
        self.implication_edges = new_imp_edges;
        self.implication_reverse_edges = new_imp_rev;
        self.contradiction_edges = new_contradictions;
        self.partition_outcomes = new_partition_outcomes;
        self.asset_to_partition = new_asset_to_partition;
        self.partition_expected_outcome_counts = new_partition_expected;
        self.market_end_timestamps = new_timestamps;

        debug!("Successfully synchronized in-memory Graph from Tier 2 Brain API.");
        Ok(())
    }

    async fn fetch_brain_payload(&self) -> anyhow::Result<BrainStatePayload> {
        let brain_url_env =
            std::env::var("BRAIN_API_URL").unwrap_or_else(|_| "http://localhost:8000".to_string());

        let valid_brain_url = url::Url::parse(&brain_url_env)?;
        if valid_brain_url.scheme() != "http" && valid_brain_url.scheme() != "https" {
            return Err(anyhow::anyhow!(
                "BRAIN_API_URL must have an http or https scheme"
            ));
        }
        if !valid_brain_url.has_host() {
            return Err(anyhow::anyhow!("BRAIN_API_URL must have a valid host"));
        }

        let mut req = self.api_client.get(valid_brain_url.join("state")?);

        if let Ok(brain_api_key) = std::env::var("ADMIN_API_KEY")
            && !brain_api_key.is_empty()
        {
            req = req.header("X-API-Key", brain_api_key);
        }

        let res = req.send().await?;

        if !res.status().is_success() {
            return Err(anyhow::anyhow!(
                "Brain API returned status: {}",
                res.status()
            ));
        }

        Ok(res.json().await?)
    }

    fn parse_implications(
        implications: &[crate::actor::ImplicationMapping],
    ) -> (HashMap<U256, Vec<U256>>, HashMap<U256, Vec<U256>>) {
        let mut edges: HashMap<U256, Vec<U256>> = HashMap::new();
        let mut rev_edges: HashMap<U256, Vec<U256>> = HashMap::new();

        for imp in implications {
            if imp.confidence < MIN_CONFIDENCE_THRESHOLD {
                continue;
            }
            match (
                U256::from_str_radix(&imp.parent_asset_id, 10),
                U256::from_str_radix(&imp.child_asset_id, 10),
            ) {
                (Ok(p_id), Ok(c_id)) => {
                    edges.entry(p_id).or_default().push(c_id);
                    rev_edges.entry(c_id).or_default().push(p_id);
                }
                _ => {
                    warn!(
                        "Failed to parse Implication U256 IDs, silently dropping: Parent: {} | Child: {}",
                        imp.parent_asset_id, imp.child_asset_id
                    );
                }
            }
        }
        (edges, rev_edges)
    }

    fn parse_contradictions(
        contradictions: &[crate::actor::ContradictionMapping],
    ) -> HashMap<U256, Vec<(U256, Decimal)>> {
        let mut edges: HashMap<U256, Vec<(U256, Decimal)>> = HashMap::new();

        for cont in contradictions {
            if cont.confidence < MIN_CONFIDENCE_THRESHOLD {
                continue;
            }
            match (
                U256::from_str_radix(&cont.asset_a, 10),
                U256::from_str_radix(&cont.asset_b, 10),
            ) {
                (Ok(a_id), Ok(b_id)) => {
                    let weight = Decimal::ONE; // Using 1.0 for mutually exclusive edges by default
                    edges.entry(a_id).or_default().push((b_id, weight));
                    edges.entry(b_id).or_default().push((a_id, weight));
                }
                _ => {
                    warn!(
                        "Failed to parse Contradiction U256 IDs, silently dropping: A: {} | B: {}",
                        cont.asset_a, cont.asset_b
                    );
                }
            }
        }
        edges
    }

    fn parse_partitions(partitions: &[crate::actor::PartitionMapping]) -> PartitionParseResult {
        let mut outcomes = HashMap::new();
        let mut asset_to_partition = HashMap::new();
        let mut expected = HashMap::new();

        for part in partitions {
            if part.confidence < MIN_CONFIDENCE_THRESHOLD {
                continue;
            }

            let partition_id = part.condition_id.clone();
            expected.insert(partition_id.clone(), part.expected_outcomes_count);

            let mut asset_set = HashSet::new();
            for a_str in &part.assets {
                match U256::from_str_radix(a_str, 10) {
                    Ok(a_id) => {
                        asset_set.insert(a_id);
                        asset_to_partition.insert(a_id, partition_id.clone());
                    }
                    Err(_) => {
                        warn!(
                            "Failed to parse Partition Asset U256 ID, dropping asset: {}",
                            a_str
                        );
                    }
                }
            }
            outcomes.insert(partition_id, asset_set);
        }
        (outcomes, asset_to_partition, expected)
    }

    fn parse_timestamps(asset_end_timestamps: &HashMap<String, i64>) -> HashMap<U256, i64> {
        let mut timestamps = HashMap::new();
        for (k_str, &ts) in asset_end_timestamps {
            if let Ok(a_id) = U256::from_str_radix(k_str, 10) {
                timestamps.insert(a_id, ts);
            }
        }
        timestamps
    }

    fn compute_tracked_assets(
        edges: &HashMap<U256, Vec<U256>>,
        contradictions: &HashMap<U256, Vec<(U256, Decimal)>>,
        outcomes: &HashMap<String, HashSet<U256>>,
        timestamps: &HashMap<U256, i64>,
    ) -> HashSet<U256> {
        let current_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let mut frequency: HashMap<U256, usize> = HashMap::new();

        Self::tally_edge_frequencies(&mut frequency, edges, timestamps, current_ts);
        Self::tally_contradiction_frequencies(
            &mut frequency,
            contradictions,
            timestamps,
            current_ts,
        );
        Self::tally_outcome_frequencies(&mut frequency, outcomes, timestamps, current_ts);

        Self::sort_and_limit_tracked_assets(frequency)
    }

    fn is_asset_unexpired(asset: U256, timestamps: &HashMap<U256, i64>, current_ts: i64) -> bool {
        if let Some(&end_ts) = timestamps.get(&asset) {
            end_ts > current_ts
        } else {
            true
        }
    }

    fn tally_edge_frequencies(
        frequency: &mut HashMap<U256, usize>,
        edges: &HashMap<U256, Vec<U256>>,
        timestamps: &HashMap<U256, i64>,
        current_ts: i64,
    ) {
        for (&p, children) in edges {
            if Self::is_asset_unexpired(p, timestamps, current_ts) {
                *frequency.entry(p).or_insert(0) += 1;
            }
            for &c in children {
                if Self::is_asset_unexpired(c, timestamps, current_ts) {
                    *frequency.entry(c).or_insert(0) += 1;
                }
            }
        }
    }

    fn tally_contradiction_frequencies(
        frequency: &mut HashMap<U256, usize>,
        edges: &HashMap<U256, Vec<(U256, Decimal)>>,
        timestamps: &HashMap<U256, i64>,
        current_ts: i64,
    ) {
        for (&p, children) in edges {
            for &(c, _) in children {
                if p < c {
                    if Self::is_asset_unexpired(p, timestamps, current_ts) {
                        *frequency.entry(p).or_insert(0) += 1;
                    }
                    if Self::is_asset_unexpired(c, timestamps, current_ts) {
                        *frequency.entry(c).or_insert(0) += 1;
                    }
                }
            }
        }
    }

    fn tally_outcome_frequencies(
        frequency: &mut HashMap<U256, usize>,
        outcomes: &HashMap<String, HashSet<U256>>,
        timestamps: &HashMap<U256, i64>,
        current_ts: i64,
    ) {
        for assets in outcomes.values() {
            for &a in assets {
                if Self::is_asset_unexpired(a, timestamps, current_ts) {
                    *frequency.entry(a).or_insert(0) += 1;
                }
            }
        }
    }

    fn sort_and_limit_tracked_assets(frequency: HashMap<U256, usize>) -> HashSet<U256> {
        let mut sorted_assets: Vec<(U256, usize)> = frequency.into_iter().collect();
        // Sort by frequency descending, then by asset_id (to ensure determinism)
        sorted_assets.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

        sorted_assets
            .into_iter()
            .take(MAX_TRACKED_ASSETS)
            .map(|(a, _)| a)
            .collect()
    }

    async fn apply_asset_diffs(
        &mut self,
        new_tracked_assets: &HashSet<U256>,
        cmd_tx: &Sender<IngestorCommand>,
    ) {
        // Subscribe to added assets dynamically directly from the Brain
        for added in new_tracked_assets.difference(&self.tracked_assets) {
            if let Err(e) = cmd_tx.send(IngestorCommand::Subscribe(*added)).await {
                warn!("Failed to send Subscribe command for {}: {}", added, e);
            }
        }

        // Unsubscribe from removed assets to save bandwidth, and evict them from Cache to prevent memory leaks!
        for removed in self.tracked_assets.difference(new_tracked_assets) {
            if let Err(e) = cmd_tx.send(IngestorCommand::Unsubscribe(*removed)).await {
                warn!("Failed to send Unsubscribe command for {}: {}", removed, e);
            }
            self.orderbook_cache.remove(removed);
        }
    }

    /// Dynamically fetches real-time Polygon base fee to optimize gas budgets.
    /// Standard is returned in gwei, which we convert to runtime USDC values.
    async fn sync_gas_oracle(&mut self) -> anyhow::Result<()> {
        let res = self
            .api_client
            .get("https://gasstation.polygon.technology/v2")
            .send()
            .await?;

        if !res.status().is_success() {
            return Err(anyhow::anyhow!(
                "Polygon Gas Station returned status: {}",
                res.status()
            ));
        }

        let gas_data: serde_json::Value = res.json().await?;
        if let Some(max_fee_val) = gas_data.get("standard").and_then(|s| s.get("maxFee")) {
            // Parse directly from the JSON string representation to avoid f64 precision loss
            let gwei_string = if let Some(s) = max_fee_val.as_str() {
                s.to_string()
            } else {
                max_fee_val.to_string()
            };
            let gwei_price = Decimal::from_str_exact(&gwei_string).unwrap_or_else(|e| {
                warn!("Failed to parse Polygon Gas Station price '{}': {}. Falling back to ESTIMATED_GWEI_PRICE.", gwei_string, e);
                ESTIMATED_GWEI_PRICE
            });
            self.current_gas_usdc_per_leg = (ESTIMATED_GAS_UNITS_PER_LEG * gwei_price)
                / Decimal::from(10_u64.pow(9))
                * MATIC_PRICE_USDC
                * GAS_SAFETY_MARGIN;
            debug!(live_gwei = %gwei_price, usdc_cost = %self.current_gas_usdc_per_leg, "Updated Live Polygon Gas Estimate.");
            Ok(())
        } else {
            Err(anyhow::anyhow!(
                "Missing 'standard.maxFee' in Polygon Gas Station response"
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use polymarket_client_sdk::types::B256;
    use rust_decimal_macros::dec;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn test_engine_actor_caches_orderbook() {
        let mut actor = EngineActor::new();
        let (tx, _rx) = mpsc::channel(10);

        let asset_id = U256::from(1_u64);
        let book = NormalizedOrderbook {
            asset_id,
            market: B256::default(),
            vwap_bid: dec!(0.50),
            vwap_ask: dec!(0.51),
            bid_untradeable: false,
            ask_untradeable: false,
            timestamp: 123456,
        };

        // Inject book to handle loop
        // Notice we mock total gas via gas_per_leg context
        let _total_est_gas_usdc = dec!(0.0);
        let gas_per_leg_usdc = dec!(0.0);

        actor
            .handle_book_update(book.clone(), &tx, dec!(0.0), gas_per_leg_usdc)
            .await;

        assert!(actor.orderbook_cache.contains_key(&asset_id));
        assert_eq!(
            actor.orderbook_cache.get(&asset_id).unwrap().vwap_bid,
            dec!(0.50)
        );
    }

    #[tokio::test]
    async fn test_engine_actor_triggers_implication_arb() {
        let mut actor = EngineActor::new();
        let (tx, mut rx) = mpsc::channel(10);

        let parent_id = U256::from(1_u64); // June
        let child_id = U256::from(2_u64); // 2026

        // Add implication: Parent implies Child
        actor.implication_edges.insert(parent_id, vec![child_id]);

        let child_book = NormalizedOrderbook {
            asset_id: child_id,
            market: B256::default(),
            vwap_bid: dec!(0.49),
            vwap_ask: dec!(0.50), // Low ask
            bid_untradeable: false,
            ask_untradeable: false,
            timestamp: 123456,
        };

        let parent_book = NormalizedOrderbook {
            asset_id: parent_id,
            market: B256::default(),
            vwap_bid: dec!(0.60), // High bid
            vwap_ask: dec!(0.61),
            bid_untradeable: false,
            ask_untradeable: false,
            timestamp: 123457,
        };

        let gas_per_leg_usdc = dec!(0.05);

        // Inject child book first, then parent book
        actor
            .handle_book_update(child_book.clone(), &tx, dec!(0.0), gas_per_leg_usdc)
            .await;
        actor
            .handle_book_update(parent_book.clone(), &tx, dec!(0.01), gas_per_leg_usdc)
            .await;

        // Check cache clearing
        assert!(!actor.orderbook_cache.contains_key(&parent_id));
        assert!(!actor.orderbook_cache.contains_key(&child_id));

        // Wait for signal
        let signal = rx.recv().await.unwrap();

        // Parent = 0.60, Child = 0.50.
        // Expected gross profit = 0.10. Expected total = profit * bounds.
        assert!(signal.expected_profit_usdc > dec!(0.0));
        assert_eq!(signal.legs.len(), 2);
    }

    #[tokio::test]
    async fn test_engine_actor_triggers_contradiction_arb() {
        let mut actor = EngineActor::new();
        let (tx, mut rx) = mpsc::channel(10);

        let peer_a_id = U256::from(10_u64);
        let peer_b_id = U256::from(20_u64);

        actor
            .contradiction_edges
            .insert(peer_a_id, vec![(peer_b_id, Decimal::ONE)]);
        actor
            .contradiction_edges
            .insert(peer_b_id, vec![(peer_a_id, Decimal::ONE)]);

        let peer_a_book = NormalizedOrderbook {
            asset_id: peer_a_id,
            market: B256::default(),
            vwap_bid: dec!(0.60), // High bid, P = 0.60
            vwap_ask: dec!(0.65),
            bid_untradeable: false,
            ask_untradeable: false,
            timestamp: 123456,
        };

        let peer_b_book = NormalizedOrderbook {
            asset_id: peer_b_id,
            market: B256::default(),
            vwap_bid: dec!(0.60), // High bid, P = 0.60 (Sum P = 1.20)
            vwap_ask: dec!(0.65),
            bid_untradeable: false,
            ask_untradeable: false,
            timestamp: 123457,
        };

        let gas_per_leg_usdc = dec!(0.05);

        // Inject first book, then second book
        actor
            .handle_book_update(peer_a_book.clone(), &tx, dec!(0.0), gas_per_leg_usdc)
            .await;
        actor
            .handle_book_update(peer_b_book.clone(), &tx, dec!(0.01), gas_per_leg_usdc)
            .await;

        // Check cache clearing
        assert!(!actor.orderbook_cache.contains_key(&peer_a_id));
        assert!(!actor.orderbook_cache.contains_key(&peer_b_id));

        // Wait for signal
        let signal = rx.recv().await.unwrap();

        // High ask prices indicate sum > 1.0 (Contradiction).
        // Profit should be strictly positive.
        assert!(signal.expected_profit_usdc > dec!(0.0));
        assert_eq!(signal.legs.len(), 2);
    }
}
