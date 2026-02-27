#[cfg(test)]
mod tests {
    use crate::strategies::partition::PartitionStrategy;
    use polymarket_client_sdk::types::U256;
    use rust_decimal_macros::dec;

    #[test]
    fn test_partition_unprofitable_logic() {
        // Sum < 1.0
        let bids = vec![
            (U256::from(1_u64), dec!(0.30)),
            (U256::from(2_u64), dec!(0.30)),
            (U256::from(3_u64), dec!(0.30)),
        ];

        let result = PartitionStrategy::check(&bids, dec!(0.01), dec!(1.0));
        assert_eq!(result, None);
    }

    #[test]
    fn test_partition_profitable() {
        // Sum > 1.0 (1.20)
        let bids = vec![
            (U256::from(1_u64), dec!(0.40)),
            (U256::from(2_u64), dec!(0.40)),
            (U256::from(3_u64), dec!(0.40)),
        ];

        let result = PartitionStrategy::check(
            &bids,
            dec!(0.01), // 1% fee
            dec!(2.0),  // $2 gas for 3 legs
        );

        // Target liquidity $100. Sum = 1.20. Gross per "basket limit" = 0.20
        // Position Size = 100 / 1.20 = 83.333 shares.
        // Total gross = 0.20 * 83.333 = $16.666
        // Fees per share = sum(bid * fee_rate) = 0.40 * 0.01 + 0.40 * 0.01 + 0.40 * 0.01 = 0.012. Total fees = 0.012 * 83.333 = $1.00
        // Net = 16.666 - 1.00 - 2.0 = $13.666

        assert!(result.is_some());
        let profit = result.unwrap();
        let expected = dec!(13.666666666666666666666666666);
        let diff = (profit - expected).abs();
        assert!(
            diff < dec!(0.0001),
            "Expected {}, got {} (diff {})",
            expected,
            profit,
            diff
        );
    }

    #[test]
    fn test_partition_unprofitable_due_to_gas() {
        // Sum > 1.0 (1.02)
        let bids = vec![
            (U256::from(1_u64), dec!(0.40)),
            (U256::from(2_u64), dec!(0.62)),
        ];

        let result = PartitionStrategy::check(
            &bids,
            dec!(0.005), // Low fee
            dec!(5.0),   // Extremely high gas prevents arb
        );

        assert_eq!(result, None);
    }
}
