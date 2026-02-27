use arbos_core::domain::{ArbSignal, NormalizedOrderbook};
use arbos_engine::actor::EngineActor;
use tokio::sync::mpsc;
use tracing::{debug, error, info};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize structured logging as mandated by AGENTS.md
    tracing_subscriber::fmt::init();
    info!("ArbOS Engine (Tier 3) initializing...");

    // Create channels for inter-process/inter-thread communication
    let (ingestor_tx, ingestor_rx) =
        mpsc::channel::<NormalizedOrderbook>(arbos_core::constants::STATE_CHANNEL_BUFFER);
    let (bot_tx, mut bot_rx) =
        mpsc::channel::<ArbSignal>(arbos_core::constants::CMD_CHANNEL_BUFFER);
    let (ingestor_cmd_tx, mut ingestor_cmd_rx) = mpsc::channel::<arbos_core::domain::IngestorCommand>(
        arbos_core::constants::CMD_CHANNEL_BUFFER,
    );

    let is_test_mode = std::env::var("ARBOS_TEST_MODE").is_ok();

    // Spawn a background task to drain the command channel so EngineActor doesn't block on bounded capacity
    tokio::spawn(async move {
        while let Some(cmd) = ingestor_cmd_rx.recv().await {
            if is_test_mode {
                debug!(
                    "Drained IngestorCommand from EngineActor (test mode): {:?}",
                    cmd
                );
            } else {
                tracing::warn!(
                    "Discarding IngestorCommand in production mode without forwarding: {:?}",
                    cmd
                );
            }
        }
    });

    // Initialize the engine core logic
    let mut actor = EngineActor::new();

    // In a full multi-binary production deployment, `ingestor_rx` would be fed by a Redis pub/sub
    // or an IPC socket from the Ingestor binary. Since ArbOS is modular, we initialize the channels
    // and await integration. For this binary's loop, we will spawn the actor and continuously read bot_rx
    // to prove the signals are emitting.

    info!("Spawning EngineActor main loop.");
    let mut actor_handle = tokio::spawn(async move {
        if let Err(e) = actor.run(ingestor_rx, bot_tx, ingestor_cmd_tx).await {
            error!("EngineActor critical failure: {:?}", e);
            return Err(e);
        }
        Ok(())
    });

    // Dummy task to showcase Engine receiving signals if this binary is run standalone
    let is_test_mode = std::env::var("ARBOS_TEST_MODE").is_ok();

    if is_test_mode {
        // In test mode, we manually pump the ingestor_tx with mock data
        // to see `bot_rx` trigger here and keep the engine alive!
        info!("Running Engine in test mode. Spawning mock data feeder...");
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                interval.tick().await;
                // Just sending a dummy orderbook to keep the loop active
                let _ = ingestor_tx
                    .send(NormalizedOrderbook {
                        asset_id: polymarket_client_sdk::types::U256::from(0),
                        market: polymarket_client_sdk::types::B256::default(),
                        vwap_bid: rust_decimal::Decimal::ZERO,
                        vwap_ask: rust_decimal::Decimal::ZERO,
                        bid_untradeable: true,
                        ask_untradeable: true,
                        timestamp: 0,
                    })
                    .await;
            }
        });
    }

    // Main thread stays alive to process/route Bot signals (Tier 4)
    loop {
        tokio::select! {
            signal_opt = bot_rx.recv() => {
                match signal_opt {
                    Some(signal) => {
                        info!(
                            profit_usdc = %signal.expected_profit_usdc,
                            legs = signal.legs.len(),
                            "Received ArbSignal from EngineActor! Ready for execution."
                        );
                        // In the full system, this is where we send the signal over IPC/Redis
                        // to the standalone Bot binary, or directly invoke Bot Executor if combined.
                    }
                    None => break, // Channel closed
                }
            }
            res = &mut actor_handle => {
                match res {
                    Ok(Err(e)) => {
                        error!("EngineActor task returned an error: {:?}", e);
                        std::process::exit(1);
                    }
                    Ok(Ok(_)) => {
                        info!("EngineActor task finished gracefully.");
                    }
                    Err(e) => {
                        error!("EngineActor task panicked: {:?}", e);
                        std::process::exit(1);
                    }
                }
                break;
            }
        }
    }

    Ok(())
}
