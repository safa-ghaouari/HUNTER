FROM debian:trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx libnginx-mod-http-ndk libnginx-mod-http-modsecurity openssl \
    && rm -rf /var/lib/apt/lists/*

COPY nginx.conf /etc/nginx/nginx.conf
COPY modsecurity /etc/nginx/modsecurity
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /etc/nginx/tls /var/log/nginx

EXPOSE 80 443

CMD ["/usr/local/bin/docker-entrypoint.sh"]
