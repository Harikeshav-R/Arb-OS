#[cfg(test)]
mod tests {
    use crate::strategies::implication::ImplicationStrategy;
    use polymarket_client_sdk::types::U256;
    use rust_decimal_macros::dec;

    #[test]
    fn test_implication_unprofitable_due_to_logic() {
        let asset_a = U256::from(1_u64);
        let asset_b = U256::from(2_u64);

        // P(A) is less than P(B), meaning logic is intact (No arb)
        let result = ImplicationStrategy::check(
            asset_a,
            dec!(0.50), // prob_a_bid
            asset_b,
            dec!(0.60), // prob_b_ask
            dec!(0.02), // 2% fee
            dec!(0.50), // 50c gas
        );
        assert_eq!(result, None);
    }

    #[test]
    fn test_implication_profitable() {
        let asset_a = U256::from(1_u64);
        let asset_b = U256::from(2_u64);

        // P(A) > P(B), meaning P(A) bid is 60c and P(B) ask is 50c
        let result = ImplicationStrategy::check(
            asset_a,
            dec!(0.60), // prob_a_bid
            asset_b,
            dec!(0.50), // prob_b_ask
            dec!(0.01), // 1% fee = 0.6c A + 0.5c B = 1.1c total fee per share
            dec!(1.0),  // $1 gas
        );

        // Target liquidity is $100.
        // position_size_shares = 100 / 0.60 = 166.66666666666666666666666667
        // gross profit per share = 0.10. Total gross = 16.666666666666666666666666667
        // total fees = (0.011) * 166.66666666666666666666666667 = 1.8333333333333333333333333333
        // Gas = 1.00
        // Expected Net = 16.66 - 1.83 - 1.00 = ~13.83

        assert!(result.is_some());
        assert!(result.unwrap() > dec!(13.8));
    }

    #[test]
    fn test_implication_unprofitable_due_to_fees() {
        let asset_a = U256::from(1_u64);
        let asset_b = U256::from(2_u64);

        // P(A) > P(B), but spread is tiny (1c)
        let result = ImplicationStrategy::check(
            asset_a,
            dec!(0.51), // prob_a_bid
            asset_b,
            dec!(0.50), // prob_b_ask
            dec!(0.02), // 2% fee
            dec!(0.50), // 50c gas
        );

        assert_eq!(result, None); // Fees should drain the 1c margin
    }
}
