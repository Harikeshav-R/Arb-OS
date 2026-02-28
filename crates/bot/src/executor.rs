use crate::dedup::SignalDeduplicator;
use crate::ledger::Ledger;
use arbos_core::constants::{EXECUTOR_RATE_LIMIT_PER_SEC, TARGET_LIQUIDITY};
use arbos_core::domain::{ArbSignal, ExecutionMode, ExecutionReport, FillDetail, TradeAction};
use rust_decimal::Decimal;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::sync::broadcast;
use tokio::sync::mpsc::{Receiver, Sender};
use tracing::{error, info, warn};

/// The Executor actor consumes `ArbSignal` from the Engine and either
/// simulates (Demo) or executes (Live) trades on Polymarket.
///
/// Integrates with:
/// - `SignalDeduplicator` — prevents re-executing the same pair within cooldown
/// - `Ledger` (shared via Arc<RwLock>) — records history and tracks positions
/// - `broadcast::Sender` — fans out reports to all WS-connected frontend clients
pub struct ExecutorActor {
    mode: ExecutionMode,
    signals_dropped: u64,
    dedup: SignalDeduplicator,
    ledger: Arc<RwLock<Ledger>>,
    broadcast_tx: broadcast::Sender<String>,
    /// Token-bucket rate limiter: tracks tokens and last refill time
    rate_tokens: u32,
    rate_last_refill: std::time::Instant,
    /// Counter for periodic dedup GC
    gc_counter: u64,
}

impl ExecutorActor {
    pub fn new(
        mode: ExecutionMode,
        dedup_cooldown_secs: u64,
        ledger: Arc<RwLock<Ledger>>,
        broadcast_tx: broadcast::Sender<String>,
    ) -> Self {
        Self {
            mode,
            signals_dropped: 0,
            dedup: SignalDeduplicator::new(dedup_cooldown_secs),
            ledger,
            broadcast_tx,
            rate_tokens: EXECUTOR_RATE_LIMIT_PER_SEC,
            rate_last_refill: std::time::Instant::now(),
            gc_counter: 0,
        }
    }

    /// Main event loop: consume ArbSignals and execute them.
    pub async fn run(
        &mut self,
        mut signal_rx: Receiver<ArbSignal>,
        report_tx: Sender<ExecutionReport>,
    ) -> anyhow::Result<()> {
        info!(
            mode = ?self.mode,
            "ExecutorActor started."
        );

        loop {
            tokio::select! {
                signal_opt = signal_rx.recv() => {
                    match signal_opt {
                        Some(signal) => {
                            self.handle_signal(signal, &report_tx).await;
                        }
                        None => {
                            info!("Signal channel closed. ExecutorActor shutting down.");
                            break;
                        }
                    }
                }
            }
        }

        let ledger = self.ledger.read().await;
        info!(
            cumulative_pnl = %ledger.cumulative_pnl(),
            total_signals = ledger.total_signals(),
            signals_dropped = self.signals_dropped,
            "ExecutorActor finished."
        );
        Ok(())
    }

    async fn handle_signal(&mut self, signal: ArbSignal, report_tx: &Sender<ExecutionReport>) {
        // 1. Rate limit check
        if !self.check_rate_limit() {
            self.signals_dropped += 1;
            warn!(
                strategy = %signal.strategy,
                profit = %signal.expected_profit_usdc,
                "Rate limit exceeded, dropping ArbSignal."
            );
            return;
        }

        // 2. Deduplication check
        let asset_ids = Ledger::extract_asset_ids(&signal);
        if !self.dedup.try_execute(&asset_ids) {
            self.signals_dropped += 1;
            warn!(
                strategy = %signal.strategy,
                profit = %signal.expected_profit_usdc,
                "Duplicate signal within cooldown window, dropping."
            );
            return;
        }

        // 3. Execute
        let report = match self.mode {
            ExecutionMode::Demo => self.execute_signal_demo(&signal),
            ExecutionMode::Live => self.execute_signal_live(&signal),
        };

        // 4. Record in ledger
        {
            let mut ledger = self.ledger.write().await;
            ledger.record_execution(&report);

            if report.success {
                info!(
                    mode = ?self.mode,
                    strategy = %report.signal.strategy,
                    pnl = %report.pnl_usdc,
                    cumulative_pnl = %ledger.cumulative_pnl(),
                    total_signals = ledger.total_signals(),
                    legs = report.fill_details.len(),
                    "Signal executed successfully."
                );
            } else {
                warn!(
                    mode = ?self.mode,
                    strategy = %report.signal.strategy,
                    "Signal execution failed."
                );
            }
        }

        // 5. Broadcast to WS clients
        if let Ok(json) = serde_json::to_string(&report) {
            let _ = self.broadcast_tx.send(json);
        }

        // 6. Forward to orchestrator
        if let Err(e) = report_tx.send(report).await {
            error!("Failed to send ExecutionReport: {}", e);
        }

        // 7. Periodic dedup GC (every 100 signals)
        self.gc_counter += 1;
        if self.gc_counter.is_multiple_of(100) {
            self.dedup.gc();
        }
    }

