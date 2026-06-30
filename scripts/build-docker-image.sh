#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

read_workspace_version() {
  awk '
    /^\[workspace.package\]$/ { in_workspace_package = 1; next }
    /^\[/ { in_workspace_package = 0 }
    in_workspace_package && /^version[[:space:]]*=/ {
      gsub(/"/, "", $3)
      print $3
      exit
    }
  ' "${REPO_ROOT}/Cargo.toml"
}

IMAGE_NAME="${IMAGE_NAME:-portal-os}"
IMAGE_TAG="${IMAGE_TAG:-$(read_workspace_version)}"
PLATFORM="${PLATFORM:-}"
NODE_IMAGE="${NODE_IMAGE:-node:24-trixie-slim}"
RUST_IMAGE="${RUST_IMAGE:-rust:1.95.0-trixie}"
RUNTIME_IMAGE="${RUNTIME_IMAGE:-debian:trixie-slim}"

build_args=(
  -f "${REPO_ROOT}/Dockerfile"
  -t "${IMAGE_NAME}:${IMAGE_TAG}"
  --build-arg "NODE_IMAGE=${NODE_IMAGE}"
  --build-arg "RUST_IMAGE=${RUST_IMAGE}"
  --build-arg "RUNTIME_IMAGE=${RUNTIME_IMAGE}"
)

if [[ -n "${PLATFORM}" ]]; then
  build_args+=(--platform "${PLATFORM}")
fi

docker build "${build_args[@]}" "${REPO_ROOT}"
