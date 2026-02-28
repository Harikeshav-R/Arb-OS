use polymarket_client_sdk::types::U256;
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::time::{Duration, Instant};

/// Prevents re-execution of the same arb pair within a configurable cooldown window.
/// This guards against the Engine firing the same signal on consecutive book update ticks.
pub struct SignalDeduplicator {
    cooldown: Duration,
    /// Maps a canonical hash key → the last time this combination of assets was executed.
    recent_signals: HashMap<u64, Instant>,
}

impl SignalDeduplicator {
    pub fn new(cooldown_secs: u64) -> Self {
        Self {
            cooldown: Duration::from_secs(cooldown_secs),
            recent_signals: HashMap::new(),
        }
    }

    /// Check if this pair/basket is allowed to execute. Returns `true` if the pair has not
    /// been executed within the cooldown window. Automatically records the pair if allowed.
    pub fn try_execute(&mut self, asset_ids: &[U256]) -> bool {
        let key = Self::canonical_key(asset_ids);
        let now = Instant::now();

        if let Some(last_exec) = self.recent_signals.get(&key)
            && now.duration_since(*last_exec) < self.cooldown
        {
            return false; // Still in cooldown
        }

        self.recent_signals.insert(key, now);
        true
    }

    /// Periodic garbage collection: remove entries older than 2x cooldown.
    pub fn gc(&mut self) {
        let cutoff = self.cooldown * 2;
        let now = Instant::now();
        self.recent_signals
            .retain(|_, last| now.duration_since(*last) < cutoff);
    }

    /// Create a canonical hash key from all asset IDs so any permutation maps to the same entry.
    /// This supports multi-leg strategies (e.g. 3+ leg basket shorts).
    fn canonical_key(asset_ids: &[U256]) -> u64 {
        let mut sorted_ids = asset_ids.to_vec();
        sorted_ids.sort_unstable();

        let mut hasher = DefaultHasher::new();
        for id in sorted_ids {
            // Hash the string representation or underlying bytes.
            // Converting to string is an easy deterministic way to hash the U256.
            id.to_string().hash(&mut hasher);
        }
        hasher.finish()
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

        assert!(dedup.try_execute(&ids_ab)); // allowed
        assert!(!dedup.try_execute(&ids_ba)); // blocked — same canonical pair
    }

    #[test]
    fn test_dedup_multi_leg() {
        let mut dedup = SignalDeduplicator::new(30);
        let ids_1 = vec![U256::from(1), U256::from(2), U256::from(3)];
        let ids_2 = vec![U256::from(3), U256::from(2), U256::from(1)];

        assert!(dedup.try_execute(&ids_1)); // allowed
        assert!(!dedup.try_execute(&ids_2)); // blocked — same basket
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

        assert!(dedup.recent_signals.is_empty());
    }
}