    /// Demo mode: simulate execution using signal data, assume all fills succeed.
    fn execute_signal_demo(&self, signal: &ArbSignal) -> ExecutionReport {
        let mut fill_details = Vec::with_capacity(signal.legs.len());

        for leg in &signal.legs {
            let (asset_id, size, side, price) = match leg {
                TradeAction::Buy { asset_id, size } => {
                    let price = TARGET_LIQUIDITY / *size;
                    (*asset_id, *size, "BUY".to_string(), price)
                }
                TradeAction::Sell { asset_id, size } => {
                    let price = TARGET_LIQUIDITY / *size;
                    (*asset_id, *size, "SELL".to_string(), price)
                }
            };

            info!(
                asset_id = %asset_id,
                side = %side,
                size = %size,
                price = %price,
                "[DEMO] Fill simulated."
            );

            fill_details.push(FillDetail {
                asset_id,
                side,
                size,
                price,
                filled: true,
            });
        }

        let now_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        ExecutionReport {
            signal: signal.clone(),
            mode: ExecutionMode::Demo,
            success: true,
            fill_details,
            pnl_usdc: signal.expected_profit_usdc,
            executed_at: now_ts,
        }
    }

    /// Live mode: placeholder for real Polymarket SDK integration.
    ///
    /// Production implementation requires:
    /// 1. Initialize `ClobClient` with API key, secret, passphrase from env
    /// 2. For each leg, call `ClobClient::create_order()` with `OrderType::FOK`
    /// 3. Atomic execution: prepare both legs, execute sequentially
    /// 4. If leg A fills but leg B fails → PANIC DUMP leg A back to market
    /// 5. Verify fills via CLOB REST API
    /// 6. EIP-712 signing is handled automatically by the SDK
    fn execute_signal_live(&self, signal: &ArbSignal) -> ExecutionReport {
        error!(
            strategy = %signal.strategy,
            legs = signal.legs.len(),
            profit = %signal.expected_profit_usdc,
            "Live execution is not yet implemented. Set ARBOS_LIVE_MODE=false or unset it."
        );

        let now_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        ExecutionReport {
            signal: signal.clone(),
            mode: ExecutionMode::Live,
            success: false,
            fill_details: vec![],
            pnl_usdc: Decimal::ZERO,
            executed_at: now_ts,
        }
    }

    /// Token-bucket rate limiter. Refills tokens once per second.
    fn check_rate_limit(&mut self) -> bool {
        let now = std::time::Instant::now();
        let elapsed = now.duration_since(self.rate_last_refill);

        if elapsed >= std::time::Duration::from_secs(1) {
            self.rate_tokens = EXECUTOR_RATE_LIMIT_PER_SEC;
            self.rate_last_refill = now;
        }

        if self.rate_tokens > 0 {
            self.rate_tokens -= 1;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use arbos_core::domain::StrategyType;
    use polymarket_client_sdk::types::U256;
    use rust_decimal_macros::dec;

    fn make_test_signal(profit: Decimal) -> ArbSignal {
        ArbSignal {
            strategy: StrategyType::Implication,
            legs: vec![
                TradeAction::Sell {
                    asset_id: U256::from(1),
                    size: dec!(200),
                },
                TradeAction::Buy {
                    asset_id: U256::from(2),
                    size: dec!(200),
                },
            ],
            expected_profit_usdc: profit,
            timestamp: 1700000000,
        }
    }

    fn make_executor() -> ExecutorActor {
        let ledger = Arc::new(RwLock::new(Ledger::new(100)));
        let (broadcast_tx, _) = broadcast::channel(16);
        ExecutorActor::new(ExecutionMode::Demo, 30, ledger, broadcast_tx)
    }

    #[test]
    fn test_demo_execution_produces_report() {
        let executor = make_executor();
        let signal = make_test_signal(dec!(2.50));
        let report = executor.execute_signal_demo(&signal);

        assert!(report.success);
        assert_eq!(report.mode, ExecutionMode::Demo);
        assert_eq!(report.pnl_usdc, dec!(2.50));
        assert_eq!(report.fill_details.len(), 2);
        assert!(report.fill_details[0].filled);
        assert!(report.fill_details[1].filled);
        assert_eq!(report.fill_details[0].side, "SELL");
        assert_eq!(report.fill_details[1].side, "BUY");
    }

    #[test]
    fn test_live_execution_returns_failure() {
        let ledger = Arc::new(RwLock::new(Ledger::new(100)));
        let (broadcast_tx, _) = broadcast::channel(16);
        let executor = ExecutorActor::new(ExecutionMode::Live, 30, ledger, broadcast_tx);
        let signal = make_test_signal(dec!(1.00));
        let report = executor.execute_signal_live(&signal);

        assert!(!report.success);
        assert_eq!(report.mode, ExecutionMode::Live);
        assert_eq!(report.pnl_usdc, Decimal::ZERO);
        assert!(report.fill_details.is_empty());
    }

    #[test]
    fn test_rate_limiter_allows_up_to_limit() {
        let mut executor = make_executor();

        for _ in 0..EXECUTOR_RATE_LIMIT_PER_SEC {
            assert!(executor.check_rate_limit());
        }
        assert!(!executor.check_rate_limit());
    }

    #[test]
    fn test_demo_execution_fills_correct_prices() {
        let executor = make_executor();
        let signal = make_test_signal(dec!(2.50));
        let report = executor.execute_signal_demo(&signal);

        // TARGET_LIQUIDITY (100) / size (200) = 0.5
        assert_eq!(report.fill_details[0].price, dec!(0.5));
        assert_eq!(report.fill_details[1].price, dec!(0.5));
    }
}
