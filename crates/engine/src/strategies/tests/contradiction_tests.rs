#[cfg(test)]
mod tests {
    use crate::strategies::contradiction::ContradictionStrategy;
    use polymarket_client_sdk::types::U256;
    use rust_decimal_macros::dec;

    #[test]
    fn test_contradiction_profitable() {
        let asset_a = U256::from(1_u64);
        let asset_b = U256::from(2_u64);

        // P(A) + P(B) = 0.60 + 0.50 = 1.10 > 1.0
        let result = ContradictionStrategy::check(
            asset_a,
            dec!(0.60), // prob_a_bid
            dec!(3.0),  // weight_a
            asset_b,
            dec!(0.50), // prob_b_bid
            dec!(1.0),  // weight_b
            dec!(0.01), // 1% fee rate
            dec!(1.0),  // $1 gas
        );

        assert!(result.is_some());
        assert!(result.unwrap() > dec!(7.0));
    }

    #[test]
    fn test_contradiction_unprofitable_due_to_logic() {
        let asset_a = U256::from(1_u64);
        let asset_b = U256::from(2_u64);

        // P(A) + P(B) = 0.40 + 0.50 = 0.90 <= 1.0 (No arb)
        let result = ContradictionStrategy::check(
            asset_a,
            dec!(0.40),
            dec!(1.0),
            asset_b,
            dec!(0.50),
            dec!(1.0),
            dec!(0.02),
            dec!(0.50),
        );
        assert_eq!(result, None);
    }

    #[test]
    fn test_contradiction_unprofitable_due_to_fees() {
        let asset_a = U256::from(1_u64);
        let asset_b = U256::from(2_u64);

        // P(A) + P(B) = 0.51 + 0.50 = 1.01 > 1.0 (excess 0.01)
        let result = ContradictionStrategy::check(
            asset_a,
            dec!(0.51),
            dec!(1.0),
            asset_b,
            dec!(0.50),
            dec!(1.0),
            dec!(0.02), // 2% fee
            dec!(0.50), // 50c gas
        );

        assert_eq!(result, None);
    }
}
