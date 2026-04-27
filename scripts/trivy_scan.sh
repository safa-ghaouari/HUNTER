#!/usr/bin/env bash
set -Eeuo pipefail

# Run this script before `docker-compose up` so vulnerable images are blocked
# before the HUNTER stack is allowed to start locally.

COMPOSE_FILE="${1:-docker-compose.yml}"
TRIVY_TIMEOUT="30m"
TRIVY_DB_REPOSITORY="ghcr.io/aquasecurity/trivy-db:2"
TRIVY_JAVA_DB_REPOSITORY="ghcr.io/aquasecurity/trivy-java-db:1"
IGNORE_UNFIXED="${IGNORE_UNFIXED:-true}"
INCLUDE_COMPOSE_IMAGES="${INCLUDE_COMPOSE_IMAGES:-false}"

if { [[ $# -lt 2 ]] || [[ "${INCLUDE_COMPOSE_IMAGES}" == "true" ]]; } && [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

if ! command -v trivy >/dev/null 2>&1; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Trivy was not found in PATH and Docker is required for the fallback scanner." >&2
    exit 1
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found in PATH." >&2
  exit 1
fi

CACHE_DIR="${PWD}/.trivy-cache"
mkdir -p "${CACHE_DIR}"

if command -v trivy >/dev/null 2>&1; then
  TRIVY_CMD=(trivy)
  TRIVY_CACHE_ARGS=(--cache-dir "${CACHE_DIR}")
else
  echo "Trivy binary not found; using the official GHCR Trivy container fallback."
  TRIVY_CMD=(
    docker run --rm
    -v /var/run/docker.sock:/var/run/docker.sock
    -v "${CACHE_DIR}:/root/.cache/"
    ghcr.io/aquasecurity/trivy:latest
  )
  TRIVY_CACHE_ARGS=(--cache-dir /root/.cache)
fi

TRIVY_COMMON_ARGS=(
  --timeout "${TRIVY_TIMEOUT}"
  --db-repository "${TRIVY_DB_REPOSITORY}"
  --java-db-repository "${TRIVY_JAVA_DB_REPOSITORY}"
  "${TRIVY_CACHE_ARGS[@]}"
)

echo "==> Updating Trivy vulnerability DB"
"${TRIVY_CMD[@]}" image "${TRIVY_COMMON_ARGS[@]}" --download-db-only

echo "==> Updating Trivy Java DB"
"${TRIVY_CMD[@]}" image "${TRIVY_COMMON_ARGS[@]}" --download-java-db-only

declare -a INPUT_IMAGES=()
if [[ $# -lt 2 ]] || [[ "${INCLUDE_COMPOSE_IMAGES}" == "true" ]]; then
  while IFS= read -r image; do
    [[ -n "${image}" ]] && INPUT_IMAGES+=("${image}")
  done < <(awk '/^[[:space:]]*image:/ {print $2}' "${COMPOSE_FILE}" | tr -d '"')
fi

if [[ $# -gt 1 ]]; then
  shift
  INPUT_IMAGES+=("$@")
fi

mapfile -t IMAGES < <(printf '%s\n' "${INPUT_IMAGES[@]}" | awk 'NF' | sort -u)

if [[ ${#IMAGES[@]} -eq 0 ]]; then
  echo "No image references were found to scan."
  exit 1
fi

declare -a PASSED_IMAGES=()
declare -a FAILED_IMAGES=()

for image in "${IMAGES[@]}"; do
  report_file="${CACHE_DIR}/$(echo "${image}" | tr '/:' '__').log"

  if docker image inspect "${image}" >/dev/null 2>&1; then
    echo "==> Using local image ${image}"
  else
    echo "==> Pulling ${image}"
    docker pull "${image}"
  fi

  echo "==> Scanning ${image}"
  SCAN_ARGS=(image "${TRIVY_COMMON_ARGS[@]}" --skip-db-update --skip-java-db-update --no-progress --exit-code 1 --severity HIGH,CRITICAL)
  if [[ "${IGNORE_UNFIXED}" == "true" ]]; then
    SCAN_ARGS+=(--ignore-unfixed)
  fi
  SCAN_ARGS+=("${image}")

  if "${TRIVY_CMD[@]}" "${SCAN_ARGS[@]}" >"${report_file}" 2>&1; then
    PASSED_IMAGES+=("${image}")
  else
    echo "    Report written to ${report_file}"
    FAILED_IMAGES+=("${image}")
  fi
done

echo
echo "Trivy summary"
echo "-------------"
echo "Passed: ${#PASSED_IMAGES[@]}"
for image in "${PASSED_IMAGES[@]}"; do
  echo "  PASS  ${image}"
done

echo "Failed: ${#FAILED_IMAGES[@]}"
for image in "${FAILED_IMAGES[@]}"; do
  echo "  FAIL  ${image}"
done

if [[ ${#FAILED_IMAGES[@]} -gt 0 ]]; then
  exit 1
fi
