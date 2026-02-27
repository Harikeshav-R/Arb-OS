use polymarket_client_sdk::types::U256;
use rust_decimal::Decimal;
use tracing::{debug, info};

pub struct ImplicationStrategy;

impl ImplicationStrategy {
    /// Checks for an Implication arbitrage signal where Event A implies Event B.
    /// In this scenario, P(A) cannot logically exceed P(B).
    /// If P(A)_bid > P(B)_ask + fees + gas, we sell A and buy B.
    pub fn check(
        asset_a: U256,
        prob_a_bid: Decimal,
        asset_b: U256,
        prob_b_ask: Decimal,
        fee_rate: Decimal,
        estimated_gas_usdc: Decimal,
    ) -> Option<Decimal> {
        // We only care if A is trading higher than B
        if prob_a_bid <= prob_b_ask {
            return None;
        }

        // Expected gross profit per share
        let gross_profit_per_share = prob_a_bid - prob_b_ask;

        // Total fee is the fee taken on selling A and buying B.
        // We evaluate profitability normalized to 1 share (which yields $1 at resolution).
        // Taker fees are taken on the filled USDC amount.
        let fee_a = prob_a_bid * fee_rate;
        let fee_b = prob_b_ask * fee_rate;
        let total_fees_per_share = fee_a + fee_b;

        // To properly execute a delta-neutral implication trade, we deploy the SAME number of shares to both legs.
        // We use max(parent_bid, child_ask) to enforce TARGET_LIQUIDITY limits.
        let highest_price = prob_a_bid.max(prob_b_ask);
        let consistent_size_shares = arbos_core::constants::TARGET_LIQUIDITY / highest_price;

        let total_gross_profit = gross_profit_per_share * consistent_size_shares;
        let total_fees = total_fees_per_share * consistent_size_shares;

        let expected_net_profit = total_gross_profit - total_fees - estimated_gas_usdc;

        if expected_net_profit > arbos_core::constants::MIN_PROFIT_THRESH_USDC {
            info!(
                asset_a = %asset_a,
                asset_b = %asset_b,
                prob_a_bid = %prob_a_bid,
                prob_b_ask = %prob_b_ask,
                net_profit = %expected_net_profit,
                "Implication Arbitrage Triggered!"
            );
            Some(expected_net_profit)
        } else {
            debug!(
                asset_a = %asset_a,
                asset_b = %asset_b,
                gross = %total_gross_profit,
                fees = %total_fees,
                gas = %estimated_gas_usdc,
                "Implication arb found but net unprofitable"
            );
            None
        }
    }
}
