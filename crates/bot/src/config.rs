use arbos_core::domain::ExecutionMode;
use polymarket_client_sdk::types::U256;
use std::str::FromStr;
use tracing::warn;

/// Centralized configuration for the Bot orchestrator.
/// Parsed from environment variables with sensible defaults.
pub struct BotConfig {
    pub execution_mode: ExecutionMode,
    pub initial_assets: Vec<U256>,
    pub ws_port: u16,
    pub dedup_cooldown_secs: u64,
    pub max_history_entries: usize,
}

impl BotConfig {
    /// Parse configuration from environment variables.
    ///
    /// | Variable               | Default        | Description                              |
    /// |------------------------|----------------|------------------------------------------|
    /// | `ARBOS_LIVE_MODE`      | `false`        | Enable live trading (not yet implemented) |
    /// | `ARBOS_INITIAL_ASSETS` | (none)         | Comma-separated initial asset IDs        |
    /// | `ARBOS_WS_PORT`        | `3001`         | WebSocket server port for frontend       |
    /// | `ARBOS_DEDUP_COOLDOWN` | `30`           | Signal dedup cooldown in seconds         |
    /// | `ARBOS_MAX_HISTORY`    | `500`          | Max execution reports to keep in memory  |
    pub fn from_env() -> Self {
        let execution_mode = if std::env::var("ARBOS_LIVE_MODE")
            .unwrap_or_default()
            .eq_ignore_ascii_case("true")
        {
            warn!("ARBOS_LIVE_MODE=true detected. Live execution is NOT YET IMPLEMENTED.");
            ExecutionMode::Live
        } else {
            ExecutionMode::Demo
        };

        let initial_assets: Vec<U256> = std::env::var("ARBOS_INITIAL_ASSETS")
            .unwrap_or_default()
            .split(',')
            .filter(|s| !s.trim().is_empty())
            .filter_map(|s| {
                U256::from_str(s.trim())
                    .inspect_err(|e| {
                        warn!(asset = s.trim(), error = %e, "Skipping invalid asset ID");
                    })
                    .ok()
            })
            .collect();

        let ws_port = std::env::var("ARBOS_WS_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3001);

        let dedup_cooldown_secs = std::env::var("ARBOS_DEDUP_COOLDOWN")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30);

        let max_history_entries = std::env::var("ARBOS_MAX_HISTORY")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(500);

        Self {
            execution_mode,
            initial_assets,
            ws_port,
            dedup_cooldown_secs,
            max_history_entries,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        // Run test in an isolated env space (or temporarily clear the relevant variables)
        // to avoid flakiness in CI environments that set some ARBOS_ vars.
        let vars_to_clear = [
            "ARBOS_LIVE_MODE",
            "ARBOS_INITIAL_ASSETS",
            "ARBOS_WS_PORT",
            "ARBOS_DEDUP_COOLDOWN",
            "ARBOS_MAX_HISTORY",
        ];

        // Save current values
        let mut saved_vars = Vec::new();
        for var in &vars_to_clear {
            saved_vars.push((*var, std::env::var(*var).ok()));
            unsafe {
                std::env::remove_var(*var);
            }
        }

        // With no env vars set, should use safe defaults
        let config = BotConfig::from_env();
        assert_eq!(config.execution_mode, ExecutionMode::Demo);
        assert!(config.initial_assets.is_empty());
        assert_eq!(config.ws_port, 3001);
        assert_eq!(config.dedup_cooldown_secs, 30);
        assert_eq!(config.max_history_entries, 500);

        // Restore prior env values
        for (var, val_opt) in saved_vars {
            if let Some(val) = val_opt {
                unsafe {
                    std::env::set_var(var, val);
                }
            }
        }
    }
}
