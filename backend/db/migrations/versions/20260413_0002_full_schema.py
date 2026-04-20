"""Full HUNTER schema — Groups 2-6.

Adds all tables beyond the initial users + clients:
  sources, hunting_jobs, tags, iocs, ioc_tags,
  threats, threat_iocs, assets, alerts, alert_iocs, reports

Revision ID: 20260413_0002
Revises: 20260411_0001
Create Date: 2026-04-13 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260413_0002"
down_revision = "20260411_0001"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# PostgreSQL ENUM helpers
# ---------------------------------------------------------------------------

def _create_enum(name: str, *values: str, bind) -> sa.Enum:
    e = sa.Enum(*values, name=name)
    e.create(bind, checkfirst=True)
    return e


def _drop_enum(name: str, bind) -> None:
    sa.Enum(name=name).drop(bind, checkfirst=True)


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    # ── Create all ENUMs first ─────────────────────────────────────────────
    source_type_enum     = _create_enum("source_type_enum",     "rss", "misp_feed", "otx", "abuse_ch", "circl", "secureworks", "manual",                                 bind=bind)
    job_type_enum        = _create_enum("job_type_enum",        "collection", "nlp", "correlation", "report_gen", "full_hunt",                                            bind=bind)
    job_status_enum      = _create_enum("job_status_enum",      "pending", "running", "success", "failed", "cancelled",                                                   bind=bind)
    ioc_type_enum        = _create_enum("ioc_type_enum",        "ip", "domain", "url", "md5", "sha1", "sha256", "email", "filename", "cve", "mutex", "other",             bind=bind)
    severity_enum        = _create_enum("severity_enum",        "critical", "high", "medium", "low", "info",                                                              bind=bind)
    tlp_level_enum       = _create_enum("tlp_level_enum",       "clear", "green", "amber", "red",                                                                         bind=bind)
    threat_type_enum     = _create_enum("threat_type_enum",     "malware", "actor", "campaign", "tool", "technique",                                                      bind=bind)
    asset_type_enum      = _create_enum("asset_type_enum",      "server", "workstation", "network_device", "cloud_instance", "other",                                     bind=bind)
    asset_crit_enum      = _create_enum("asset_criticality_enum","critical", "high", "medium", "low",                                                                     bind=bind)
    alert_status_enum    = _create_enum("alert_status_enum",    "open", "investigating", "resolved", "false_positive",                                                    bind=bind)
    report_status_enum   = _create_enum("report_status_enum",   "generating", "ready", "failed",                                                                          bind=bind)
    report_type_enum     = _create_enum("report_type_enum",     "threat_hunt", "executive_summary", "ioc_report", "incident",                                             bind=bind)

    # ── 1. sources ─────────────────────────────────────────────────────────
    # Couche 1 — each row is an external data provider polled by the collector.
    if "sources" not in existing:
        op.create_table(
            "sources",
            sa.Column("id",                       postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("name",                     sa.String(255),                nullable=False),
            sa.Column("type",                     source_type_enum,              nullable=False),
            sa.Column("url",                      sa.Text(),                     nullable=True),
            sa.Column("api_key_vault_path",       sa.String(255),                nullable=True),
            sa.Column("is_active",                sa.Boolean(),                  nullable=False, server_default=sa.text("true")),
            sa.Column("polling_interval_minutes", sa.Integer(),                  nullable=False, server_default=sa.text("60")),
            sa.Column("last_polled_at",           sa.DateTime(timezone=True),    nullable=True),
            sa.Column("created_at",               sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )

    # ── 2. hunting_jobs ────────────────────────────────────────────────────
    # Tracks every Celery async task: collection, NLP, correlation, report_gen.
    if "hunting_jobs" not in existing:
        op.create_table(
            "hunting_jobs",
            sa.Column("id",              postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("celery_task_id",  sa.String(255),                nullable=True),
            sa.Column("type",            job_type_enum,                 nullable=False),
            sa.Column("status",          job_status_enum,               nullable=False, server_default=sa.text("'pending'")),
            sa.Column("client_id",       postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("source_id",       postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("initiated_by",    postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("params",          postgresql.JSONB(),             nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("result_summary",  postgresql.JSONB(),             nullable=True),
            sa.Column("error_message",   sa.Text(),                     nullable=True),
            sa.Column("started_at",      sa.DateTime(timezone=True),    nullable=True),
            sa.Column("finished_at",     sa.DateTime(timezone=True),    nullable=True),
            sa.Column("created_at",      sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["client_id"],    ["clients.id"],  ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["source_id"],    ["sources.id"],  ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["initiated_by"], ["users.id"],    ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("celery_task_id"),
        )
        op.create_index("ix_hunting_jobs_status",    "hunting_jobs", ["status"])
        op.create_index("ix_hunting_jobs_client_id", "hunting_jobs", ["client_id"])
        op.create_index("ix_hunting_jobs_celery_task_id", "hunting_jobs", ["celery_task_id"])

    # ── 3. tags ────────────────────────────────────────────────────────────
    # Analyst-defined labels for IoCs (free-form, coloured badges).
    if "tags" not in existing:
        op.create_table(
            "tags",
            sa.Column("id",         postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("name",       sa.String(100),                nullable=False),
            sa.Column("color",      sa.String(7),                  nullable=False, server_default=sa.text("'#00D9FF'")),
            sa.Column("created_at", sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
        op.create_index("ix_tags_name", "tags", ["name"], unique=True)

    # ── 4. iocs ────────────────────────────────────────────────────────────
    # Core artefact of the pipeline — produced by NLP, stored in MISP/PostgreSQL,
    # queried against Elasticsearch for correlation.
    if "iocs" not in existing:
        op.create_table(
            "iocs",
            sa.Column("id",               postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("type",             ioc_type_enum,                 nullable=False),
            sa.Column("value",            sa.Text(),                     nullable=False),
            sa.Column("value_normalized", sa.Text(),                     nullable=False),
            sa.Column("severity",         severity_enum,                 nullable=False, server_default=sa.text("'medium'")),
            sa.Column("confidence",       sa.Integer(),                  nullable=False, server_default=sa.text("50")),
            sa.Column("tlp",              tlp_level_enum,                nullable=False, server_default=sa.text("'amber'")),
            sa.Column("source_type",      sa.String(100),                nullable=False),
            sa.Column("misp_event_id",    sa.String(255),                nullable=True),
            sa.Column("opencti_id",       sa.String(255),                nullable=True),
            sa.Column("description",      sa.Text(),                     nullable=True),
            sa.Column("is_active",        sa.Boolean(),                  nullable=False, server_default=sa.text("true")),
            sa.Column("first_seen_at",    sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("last_seen_at",     sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("hunting_job_id",   postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at",       sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["hunting_job_id"], ["hunting_jobs.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_iocs_type",             "iocs", ["type"])
        op.create_index("ix_iocs_severity",         "iocs", ["severity"])
        op.create_index("ix_iocs_hunting_job_id",   "iocs", ["hunting_job_id"])
        # value_normalized is queried heavily in correlation — needs a hash index
        # for equality (exact match) and a text index for pattern match.
        op.create_index("ix_iocs_value_normalized", "iocs", ["value_normalized"])

    # ── 5. ioc_tags ────────────────────────────────────────────────────────
    # Many-to-many: IoC ↔ Tag
    if "ioc_tags" not in existing:
        op.create_table(
            "ioc_tags",
            sa.Column("ioc_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("tag_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.ForeignKeyConstraint(["ioc_id"], ["iocs.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("ioc_id", "tag_id"),
        )

    # ── 6. threats ─────────────────────────────────────────────────────────
    # Named threat intelligence entities: malware families, actors, campaigns.
    # Produced by the NLP clustering step (sklearn K-Means / DBSCAN).
    # Pushed to OpenCTI as STIX 2.1 objects.
    if "threats" not in existing:
        op.create_table(
            "threats",
            sa.Column("id",                postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("name",              sa.String(255),                nullable=False),
            sa.Column("type",              threat_type_enum,              nullable=False),
            sa.Column("description",       sa.Text(),                     nullable=True),
            sa.Column("mitre_techniques",  postgresql.ARRAY(sa.String(20)), nullable=False, server_default=sa.text("'{}'::varchar(20)[]")),
            sa.Column("severity",          severity_enum,                 nullable=False, server_default=sa.text("'high'")),
            sa.Column("hunting_job_id",    postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at",        sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["hunting_job_id"], ["hunting_jobs.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
        op.create_index("ix_threats_name",          "threats", ["name"], unique=True)
        op.create_index("ix_threats_type",          "threats", ["type"])
        op.create_index("ix_threats_severity",      "threats", ["severity"])
        op.create_index("ix_threats_hunting_job_id","threats", ["hunting_job_id"])

    # ── 7. threat_iocs ─────────────────────────────────────────────────────
    # Many-to-many: Threat ↔ IoC
    # An IoC can be attributed to multiple threat actors (overlap is common).
    if "threat_iocs" not in existing:
        op.create_table(
            "threat_iocs",
            sa.Column("threat_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("ioc_id",    postgresql.UUID(as_uuid=True), nullable=False),
            sa.ForeignKeyConstraint(["threat_id"], ["threats.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["ioc_id"],    ["iocs.id"],    ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("threat_id", "ioc_id"),
        )

    # ── 8. assets ──────────────────────────────────────────────────────────
    # Client-side hosts / devices discovered by OpenVAS or extracted from logs.
    # The pivot point between a client's network and triggered alerts.
    if "assets" not in existing:
        op.create_table(
            "assets",
            sa.Column("id",           postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("client_id",    postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("hostname",     sa.String(255),                nullable=True),
            sa.Column("ip_address",   postgresql.INET(),             nullable=True),
            sa.Column("asset_type",   asset_type_enum,               nullable=False, server_default=sa.text("'other'")),
            sa.Column("os",           sa.String(255),                nullable=True),
            sa.Column("criticality",  asset_crit_enum,               nullable=False, server_default=sa.text("'medium'")),
            sa.Column("is_active",    sa.Boolean(),                  nullable=False, server_default=sa.text("true")),
            sa.Column("discovered_at",sa.DateTime(timezone=True),    nullable=True),
            sa.Column("created_at",   sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_assets_client_id",  "assets", ["client_id"])
        op.create_index("ix_assets_hostname",   "assets", ["hostname"])
        op.create_index("ix_assets_ip_address", "assets", ["ip_address"])

    # ── 9. alerts ──────────────────────────────────────────────────────────
    # A correlation hit: IoC value found in a client's Elasticsearch log index.
    # Triggers a Shuffle SOAR playbook → Cortex enrichment → TheHive case.
    if "alerts" not in existing:
        op.create_table(
            "alerts",
            sa.Column("id",                  postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("client_id",           postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("hunting_job_id",      postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("asset_id",            postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("threat_id",           postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("severity",            severity_enum,                 nullable=False),
            sa.Column("status",              alert_status_enum,             nullable=False, server_default=sa.text("'open'")),
            sa.Column("title",               sa.String(500),                nullable=False),
            sa.Column("description",         sa.Text(),                     nullable=True),
            sa.Column("raw_log_ref",         sa.Text(),                     nullable=True),
            sa.Column("mitre_technique_id",  sa.String(50),                 nullable=True),
            sa.Column("thehive_case_id",     sa.String(255),                nullable=True),
            sa.Column("validated_by",        postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("validated_at",        sa.DateTime(timezone=True),    nullable=True),
            sa.Column("created_at",          sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at",          sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["client_id"],      ["clients.id"],      ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["hunting_job_id"], ["hunting_jobs.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["asset_id"],       ["assets.id"],       ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["threat_id"],      ["threats.id"],      ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["validated_by"],   ["users.id"],        ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_alerts_client_id",      "alerts", ["client_id"])
        op.create_index("ix_alerts_status",         "alerts", ["status"])
        op.create_index("ix_alerts_severity",       "alerts", ["severity"])
        op.create_index("ix_alerts_hunting_job_id", "alerts", ["hunting_job_id"])
        op.create_index("ix_alerts_asset_id",       "alerts", ["asset_id"])
        op.create_index("ix_alerts_threat_id",      "alerts", ["threat_id"])

    # ── 10. alert_iocs ─────────────────────────────────────────────────────
    # Many-to-many: Alert ↔ IoC
    # Records exactly which IoCs triggered a given alert — essential for triage.
    if "alert_iocs" not in existing:
        op.create_table(
            "alert_iocs",
            sa.Column("alert_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("ioc_id",   postgresql.UUID(as_uuid=True), nullable=False),
            sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["ioc_id"],   ["iocs.id"],   ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("alert_id", "ioc_id"),
        )

    # ── 11. reports ────────────────────────────────────────────────────────
    # PDF documents generated by WeasyPrint and stored in MinIO.
    # Clients download them via a pre-signed URL.
    if "reports" not in existing:
        op.create_table(
            "reports",
            sa.Column("id",               postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("client_id",        postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("hunting_job_id",   postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("generated_by",     postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("report_type",      report_type_enum,              nullable=False),
            sa.Column("title",            sa.String(500),                nullable=False),
            sa.Column("period_start",     sa.Date(),                     nullable=True),
            sa.Column("period_end",       sa.Date(),                     nullable=True),
            sa.Column("status",           report_status_enum,            nullable=False, server_default=sa.text("'generating'")),
            sa.Column("minio_object_key", sa.String(512),                nullable=True),
            sa.Column("file_size_bytes",  sa.BigInteger(),               nullable=True),
            sa.Column("created_at",       sa.DateTime(timezone=True),    nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["client_id"],      ["clients.id"],      ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["hunting_job_id"], ["hunting_jobs.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["generated_by"],   ["users.id"],        ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_reports_client_id",    "reports", ["client_id"])
        op.create_index("ix_reports_status",       "reports", ["status"])
        op.create_index("ix_reports_report_type",  "reports", ["report_type"])


# ---------------------------------------------------------------------------
# Downgrade — drops in reverse FK order
# ---------------------------------------------------------------------------

def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    for table in ["reports", "alert_iocs", "alerts", "assets",
                  "threat_iocs", "threats", "ioc_tags", "iocs",
                  "tags", "hunting_jobs", "sources"]:
        if table in existing:
            op.drop_table(table)

    for enum_name in [
        "report_type_enum", "report_status_enum", "alert_status_enum",
        "asset_criticality_enum", "asset_type_enum", "threat_type_enum",
        "tlp_level_enum", "severity_enum", "ioc_type_enum",
        "job_status_enum", "job_type_enum", "source_type_enum",
    ]:
        sa.Enum(name=enum_name).drop(bind, checkfirst=True)
