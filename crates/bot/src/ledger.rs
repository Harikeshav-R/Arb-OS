use arbos_core::domain::{ExecutionReport, FillDetail, TradeAction};
use polymarket_client_sdk::types::U256;
use rust_decimal::Decimal;
use std::collections::{HashMap, VecDeque};

/// Tracks an open position on a specific asset.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Position {
    pub asset_id: U256,
    pub side: String,
    pub size: Decimal,
    pub entry_price: Decimal,
    pub opened_at: i64,
}

/// In-memory execution history and position tracker.
///
/// - **History**: bounded ring buffer of the last N execution reports.
/// - **Positions**: running tally of open positions per asset (accumulated from fill details).
pub struct Ledger {
    max_history: usize,
    history: VecDeque<ExecutionReport>,
    positions: HashMap<U256, Position>,
    cumulative_pnl: Decimal,
    total_signals: u64,
}

impl Ledger {
    pub fn new(max_history: usize) -> Self {
        Self {
            max_history,
            history: VecDeque::with_capacity(max_history),
            positions: HashMap::new(),
            cumulative_pnl: Decimal::ZERO,
            total_signals: 0,
        }
    }

    /// Record a completed execution, update positions and P&L.
    pub fn record_execution(&mut self, report: &ExecutionReport) {
        if report.success {
            self.cumulative_pnl += report.pnl_usdc;
            self.total_signals += 1;

            for fill in &report.fill_details {
                if fill.filled {
                    self.update_position(fill, report.executed_at);
                }
            }
        }

        if self.max_history == 0 {
            return;
        }

        if self.history.len() >= self.max_history {
            self.history.pop_back();
        }
        self.history.push_front(report.clone());
    }

    /// Update or create a position from a fill detail.
    fn update_position(&mut self, fill: &FillDetail, timestamp: i64) {
        let entry = self.positions.entry(fill.asset_id);
        match entry {
            std::collections::hash_map::Entry::Occupied(mut e) => {
                let pos = e.get_mut();
                if pos.side == fill.side {
                    // Same side: increase position
                    let total_cost = (pos.size * pos.entry_price) + (fill.size * fill.price);
                    pos.size += fill.size;
                    if pos.size > Decimal::ZERO {
                        pos.entry_price = total_cost / pos.size;
                    }
                } else {
                    // Opposite side: reduce/close position
                    if fill.size >= pos.size {
                        // Position fully closed or reversed
                        let remaining = fill.size - pos.size;
                        if remaining > Decimal::ZERO {
                            pos.side = fill.side.clone();
                            pos.size = remaining;
                            pos.entry_price = fill.price;
                            pos.opened_at = timestamp;
                        } else {
                            e.remove();
                        }
                    } else {
                        pos.size -= fill.size;
                    }
                }
            }
            std::collections::hash_map::Entry::Vacant(e) => {
                e.insert(Position {
                    asset_id: fill.asset_id,
                    side: fill.side.clone(),
                    size: fill.size,
                    entry_price: fill.price,
                    opened_at: timestamp,
                });
            }
        }
    }

    /// Get a snapshot of all open positions.
    pub fn get_positions(&self) -> Vec<Position> {
        self.positions.values().cloned().collect()
    }

    /// Get recent execution history (newest first).
    pub fn get_recent_history(&self, limit: usize) -> Vec<&ExecutionReport> {
        self.history.iter().take(limit).collect()
    }

    pub fn cumulative_pnl(&self) -> Decimal {
        self.cumulative_pnl
    }

    pub fn total_signals(&self) -> u64 {
        self.total_signals
    }

    /// Extract the asset IDs from a signal's trade legs.
    pub fn extract_asset_ids(signal: &arbos_core::domain::ArbSignal) -> Vec<U256> {
        signal
            .legs
            .iter()
            .map(|leg| match leg {
                TradeAction::Buy { asset_id, .. } => *asset_id,
                TradeAction::Sell { asset_id, .. } => *asset_id,
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use arbos_core::domain::{ArbSignal, ExecutionMode, StrategyType, TradeAction};
    use rust_decimal_macros::dec;

    fn make_report(profit: Decimal, success: bool) -> ExecutionReport {
        ExecutionReport {
            signal: ArbSignal {
                strategy: StrategyType::Implication,
                legs: vec![
                    TradeAction::Sell {
                        asset_id: U256::from(1),
                        size: dec!(100),
                    },
                    TradeAction::Buy {
                        asset_id: U256::from(2),
                        size: dec!(100),
                    },
                ],
                expected_profit_usdc: profit,
                timestamp: 1700000000,
            },
            mode: ExecutionMode::Demo,
            success,
            fill_details: vec![
                FillDetail {
                    asset_id: U256::from(1),
                    side: "SELL".to_string(),
                    size: dec!(100),
                    price: dec!(0.60),
                    filled: success,
                },
                FillDetail {
                    asset_id: U256::from(2),
                    side: "BUY".to_string(),
                    size: dec!(100),
                    price: dec!(0.55),
                    filled: success,
                },
            ],
            pnl_usdc: if success { profit } else { Decimal::ZERO },
            executed_at: 1700000000,
        }
    }

    #[test]
    fn test_ledger_records_execution() {
        let mut ledger = Ledger::new(100);
        let report = make_report(dec!(2.50), true);
        ledger.record_execution(&report);

        assert_eq!(ledger.total_signals(), 1);
        assert_eq!(ledger.cumulative_pnl(), dec!(2.50));
        assert_eq!(ledger.get_recent_history(10).len(), 1);
    }

    #[test]
    fn test_ledger_tracks_positions() {
        let mut ledger = Ledger::new(100);
        let report = make_report(dec!(2.50), true);
        ledger.record_execution(&report);

        let positions = ledger.get_positions();
        assert_eq!(positions.len(), 2);
    }

    #[test]
    fn test_ledger_failed_signal_no_pnl() {
        let mut ledger = Ledger::new(100);
        let report = make_report(dec!(1.00), false);
        ledger.record_execution(&report);

        assert_eq!(ledger.total_signals(), 0);
        assert_eq!(ledger.cumulative_pnl(), Decimal::ZERO);
        // Still recorded in history for audit
        assert_eq!(ledger.get_recent_history(10).len(), 1);
    }

    #[test]
    fn test_ledger_history_bounded() {
        let mut ledger = Ledger::new(3);
        for i in 0..5 {
            let report = make_report(Decimal::from(i), true);
            ledger.record_execution(&report);
        }

        // Only keeps the last 3
        assert_eq!(ledger.get_recent_history(10).len(), 3);
        // Most recent first
        assert_eq!(ledger.get_recent_history(1)[0].pnl_usdc, dec!(4));
    }

    #[test]
    fn test_ledger_cumulative_pnl() {
        let mut ledger = Ledger::new(100);
        ledger.record_execution(&make_report(dec!(1.50), true));
        ledger.record_execution(&make_report(dec!(2.00), true));
        ledger.record_execution(&make_report(dec!(0.75), true));
        assert_eq!(ledger.cumulative_pnl(), dec!(4.25));
    }
}
