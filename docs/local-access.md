# HUNTER Local Access

The real local credentials are stored in the root `.env` file. That file is gitignored and should not be committed.

## Main App

- Frontend: http://localhost:3002 or nginx at http://localhost
- Backend API: http://localhost:8000
- Admin login email: `BOOTSTRAP_ADMIN_EMAIL`
- Admin login password: `BOOTSTRAP_ADMIN_PASSWORD`

## Service Consoles

- Grafana: http://localhost:3001
  - User: `GRAFANA_ADMIN_USER`
  - Password: `GRAFANA_ADMIN_PASSWORD`
- MinIO: http://localhost:9101
  - User: `MINIO_ROOT_USER`
  - Password: `MINIO_ROOT_PASSWORD`
- RabbitMQ: http://localhost:15672
  - User: `RABBITMQ_DEFAULT_USER`
  - Password: `RABBITMQ_DEFAULT_PASSWORD`
- MISP: https://localhost:8443 or http://localhost:8081
  - Admin email: `MISP_ADMIN_EMAIL`
  - Admin password: `MISP_ADMIN_PASSWORD`
- OpenCTI: http://localhost:8080
  - Admin email: `OPENCTI_ADMIN_EMAIL`
  - Admin password: `OPENCTI_ADMIN_PASSWORD`
  - API token: `OPENCTI_TOKEN`
- TheHive: http://localhost:9000
  - Admin login: `THEHIVE_ADMIN_LOGIN`
  - Admin password: `THEHIVE_ADMIN_PASSWORD`
- Cortex: http://localhost:9001
- Kibana: http://localhost:5601
- Prometheus: http://localhost:9090
- Vault: http://localhost:8200
  - Token: `VAULT_TOKEN`

## Internal Services

- PostgreSQL host port: `localhost:5433`
  - DB: `POSTGRES_DB`
  - User: `POSTGRES_USER`
  - Password: `POSTGRES_PASSWORD`
- Redis host port: `localhost:6379`
  - Password: `REDIS_PASSWORD`
- Logstash HTTP input: http://localhost:8088
  - User: `LOGSTASH_HTTP_USER`
  - Password: `LOGSTASH_HTTP_PASSWORD`

## Important

Most services only apply admin credentials on first boot. If persistent Docker volumes already exist, changing `.env` alone may not change the existing service accounts. Use a fresh stack/volumes when you need every account to be recreated exactly from `.env`.
