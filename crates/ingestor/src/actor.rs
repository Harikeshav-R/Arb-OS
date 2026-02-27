use crate::clob_client::ClobClientWrapper;
use arbos_core::domain::{IngestorCommand, NormalizedOrderbook};
use futures::stream::{SelectAll, StreamExt};
use polymarket_client_sdk::clob::ws::types::response::{BookUpdate, OrderBookLevel};
use polymarket_client_sdk::types::U256;
use rust_decimal::Decimal;
use std::collections::HashSet;
use std::pin::Pin;
use tokio::sync::mpsc::{Receiver, Sender};
use tracing::{error, info, warn};

type WsStream<'a> = Pin<
    Box<
        dyn futures::Stream<Item = Result<BookUpdate, polymarket_client_sdk::error::Error>>
            + Send
            + 'a,
    >,
>;

#[derive(Default)]
pub struct IngestorActor {
    tracked_assets: HashSet<U256>,
}

impl IngestorActor {
    pub fn new() -> Self {
        Self {
            tracked_assets: HashSet::new(),
        }
    }

    pub async fn run(
        &mut self,
        mut cmd_rx: Receiver<IngestorCommand>,
        state_tx: Sender<NormalizedOrderbook>,
    ) -> anyhow::Result<()> {
        let mut retry_count = 0;
        let max_retries = 10;
        let base_delay = arbos_core::constants::CONNECTION_RETRY_DELAY_SECS;

        loop {
            if self.tracked_assets.is_empty()
                && !self.wait_for_initial_subscription(&mut cmd_rx).await
            {
                return Ok(()); // Command channel closed
            }

            // Create a fresh client wrapper for each connection attempt
            let wrapper = ClobClientWrapper::new();
            let mut streams = SelectAll::new();

            let assets = self.get_subscription_assets();
            info!(
                asset_count = assets.len(),
                "Connecting WebSocket for market data"
            );

            match wrapper.client.subscribe_orderbook(assets) {
                Ok(s) => {
                    streams.push(Box::pin(s) as WsStream<'_>);
                    retry_count = 0; // Reset on successful connect
                }
                Err(e) => {
                    retry_count += 1;
                    if retry_count > max_retries {
                        error!(error = ?e, "Max connection retries exceeded, exiting actor");
                        return Err(anyhow::anyhow!("Max connection retries exceeded: {}", e));
                    }

                    let delay = std::cmp::min(base_delay * (1 << (retry_count - 1)), 60);
                    error!(error = ?e, delay_secs = delay, "Failed to start market data stream, backing off");
                    tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
                    continue;
                }
            }

            self.process_streams(&mut cmd_rx, &state_tx, &wrapper, &mut streams)
                .await?;
        }
    }

    /// Waits for the first subscription command before connecting.
    /// Returns `true` if a subscription was added, `false` if the channel was closed.
    async fn wait_for_initial_subscription(
        &mut self,
        cmd_rx: &mut Receiver<IngestorCommand>,
    ) -> bool {
        info!("No tracked assets. Waiting for subscription command...");
        while let Some(cmd) = cmd_rx.recv().await {
            match cmd {
                IngestorCommand::Subscribe(asset) => {
                    self.tracked_assets.insert(asset);
                }
                IngestorCommand::Unsubscribe(asset) => {
                    self.tracked_assets.remove(&asset);
                }
            }
            if !self.tracked_assets.is_empty() {
                return true;
            }
        }
        info!("Command channel closed. Exiting ingestor actor.");
        false
    }

    /// Processes the active WebSocket streams and incoming commands.
    async fn process_streams<'a>(
        &mut self,
        cmd_rx: &mut Receiver<IngestorCommand>,
        state_tx: &Sender<NormalizedOrderbook>,
        wrapper: &'a ClobClientWrapper,
        streams: &mut SelectAll<WsStream<'a>>,
    ) -> anyhow::Result<()> {
        loop {
            if self.tracked_assets.is_empty() {
                info!("All assets unsubscribed, breaking stream loop to wait for commands");
                break;
            }

            tokio::select! {
                cmd_opt = cmd_rx.recv() => {
                    match cmd_opt {
                        Some(cmd) => {
                            self.handle_command(cmd, wrapper, streams);

                            // Drain any other pending commands
                            while let Ok(pending_cmd) = cmd_rx.try_recv() {
                                self.handle_command(pending_cmd, wrapper, streams);
                            }
                        }
                        None => {
                            info!("Command channel closed during stream processing.");
                            self.tracked_assets.clear(); // Force exit to outer loop which will then exit entirely
                            break;
                        }
                    }
                }

                book_result_opt = streams.next(), if !streams.is_empty() => {
                    // process_stream_event returns Ok(false) if the stream should be broken/reconnected
                    let should_continue = match self.process_stream_event(book_result_opt, state_tx).await {
                        Ok(continue_stream) => continue_stream,
                        Err(e) => {
                            error!(error = ?e, "Critical error processing stream event");
                            return Err(e);
                        }
                    };
                    if !should_continue {
                        break;
                    }
                }
            }

            if streams.is_empty() && !self.tracked_assets.is_empty() {
                warn!("All WebSocket streams ended unexpectedly");
                tokio::time::sleep(tokio::time::Duration::from_secs(
                    arbos_core::constants::CONNECTION_RETRY_DELAY_SECS,
                ))
                .await;
                break;
            }
        }
        Ok(())
    }

