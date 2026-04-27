FROM hashicorp/vault:1.15

# jq for reliable JSON parsing in the entrypoint script
RUN apk add --no-cache jq curl

COPY vault.hcl /vault/config/vault.hcl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
