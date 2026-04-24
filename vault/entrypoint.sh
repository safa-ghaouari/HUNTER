#!/bin/sh
# Vault entrypoint: file storage, auto-init on first run, auto-unseal on restart.
# Secrets are populated from env vars on every start (idempotent KV puts).

INIT_FILE="/vault/data/.vault-init.json"
CUSTOM_TOKEN="${VAULT_DEV_ROOT_TOKEN_ID:-hunter-vault-root-token-2026}"

# Clear any env-injected VAULT_TOKEN so it doesn't interfere with vault CLI calls
unset VAULT_TOKEN
export VAULT_ADDR="http://127.0.0.1:8200"

# ── 1. Start Vault server in background ────────────────────────────────────
vault server -config=/vault/config/vault.hcl &
VAULT_PID=$!

# ── 2. Wait for Vault API to respond (any HTTP response = ready) ───────────
echo "[vault] Waiting for API..."
until curl -so /dev/null http://127.0.0.1:8200/v1/sys/init; do
    sleep 1
done
echo "[vault] API is up."

# ── 3. Initialize on first run ─────────────────────────────────────────────
INITIALIZED=$(curl -s http://127.0.0.1:8200/v1/sys/init | jq -r '.initialized')
if [ "$INITIALIZED" != "true" ]; then
    echo "[vault] First run — initializing..."
    vault operator init -key-shares=1 -key-threshold=1 -format=json > "$INIT_FILE"
    chmod 600 "$INIT_FILE"
    echo "[vault] Initialized. Keys saved."
fi

# ── 4. Unseal if sealed ────────────────────────────────────────────────────
SEALED=$(curl -s http://127.0.0.1:8200/v1/sys/seal-status | jq -r '.sealed')
if [ "$SEALED" = "true" ]; then
    echo "[vault] Unsealing..."
    UNSEAL_KEY=$(jq -r '.unseal_keys_b64[0]' "$INIT_FILE")
    vault operator unseal "$UNSEAL_KEY" > /dev/null
    echo "[vault] Unsealed."
fi

# ── 5. Login with the generated root token ────────────────────────────────
export VAULT_TOKEN=$(jq -r '.root_token' "$INIT_FILE")

# ── 6. Enable KV v2 mounts (idempotent) ───────────────────────────────────
if vault secrets enable -path=secret kv-v2 >/dev/null 2>&1; then
    echo "[vault] KV v2 (secret) enabled."
else
    echo "[vault] KV v2 (secret) already enabled."
fi

if vault secrets enable -path=hunter kv-v2 >/dev/null 2>&1; then
    echo "[vault] KV v2 (hunter) enabled."
else
    echo "[vault] KV v2 (hunter) already enabled."
fi

# ── 7. Ensure our fixed service token exists ──────────────────────────────
if vault token lookup "$CUSTOM_TOKEN" > /dev/null 2>&1; then
    echo "[vault] Service token OK: $CUSTOM_TOKEN"
else
    vault token create \
        -id="$CUSTOM_TOKEN" \
        -policy=root \
        -orphan=true \
        -no-default-policy \
        -ttl=87600h \
        > /dev/null
    echo "[vault] Service token created: $CUSTOM_TOKEN"
fi

# ── 8. Populate secrets from environment (idempotent) ─────────────────────
echo "[vault] Writing secrets..."
_put() {
    if vault kv put "secret/$1" "$2" > /dev/null 2>&1; then
        echo "[vault]   $1 OK"
    fi
}

[ -n "$OTX_API_KEY" ]        && _put "sources/4dc8cfff-9309-4fdf-833c-afafc8b9291f" "api_key=$OTX_API_KEY"
[ -n "$VIRUSTOTAL_API_KEY" ] && _put "enrichment/virustotal"  "api_key=$VIRUSTOTAL_API_KEY"
[ -n "$SHODAN_API_KEY" ]     && _put "enrichment/shodan"      "api_key=$SHODAN_API_KEY"
[ -n "$ABUSEIPDB_API_KEY" ]  && _put "enrichment/abuseipdb"   "api_key=$ABUSEIPDB_API_KEY"
[ -n "$MISP_KEY" ]           && _put "integrations/misp"       "api_key=$MISP_KEY"
[ -n "$THEHIVE_API_KEY" ]    && _put "integrations/thehive"    "api_key=$THEHIVE_API_KEY"
[ -n "$OPENCTI_TOKEN" ]      && _put "integrations/opencti"    "api_key=$OPENCTI_TOKEN"

echo "[vault] Ready."

# ── 9. Keep vault running ──────────────────────────────────────────────────
wait $VAULT_PID
