#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="${1:-docker-compose.yml}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Phase 1 pre-deploy starting..."

echo "==> Building Phase 1 images"
docker compose build backend frontend nginx
if [[ $? -ne 0 ]]; then
  echo "Docker compose build failed." >&2
  exit 1
fi

echo "==> Running Trivy pre-deploy scan"
"${SCRIPT_DIR}/trivy_scan.sh" "${COMPOSE_FILE}" hunter-backend hunter-frontend hunter-nginx
if [[ $? -ne 0 ]]; then
  echo "Trivy pre-deploy scan failed." >&2
  exit 1
fi

echo "==> Starting Phase 1 stack"
docker compose up -d postgres redis minio vault backend frontend nginx prometheus grafana
if [[ $? -ne 0 ]]; then
  echo "Docker compose up failed." >&2
  exit 1
fi

echo "==> Waiting for backend readiness"
for attempt in $(seq 1 30); do
  if curl -fsS http://localhost:8000/metrics >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 30 ]]; then
    echo "Backend did not become ready in time." >&2
    exit 1
  fi
  sleep 2
done

echo "==> Running Phase 1 smoke test"
if command -v pwsh >/dev/null 2>&1; then
  pwsh -ExecutionPolicy Bypass -File "${SCRIPT_DIR}/phase1_smoke.ps1"
elif command -v powershell >/dev/null 2>&1; then
  powershell -ExecutionPolicy Bypass -File "${SCRIPT_DIR}/phase1_smoke.ps1"
else
  echo "PowerShell is required to run the Phase 1 smoke test." >&2
  exit 1
fi
if [[ $? -ne 0 ]]; then
  echo "Phase 1 smoke test failed." >&2
  exit 1
fi

echo "Phase 1 pre-deploy completed successfully."
