ARG NODE_IMAGE=node:24-trixie-slim
ARG RUST_IMAGE=rust:1.95.0-trixie
ARG RUNTIME_IMAGE=debian:trixie-slim

FROM ${NODE_IMAGE} AS frontend-builder

WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile

COPY frontend frontend
RUN pnpm --dir frontend build

FROM ${RUST_IMAGE} AS server-builder

WORKDIR /workspace
ENV CARGO_HTTP_TIMEOUT=120
ENV CARGO_NET_RETRY=10
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  pkg-config \
  libssl-dev \
  && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock build.rs ./
COPY src src
COPY --from=frontend-builder /workspace/frontend/dist frontend/dist
RUN cargo build --release --locked

FROM ${RUNTIME_IMAGE}

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=server-builder /workspace/target/release/portal-os /usr/local/bin/portal-os
RUN mkdir -p /app/data

ENV RUST_LOG=info
ENV PORTAL_OS_DATA_DIR=/app/data

EXPOSE 9090

ENTRYPOINT ["/usr/local/bin/portal-os"]
