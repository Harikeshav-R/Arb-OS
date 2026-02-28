use crate::ledger::Ledger;
use arbos_core::domain::IngestorCommand;
use axum::Router;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::{IntoResponse, Json};
use axum::routing::{get, post};
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast, mpsc};
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};

/// Shared state accessible by all Axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub ledger: Arc<RwLock<Ledger>>,
    pub broadcast_tx: broadcast::Sender<String>,
    pub start_time: std::time::Instant,
    pub mode: arbos_core::domain::ExecutionMode,
    pub ingestor_cmd_tx: mpsc::Sender<IngestorCommand>,
}

/// Start the Axum HTTP + WebSocket server on the given port.
pub async fn start_server(state: AppState, port: u16) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/health", get(health_handler))
        .route("/api/status", get(status_handler))
        .route("/api/assets/add", post(add_assets_handler))
        .layer(
            std::env::var("VITE_ALLOWED_ORIGINS")
                .ok()
                .filter(|s| !s.is_empty())
                .map(|origin| {
                    match origin.parse::<axum::http::HeaderValue>() {
                        Ok(header) => CorsLayer::new()
                            .allow_origin(header)
                            .allow_methods(Any)
                            .allow_headers(Any),
                        Err(e) => {
                            warn!("Invalid VITE_ALLOWED_ORIGINS value '{}': {}. Falling back to safe localhost default.", origin, e);
                            CorsLayer::new()
                                .allow_origin("http://localhost:5173".parse::<axum::http::HeaderValue>().unwrap())
                                .allow_methods(Any)
                                .allow_headers(Any)
                        }
                    }
                })
                .unwrap_or_else(|| {
                    // Safe default if no env var is provided: only allow standard local vite dev server
                    CorsLayer::new()
                        .allow_origin("http://localhost:5173".parse::<axum::http::HeaderValue>().unwrap())
                        .allow_methods(Any)
                        .allow_headers(Any)
                }),
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
                        match serde_json::from_str::<serde_json::Value>(&json_str) {
                            Ok(parsed) => {
                                let wrapped = serde_json::json!({
                                    "type": "EXECUTION_REPORT",
                                    "data": parsed,
                                });
                                if let Ok(wrapped_str) = serde_json::to_string(&wrapped)
                                    && socket.send(Message::Text(wrapped_str.into())).await.is_err()
                                {
                                    break; // Client disconnected
                                }
                            }
                            Err(e) => {
                                tracing::error!("Failed to parse broadcast JSON (closing connection): {}", e);
                                let _ = socket.send(Message::Close(None)).await;
                                break;
                            }
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

/// Endpoint to dynamically add assets to the active ingestion stream
#[derive(serde::Deserialize)]
pub struct AddAssetsRequest {
    pub asset_ids: Vec<String>,
}

async fn add_assets_handler(
    State(state): State<AppState>,
    axum::extract::Json(payload): axum::extract::Json<AddAssetsRequest>,
) -> impl IntoResponse {
    if payload.asset_ids.is_empty() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "No asset IDs provided" })),
        )
            .into_response();
    }

    let mut added_count = 0;
    let mut errors = Vec::new();

    for id_str in payload.asset_ids {
        match std::str::FromStr::from_str(&id_str) {
            Ok(u256_id) => {
                if let Err(e) = state
                    .ingestor_cmd_tx
                    .send(IngestorCommand::Subscribe(u256_id))
                    .await
                {
                    error!(asset_id = %u256_id, "Failed to send Subscribe command to Ingestor: {}", e);
                    errors.push(format!(
                        "Failed to route asset {}: channel full/closed",
                        id_str
                    ));
                } else {
                    added_count += 1;
                    info!(asset_id = %u256_id, "Dynamically instructed Ingestor to subscribe tracking frontend request.");
                }
            }
            Err(e) => {
                warn!(asset_id = %id_str, "Frontend supplied invalid asset string format: {}", e);
                errors.push(format!("Invalid U256 string '{}'", id_str));
            }
        }
    }

    if added_count == 0 && !errors.is_empty() {
        (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "Failed to add any requested assets",
                "errors": errors
            })),
        )
            .into_response()
    } else {
        (
            axum::http::StatusCode::OK,
            Json(serde_json::json!({
                "message": format!("Successfully routed {} assets to Ingestor", added_count),
                "errors": errors
            })),
        )
            .into_response()
    }
}

/// Build the status JSON payload from shared state.
async fn build_status_json(state: &AppState) -> anyhow::Result<serde_json::Value> {
    // Minimize lock contention by cloning the needed data quickly and dropping the lock
    let uptime = state.start_time.elapsed().as_secs();
    let (positions_snap, history_snap, cumulative_pnl, total_signals) = {
        let ledger = state.ledger.read().await;
        (
            ledger.get_positions(),
            // Map the history explicitly so we own the data before dropping the lock
            ledger
                .get_recent_history(50)
                .into_iter()
                .cloned()
                .collect::<Vec<_>>(),
            ledger.cumulative_pnl(),
            ledger.total_signals(),
        )
    };

    let positions: Vec<serde_json::Value> = positions_snap
        .into_iter()
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

    let recent_trades: Vec<serde_json::Value> = history_snap
        .into_iter()
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
        // Stable serialization instead of Debug representation
        "mode": match state.mode {
            arbos_core::domain::ExecutionMode::Live => "LIVE",
            arbos_core::domain::ExecutionMode::Demo => "DEMO",
        },
        "cumulative_pnl": cumulative_pnl.to_string(),
        "signals_executed": total_signals,
        "uptime_secs": uptime,
        "positions": positions,
        "recent_trades": recent_trades,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn build_test_router() -> Router {
        let (cmd_tx, _) = tokio::sync::mpsc::channel(1);
        let state = AppState {
            ledger: Arc::new(RwLock::new(Ledger::new(50))),
            broadcast_tx: broadcast::channel(10).0,
            start_time: std::time::Instant::now(),
            mode: arbos_core::domain::ExecutionMode::Demo,
            ingestor_cmd_tx: cmd_tx,
        };

        Router::new()
            .route("/api/health", get(health_handler))
            .route("/api/status", get(status_handler))
            .route("/api/assets/add", post(add_assets_handler))
            .with_state(state)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = build_test_router();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&body[..], b"OK");
    }

    #[tokio::test]
    async fn test_status_endpoint() {
        let app = build_test_router();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let payload: serde_json::Value =
            serde_json::from_slice(&body).expect("Invalid JSON returned by /api/status");

        assert_eq!(payload["mode"], "DEMO");
        assert!(payload["uptime_secs"].is_u64());
        assert_eq!(payload["cumulative_pnl"], "0"); // Starts at zero
        assert_eq!(payload["signals_executed"], 0);
        assert!(payload["positions"].is_array());
        assert!(payload["recent_trades"].is_array());
    }
}