    fn get_subscription_assets(&self) -> Vec<U256> {
        self.tracked_assets.iter().copied().collect()
    }

    fn handle_command<'a>(
        &mut self,
        cmd: IngestorCommand,
        wrapper: &'a ClobClientWrapper,
        streams: &mut SelectAll<WsStream<'a>>,
    ) {
        match cmd {
            IngestorCommand::Subscribe(asset) => {
                if self.tracked_assets.len() >= arbos_core::constants::MAX_TRACKED_ASSETS {
                    warn!(
                        asset_id = %asset,
                        limit = arbos_core::constants::MAX_TRACKED_ASSETS,
                        "Maximum tracked assets limit reached. Rejecting subscription."
                    );
                    return;
                }

                if self.tracked_assets.contains(&asset) {
                    return; // Already tracking, nothing to do
                }

                // Attempt to subscribe to the remote stream first.
                match wrapper.client.subscribe_orderbook(vec![asset]) {
                    Ok(s) => {
                        // Only add to tracked assets if the SDK connection succeeds
                        self.tracked_assets.insert(asset);
                        info!(asset_id = %asset, "New Subscription Requested & Executed");
                        streams.push(Box::pin(s) as WsStream<'a>);
                    }
                    Err(e) => {
                        error!(error = ?e, asset_id = %asset, "Failed to dynamically subscribe, asset not tracked")
                    }
                }
            }
            IngestorCommand::Unsubscribe(asset) => {
                if self.tracked_assets.remove(&asset) {
                    info!(asset_id = %asset, "Unsubscribe Requested");
                    // Note: The specific stream is not removed from the `SelectAll` collection here.
                    // This design choice is acceptable for our expected usage patterns because:
                    // 1. Unsubscribing tells the server to stop pushing data, so the stream
                    //    becomes dormant and consumes negligible resources.
                    // 2. The set of tracked markets is relatively stable over a trading session;
                    //    we don't expect unbounded rapid subscribe/unsubscribe cycles.
                    // 3. Modifying `SelectAll` or wrapper abstractions would introduce
                    //    unnecessary complexity overhead in the critical path.
                    if let Err(e) = wrapper.client.unsubscribe_orderbook(&[asset]) {
                        error!(error = ?e, "Failed to dynamically unsubscribe");
                    }
                }
            }
        }
    }

    async fn process_stream_event<E: std::fmt::Debug>(
        &self,
        event: Option<Result<BookUpdate, E>>,
        state_tx: &Sender<NormalizedOrderbook>,
    ) -> anyhow::Result<bool> {
        match event {
            Some(Ok(book)) => {
                self.handle_book(book, state_tx).await?;
                Ok(true) // Continue stream
            }
            Some(Err(e)) => {
                error!(error = ?e, "WebSocket stream emitted error");
                tokio::time::sleep(tokio::time::Duration::from_secs(
                    arbos_core::constants::STREAM_ERROR_RETRY_DELAY_SECS,
                ))
                .await;
                Ok(false) // Break stream loop
            }
            None => {
                warn!("WebSocket stream closed unexpectedly");
                tokio::time::sleep(tokio::time::Duration::from_secs(
                    arbos_core::constants::CONNECTION_RETRY_DELAY_SECS,
                ))
                .await;
                Ok(false) // Break stream loop
            }
        }
    }

    async fn handle_book(
        &self,
        book: BookUpdate,
        state_tx: &Sender<NormalizedOrderbook>,
    ) -> anyhow::Result<()> {
        if !self.tracked_assets.contains(&book.asset_id) {
            return Ok(());
        }

        let (vwap_bid, bid_untradeable) = Self::calculate_vwap(&book.bids);
        let (vwap_ask, ask_untradeable) = Self::calculate_vwap(&book.asks);

        let state = NormalizedOrderbook {
            asset_id: book.asset_id,
            market: book.market,
            vwap_bid,
            vwap_ask,
            bid_untradeable,
            ask_untradeable,
            timestamp: book.timestamp,
        };

        if let Err(e) = state_tx.send(state).await {
            error!(error = %e, "Engine receiver dropped, shutting down ingestor actor");
            return Err(anyhow::anyhow!("State receiver dropped: {}", e));
        }

        Ok(())
    }

    /// Calculates the VWAP up to a target liquidity equivalent of TARGET_LIQUIDITY USDC.
    /// Returns (vwap as Decimal, untradeable as bool).
    fn calculate_vwap(levels: &[OrderBookLevel]) -> (Decimal, bool) {
        let target_liquidity_usdc = arbos_core::constants::TARGET_LIQUIDITY;
        let mut accumulated_usdc = Decimal::ZERO;
        let mut accumulated_shares = Decimal::ZERO;

        for level in levels {
            let price = level.price;
            let size_in_shares = level.size;

            if price.is_zero() || size_in_shares.is_zero() {
                continue;
            }

            let usdc_at_level = price * size_in_shares;
            let remaining_usdc_needed = target_liquidity_usdc - accumulated_usdc;

            if usdc_at_level <= remaining_usdc_needed {
                accumulated_usdc += usdc_at_level;
                accumulated_shares += size_in_shares;
                if accumulated_usdc >= target_liquidity_usdc {
                    break;
                }
            } else {
                let shares_to_take = remaining_usdc_needed / price;
                accumulated_usdc += remaining_usdc_needed;
                accumulated_shares += shares_to_take;
                break;
            }
        }

        if accumulated_usdc < target_liquidity_usdc || accumulated_shares.is_zero() {
            (Decimal::ZERO, true)
        } else {
            (accumulated_usdc / accumulated_shares, false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use serde_json::json;

    fn make_level(price: &str, size: &str) -> OrderBookLevel {
        serde_json::from_value(json!({
            "price": price,
            "size": size
        }))
        .unwrap()
    }

    #[test]
    fn test_vwap_sufficient_liquidity() {
        let levels = vec![
            make_level("0.40", "100.0"), // 100 shares @ 0.40 = $40 USDC
            make_level("0.60", "100.0"), // 100 shares @ 0.60 = $60 USDC
            make_level("0.70", "100.0"), // Should be ignored
        ];

        let (vwap, untradeable) = IngestorActor::calculate_vwap(&levels);

        assert!(!untradeable);
        // Accumulated 200 shares for $100 USDC total. VWAP = 100 / 200 = 0.50
        assert_eq!(vwap, dec!(0.50));
    }

    #[test]
    fn test_vwap_insufficient_liquidity() {
        let levels = vec![
            make_level("0.50", "100.0"), // $50 USDC
            make_level("0.60", "50.0"),  // $30 USDC (Total $80 USDC < TARGET_LIQUIDITY)
        ];

        let (vwap, untradeable) = IngestorActor::calculate_vwap(&levels);

        assert!(untradeable);
        assert_eq!(vwap, Decimal::ZERO);
    }

    #[test]
    fn test_vwap_empty_orderbook() {
        let levels: Vec<OrderBookLevel> = vec![];
        let (vwap, untradeable) = IngestorActor::calculate_vwap(&levels);
        assert!(untradeable);
        assert_eq!(vwap, Decimal::ZERO);
    }

    #[test]
    fn test_vwap_exact_target_liquidity() {
        let levels = vec![
            make_level("0.50", "200.0"), // 200 shares @ 0.50 = exactly $100 USDC
        ];
        let (vwap, untradeable) = IngestorActor::calculate_vwap(&levels);
        assert!(!untradeable);
        assert_eq!(vwap, dec!(0.50));
    }

    #[test]
    fn test_vwap_excess_liquidity() {
        let levels = vec![
            make_level("0.80", "500.0"), // 500 shares @ 0.80 = $400 USDC (needs only 125 shares for $100)
        ];
        let (vwap, untradeable) = IngestorActor::calculate_vwap(&levels);
        assert!(!untradeable);
        assert_eq!(vwap, dec!(0.80));
    }

    #[test]
    fn test_vwap_zero_price_or_size() {
        let levels = vec![
            make_level("0.00", "1000.0"), // Zero price, should be ignored
            make_level("0.50", "0.0"),    // Zero size, should be ignored
            make_level("0.40", "250.0"),  // 250 shares @ 0.40 = $100 USDC
        ];
        let (vwap, untradeable) = IngestorActor::calculate_vwap(&levels);
        assert!(!untradeable);
        assert_eq!(vwap, dec!(0.40));
    }

    #[test]
    fn test_vwap_partial_level_liquidity() {
        let levels = vec![
            make_level("0.50", "150.0"), // 150 shares @ 0.50 = $75 USDC
            make_level("0.60", "100.0"), // Needs $25 USDC more. $25 / 0.60 = 41.6666... shares
        ];

        let (vwap, untradeable) = IngestorActor::calculate_vwap(&levels);

        assert!(!untradeable);
        // Total shares = 150 + (25 / 0.6) = 150 + 41.666666666666666666666666667 = 191.66666666666666666666666667
        // VWAP = 100 / 191.66666666666666666666666667 = 0.5217391304347826086956521739
        // rust_decimal rounds this. We can just test the expected exact decimal logic output:
        let expected_shares = dec!(150.0) + (dec!(25.0) / dec!(0.60));
        let expected_vwap = dec!(100.0) / expected_shares;

        assert_eq!(vwap, expected_vwap);
    }
}
