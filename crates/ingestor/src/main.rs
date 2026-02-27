pub mod actor;
pub mod clob_client;

use actor::IngestorActor;
use arbos_core::domain::IngestorCommand;
use polymarket_client_sdk::types::U256;
use std::str::FromStr;
use tokio::sync::mpsc;
use tokio::time::{Duration, sleep};
use tracing::{error, info};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize structured logging
    tracing_subscriber::fmt::init();

    info!("Ingestor started");

    let asset_id_str = std::env::args().nth(1).unwrap_or_else(|| {
        error!("Usage: arbos-ingestor <initial_asset_id>");
        std::process::exit(1);
    });

    let initial_asset = U256::from_str(&asset_id_str).unwrap_or_else(|_| {
        error!("Invalid asset ID format. Expected a valid 256-bit unsigned integer string.");
        std::process::exit(1);
    });

    let (cmd_tx, cmd_rx) = mpsc::channel(arbos_core::constants::CMD_CHANNEL_BUFFER);
    let (state_tx, mut state_rx) = mpsc::channel(arbos_core::constants::STATE_CHANNEL_BUFFER);

    let mut actor = IngestorActor::new();

    // Spawn the actor in the background
    let mut actor_handle = tokio::spawn(async move {
        if let Err(e) = actor.run(cmd_rx, state_tx).await {
            error!("Ingestor Actor critical failure: {:?}", e);
            return Err(e);
        }
        Ok(())
    });

    // Send the initial asset immediately
    cmd_tx
        .send(IngestorCommand::Subscribe(initial_asset))
        .await?;

    let is_test_mode = std::env::var("ARBOS_TEST_MODE").is_ok();

    if is_test_mode {
        // Dummy task: Send another subscription after 5 seconds to test dynamic topic addition
        let dummy_tx = cmd_tx.clone();
        tokio::spawn(async move {
            sleep(Duration::from_secs(5)).await;
            // A random test asset on Polymarket representing a specific event outcome (e.g. Yes/No market token ID)
            let test_asset = U256::from_str(
                "106585164761922456203746651621390029417453862034640469075081961934906147433548",
            )
            .expect("Failed to parse test asset ID string into U256.");
            info!("Dummy Task: commanding ingestor to subscribe to secondary testing asset...");
            let _ = dummy_tx.send(IngestorCommand::Subscribe(test_asset)).await;
        });
    }

    loop {
        tokio::select! {
            state_opt = state_rx.recv() => {
                match state_opt {
                    Some(state) => {
                        if is_test_mode {
                            info!(
                                "[VWAP OUT] Asset: {} | Bid(tradeable={}): {} | Ask(tradeable={}): {}",
                                state.asset_id,
                                !state.bid_untradeable,
                                state.vwap_bid,
                                !state.ask_untradeable,
                                state.vwap_ask
                            );
                        } else {
                            tracing::debug!(asset_id = %state.asset_id, "Received and routed normalized orderbook state");
                            // Silently consume to prevent channel from blocking
                            // In the full system, route this NormalizedOrderbook to Tier 3 (Engine)
                        }
                    }
                    None => break, // Channel closed
                }
            }
            res = &mut actor_handle => {
                match res {
                    Ok(Err(e)) => {
                        error!("Actor task returned an error: {:?}", e);
                        std::process::exit(1);
                    }
                    Ok(Ok(_)) => {
                        info!("Actor task finished successfully.");
                    }
                    Err(e) => {
                        error!("Actor task panicked: {:?}", e);
                        std::process::exit(1);
                    }
                }
                break;
            }
        }
    }

    Ok(())
}
