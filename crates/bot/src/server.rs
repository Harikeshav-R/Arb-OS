use crate::ledger::Ledger;
use axum::Router;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::{IntoResponse, Json};
use axum::routing::get;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use tower_http::cors::CorsLayer;
use tracing::{error, info};

/// Shared state accessible by all Axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub ledger: Arc<RwLock<Ledger>>,
    pub broadcast_tx: broadcast::Sender<String>,
    pub start_time: std::time::Instant,
    pub mode: arbos_core::domain::ExecutionMode,
}

/// Start the Axum HTTP + WebSocket server on the given port.
pub async fn start_server(state: AppState, port: u16) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/health", get(health_handler))
        .route("/api/status", get(status_handler))
        .layer(
            std::env::var("VITE_ALLOWED_ORIGINS")
                .map(|origin| {
                    CorsLayer::new()
                        .allow_origin(origin.parse::<axum::http::HeaderValue>().unwrap())
                        .allow_methods(tower_http::cors::Any)
                        .allow_headers(tower_http::cors::Any)
                })
                .unwrap_or_else(|_| CorsLayer::permissive()), // Use permissive if unspecified, but can be locked down
        )
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    info!(port = port, "Starting WebSocket + REST server.");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

/// WebSocket upgrade handler: subscribes the client to the broadcast channel
/// and streams all `ExecutionReport` JSON messages in real-time.
async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_ws_connection(socket, state))
}

async fn handle_ws_connection(mut socket: WebSocket, state: AppState) {
    let mut rx = state.broadcast_tx.subscribe();
    info!("Frontend WebSocket client connected.");

    // Send initial state snapshot
    if let Ok(snapshot) = build_status_json(&state).await {
        let init_msg = serde_json::json!({
            "type": "SNAPSHOT",
            "data": snapshot,
        });
        if let Ok(json_str) = serde_json::to_string(&init_msg) {
            let _ = socket.send(Message::Text(json_str.into())).await;
        }
    }

    // Stream execution reports
    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(json_str) => {
                        let wrapped = serde_json::json!({
                            "type": "EXECUTION_REPORT",
                            "data": serde_json::from_str::<serde_json::Value>(&json_str).unwrap_or_default(),
                        });
                        if let Ok(wrapped_str) = serde_json::to_string(&wrapped)
                            && socket.send(Message::Text(wrapped_str.into())).await.is_err()
                        {
                            break; // Client disconnected
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(skipped = n, "WebSocket client lagged behind broadcast.");
                    }
                    Err(_) => break,
                }
            }
            // Check for incoming messages (ping/close)
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {} // Ignore other messages
                }
            }
        }
    }

    info!("Frontend WebSocket client disconnected.");
}

/// Simple healthcheck endpoint.
async fn health_handler() -> &'static str {
    "OK"
}

/// Status endpoint returning JSON with system state.
async fn status_handler(State(state): State<AppState>) -> impl IntoResponse {
    match build_status_json(&state).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => {
            error!("Failed to build status JSON: {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// Build the status JSON payload from shared state.
async fn build_status_json(state: &AppState) -> anyhow::Result<serde_json::Value> {
    let ledger = state.ledger.read().await;
    let uptime = state.start_time.elapsed().as_secs();

    let positions: Vec<serde_json::Value> = ledger
        .get_positions()
        .iter()
        .map(|p| {
            serde_json::json!({
                "asset_id": p.asset_id.to_string(),
                "side": p.side.as_str(),
                "size": p.size.to_string(),
                "entry_price": p.entry_price.to_string(),
                "opened_at": p.opened_at,
            })
        })
        .collect();

    let recent_trades: Vec<serde_json::Value> = ledger
        .get_recent_history(50)
        .iter()
        .map(|r| {
            serde_json::json!({
                "strategy": r.signal.strategy.to_string(),
                "success": r.success,
                "pnl_usdc": r.pnl_usdc.to_string(),
                "legs": r.fill_details.len(),
                "executed_at": r.executed_at,
                "fill_details": r.fill_details.iter().map(|f| {
                    serde_json::json!({
                        "asset_id": f.asset_id.to_string(),
                        "side": f.side.as_str(),
                        "size": f.size.to_string(),
                        "price": f.price.to_string(),
                        "filled": f.filled,
                    })
                }).collect::<Vec<_>>(),
            })
        })
        .collect();

    Ok(serde_json::json!({
        "mode": format!("{:?}", state.mode),
        "cumulative_pnl": ledger.cumulative_pnl().to_string(),
        "signals_executed": ledger.total_signals(),
        "uptime_secs": uptime,
        "positions": positions,
        "recent_trades": recent_trades,
    }))
}
