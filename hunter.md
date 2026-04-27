 HUNTER — Plateforme Automatisée de Threat Hunting                                                                     
  1. Architecture Globale (5 couches)                                                                                   
  ┌─────────────────────────────────────────────────────────────────────┐
  │  COUCHE 1 — COLLECTE DE DONNÉES                                     │
  │  Feedparser (RSS) · Newspaper3k (Web) · AlienVault OTX · Abuse.ch  │
  │  CIRCL MISP Feeds · Secureworks API · WireGuard (on-premise)        │
  │  OpenVAS/Greenbone (vulnérabilités)                                 │
  └──────────────────────────────┬──────────────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────────────┐
  │  COUCHE 2 — PIPELINE IA / NLP                                       │
  │  spaCy (NER) · iocextract (regex IoC) · SecBERT (classification)   │
  │  Scikit-learn (K-Means, DBSCAN, Isolation Forest)                   │
  │  LangChain + Ollama/Mistral (RAG local, résumés intelligents)       │
  └──────────────────────────────┬──────────────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────────────┐
  │  COUCHE 3 — STOCKAGE & CORRÉLATION                                  │
  │  MISP (IoC central) · OpenCTI (graphe STIX 2.1)                    │
  │  Logstash (ETL) · Elasticsearch + Kibana (logs)                     │
  │  PostgreSQL (données métier) · Redis (cache/queue)                  │
  │  MISP Correlation Engine (IoC ↔ logs client)                       │
  └──────────────────────────────┬──────────────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────────────┐
  │  COUCHE 4 — ORCHESTRATION & RÉPONSE                                 │
  │  Celery (tâches async) · Shuffle SOAR (playbooks)                  │
  │  TheHive v4 (case management multi-tenant)                          │
  │  Cortex (enrichissement : VirusTotal, Shodan, AbuseIPDB)            │
  │  MITRE ATT&CK Navigator (mapping TTPs)                              │
  └──────────────────────────────┬──────────────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────────────┐
  │  COUCHE 5 — PRÉSENTATION & SÉCURITÉ                                 │
  │  React.js (SPA : portail Client + portail SOC Admin)                │
  │  FastAPI (REST API + WebSockets) · WeasyPrint (rapports PDF)        │
  │  MinIO (stockage PDFs, backups) · Grafana + Prometheus (monitoring) │
  │  PyJWT + OAuth2 · Casbin RBAC · Nginx + ModSecurity · Vault        │
  │  Docker + Docker Compose · Trivy (scan images CI/CD)               │
  └─────────────────────────────────────────────────────────────────────┘

  ---
  2. Processus de Fonctionnement (flux complet)

  [SOC Admin] sélectionne un thème (ex: ransomware)
        │
        ▼
  [FastAPI] déclenche une tâche Celery
        │
        ├──► [Feedparser] pull RSS (CERT-FR, SANS-ISC, BleepingComputer…)
        ├──► [Newspaper3k] scrape articles web
        ├──► [AlienVault OTX / Abuse.ch / CIRCL] → import IoC dans MISP
        │
        ▼
  [Pipeline NLP – Celery task]
        ├──► spaCy → NER (IPs, CVEs, hashes, domaines, noms malwares)
        ├──► iocextract → IoC par regex (URLs, MD5/SHA256, emails)
        ├──► SecBERT → classification automatique du contenu
        ├──► Scikit-learn → clustering menaces + détection anomalies
        └──► LangChain + Ollama/Mistral → résumé intelligent (RAG local)
        │
        ▼
  [IoC stockés dans MISP + OpenCTI + PostgreSQL]
        │
        ▼
  [Connexion environnement client]
        ├──► Secureworks Taegis XDR API (cloud) ou WireGuard VPN (on-premise)
        ├──► OpenVAS/Greenbone → scan vulnérabilités CVE
        └──► Logstash → normalisation logs → Elasticsearch (indexation)
        │
        ▼
  [MISP Correlation Engine]
        └──► compare IoC externes ↔ logs clients (actifs impactés identifiés)
        │
  [Sigma Rules via sigma-cli → appliquées sur Elasticsearch]
        │
        ▼
  [Shuffle SOAR déclenche playbook automatique]
        ├──► Cortex → enrichissement (VirusTotal, Shodan, AbuseIPDB)
        ├──► TheHive v4 → création du case d'incident
        └──► Notification analyste SOC
        │
        ▼
  [WeasyPrint → génération rapport PDF]
        └──► stocké dans MinIO
        │
        ▼
  [React.js] WebSocket push → Client voit résultats en temps réel
  [React.js] SOC Admin supervise, valide, ferme le case dans TheHive

  ---
  3. Architecture des Fichiers

  hunter/
  ├── docker-compose.yml              # Stack complète (tous les services)
  ├── .env                            # Variables d'environnement
  ├── nginx/
  │   ├── nginx.conf                  # Reverse proxy + TLS (Let's Encrypt)
  │   └── modsecurity/                # WAF ModSecurity
  │
  ├── backend/                        # FastAPI (Python)
  │   ├── Dockerfile
  │   ├── requirements.txt
  │   ├── main.py                     # Entrypoint FastAPI
  │   ├── config.py                   # Settings (Vault, Env)
  │   ├── auth/
  │   │   ├── jwt.py                  # PyJWT + OAuth2PasswordBearer
  │   │   └── rbac.py                 # Casbin (Admin SOC / Client)
  │   ├── api/
  │   │   ├── routes/
  │   │   │   ├── auth.py             # Login, token refresh
  │   │   │   ├── hunting.py          # Lancer threat hunting
  │   │   │   ├── reports.py          # Accès rapports PDF
  │   │   │   ├── alerts.py           # Alertes & corrélations
  │   │   │   └── clients.py          # Gestion clients MSSP
  │   │   └── websockets.py           # Push temps réel (statut analyses)
  │   ├── models/                     # SQLAlchemy ORM
  │   │   ├── user.py
  │   │   ├── client.py
  │   │   ├── ioc.py
  │   │   ├── report.py
  │   │   └── asset.py
  │   ├── db/
  │   │   ├── database.py             # Connexion PostgreSQL
  │   │   └── migrations/             # Alembic
  │   ├── tasks/                      # Celery async tasks
  │   │   ├── celery_app.py           # Config Celery + Redis
  │   │   ├── collection.py           # Feedparser + Newspaper3k
  │   │   ├── nlp_pipeline.py         # spaCy, iocextract, SecBERT, sklearn
  │   │   ├── llm_rag.py              # LangChain + Ollama/Mistral
  │   │   ├── correlation.py          # MISP Correlation Engine
  │   │   ├── report_gen.py           # WeasyPrint → PDF
  │   │   └── backup.py               # pg_dump → MinIO
  │   ├── integrations/               # Clients vers services externes
  │   │   ├── misp_client.py
  │   │   ├── opencti_client.py
  │   │   ├── secureworks_client.py
  │   │   ├── openvas_client.py
  │   │   ├── thehive_client.py
  │   │   ├── cortex_client.py
  │   │   ├── shuffle_client.py
  │   │   ├── elasticsearch_client.py
  │   │   └── vault_client.py         # HashiCorp Vault (secrets)
  │   ├── reports/
  │   │   └── templates/              # HTML/CSS → WeasyPrint
  │   ├── storage/
  │   │   └── minio_client.py
  │   └── tests/                      # Pytest
  │       ├── test_api.py
  │       ├── test_nlp.py
  │       └── test_correlation.py
  │
  ├── frontend/                        # React.js SPA
  │   ├── Dockerfile
  │   ├── package.json
  │   └── src/
  │       ├── App.js
  │       ├── components/
  │       │   ├── Auth/
  │       │   ├── Dashboard/
  │       │   ├── Reports/
  │       │   ├── Alerts/
  │       │   └── Hunting/
  │       ├── pages/
  │       │   ├── client/             # Portail Client (consulter rapports/alertes)
  │       │   └── admin/              # Portail SOC Admin (lancer hunting, gérer)
  │       ├── services/               # Appels API + WebSocket
  │       └── contexts/               # Auth context, RBAC guards
  │
  ├── logstash/
  │   └── pipelines/
  │       └── hunter.conf             # Normalisation logs multi-formats
  │
  ├── sigma_rules/
  │   └── *.yml                       # Règles Sigma (ATT&CK coverage)
  │
  ├── monitoring/
  │   ├── grafana/                    # Dashboards opérationnels
  │   └── prometheus/
  │       └── prometheus.yml
  │
  └── scripts/
      ├── init_db.py                  # Init PostgreSQL
      ├── seed_misp.py                # Config MISP + feeds
      └── trivy_scan.sh               # Scan images Docker CI/CD

  ---
  4. Phases de Développement (Scrum)

  Phase 1 — Infrastructure & Fondation

  Objectif : tout faire tourner en local
  - docker-compose.yml avec tous les services (PostgreSQL, Redis, Elasticsearch, MISP, OpenCTI, TheHive, Cortex, MinIO,
  Vault, Grafana, Prometheus)
  - FastAPI skeleton + modèles SQLAlchemy + Alembic migrations
  - Authentification JWT (PyJWT + OAuth2) + RBAC Casbin (Admin SOC / Client)
  - Nginx + ModSecurity + HashiCorp Vault (secrets API keys)
  - React.js scaffold + pages de login avec guards RBAC
  - Trivy intégré en pré-déploiement

  Phase 2 — Module de Collecte

  Objectif : ingestion automatique des données cyber
  - Feedparser → RSS (CERT-FR, SANS-ISC, BleepingComputer, TheHackerNews)
  - Newspaper3k → scraping articles web
  - Connexion MISP → import feeds AlienVault OTX, Abuse.ch, CIRCL
  - OpenCTI → connecteur MISP (STIX 2.1)
  - Celery + Redis → file de tâches asynchrones
  - Endpoints FastAPI pour déclencher/suivre les collectes

  Phase 3 — Pipeline IA / NLP

  Objectif : extraire et classifier les menaces automatiquement
  - spaCy NER pipeline → extraction IPs, CVEs, hashes, domaines, noms malwares
  - iocextract → IoC par regex (URLs, MD5/SHA256, emails, defanging)
  - SecBERT (HuggingFace Transformers) → classification contenus
  - Scikit-learn → K-Means/DBSCAN clustering + Isolation Forest anomalies
  - LangChain + Ollama (Mistral local Docker) → pipeline RAG + résumés intelligents
  - IoC stockés dans MISP + PostgreSQL

  Phase 4 — Intégration Client & Corrélation

  Objectif : connecter l'environnement client et corréler les IoC
  - Secureworks Taegis XDR API → récupération alertes/logs
  - WireGuard VPN → connexion clients on-premise
  - OpenVAS/Greenbone → scan vulnérabilités CVE, résultats vers OpenCTI
  - Logstash → normalisation logs (Windows Event, Syslog, CEF, JSON)
  - Elasticsearch + Kibana → indexation + dashboards KQL
  - MISP Correlation Engine → IoC externes ↔ logs clients
  - Sigma rules via sigma-cli → déploiement sur Elasticsearch
  - MITRE ATT&CK Navigator → mapping couverture détection

  Phase 5 — SOAR & Gestion des Incidents

  Objectif : automatiser la réponse et la gestion des cases
  - TheHive v4 → configuration multi-tenant (un espace par client MSSP)
  - Cortex → activation analyseurs (VirusTotal, Shodan, AbuseIPDB, PassiveTotal)
  - Shuffle SOAR → playbooks : alerte → enrichissement → case TheHive → notification → blocage

  Phase 6 — Reporting & Frontend Complet

  Objectif : interface complète et rapports livrables
  - WeasyPrint → templates HTML/CSS → PDF Threat Hunting professionnels
  - MinIO → stockage et serving des PDFs
  - React.js portail Client : consulter rapports, alertes, statut
  - React.js portail SOC Admin : lancer hunting, gérer corrélations, superviser
  - WebSockets → push temps réel statut des analyses
  - Grafana + Prometheus → dashboards monitoring plateforme

  Phase 7 — Tests & Déploiement Final

  Objectif : assurance qualité et mise en production
  - Pytest → tests unitaires et d'intégration backend FastAPI
  - Jest → tests frontend React
  - pg_dump + Celery + MinIO → backup PostgreSQL automatisé
  - Tests d'intégration bout-en-bout (collecte → rapport)
  - Finalisation Docker Compose production
  - Documentation technique + manuel utilisateur
