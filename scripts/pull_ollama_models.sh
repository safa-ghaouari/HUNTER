#!/usr/bin/env bash
# scripts/pull_ollama_models.sh — Phase 3: pull Mistral into the Ollama container.
#
# Run once after `docker compose up -d` to download the Mistral 7B model.
# The model is stored in the `ollama_data` Docker volume and survives restarts.
#
# Usage:
#   bash scripts/pull_ollama_models.sh
#
set -Eeuo pipefail

CONTAINER="hunter-ollama"
MODEL="mistral"

echo "==> Waiting for Ollama container to be ready..."
for attempt in $(seq 1 30); do
  if docker exec "$CONTAINER" ollama list >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "ERROR: Ollama container did not become ready in time." >&2
    exit 1
  fi
  sleep 3
done

echo "==> Pulling model: $MODEL (this may take several minutes on first run)"
docker exec "$CONTAINER" ollama pull "$MODEL"

echo "==> Verifying model is available..."
docker exec "$CONTAINER" ollama list | grep "$MODEL"

echo "==> Done. Mistral is ready at http://localhost:11434"
