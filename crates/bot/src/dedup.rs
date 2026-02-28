use polymarket_client_sdk::types::U256;
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// Prevents re-execution of the same arb pair within a configurable cooldown window.
/// This guards against the Engine firing the same signal on consecutive book update ticks.
pub struct SignalDeduplicator {
    cooldown: Duration,
    /// Maps a canonical pair key → the last time this pair was executed.
    recent_pairs: HashMap<(U256, U256), Instant>,
}

impl SignalDeduplicator {
    pub fn new(cooldown_secs: u64) -> Self {
        Self {
            cooldown: Duration::from_secs(cooldown_secs),
            recent_pairs: HashMap::new(),
        }
    }

    /// Check if this pair is allowed to execute. Returns `true` if the pair has not
    /// been executed within the cooldown window. Automatically records the pair if allowed.
    pub fn try_execute(&mut self, asset_ids: &[U256]) -> bool {
        let key = Self::canonical_key(asset_ids);
        let now = Instant::now();

        if let Some(last_exec) = self.recent_pairs.get(&key)
            && now.duration_since(*last_exec) < self.cooldown
        {
            return false; // Still in cooldown
        }

        self.recent_pairs.insert(key, now);
        true
    }

    /// Periodic garbage collection: remove entries older than 2x cooldown.
    pub fn gc(&mut self) {
        let cutoff = self.cooldown * 2;
        let now = Instant::now();
        self.recent_pairs
            .retain(|_, last| now.duration_since(*last) < cutoff);
    }

    /// Create a canonical key from asset IDs so (A, B) and (B, A) map to the same entry.
    fn canonical_key(asset_ids: &[U256]) -> (U256, U256) {
        if asset_ids.len() < 2 {
            return (asset_ids.first().copied().unwrap_or(U256::ZERO), U256::ZERO);
        }
        let a = asset_ids[0];
        let b = asset_ids[1];
        if a <= b { (a, b) } else { (b, a) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dedup_blocks_duplicate_pair() {
        let mut dedup = SignalDeduplicator::new(30);
        let ids = vec![U256::from(1), U256::from(2)];

        assert!(dedup.try_execute(&ids)); // First attempt: allowed
        assert!(!dedup.try_execute(&ids)); // Second attempt: blocked
    }

    #[test]
    fn test_dedup_canonical_order() {
        let mut dedup = SignalDeduplicator::new(30);
        let ids_ab = vec![U256::from(1), U256::from(2)];
        let ids_ba = vec![U256::from(2), U256::from(1)];

        assert!(dedup.try_execute(&ids_ab)); // (1, 2) allowed
        assert!(!dedup.try_execute(&ids_ba)); // (2, 1) blocked — same canonical pair
    }

    #[test]
    fn test_dedup_allows_after_cooldown() {
        let mut dedup = SignalDeduplicator::new(0); // Zero-second cooldown
        let ids = vec![U256::from(1), U256::from(2)];

        assert!(dedup.try_execute(&ids));
        // With 0s cooldown, the next call should pass immediately
        std::thread::sleep(std::time::Duration::from_millis(10));
        assert!(dedup.try_execute(&ids));
    }

    #[test]
    fn test_dedup_different_pairs_allowed() {
        let mut dedup = SignalDeduplicator::new(30);
        let pair_a = vec![U256::from(1), U256::from(2)];
        let pair_b = vec![U256::from(3), U256::from(4)];

        assert!(dedup.try_execute(&pair_a));
        assert!(dedup.try_execute(&pair_b)); // Different pair: allowed
    }

    #[test]
    fn test_gc_removes_old_entries() {
        let mut dedup = SignalDeduplicator::new(0); // 0s cooldown → 0s gc cutoff
        let ids = vec![U256::from(1), U256::from(2)];

        dedup.try_execute(&ids);
        std::thread::sleep(std::time::Duration::from_millis(10));
        dedup.gc();

        assert!(dedup.recent_pairs.is_empty());
    }
}
