use polymarket_client_sdk::types::U256;
use rust_decimal::Decimal;
use tracing::{debug, info};

pub struct ContradictionStrategy;

impl ContradictionStrategy {
    /// Checks for a Contradiction arbitrage signal where two mutually exclusive events
    /// have a combined probability > 1.0.
    /// Calculates coherent probabilities using weights to penalize the probabilities,
    /// and logs the "edges".
    /// If Sum(P_bid) > 1.0 + fees + gas, we sell both outcomes (buy NO on both).
    #[allow(clippy::too_many_arguments)]
    pub fn check(
        asset_a: U256,
        prob_a_bid: Decimal,
        weight_a: Decimal,
        asset_b: U256,
        prob_b_bid: Decimal,
        weight_b: Decimal,
        fee_rate: Decimal,
        estimated_gas_usdc: Decimal,
    ) -> Option<Decimal> {
        let sum_bids = prob_a_bid + prob_b_bid;

        // The constraint is: P(A) + P(B) <= 1.0
        if sum_bids <= Decimal::ONE {
            return None;
        }

        let excess = sum_bids - Decimal::ONE;

        let combined_weight = weight_a + weight_b;

        let mut coherent_a = prob_a_bid;
        let mut coherent_b = prob_b_bid;
        let mut edge_a = Decimal::ZERO;
        let mut edge_b = Decimal::ZERO;

        if combined_weight > Decimal::ZERO {
            // The penalty for A is proportional to the weight of B
            let penalty_a = excess * (weight_b / combined_weight);
            // The penalty for B is proportional to the weight of A
            let penalty_b = excess * (weight_a / combined_weight);

            coherent_a -= penalty_a;
            coherent_b -= penalty_b;

            edge_a = coherent_a - prob_a_bid;
            edge_b = coherent_b - prob_b_bid;
        }

        let gross_profit_per_share = excess;

        // Fees are taken on the traded value (the bid prices)
        let total_fees_per_share = (prob_a_bid + prob_b_bid) * fee_rate;

        // Position sizing based on the sum_bids or TARGET_LIQUIDITY limits
        let position_size_shares = arbos_core::constants::TARGET_LIQUIDITY / sum_bids;

        let total_gross_profit = gross_profit_per_share * position_size_shares;
        let total_fees = total_fees_per_share * position_size_shares;

        let expected_net_profit = total_gross_profit - total_fees - estimated_gas_usdc;

        if expected_net_profit > arbos_core::constants::MIN_PROFIT_THRESH_USDC {
            info!(
                asset_a = %asset_a,
                asset_b = %asset_b,
                prob_a_bid = %prob_a_bid,
                prob_b_bid = %prob_b_bid,
                weight_a = %weight_a,
                weight_b = %weight_b,
                coherent_a = %coherent_a,
                coherent_b = %coherent_b,
                edge_a = %edge_a,
                edge_b = %edge_b,
                net_profit = %expected_net_profit,
                "Contradiction Arbitrage Triggered!"
            );
            Some(expected_net_profit)
        } else {
            debug!(
                sum_bids = %sum_bids,
                excess = %excess,
                gross = %total_gross_profit,
                fees = %total_fees,
                gas = %estimated_gas_usdc,
                "Contradiction arb found but net unprofitable"
            );
            None
        }
    }
}
