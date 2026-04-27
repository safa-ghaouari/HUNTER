#!/bin/sh
set -eu

TLS_DIR="/etc/nginx/tls"
CERT_FILE="${HUNTER_TLS_CERT_FILE:-${TLS_DIR}/hunter-local.crt}"
KEY_FILE="${HUNTER_TLS_KEY_FILE:-${TLS_DIR}/hunter-local.key}"
TLS_CN="${HUNTER_TLS_CERT_CN:-localhost}"
TLS_DAYS="${HUNTER_TLS_CERT_DAYS:-3650}"

mkdir -p "${TLS_DIR}"

if [ ! -s "${CERT_FILE}" ] || [ ! -s "${KEY_FILE}" ]; then
  echo "Generating self-signed TLS certificate for ${TLS_CN}..."
  openssl req \
    -x509 \
    -nodes \
    -newkey rsa:2048 \
    -sha256 \
    -days "${TLS_DAYS}" \
    -subj "/CN=${TLS_CN}" \
    -addext "subjectAltName=DNS:${TLS_CN},DNS:localhost,IP:127.0.0.1" \
    -keyout "${KEY_FILE}" \
    -out "${CERT_FILE}"
fi

exec nginx -g "daemon off;"
