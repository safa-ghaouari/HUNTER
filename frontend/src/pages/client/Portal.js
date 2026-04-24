import React, { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import PortalShell, {
  DataTable, DetailRow, Drawer, EmptyState, ErrorState,
  FilterSelect, LoadingState, Panel, PortalPageHeader, SearchBar,
  StatCard, StatusPill, useToast,
} from "../../components/PortalShell";
import { useAuth } from "../../contexts/AuthContext";
import { alerts, reports } from "../../services/api";

const CLIENT_ITEMS = [
  { key: "dashboard", label: "Overview",  icon: "◈" },
  { key: "alerts",    label: "My Alerts", icon: "⚑" },
  { key: "reports",   label: "Reports",   icon: "≡" },
];

function tc(v) { return String(v || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function fdt(v) { return v ? new Date(v).toLocaleString() : "—"; }
function fsize(v) {
  if (!v) return "—";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}
function severityTone(v) {
  return { critical: "critical", high: "warning", medium: "info", low: "success", info: "neutral" }[v] || "neutral";
}
function statusTone(v) {
  return { open: "warning", investigating: "info", resolved: "success", false_positive: "neutral",
    generating: "warning", ready: "success", failed: "critical" }[v] || "neutral";
}

function ClientDashboardView({ navTo }) {
  const [alertData, setAlertData] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([alerts.clientList(), reports.clientList()]).then(([a, r]) => {
      setAlertData(a.data); setReportData(r.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  const openAlerts = alertData.filter((a) => a.status === "open").length;
  const criticalAlerts = alertData.filter((a) => a.severity === "critical").length;

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Client Portal" title="Security Overview" subtitle="Your threat intelligence and incident dashboard." />

      <div className="stats-grid">
        <StatCard label="Open Alerts" value={openAlerts} tone="red" detail={`${criticalAlerts} critical`} />
        <StatCard label="Total Alerts" value={alertData.length} tone="amber" detail="All severity levels" />
        <StatCard label="Reports Ready" value={reportData.filter((r) => r.status === "ready").length} tone="teal" detail={`${reportData.length} total`} />
        <StatCard label="Investigating" value={alertData.filter((a) => a.status === "investigating").length} tone="ice" detail="Active cases" />
      </div>

      <div className="dashboard-grid">
        <Panel title="Recent Alerts" subtitle="Detections in your environment"
          actions={<button className="portal-button portal-button--secondary" onClick={() => navTo("alerts")}>View all</button>}>
          {alertData.length === 0 ? <EmptyState label="No alerts." /> : (
            <DataTable rowKey="id" rows={alertData.slice(0, 6)} columns={[
              { key: "title", label: "Alert" },
              { key: "severity", label: "Severity", render: (v) => <StatusPill tone={severityTone(v)}>{tc(v)}</StatusPill> },
              { key: "status", label: "Status", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
              { key: "created_at", label: "Date", render: fdt },
            ]} />
          )}
        </Panel>

        <Panel title="Reports" subtitle="Generated threat intelligence reports"
          actions={<button className="portal-button portal-button--secondary" onClick={() => navTo("reports")}>View all</button>}>
          {reportData.length === 0 ? <EmptyState label="No reports yet." /> : (
            <DataTable rowKey="id" rows={reportData.slice(0, 5)} columns={[
              { key: "title", label: "Title" },
              { key: "report_type", label: "Type", render: (v) => tc(v) },
              { key: "status", label: "Status", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
              { key: "created_at", label: "Date", render: fdt },
            ]} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function ClientAlertsView() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [severityFilter, setSeverityFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (severityFilter) params.severity = severityFilter;
    alerts.clientList(params).then((r) => { setData(r.data); setError(""); })
      .catch((e) => setError(e.response?.data?.detail || "Failed")).finally(() => setLoading(false));
  }, [statusFilter, severityFilter]);

  useEffect(() => { load(); }, [load]);

  const STATUS_OPTS = [
    { value: "open", label: "Open" }, { value: "investigating", label: "Investigating" },
    { value: "resolved", label: "Resolved" }, { value: "false_positive", label: "False Positive" },
  ];
  const SEV_OPTS = ["critical","high","medium","low","info"].map((v) => ({ value: v, label: tc(v) }));
  const filtered = data.filter((a) => !search || a.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Client Portal" title="My Alerts" subtitle="Security detections in your environment." />
      <Panel title={`${data.length} alerts`}
        actions={
          <div className="panel-actions-row">
            <SearchBar value={search} onChange={setSearch} placeholder="Search alerts…" />
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTS} placeholder="All statuses" />
            <FilterSelect value={severityFilter} onChange={setSeverityFilter} options={SEV_OPTS} placeholder="All severities" />
            <button className="portal-button portal-button--secondary" onClick={load}>Refresh</button>
          </div>
        }
      >
        {loading ? <LoadingState /> : error ? <ErrorState label="Could not load alerts." detail={error} onRetry={load} /> :
          filtered.length === 0 ? <EmptyState label="No alerts match your filters." /> : (
            <DataTable rowKey="id" rows={filtered} onRowClick={setDetail} columns={[
              { key: "title", label: "Alert" },
              { key: "severity", label: "Severity", render: (v) => <StatusPill tone={severityTone(v)}>{tc(v)}</StatusPill> },
              { key: "status", label: "Status", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
              { key: "mitre_technique_id", label: "MITRE", render: (v) => v ? <code>{v}</code> : "—" },
              { key: "created_at", label: "Created", render: fdt },
            ]} />
          )}
      </Panel>

      {detail && (
        <Drawer title={detail.title} onClose={() => setDetail(null)}>
          <div className="detail-section">
            <DetailRow label="Severity" value={<StatusPill tone={severityTone(detail.severity)}>{tc(detail.severity)}</StatusPill>} />
            <DetailRow label="Status" value={<StatusPill tone={statusTone(detail.status)}>{tc(detail.status)}</StatusPill>} />
            <DetailRow label="MITRE technique" value={detail.mitre_technique_id} mono />
            <DetailRow label="TheHive case" value={detail.thehive_case_id} mono />
            <DetailRow label="Created" value={fdt(detail.created_at)} />
            <DetailRow label="Updated" value={fdt(detail.updated_at)} />
            {detail.description && (
              <div className="detail-description">
                <div className="detail-json__label">Description</div>
                <p>{detail.description}</p>
              </div>
            )}
            {detail.raw_log_ref && (
              <div className="detail-json">
                <div className="detail-json__label">Log reference</div>
                <pre>{detail.raw_log_ref}</pre>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}

function ClientReportsView() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [detail, setDetail] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    reports.clientList(params).then((r) => { setData(r.data); setError(""); })
      .catch((e) => setError(e.response?.data?.detail || "Failed")).finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (report) => {
    setDownloading(report.id);
    try {
      const r = await reports.clientDownload(report.id);
      window.open(r.data.download_url, "_blank");
      toast("Download started", "success");
    } catch (e) { toast(e.response?.data?.detail || "Download failed", "error"); }
    finally { setDownloading(null); }
  };

  const STATUS_OPTS = [
    { value: "generating", label: "Generating" }, { value: "ready", label: "Ready" }, { value: "failed", label: "Failed" },
  ];

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Client Portal" title="Reports" subtitle="Your threat intelligence and hunt reports." />
      <Panel title={`${data.length} reports`}
        actions={
          <div className="panel-actions-row">
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTS} placeholder="All statuses" />
            <button className="portal-button portal-button--secondary" onClick={load}>Refresh</button>
          </div>
        }
      >
        {loading ? <LoadingState /> : error ? <ErrorState label="Could not load reports." detail={error} onRetry={load} /> :
          data.length === 0 ? <EmptyState label="No reports available." detail="Reports are generated after threat hunting jobs complete." /> : (
            <DataTable rowKey="id" rows={data} onRowClick={setDetail} columns={[
              { key: "title", label: "Title" },
              { key: "report_type", label: "Type", render: (v) => tc(v) },
              { key: "status", label: "Status", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
              { key: "file_size_bytes", label: "Size", render: fsize },
              { key: "created_at", label: "Created", render: fdt },
              { key: "_dl", label: "", render: (_, row) => (
                row.status === "ready" ? (
                  <button className="portal-button portal-button--secondary portal-button--sm"
                    onClick={(e) => { e.stopPropagation(); handleDownload(row); }}
                    disabled={downloading === row.id}>
                    {downloading === row.id ? "…" : "↓ Download"}
                  </button>
                ) : null
              )},
            ]} />
          )}
      </Panel>

      {detail && (
        <Drawer title={detail.title} onClose={() => setDetail(null)}>
          <div className="detail-section">
            <DetailRow label="Type" value={tc(detail.report_type)} />
            <DetailRow label="Status" value={<StatusPill tone={statusTone(detail.status)}>{tc(detail.status)}</StatusPill>} />
            <DetailRow label="File size" value={fsize(detail.file_size_bytes)} />
            <DetailRow label="Period" value={detail.period_start && detail.period_end ? `${detail.period_start} → ${detail.period_end}` : "—"} />
            <DetailRow label="Created" value={fdt(detail.created_at)} />
            {detail.status === "ready" && (
              <button className="portal-button portal-button--primary" style={{ marginTop: "1rem" }}
                onClick={() => handleDownload(detail)} disabled={downloading === detail.id}>
                {downloading === detail.id ? "Getting link…" : "↓ Download PDF"}
              </button>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}

export default function ClientPortal() {
  const navigate = useNavigate();
  const { section = "dashboard" } = useParams();
  const { role, user, logout } = useAuth();
  const [alertCount, setAlertCount] = useState(null);

  useEffect(() => {
    alerts.clientList({ status: "open" }).then((r) => setAlertCount(r.data.length)).catch(() => {});
  }, []);

  const items = CLIENT_ITEMS.map((item) =>
    item.key === "alerts" && alertCount ? { ...item, badge: alertCount, badgeTone: "red" } : item
  );

  const valid = items.some((i) => i.key === section);
  const active = valid ? section : "dashboard";

  if (role !== "client") return <Navigate to="/login" replace />;
  if (active !== section) return <Navigate to={`/client/${active}`} replace />;

  const VIEWS = {
    dashboard: <ClientDashboardView navTo={(s) => navigate(`/client/${s}`)} />,
    alerts: <ClientAlertsView />,
    reports: <ClientReportsView />,
  };

  return (
    <PortalShell
      title="Client Workspace"
      subtitle="Your threat intelligence portal"
      role={role}
      user={user}
      items={items}
      activeKey={active}
      onNavigate={(s) => navigate(`/client/${s}`)}
      onLogout={logout}
    >
      {VIEWS[active]}
    </PortalShell>
  );
}
