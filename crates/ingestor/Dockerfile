# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM rust:1.93-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Cache dependencies — copy manifests first, build a dummy, then copy source
COPY Cargo.toml Cargo.lock ./
COPY crates/core/Cargo.toml crates/core/Cargo.toml
COPY crates/ingestor/Cargo.toml crates/ingestor/Cargo.toml
COPY crates/engine/Cargo.toml crates/engine/Cargo.toml
COPY crates/bot/Cargo.toml crates/bot/Cargo.toml

# Create stub lib/main files so cargo can resolve the workspace
RUN mkdir -p crates/core/src crates/ingestor/src crates/engine/src crates/bot/src && \
    echo "fn main() {}" > crates/ingestor/src/main.rs && \
    echo "fn main() {}" > crates/engine/src/main.rs && \
    echo "fn main() {}" > crates/bot/src/main.rs && \
    touch crates/core/src/lib.rs crates/engine/src/lib.rs

# Pre-build dependencies (cached unless Cargo.toml/Cargo.lock change)
RUN cargo build --release -p ingestor 2>/dev/null || true

# Copy real source and build
COPY . .
RUN touch crates/*/src/*.rs && \
    cargo build --release -p ingestor

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Security: run as non-root
RUN groupadd --gid 1000 ingestor && \
    useradd --uid 1000 --gid ingestor --shell /bin/sh --create-home ingestor

COPY --from=builder /usr/src/app/target/release/ingestor /usr/local/bin/ingestor

USER ingestor

CMD ["ingestor"]
