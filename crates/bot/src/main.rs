pub mod config;
pub mod dedup;
pub mod executor;
pub mod ledger;
pub mod server;

use arbos_core::domain::{ArbSignal, ExecutionReport, IngestorCommand, NormalizedOrderbook};
use arbos_engine::actor::EngineActor;
use arbos_ingestor::actor::IngestorActor;
use config::BotConfig;
use executor::ExecutorActor;
use ledger::Ledger;
use server::AppState;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast, mpsc};
use tokio_util::sync::CancellationToken;
use tracing::{error, info};

/// ArbOS Unified Orchestrator
///
/// Spawns all tiers as Tokio tasks connected by zero-copy MPSC channels:
///   Ingestor (WS feed) → Engine (strategy evaluation) → Executor (trade execution)
///
/// Also runs an Axum WebSocket + REST server for frontend integration.
///
/// Default mode: Demo (simulated execution, no real money).
/// Set `ARBOS_LIVE_MODE=true` to enable live trading (not yet implemented).
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    info!("ArbOS Orchestrator initializing...");

    // ── Configuration ────────────────────────────────────────────────────────

    let config = BotConfig::from_env();
    info!(
        mode = ?config.execution_mode,
        ws_port = config.ws_port,
        dedup_cooldown = config.dedup_cooldown_secs,
        max_history = config.max_history_entries,
        initial_assets = config.initial_assets.len(),
        "Configuration loaded."
    );

    // ── Shared State ─────────────────────────────────────────────────────────

    let ledger = Arc::new(RwLock::new(Ledger::new(config.max_history_entries)));
    let (broadcast_tx, _broadcast_rx) = broadcast::channel::<String>(256);
    let start_time = std::time::Instant::now();

    // ── MPSC Channels ────────────────────────────────────────────────────────

    let (ingestor_cmd_tx, ingestor_cmd_rx) =
        mpsc::channel::<IngestorCommand>(arbos_core::constants::CMD_CHANNEL_BUFFER);
    let (orderbook_tx, orderbook_rx) =
        mpsc::channel::<NormalizedOrderbook>(arbos_core::constants::STATE_CHANNEL_BUFFER);
    let (signal_tx, signal_rx) =
        mpsc::channel::<ArbSignal>(arbos_core::constants::SIGNAL_CHANNEL_BUFFER);
    let (report_tx, mut report_rx) =
        mpsc::channel::<ExecutionReport>(arbos_core::constants::REPORT_CHANNEL_BUFFER);

    let cancel_token = CancellationToken::new();

    // ── Spawn Axum Server ────────────────────────────────────────────────────

    let app_state = AppState {
        ledger: ledger.clone(),
        broadcast_tx: broadcast_tx.clone(),
        start_time,
        mode: config.execution_mode,
        ingestor_cmd_tx: ingestor_cmd_tx.clone(),
    };

    let ws_port = config.ws_port;
    let server_handle = tokio::spawn(async move {
        if let Err(e) = server::start_server(app_state, ws_port).await {
            error!("WebSocket server failed: {:?}", e);
        }
    });

    // ── Spawn Tier 1: Ingestor ───────────────────────────────────────────────

    let ingestor_cmd_tx_for_seeds = ingestor_cmd_tx.clone();
    let ingestor_cancel = cancel_token.clone();
    let ingestor_handle = tokio::spawn(async move {
        // Here we simulate checking cancellation, ideally IngestorActor also takes the token.
        // For simplicity, we wrap its execution or let it handle dropped channels.
        let mut ingestor = IngestorActor::new();
        tokio::select! {
            res = ingestor.run(ingestor_cmd_rx, orderbook_tx) => {
                if let Err(e) = res {
                    error!("IngestorActor critical failure: {:?}", e);
                    return Err(e);
                }
            }
            _ = ingestor_cancel.cancelled() => {
                info!("Ingestor gracefully cancelled via token.");
            }
        }
        Ok(())
    });

    // Send initial asset subscriptions
    for asset_id in &config.initial_assets {
        info!(asset_id = %asset_id, "Sending initial subscription command.");
        if let Err(e) = ingestor_cmd_tx_for_seeds
            .send(IngestorCommand::Subscribe(*asset_id))
            .await
        {
            error!("Failed to send initial subscription: {}", e);
        }
    }

    // ── Spawn Tier 3: Engine ─────────────────────────────────────────────────

    let engine_cancel = cancel_token.clone();
    let engine_handle = tokio::spawn(async move {
        let mut engine = EngineActor::new();
        tokio::select! {
             res = engine.run(orderbook_rx, signal_tx, ingestor_cmd_tx) => {
                 if let Err(e) = res {
                     error!("EngineActor critical failure: {:?}", e);
                     return Err(e);
                 }
             }
             _ = engine_cancel.cancelled() => {
                 info!("Engine gracefully cancelled via token.");
             }
        }
        Ok(())
    });

    // ── Spawn Tier 4: Executor ───────────────────────────────────────────────

    let executor_ledger = ledger.clone();
    let executor_broadcast = broadcast_tx.clone();
    let execution_mode = config.execution_mode;
    let dedup_cooldown = config.dedup_cooldown_secs;
    let executor_cancel = cancel_token.clone();
    let executor_handle = tokio::spawn(async move {
        let mut executor = ExecutorActor::new(
            execution_mode,
            dedup_cooldown,
            executor_ledger,
            executor_broadcast,
        );
        tokio::select! {
             res = executor.run(signal_rx, report_tx) => {
                 if let Err(e) = res {
                     error!("ExecutorActor critical failure: {:?}", e);
                     return Err(e);
                 }
             }
             _ = executor_cancel.cancelled() => {
                 info!("Executor gracefully cancelled via token.");
             }
        }
        Ok(())
    });

    // ── Main Loop: Report Consumer + Graceful Shutdown ───────────────────────

    info!("All tiers spawned. Orchestrator ready. Press Ctrl+C to shutdown.");

    loop {
        tokio::select! {
            report_opt = report_rx.recv() => {
                match report_opt {
                    Some(_report) => {
                        // Reports are already logged and broadcast by the executor.
                        // This loop exists to keep the channel drained and
                        // enable future orchestrator-level logic (e.g., circuit breakers).
                    }
                    None => {
                        info!("Report channel closed. All executors stopped.");
                        break;
                    }
                }
            }
            _ = tokio::signal::ctrl_c() => {
                info!("Ctrl+C received. Initiating graceful shutdown...");
                break;
            }
        }
    }

    // ── Graceful Shutdown ────────────────────────────────────────────────────

    // Trigger the cancellation token for all actors
    cancel_token.cancel();

    // Dropping channels signals any dangling non-tokio listeners
    drop(ingestor_cmd_tx_for_seeds);
    server_handle.abort(); // Axum server doesn't stop on channel close

    let results = tokio::join!(ingestor_handle, engine_handle, executor_handle);

    for (name, result) in [
        ("Ingestor", results.0),
        ("Engine", results.1),
        ("Executor", results.2),
    ] {
        match result {
            Ok(Ok(())) => info!("{} shut down cleanly.", name),
            Ok(Err(e)) => error!("{} returned error: {:?}", name, e),
            Err(e) if e.is_cancelled() => info!("{} cancelled.", name),
            Err(e) => error!("{} task panicked: {:?}", name, e),
        }
    }

    // Final summary
    let ledger = ledger.read().await;
    info!(
        cumulative_pnl = %ledger.cumulative_pnl(),
        total_signals = ledger.total_signals(),
        "ArbOS Orchestrator shut down complete."
    );
    Ok(())
}
