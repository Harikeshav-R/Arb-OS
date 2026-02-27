use polymarket_client_sdk::types::U256;
use rust_decimal::Decimal;
use tracing::{debug, info};

pub struct PartitionStrategy;

impl PartitionStrategy {
    /// Checks for a Partition arbitrage signal where a set of mutually exclusive
    /// outcomes are exhaustive.
    /// In this scenario, Sum(P(E_i)) must equal 1.0 logically.
    /// If Sum(P_bid) > 1.0 + fees + gas, we sell all outcomes (basket short).
    pub fn check(
        asset_bids: &[(U256, Decimal)],
        fee_rate: Decimal,
        estimated_gas_usdc: Decimal,
    ) -> Option<Decimal> {
        if asset_bids.is_empty() {
            return None;
        }

        let sum_bids: Decimal = asset_bids.iter().map(|(_, bid)| bid).sum();

        // If the sum isn't > 1.0, there is no structural arb
        if sum_bids <= Decimal::ONE {
            return None;
        }

        let gross_profit_per_share = sum_bids - Decimal::ONE;

        // Fees are charged on the filled value for each sell
        let total_fees_per_share: Decimal = asset_bids.iter().map(|(_, bid)| bid * fee_rate).sum();

        // Calculate profitability based on deploying TARGET_LIQUIDITY in USDC.
        let position_size_shares = arbos_core::constants::TARGET_LIQUIDITY / sum_bids;

        let total_gross_profit = gross_profit_per_share * position_size_shares;
        let total_fees = total_fees_per_share * position_size_shares;

        let expected_net_profit = total_gross_profit - total_fees - estimated_gas_usdc;

        if expected_net_profit > arbos_core::constants::MIN_PROFIT_THRESH_USDC {
            info!(
                leg_count = asset_bids.len(),
                sum_bids = %sum_bids,
                net_profit = %expected_net_profit,
                "Partition Arbitrage Triggered!"
            );
            Some(expected_net_profit)
        } else {
            debug!(
                sum_bids = %sum_bids,
                gross = %total_gross_profit,
                fees = %total_fees,
                gas = %estimated_gas_usdc,
                "Partition arb found but net unprofitable"
            );
            None
        }
    }
}
