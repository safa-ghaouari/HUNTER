"""Shared enumerations used across all HUNTER models.

Defined once here to avoid duplication and keep PostgreSQL ENUM names
consistent with Python values throughout the codebase.
"""

from enum import Enum


# ---------------------------------------------------------------------------
# Source layer (Couche 1 — Collecte)
# ---------------------------------------------------------------------------

class SourceType(str, Enum):
    """Type of external data source feeding the collection pipeline."""
    RSS        = "rss"          # Feedparser — CERT-FR, SANS-ISC, BleepingComputer…
    MISP_FEED  = "misp_feed"    # MISP curated feed (AlienVault OTX, Abuse.ch, CIRCL)
    OTX        = "otx"          # AlienVault OTX API
    ABUSE_CH   = "abuse_ch"     # Abuse.ch (URLhaus, Feodo, MalwareBazaar)
    CIRCL      = "circl"        # CIRCL MISP feeds
    SECUREWORKS = "secureworks" # Secureworks Taegis XDR (client environment)
    MANUAL     = "manual"       # Manually added by SOC analyst


# ---------------------------------------------------------------------------
# Pipeline layer (Couche 2 — IA / NLP  +  Couche 4 — Orchestration)
# ---------------------------------------------------------------------------

class JobType(str, Enum):
    """The kind of async task a HuntingJob represents."""
    COLLECTION  = "collection"   # Feedparser + Newspaper3k + MISP import
    NLP         = "nlp"          # spaCy + iocextract + SecBERT + sklearn
    CORRELATION = "correlation"  # MISP IoC ↔ Elasticsearch client logs
    REPORT_GEN  = "report_gen"   # WeasyPrint PDF generation
    FULL_HUNT   = "full_hunt"    # End-to-end: collection → NLP → correlation → report


class JobStatus(str, Enum):
    """Lifecycle state of a Celery-backed HuntingJob."""
    PENDING   = "pending"    # Queued, not yet picked up by a worker
    RUNNING   = "running"    # Worker is actively processing
    SUCCESS   = "success"    # Completed without errors
    FAILED    = "failed"     # Worker raised an unrecoverable error
    CANCELLED = "cancelled"  # Manually cancelled by SOC analyst


# ---------------------------------------------------------------------------
# IoC layer (Couche 3 — Stockage)
# ---------------------------------------------------------------------------

class IocType(str, Enum):
    """Indicator of Compromise category as defined by MISP / OpenCTI standards."""
    IP       = "ip"        # IPv4 / IPv6 address
    DOMAIN   = "domain"    # Fully qualified domain name
    URL      = "url"       # Full URL (including path / query string)
    MD5      = "md5"       # MD5 file hash
    SHA1     = "sha1"      # SHA-1 file hash
    SHA256   = "sha256"    # SHA-256 file hash
    EMAIL    = "email"     # Email address (sender / recipient of phishing)
    FILENAME = "filename"  # Malicious filename or pattern
    CVE      = "cve"       # CVE identifier (e.g. CVE-2024-12345)
    MUTEX    = "mutex"     # Windows mutex name dropped by malware
    OTHER    = "other"     # Uncategorised — reviewed manually


class TlpLevel(str, Enum):
    """Traffic Light Protocol sharing restriction level (TLP 2.0)."""
    CLEAR  = "clear"   # No restriction (formerly WHITE)
    GREEN  = "green"   # Community sharing only
    AMBER  = "amber"   # Limited distribution (need-to-know)
    RED    = "red"     # Not for disclosure — recipient only


class Severity(str, Enum):
    """Risk severity shared by IoCs and Alerts (maps to UI colour tokens)."""
    CRITICAL = "critical"  # #FF4444 — immediate action required
    HIGH     = "high"      # #FF8C00
    MEDIUM   = "medium"    # #FFD700
    LOW      = "low"       # #00C853
    INFO     = "info"      # informational, no immediate risk


# ---------------------------------------------------------------------------
# Threat intelligence layer
# ---------------------------------------------------------------------------

class ThreatType(str, Enum):
    """Classification of a threat intelligence grouping (STIX 2.1 inspired)."""
    MALWARE   = "malware"    # Malware family (ransomware, trojan, wiper…)
    ACTOR     = "actor"      # Threat actor / APT group
    CAMPAIGN  = "campaign"   # Coordinated attack campaign
    TOOL      = "tool"       # Offensive tool / framework (Cobalt Strike, Mimikatz…)
    TECHNIQUE = "technique"  # ATT&CK technique standalone entry


# ---------------------------------------------------------------------------
# Client environment layer (Couche 4 — assets)
# ---------------------------------------------------------------------------

class ConnectionType(str, Enum):
    """Integration type used to pull data from a client's security environment."""
    OPENVAS      = "openvas"      # Greenbone OpenVAS / GVM (GMP API)
    SECUREWORKS  = "secureworks"  # Secureworks Taegis XDR REST API
    ONPREMISE    = "onpremise"    # Generic on-premise log source (Syslog/SIEM)


class AssetType(str, Enum):
    """Category of client-side asset discovered or registered."""
    SERVER         = "server"
    WORKSTATION    = "workstation"
    NETWORK_DEVICE = "network_device"   # Firewall, switch, router
    CLOUD_INSTANCE = "cloud_instance"   # AWS EC2, Azure VM, GCP…
    OTHER          = "other"


class AssetCriticality(str, Enum):
    """Business criticality of the asset — drives alert priority."""
    CRITICAL = "critical"
    HIGH     = "high"
    MEDIUM   = "medium"
    LOW      = "low"


# ---------------------------------------------------------------------------
# Alert / case management layer (Couche 4 — Réponse)
# ---------------------------------------------------------------------------

class AlertStatus(str, Enum):
    """Analyst workflow state of a correlated alert."""
    OPEN           = "open"            # Newly created, awaiting triage
    INVESTIGATING  = "investigating"   # Analyst assigned, TheHive case open
    RESOLVED       = "resolved"        # Confirmed threat, remediated
    FALSE_POSITIVE = "false_positive"  # Correlation hit dismissed by analyst


# ---------------------------------------------------------------------------
# Reporting layer (Couche 6 — Présentation)
# ---------------------------------------------------------------------------

class ReportStatus(str, Enum):
    """Generation lifecycle of a PDF report stored in MinIO."""
    GENERATING = "generating"  # WeasyPrint task running
    READY      = "ready"       # PDF uploaded to MinIO, available for download
    FAILED     = "failed"      # Generation task failed


class ReportType(str, Enum):
    """Format / audience of the generated report."""
    THREAT_HUNT        = "threat_hunt"        # Full technical hunt report
    EXECUTIVE_SUMMARY  = "executive_summary"  # Management-level summary
    IOC_REPORT         = "ioc_report"         # Raw IoC list with context
    INCIDENT           = "incident"           # Post-incident report linked to a TheHive case
