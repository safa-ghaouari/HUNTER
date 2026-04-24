import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import PortalShell, {
  ActionMenu, ConfirmDialog, DataTable, DetailRow, Drawer, EmptyState,
  ErrorState, FilterSelect, FormField, FormInput, FormSelect, FormTextarea,
  LoadingState, Modal, Pagination, Panel, PortalPageHeader, SearchBar,
  StatCard, StatusPill, useToast,
} from "../../components/PortalShell";
import { useAuth } from "../../contexts/AuthContext";
import { alerts, clients, collections, hunting, iocs, reports, sources } from "../../services/api";

// ─── Nav ──────────────────────────────────────────────────────────────────────
const ADMIN_ITEMS = [
  { key: "dashboard", label: "Overview",      icon: "◈" },
  { key: "clients",   label: "Clients",        icon: "◻" },
  { key: "sources",   label: "Sources",        icon: "⊕" },
  { key: "collections", label: "Collections",  icon: "↓" },
  { key: "jobs",      label: "Hunting Jobs",   icon: "⚙" },
  { key: "iocs",      label: "IoC Center",     icon: "◆" },
  { key: "alerts",    label: "Alerts",         icon: "⚑" },
  { key: "reports",   label: "Reports",        icon: "≡" },
  { key: "platform",  label: "Platform",       icon: "⬡" },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
function tc(v) {
  return String(v || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fdt(v) { return v ? new Date(v).toLocaleString() : "—"; }
function fd(v) { return v ? new Date(v).toLocaleDateString() : "—"; }
function fdur(a, b) {
  if (!a || !b) return "—";
  const s = Math.round((new Date(b) - new Date(a)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
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
  return { failed: "critical", cancelled: "critical", pending: "warning", running: "info",
    investigating: "info", resolved: "success", false_positive: "neutral", inactive: "neutral",
    generating: "warning", ready: "success" }[v] || "neutral";
}

const PER_PAGE = 25;

// ─── Dashboard ────────────────────────────────────────────────────────────────
function AdminDashboardView({ navTo }) {
  const [data, setData] = useState({ clients: [], sources: [], jobs: [], alerts: [], iocs: [], reports: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      clients.list(), sources.list(), hunting.list(), alerts.list(), iocs.list({ limit: 8 }), reports.list(),
    ]).then(([c, s, j, a, i, r]) => {
      setData({ clients: c.data, sources: s.data, jobs: j.data, alerts: a.data, iocs: i.data, reports: r.data });
    }).finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => ({
    clients: data.clients.length,
    sources: data.sources.length,
    runningJobs: data.jobs.filter((j) => j.status === "running").length,
    failedSources: data.sources.filter((s) => s.consecutive_failures > 0).length,
    openAlerts: data.alerts.filter((a) => a.status === "open").length,
    criticalAlerts: data.alerts.filter((a) => a.severity === "critical").length,
  }), [data]);

  if (loading) return <LoadingState />;

  return (
    <div className="portal-page-grid">
      <PortalPageHeader
        eyebrow="SOC Overview"
        title="Mission Control"
        subtitle="Live platform view — tenants, intelligence ingestion, hunting jobs, analyst outputs."
        actions={
          <button className="portal-button portal-button--primary" onClick={() => navTo("jobs")}>
            + New Hunt
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard label="Active Clients" value={stats.clients} tone="teal" detail="Tenant accounts onboarded" />
        <StatCard label="Intel Sources" value={stats.sources} tone="ice" detail={stats.failedSources ? `${stats.failedSources} need attention` : "All healthy"} />
        <StatCard label="Running Jobs" value={stats.runningJobs} tone="amber" detail="Collection & hunt execution" />
        <StatCard label="Open Alerts" value={stats.openAlerts} tone="red" detail={`${stats.criticalAlerts} critical`} />
      </div>

      <div className="dashboard-grid">
        <Panel title="Recent Hunting Jobs" subtitle="Latest orchestration activity"
          actions={<button className="portal-button portal-button--secondary" onClick={() => navTo("jobs")}>View all</button>}>
          {data.jobs.length === 0 ? <EmptyState label="No jobs yet." /> : (
            <DataTable rowKey="id" rows={data.jobs.slice(0, 6)} columns={[
              { key: "id", label: "Job", render: (v) => <code>{String(v).slice(0, 8)}</code> },
              { key: "type", label: "Type", render: (v) => tc(v) },
              { key: "status", label: "Status", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
              { key: "created_at", label: "Created", render: fdt },
            ]} />
          )}
        </Panel>

        <Panel title="Source Health" subtitle="Collection reliability snapshot"
          actions={<button className="portal-button portal-button--secondary" onClick={() => navTo("sources")}>Manage</button>}>
          {data.sources.length === 0 ? <EmptyState label="No sources configured." /> : (
            <DataTable rowKey="id" rows={data.sources.slice(0, 6)} columns={[
              { key: "name", label: "Source" },
              { key: "type", label: "Type", render: (v) => tc(v) },
              { key: "is_active", label: "Health", render: (_, r) => (
                <StatusPill tone={!r.is_active ? "critical" : r.consecutive_failures ? "warning" : "success"}>
                  {!r.is_active ? "Disabled" : r.consecutive_failures ? `${r.consecutive_failures} failures` : "Healthy"}
                </StatusPill>
              )},
              { key: "last_polled_at", label: "Last Poll", render: fdt },
            ]} />
          )}
        </Panel>

        <Panel title="Alert Queue" subtitle="Most recent across tenants"
          actions={<button className="portal-button portal-button--secondary" onClick={() => navTo("alerts")}>Triage</button>}>
          {data.alerts.length === 0 ? <EmptyState label="No alerts." /> : (
            <DataTable rowKey="id" rows={data.alerts.slice(0, 6)} columns={[
              { key: "title", label: "Alert" },
              { key: "severity", label: "Severity", render: (v) => <StatusPill tone={severityTone(v)}>{tc(v)}</StatusPill> },
              { key: "status", label: "Workflow", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
              { key: "created_at", label: "Created", render: fdt },
            ]} />
          )}
        </Panel>

        <Panel title="Newest IoCs" subtitle="Latest extracted indicators"
          actions={<button className="portal-button portal-button--secondary" onClick={() => navTo("iocs")}>View all</button>}>
          {data.iocs.length === 0 ? <EmptyState label="No IoCs yet." /> : (
            <DataTable rowKey="id" rows={data.iocs} columns={[
              { key: "value", label: "Indicator" },
              { key: "type", label: "Type", render: (v) => tc(v) },
              { key: "severity", label: "Severity", render: (v) => <StatusPill tone={severityTone(v)}>{tc(v)}</StatusPill> },
              { key: "first_seen_at", label: "First Seen", render: fdt },
            ]} />
          )}
        </Panel>
      </div>
    </div>
  );
}

// ─── Clients ──────────────────────────────────────────────────────────────────
function ClientForm({ initial, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    name: initial?.name || "", vpn_ip: initial?.vpn_ip || "",
    api_key: "", connection_type: initial?.connection_type || "",
    openvas_url: initial?.openvas_url || "", openvas_username: "", openvas_password: "",
    secureworks_url: initial?.secureworks_url || "", secureworks_client_id: "", secureworks_client_secret: "",
  });
  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  const CONNECTION_TYPES = [
    { value: "openvas", label: "OpenVAS" },
    { value: "secureworks", label: "Secureworks" },
    { value: "onpremise", label: "On-Premise" },
  ];

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="form-grid form-grid--2">
        <FormField label="Client Name" required><FormInput value={form.name} onChange={set("name")} placeholder="Acme Corp" /></FormField>
        <FormField label="VPN IP"><FormInput value={form.vpn_ip} onChange={set("vpn_ip")} placeholder="10.0.0.1" /></FormField>
      </div>
      {!initial && (
        <FormField label="API Key" required hint="Used to authenticate this client's agent">
          <FormInput value={form.api_key} onChange={set("api_key")} type="password" placeholder="••••••••" />
        </FormField>
      )}
      <FormField label="Connection Type">
        <FormSelect value={form.connection_type} onChange={set("connection_type")} options={CONNECTION_TYPES} placeholder="None" />
      </FormField>
      {form.connection_type === "openvas" && (
        <div className="form-grid form-grid--2">
          <FormField label="OpenVAS URL"><FormInput value={form.openvas_url} onChange={set("openvas_url")} placeholder="https://openvas:9390" /></FormField>
          <FormField label="Username"><FormInput value={form.openvas_username} onChange={set("openvas_username")} placeholder="admin" /></FormField>
          <div className="form-grid__full">
            <FormField label="Password"><FormInput value={form.openvas_password} onChange={set("openvas_password")} type="password" /></FormField>
          </div>
        </div>
      )}
      {form.connection_type === "secureworks" && (
        <div className="form-grid form-grid--2">
          <FormField label="Secureworks URL"><FormInput value={form.secureworks_url} onChange={set("secureworks_url")} /></FormField>
          <FormField label="Client ID"><FormInput value={form.secureworks_client_id} onChange={set("secureworks_client_id")} /></FormField>
          <div className="form-grid__full">
            <FormField label="Client Secret"><FormInput value={form.secureworks_client_secret} onChange={set("secureworks_client_secret")} type="password" /></FormField>
          </div>
        </div>
      )}
      <div className="modal-footer">
        <button type="button" className="portal-button portal-button--secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="portal-button portal-button--primary" disabled={submitting}>
          {submitting ? "Saving…" : initial ? "Save changes" : "Create client"}
        </button>
      </div>
    </form>
  );
}

function AdminClientsView() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [usersTarget, setUsersTarget] = useState(null);
  const [users, setUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ email: "", password: "" });

  const load = useCallback(() => {
    setLoading(true);
    clients.list().then((r) => { setData(r.data); setError(""); }).catch((e) => setError(e.response?.data?.detail || "Failed to load")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openUsers = (client) => {
    setUsersTarget(client);
    clients.users(client.id).then((r) => setUsers(r.data)).catch(() => setUsers([]));
  };

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await clients.create(form);
      toast("Client created", "success");
      setShowCreate(false);
      load();
    } catch (e) { toast(e.response?.data?.detail || "Failed to create", "error"); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async (form) => {
    setSubmitting(true);
    try {
      await clients.update(editTarget.id, form);
      toast("Client updated", "success");
      setEditTarget(null);
      load();
    } catch (e) { toast(e.response?.data?.detail || "Failed to update", "error"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    try {
      await clients.delete(deleteTarget.id);
      toast("Client deleted", "success");
      setDeleteTarget(null);
      load();
    } catch (e) { toast(e.response?.data?.detail || "Failed to delete", "error"); }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await clients.createUser(usersTarget.id, userForm);
      toast("User created", "success");
      setShowAddUser(false);
      setUserForm({ email: "", password: "" });
      clients.users(usersTarget.id).then((r) => setUsers(r.data));
    } catch (err) { toast(err.response?.data?.detail || "Failed", "error"); }
  };

  const filtered = data.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Admin" title="Clients" subtitle="Manage tenant organizations and their users." />
      <Panel
        title={`${data.length} client${data.length !== 1 ? "s" : ""}`}
        actions={
          <div className="panel-actions-row">
            <SearchBar value={search} onChange={setSearch} placeholder="Search clients…" />
            <button className="portal-button portal-button--primary" onClick={() => setShowCreate(true)}>+ Add client</button>
          </div>
        }
      >
        {loading ? <LoadingState /> : error ? <ErrorState label="Could not load clients." detail={error} onRetry={load} /> :
          filtered.length === 0 ? <EmptyState label="No clients found." /> : (
            <DataTable rowKey="id" rows={filtered} columns={[
              { key: "name", label: "Name" },
              { key: "vpn_ip", label: "VPN IP" },
              { key: "connection_type", label: "Connection", render: (v) => v ? tc(v) : "—" },
              { key: "is_active", label: "Status", render: (v) => <StatusPill tone={v ? "success" : "critical"}>{v ? "Active" : "Inactive"}</StatusPill> },
              { key: "created_at", label: "Created", render: fd },
              {
                key: "_actions", label: "", render: (_, row) => (
                  <ActionMenu actions={[
                    { label: "Edit", onClick: () => setEditTarget(row) },
                    { label: "Manage users", onClick: () => openUsers(row) },
                    { label: "Test connection", onClick: () => clients.testConnection(row.id).then(() => toast("Connection OK", "success")).catch(() => toast("Connection failed", "error")) },
                    "divider",
                    { label: "Delete", danger: true, onClick: () => setDeleteTarget(row) },
                  ]} />
                )
              },
            ]} />
          )}
      </Panel>

      {showCreate && (
        <Modal title="Add Client" size="lg" onClose={() => setShowCreate(false)}>
          <ClientForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} submitting={submitting} />
        </Modal>
      )}
      {editTarget && (
        <Modal title="Edit Client" size="lg" onClose={() => setEditTarget(null)}>
          <ClientForm initial={editTarget} onSubmit={handleUpdate} onCancel={() => setEditTarget(null)} submitting={submitting} />
        </Modal>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete client"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {usersTarget && (
        <Drawer title={`Users — ${usersTarget.name}`} onClose={() => { setUsersTarget(null); setShowAddUser(false); }}>
          <div className="drawer-section">
            <div className="drawer-section-header">
              <span>{users.length} user{users.length !== 1 ? "s" : ""}</span>
              <button className="portal-button portal-button--secondary portal-button--sm" onClick={() => setShowAddUser((p) => !p)}>
                {showAddUser ? "Cancel" : "+ Add user"}
              </button>
            </div>
            {showAddUser && (
              <form className="inline-form" onSubmit={handleAddUser}>
                <FormInput value={userForm.email} onChange={(v) => setUserForm((p) => ({ ...p, email: v }))} placeholder="user@example.com" type="email" />
                <FormInput value={userForm.password} onChange={(v) => setUserForm((p) => ({ ...p, password: v }))} placeholder="Password" type="password" />
                <button type="submit" className="portal-button portal-button--primary portal-button--sm">Create</button>
              </form>
            )}
            {users.map((u) => (
              <div key={u.id} className="detail-row">
                <span className="detail-label">{u.email}</span>
                <StatusPill tone={u.is_active ? "success" : "neutral"}>{u.is_active ? "Active" : "Inactive"}</StatusPill>
              </div>
            ))}
            {users.length === 0 && <EmptyState label="No users yet." />}
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ─── Sources ──────────────────────────────────────────────────────────────────
const SOURCE_TYPES = [
  { value: "rss", label: "RSS" }, { value: "misp_feed", label: "MISP Feed" },
  { value: "otx", label: "AlienVault OTX" }, { value: "abuse_ch", label: "Abuse.ch" },
  { value: "circl", label: "CIRCL" }, { value: "secureworks", label: "Secureworks" },
  { value: "manual", label: "Manual" },
];

function SourceForm({ initial, onSubmit, onCancel, clientList, submitting }) {
  const [form, setForm] = useState({
    name: initial?.name || "", type: initial?.type || "rss",
    url: initial?.url || "", polling_interval_minutes: initial?.polling_interval_minutes || 60,
    is_active: initial?.is_active !== false, client_id: initial?.client_id || "", api_key: "",
  });
  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="form-grid form-grid--2">
        <FormField label="Name" required><FormInput value={form.name} onChange={set("name")} placeholder="My Source" /></FormField>
        <FormField label="Type" required>
          <FormSelect value={form.type} onChange={set("type")} options={SOURCE_TYPES} />
        </FormField>
      </div>
      <FormField label="URL" hint="Feed URL or API endpoint">
        <FormInput value={form.url} onChange={set("url")} placeholder="https://…" />
      </FormField>
      <div className="form-grid form-grid--2">
        <FormField label="Poll interval (minutes)">
          <FormInput value={form.polling_interval_minutes} onChange={(v) => set("polling_interval_minutes")(parseInt(v) || 60)} type="number" />
        </FormField>
        <FormField label="Scoped to client">
          <FormSelect value={form.client_id} onChange={set("client_id")}
            options={clientList.map((c) => ({ value: c.id, label: c.name }))} placeholder="Global (all clients)" />
        </FormField>
      </div>
      <FormField label="API Key" hint="Leave blank to keep existing key">
        <FormInput value={form.api_key} onChange={set("api_key")} type="password" placeholder="••••••••" />
      </FormField>
      <div className="modal-footer">
        <button type="button" className="portal-button portal-button--secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="portal-button portal-button--primary" disabled={submitting}>
          {submitting ? "Saving…" : initial ? "Save changes" : "Add source"}
        </button>
      </div>
    </form>
  );
}

function AdminSourcesView() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [clientList, setClientList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([sources.list(), clients.list()]).then(([s, c]) => {
      setData(s.data); setClientList(c.data); setError("");
    }).catch((e) => setError(e.response?.data?.detail || "Failed")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (form) => {
    setSubmitting(true);
    try { await sources.create(form); toast("Source added", "success"); setShowCreate(false); load(); }
    catch (e) { toast(e.response?.data?.detail || "Failed", "error"); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async (form) => {
    setSubmitting(true);
    try { await sources.update(editTarget.id, form); toast("Source updated", "success"); setEditTarget(null); load(); }
    catch (e) { toast(e.response?.data?.detail || "Failed", "error"); }
    finally { setSubmitting(false); }
  };

  const handleToggle = async (src) => {
    try { await sources.update(src.id, { is_active: !src.is_active }); toast(src.is_active ? "Source disabled" : "Source enabled", "success"); load(); }
    catch (e) { toast(e.response?.data?.detail || "Failed", "error"); }
  };

  const handleDelete = async () => {
    try { await sources.delete(deleteTarget.id); toast("Source deleted", "success"); setDeleteTarget(null); load(); }
    catch (e) { toast(e.response?.data?.detail || "Failed", "error"); }
  };

  const clientName = (id) => clientList.find((c) => c.id === id)?.name || "—";
  const filtered = data.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Admin" title="Sources" subtitle="Threat intelligence feeds and collectors." />
      <Panel
        title={`${data.length} source${data.length !== 1 ? "s" : ""}`}
        actions={
          <div className="panel-actions-row">
            <SearchBar value={search} onChange={setSearch} placeholder="Search sources…" />
            <button className="portal-button portal-button--primary" onClick={() => setShowCreate(true)}>+ Add source</button>
          </div>
        }
      >
        {loading ? <LoadingState /> : error ? <ErrorState label="Could not load sources." detail={error} onRetry={load} /> :
          filtered.length === 0 ? <EmptyState label="No sources found." /> : (
            <DataTable rowKey="id" rows={filtered} columns={[
              { key: "name", label: "Name" },
              { key: "type", label: "Type", render: (v) => tc(v) },
              { key: "client_id", label: "Scope", render: (v) => v ? clientName(v) : "Global" },
              { key: "polling_interval_minutes", label: "Poll (min)" },
              { key: "is_active", label: "Status", render: (_, r) => (
                <StatusPill tone={!r.is_active ? "critical" : r.consecutive_failures ? "warning" : "success"}>
                  {!r.is_active ? "Disabled" : r.consecutive_failures ? `${r.consecutive_failures} fails` : "Healthy"}
                </StatusPill>
              )},
              { key: "last_polled_at", label: "Last Poll", render: fdt },
              { key: "_actions", label: "", render: (_, row) => (
                <ActionMenu actions={[
                  { label: "View details", onClick: () => setDetail(row) },
                  { label: "Edit", onClick: () => setEditTarget(row) },
                  { label: row.is_active ? "Disable" : "Enable", onClick: () => handleToggle(row) },
                  "divider",
                  { label: "Delete", danger: true, onClick: () => setDeleteTarget(row) },
                ]} />
              )},
            ]} />
          )}
      </Panel>

      {showCreate && (
        <Modal title="Add Source" size="lg" onClose={() => setShowCreate(false)}>
          <SourceForm clientList={clientList} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} submitting={submitting} />
        </Modal>
      )}
      {editTarget && (
        <Modal title="Edit Source" size="lg" onClose={() => setEditTarget(null)}>
          <SourceForm initial={editTarget} clientList={clientList} onSubmit={handleUpdate} onCancel={() => setEditTarget(null)} submitting={submitting} />
        </Modal>
      )}
      {deleteTarget && (
        <ConfirmDialog title="Delete source" message={`Delete "${deleteTarget.name}"?`} danger onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {detail && (
        <Drawer title={detail.name} onClose={() => setDetail(null)}>
          <div className="detail-section">
            <DetailRow label="Type" value={tc(detail.type)} />
            <DetailRow label="URL" value={detail.url} mono />
            <DetailRow label="Vault path" value={detail.api_key_vault_path} mono />
            <DetailRow label="Poll interval" value={`${detail.polling_interval_minutes} min`} />
            <DetailRow label="Status" value={detail.is_active ? "Active" : "Disabled"} />
            <DetailRow label="Consecutive failures" value={detail.consecutive_failures} />
            <DetailRow label="Last error" value={detail.last_error_message} />
            <DetailRow label="Last polled" value={fdt(detail.last_polled_at)} />
            <DetailRow label="Created" value={fdt(detail.created_at)} />
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ─── Collections ──────────────────────────────────────────────────────────────
function AdminCollectionsView() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [sourceList, setSourceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showTrigger, setShowTrigger] = useState(false);
  const [triggerForm, setTriggerForm] = useState({ source_id: "", seed_text: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([collections.list(), sources.list()]).then(([c, s]) => {
      setData(c.data); setSourceList(s.data); setError("");
    }).catch((e) => setError(e.response?.data?.detail || "Failed")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTrigger = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await collections.create({ source_id: triggerForm.source_id || undefined, seed_text: triggerForm.seed_text || undefined });
      toast("Collection job queued", "success");
      setShowTrigger(false);
      load();
    } catch (err) { toast(err.response?.data?.detail || "Failed", "error"); }
    finally { setSubmitting(false); }
  };

  const STATUS_OPTIONS = [
    { value: "pending", label: "Pending" }, { value: "running", label: "Running" },
    { value: "success", label: "Success" }, { value: "failed", label: "Failed" },
  ];

  const filtered = data.filter((c) => !statusFilter || c.status === statusFilter);

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Admin" title="Collections" subtitle="Feed ingestion job history." />
      <Panel
        title={`${filtered.length} run${filtered.length !== 1 ? "s" : ""}`}
        actions={
          <div className="panel-actions-row">
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="All statuses" />
            <button className="portal-button portal-button--primary" onClick={() => setShowTrigger(true)}>+ Trigger collection</button>
            <button className="portal-button portal-button--secondary" onClick={load}>Refresh</button>
          </div>
        }
      >
        {loading ? <LoadingState /> : error ? <ErrorState label="Could not load." detail={error} onRetry={load} /> :
          filtered.length === 0 ? <EmptyState label="No collection jobs." /> : (
            <DataTable rowKey="id" rows={filtered} onRowClick={setDetail} columns={[
              { key: "id", label: "Run ID", render: (v) => <code>{String(v).slice(0, 8)}</code> },
              { key: "source_id", label: "Source", render: (v) => v ? <code>{String(v).slice(0, 8)}</code> : "All sources" },
              { key: "status", label: "Status", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
              { key: "started_at", label: "Started", render: fdt },
              { key: "finished_at", label: "Finished", render: fdt },
              { key: "error_message", label: "Error", render: (v) => v ? <span className="error-text">{v.slice(0, 60)}{v.length > 60 ? "…" : ""}</span> : "—" },
            ]} />
          )}
      </Panel>

      {showTrigger && (
        <Modal title="Trigger Collection" onClose={() => setShowTrigger(false)}>
          <form onSubmit={handleTrigger}>
            <FormField label="Source" hint="Leave blank to run all active sources">
              <FormSelect value={triggerForm.source_id} onChange={(v) => setTriggerForm((p) => ({ ...p, source_id: v }))}
                options={sourceList.filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.name }))}
                placeholder="All active sources" />
            </FormField>
            <FormField label="Seed text (optional)" hint="Manual intelligence text to inject">
              <FormTextarea value={triggerForm.seed_text} onChange={(v) => setTriggerForm((p) => ({ ...p, seed_text: v }))} placeholder="Paste threat report or IOC list…" />
            </FormField>
            <div className="modal-footer">
              <button type="button" className="portal-button portal-button--secondary" onClick={() => setShowTrigger(false)}>Cancel</button>
              <button type="submit" className="portal-button portal-button--primary" disabled={submitting}>{submitting ? "Queuing…" : "Trigger"}</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Drawer title={`Collection — ${String(detail.id).slice(0, 8)}`} onClose={() => setDetail(null)}>
          <div className="detail-section">
            <DetailRow label="Status" value={<StatusPill tone={statusTone(detail.status)}>{tc(detail.status)}</StatusPill>} />
            <DetailRow label="Source" value={detail.source_id || "All sources"} mono />
            <DetailRow label="Started" value={fdt(detail.started_at)} />
            <DetailRow label="Finished" value={fdt(detail.finished_at)} />
            <DetailRow label="Duration" value={fdur(detail.started_at, detail.finished_at)} />
            {detail.error_message && (
              <div className="detail-error-box">{detail.error_message}</div>
            )}
            {detail.result_summary && (
              <div className="detail-json">
                <div className="detail-json__label">Result summary</div>
                <pre>{JSON.stringify(detail.result_summary, null, 2)}</pre>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ─── Hunting Jobs ─────────────────────────────────────────────────────────────
function HuntingJobForm({ clientList, sourceList, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    type: "full_hunt", client_id: "", source_id: "", theme: "", period_days: "", seed_text: "",
  });
  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  const JOB_TYPES = [
    { value: "full_hunt", label: "Full Hunt (end-to-end)" },
    { value: "collection", label: "Collection only" },
  ];

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <div className="form-grid form-grid--2">
        <FormField label="Job type" required>
          <FormSelect value={form.type} onChange={set("type")} options={JOB_TYPES} />
        </FormField>
        <FormField label="Client scope">
          <FormSelect value={form.client_id} onChange={set("client_id")}
            options={clientList.map((c) => ({ value: c.id, label: c.name }))} placeholder="No specific client" />
        </FormField>
        <FormField label="Theme / keyword">
          <FormInput value={form.theme} onChange={set("theme")} placeholder="e.g. ransomware, LockBit" />
        </FormField>
        <FormField label="Period (days)">
          <FormInput value={form.period_days} onChange={set("period_days")} type="number" placeholder="7" />
        </FormField>
      </div>
      <FormField label="Seed text" hint="Paste a threat report, news article, or raw IOC list to analyze">
        <FormTextarea value={form.seed_text} onChange={set("seed_text")} rows={6}
          placeholder="Paste intelligence content here — URLs, IPs, CVEs, malware descriptions…" />
      </FormField>
      <div className="modal-footer">
        <button type="button" className="portal-button portal-button--secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="portal-button portal-button--primary" disabled={submitting}>
          {submitting ? "Launching…" : "Launch hunt"}
        </button>
      </div>
    </form>
  );
}

function AdminHuntingView() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [clientList, setClientList] = useState([]);
  const [sourceList, setSourceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.type = typeFilter;
    Promise.all([hunting.list(params), clients.list(), sources.list()]).then(([j, c, s]) => {
      setData(j.data); setClientList(c.data); setSourceList(s.data); setError(""); setPage(1);
    }).catch((e) => setError(e.response?.data?.detail || "Failed")).finally(() => setLoading(false));
  }, [statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await hunting.create({
        type: form.type,
        client_id: form.client_id || undefined,
        source_id: form.source_id || undefined,
        theme: form.theme || undefined,
        period_days: form.period_days ? parseInt(form.period_days) : undefined,
        seed_text: form.seed_text || undefined,
      });
      toast("Hunt launched", "success");
      setShowCreate(false);
      load();
    } catch (e) { toast(e.response?.data?.detail || "Failed to launch", "error"); }
    finally { setSubmitting(false); }
  };

  const handleCancel = async () => {
    try { await hunting.cancel(cancelTarget.id); toast("Job cancelled", "success"); setCancelTarget(null); load(); }
    catch (e) { toast(e.response?.data?.detail || "Failed", "error"); }
  };

  const clientName = (id) => clientList.find((c) => c.id === id)?.name;
  const paged = data.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const STATUS_OPTS = [
    { value: "pending", label: "Pending" }, { value: "running", label: "Running" },
    { value: "success", label: "Success" }, { value: "failed", label: "Failed" }, { value: "cancelled", label: "Cancelled" },
  ];
  const TYPE_OPTS = [
    { value: "full_hunt", label: "Full Hunt" }, { value: "collection", label: "Collection" },
    { value: "nlp", label: "NLP" }, { value: "correlation", label: "Correlation" }, { value: "report_gen", label: "Report Gen" },
  ];

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Admin" title="Hunting Jobs"
        subtitle={`${data.length} total jobs — automated threat hunting orchestration.`}
        actions={<button className="portal-button portal-button--primary" onClick={() => setShowCreate(true)}>+ New hunt</button>}
      />
      <Panel
        title={`${data.length} jobs`}
        actions={
          <div className="panel-actions-row">
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTS} placeholder="All statuses" />
            <FilterSelect value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTS} placeholder="All types" />
            <button className="portal-button portal-button--secondary" onClick={load}>Refresh</button>
          </div>
        }
      >
        {loading ? <LoadingState /> : error ? <ErrorState label="Could not load jobs." detail={error} onRetry={load} /> :
          paged.length === 0 ? <EmptyState label="No jobs match your filters." /> : (
            <>
              <DataTable rowKey="id" rows={paged} columns={[
                { key: "id", label: "Job ID", render: (v) => <code>{String(v).slice(0, 8)}</code> },
                { key: "type", label: "Type", render: tc },
                { key: "client_id", label: "Client", render: (v) => v ? (clientName(v) || <code>{String(v).slice(0, 8)}</code>) : "—" },
                { key: "status", label: "Status", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
                { key: "created_at", label: "Created", render: fdt },
                { key: "finished_at", label: "Duration", render: (_, r) => fdur(r.started_at, r.finished_at) },
                { key: "_actions", label: "", render: (_, row) => (
                  <ActionMenu actions={[
                    { label: "View details", onClick: () => setDetail(row) },
                    { label: "Cancel", onClick: () => setCancelTarget(row), disabled: !["pending", "running"].includes(row.status) },
                  ]} />
                )},
              ]} />
              <Pagination total={data.length} page={page} perPage={PER_PAGE} onChange={setPage} />
            </>
          )}
      </Panel>

      {showCreate && (
        <Modal title="New Hunting Job" subtitle="Configure and launch a threat hunting pipeline." size="lg" onClose={() => setShowCreate(false)}>
          <HuntingJobForm clientList={clientList} sourceList={sourceList} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} submitting={submitting} />
        </Modal>
      )}
      {cancelTarget && (
        <ConfirmDialog title="Cancel job" message={`Cancel job ${String(cancelTarget.id).slice(0, 8)}?`}
          danger onConfirm={handleCancel} onCancel={() => setCancelTarget(null)} />
      )}
      {detail && (
        <Drawer title={`Job — ${String(detail.id).slice(0, 8)}`} onClose={() => setDetail(null)}>
          <div className="detail-section">
            <DetailRow label="ID" value={detail.id} mono />
            <DetailRow label="Type" value={tc(detail.type)} />
            <DetailRow label="Status" value={<StatusPill tone={statusTone(detail.status)}>{tc(detail.status)}</StatusPill>} />
            <DetailRow label="Client" value={clientName(detail.client_id) || detail.client_id} />
            <DetailRow label="Celery task" value={detail.celery_task_id} mono />
            <DetailRow label="Created" value={fdt(detail.created_at)} />
            <DetailRow label="Started" value={fdt(detail.started_at)} />
            <DetailRow label="Finished" value={fdt(detail.finished_at)} />
            <DetailRow label="Duration" value={fdur(detail.started_at, detail.finished_at)} />
            {detail.error_message && <div className="detail-error-box">{detail.error_message}</div>}
            {detail.params && Object.keys(detail.params).length > 0 && (
              <div className="detail-json"><div className="detail-json__label">Parameters</div>
                <pre>{JSON.stringify(detail.params, null, 2)}</pre></div>
            )}
            {detail.result_summary && (
              <div className="detail-json"><div className="detail-json__label">Result summary</div>
                <pre>{JSON.stringify(detail.result_summary, null, 2)}</pre></div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ─── IoC Center ───────────────────────────────────────────────────────────────
function AdminIoCsView() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [severityFilter, setSeverityFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [enriching, setEnriching] = useState(null);

  const load = useCallback((pg = 1) => {
    setLoading(true);
    const params = { limit: PER_PAGE, offset: (pg - 1) * PER_PAGE };
    if (typeFilter) params.type = typeFilter;
    if (severityFilter) params.severity = severityFilter;
    iocs.list(params).then((r) => { setData(r.data); setTotal(r.data.length < PER_PAGE ? (pg - 1) * PER_PAGE + r.data.length : pg * PER_PAGE + 1); setError(""); })
      .catch((e) => setError(e.response?.data?.detail || "Failed")).finally(() => setLoading(false));
  }, [typeFilter, severityFilter]);

  useEffect(() => { setPage(1); load(1); }, [load]);

  const handlePageChange = (p) => { setPage(p); load(p); };

  const handleEnrich = async (ioc) => {
    setEnriching(ioc.id);
    try {
      const r = await iocs.enrich(ioc.id);
      toast("IoC enriched", "success");
      if (detail?.id === ioc.id) setDetail((prev) => ({ ...prev, enrichment: r.data.enrichment }));
      load(page);
    } catch (e) { toast(e.response?.data?.detail || "Enrichment failed", "error"); }
    finally { setEnriching(null); }
  };

  const TYPE_OPTS = ["ip","domain","url","md5","sha1","sha256","email","filename","cve","mutex","other"].map((v) => ({ value: v, label: v.toUpperCase() }));
  const SEV_OPTS = ["critical","high","medium","low","info"].map((v) => ({ value: v, label: tc(v) }));

  const filtered = data.filter((i) => !search || i.value.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Admin" title="IoC Center" subtitle="Extracted indicators of compromise." />
      <Panel
        title="Indicators"
        actions={
          <div className="panel-actions-row">
            <SearchBar value={search} onChange={setSearch} placeholder="Filter by value…" />
            <FilterSelect value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={TYPE_OPTS} placeholder="All types" />
            <FilterSelect value={severityFilter} onChange={(v) => { setSeverityFilter(v); setPage(1); }} options={SEV_OPTS} placeholder="All severities" />
            <button className="portal-button portal-button--secondary" onClick={() => load(page)}>Refresh</button>
          </div>
        }
      >
        {loading ? <LoadingState /> : error ? <ErrorState label="Could not load IoCs." detail={error} onRetry={() => load(page)} /> :
          filtered.length === 0 ? <EmptyState label="No IoCs match your filters." /> : (
            <>
              <DataTable rowKey="id" rows={filtered} onRowClick={setDetail} columns={[
                { key: "value", label: "Indicator", render: (v) => <code className="ioc-value">{v}</code> },
                { key: "type", label: "Type", render: (v) => <span className="type-badge">{v.toUpperCase()}</span> },
                { key: "severity", label: "Severity", render: (v) => <StatusPill tone={severityTone(v)}>{tc(v)}</StatusPill> },
                { key: "confidence", label: "Confidence", render: (v) => <div className="confidence-bar"><div className="confidence-bar__fill" style={{ width: `${v}%` }} /><span>{v}%</span></div> },
                { key: "tlp", label: "TLP", render: (v) => <span className={`tlp-badge tlp-badge--${v}`}>{v.toUpperCase()}</span> },
                { key: "first_seen_at", label: "First Seen", render: fdt },
                { key: "_actions", label: "", render: (_, row) => (
                  <ActionMenu actions={[
                    { label: "View details", onClick: () => setDetail(row) },
                    { label: enriching === row.id ? "Enriching…" : "Enrich", onClick: () => handleEnrich(row), disabled: enriching === row.id },
                  ]} />
                )},
              ]} />
              <Pagination total={total} page={page} perPage={PER_PAGE} onChange={handlePageChange} />
            </>
          )}
      </Panel>

      {detail && (
        <Drawer title={`IoC — ${detail.type.toUpperCase()}`} onClose={() => setDetail(null)}>
          <div className="detail-section">
            <div className="ioc-value-display">{detail.value}</div>
            <DetailRow label="Type" value={detail.type.toUpperCase()} />
            <DetailRow label="Severity" value={<StatusPill tone={severityTone(detail.severity)}>{tc(detail.severity)}</StatusPill>} />
            <DetailRow label="Confidence" value={`${detail.confidence}%`} />
            <DetailRow label="TLP" value={<span className={`tlp-badge tlp-badge--${detail.tlp}`}>{detail.tlp.toUpperCase()}</span>} />
            <DetailRow label="Source type" value={tc(detail.source_type)} />
            <DetailRow label="Active" value={detail.is_active ? "Yes" : "No"} />
            <DetailRow label="First seen" value={fdt(detail.first_seen_at)} />
            <DetailRow label="Last seen" value={fdt(detail.last_seen_at)} />
            {detail.description && <div className="detail-description">{detail.description}</div>}
            {detail.enrichment ? (
              <div className="detail-json">
                <div className="detail-json__label">Enrichment data</div>
                <pre>{JSON.stringify(detail.enrichment, null, 2)}</pre>
              </div>
            ) : (
              <button className="portal-button portal-button--secondary" style={{ marginTop: "1rem" }}
                onClick={() => handleEnrich(detail)} disabled={enriching === detail.id}>
                {enriching === detail.id ? "Enriching…" : "Enrich this IoC"}
              </button>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
function AdminAlertsView() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [severityFilter, setSeverityFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (severityFilter) params.severity = severityFilter;
    alerts.list(params).then((r) => { setData(r.data); setError(""); })
      .catch((e) => setError(e.response?.data?.detail || "Failed")).finally(() => setLoading(false));
  }, [statusFilter, severityFilter]);

  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = async (alertId, newStatus) => {
    setUpdatingStatus(true);
    try {
      const r = await alerts.updateStatus(alertId, newStatus);
      toast(`Alert marked as ${tc(newStatus)}`, "success");
      setData((prev) => prev.map((a) => a.id === alertId ? r.data : a));
      if (detail?.id === alertId) setDetail(r.data);
    } catch (e) { toast(e.response?.data?.detail || "Failed", "error"); }
    finally { setUpdatingStatus(false); }
  };

  const STATUS_OPTS = [
    { value: "open", label: "Open" }, { value: "investigating", label: "Investigating" },
    { value: "resolved", label: "Resolved" }, { value: "false_positive", label: "False Positive" },
  ];
  const SEV_OPTS = ["critical","high","medium","low","info"].map((v) => ({ value: v, label: tc(v) }));

  const filtered = data.filter((a) => !search || a.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Admin" title="Alerts" subtitle="SOC triage queue — review, investigate, resolve." />
      <Panel
        title={`${data.length} alert${data.length !== 1 ? "s" : ""}`}
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
              { key: "status", label: "Workflow", render: (v) => <StatusPill tone={statusTone(v)}>{tc(v)}</StatusPill> },
              { key: "mitre_technique_id", label: "MITRE", render: (v) => v ? <code>{v}</code> : "—" },
              { key: "created_at", label: "Created", render: fdt },
              { key: "_actions", label: "", render: (_, row) => (
                <ActionMenu actions={[
                  { label: "View details", onClick: () => setDetail(row) },
                  "divider",
                  { label: "Mark: Investigating", onClick: () => handleStatusUpdate(row.id, "investigating"), disabled: row.status === "investigating" },
                  { label: "Mark: Resolved", onClick: () => handleStatusUpdate(row.id, "resolved"), disabled: row.status === "resolved" },
                  { label: "Mark: False Positive", onClick: () => handleStatusUpdate(row.id, "false_positive"), disabled: row.status === "false_positive" },
                  { label: "Reopen", onClick: () => handleStatusUpdate(row.id, "open"), disabled: row.status === "open" },
                ]} />
              )},
            ]} />
          )}
      </Panel>

      {detail && (
        <Drawer title={detail.title} onClose={() => setDetail(null)}>
          <div className="detail-section">
            <div className="alert-status-actions">
              {["open","investigating","resolved","false_positive"].map((s) => (
                <button key={s}
                  className={`portal-button portal-button--sm ${detail.status === s ? "portal-button--primary" : "portal-button--secondary"}`}
                  onClick={() => handleStatusUpdate(detail.id, s)}
                  disabled={detail.status === s || updatingStatus}
                >{tc(s)}</button>
              ))}
            </div>
            <DetailRow label="Severity" value={<StatusPill tone={severityTone(detail.severity)}>{tc(detail.severity)}</StatusPill>} />
            <DetailRow label="Status" value={<StatusPill tone={statusTone(detail.status)}>{tc(detail.status)}</StatusPill>} />
            <DetailRow label="Client" value={detail.client_id} mono />
            <DetailRow label="MITRE technique" value={detail.mitre_technique_id} mono />
            <DetailRow label="TheHive case" value={detail.thehive_case_id} mono />
            <DetailRow label="Created" value={fdt(detail.created_at)} />
            <DetailRow label="Updated" value={fdt(detail.updated_at)} />
            <DetailRow label="Validated by" value={detail.validated_by} mono />
            <DetailRow label="Validated at" value={fdt(detail.validated_at)} />
            {detail.description && (
              <div className="detail-description">
                <div className="detail-json__label">Description</div>
                <p>{detail.description}</p>
              </div>
            )}
            {detail.raw_log_ref && (
              <div className="detail-json">
                <div className="detail-json__label">Raw log reference</div>
                <pre>{detail.raw_log_ref}</pre>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────
function AdminReportsView() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [detail, setDetail] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.type = typeFilter;
    reports.list(params).then((r) => { setData(r.data); setError(""); })
      .catch((e) => setError(e.response?.data?.detail || "Failed")).finally(() => setLoading(false));
  }, [statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (report) => {
    setDownloading(report.id);
    try {
      const r = await reports.download(report.id);
      window.open(r.data.download_url, "_blank");
      toast("Download started", "success");
    } catch (e) { toast(e.response?.data?.detail || "Download failed", "error"); }
    finally { setDownloading(null); }
  };

  const STATUS_OPTS = [{ value: "generating", label: "Generating" }, { value: "ready", label: "Ready" }, { value: "failed", label: "Failed" }];
  const TYPE_OPTS = [
    { value: "threat_hunt", label: "Threat Hunt" }, { value: "executive_summary", label: "Executive Summary" },
    { value: "ioc_report", label: "IoC Report" }, { value: "incident", label: "Incident" },
  ];

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Admin" title="Reports" subtitle="Generated PDF threat intelligence reports." />
      <Panel
        title={`${data.length} report${data.length !== 1 ? "s" : ""}`}
        actions={
          <div className="panel-actions-row">
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTS} placeholder="All statuses" />
            <FilterSelect value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTS} placeholder="All types" />
            <button className="portal-button portal-button--secondary" onClick={load}>Refresh</button>
          </div>
        }
      >
        {loading ? <LoadingState /> : error ? <ErrorState label="Could not load reports." detail={error} onRetry={load} /> :
          data.length === 0 ? <EmptyState label="No reports yet." detail="Reports are generated automatically at the end of a full hunt." /> : (
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
            <DetailRow label="Client" value={detail.client_id} mono />
            <DetailRow label="Hunting job" value={detail.hunting_job_id} mono />
            <DetailRow label="File size" value={fsize(detail.file_size_bytes)} />
            <DetailRow label="Period" value={detail.period_start && detail.period_end ? `${detail.period_start} → ${detail.period_end}` : "—"} />
            <DetailRow label="Created" value={fdt(detail.created_at)} />
            <DetailRow label="MinIO key" value={detail.minio_object_key} mono />
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

// ─── Platform ─────────────────────────────────────────────────────────────────
function IntegCard({ name, url, status, detail, linkHref }) {
  return (
    <div className={`integr-card integr-card--${status}`}>
      <div className="integr-card__header">
        <span className="integr-card__name">{name}</span>
        <span className={`integr-card__dot integr-card__dot--${status}`} />
      </div>
      <div className="integr-card__detail">{detail}</div>
      {linkHref && (
        <a className="integr-card__link" href={linkHref} target="_blank" rel="noreferrer">Open UI →</a>
      )}
    </div>
  );
}

function AdminPlatformView() {
  const [ollamaModels, setOllamaModels] = useState([]);
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL || ""}/metrics`).catch(() => {});
  }, []);

  const host = window.location.hostname;

  return (
    <div className="portal-page-grid">
      <PortalPageHeader eyebrow="Admin" title="Platform" subtitle="Integration status and external service links." />

      <div className="integr-grid">
        <IntegCard name="Backend API" status="ok" detail="FastAPI + SQLAlchemy async" />
        <IntegCard name="Elasticsearch" status="ok" detail="Search engine for logs & IoCs" linkHref={`http://${host}:9200`} />
        <IntegCard name="Kibana" status="ok" detail="Log visualization" linkHref={`http://${host}:5601`} />
        <IntegCard name="Logstash" status="ok" detail="Log ingestion pipeline" />
        <IntegCard name="MISP" status="ok" detail="Threat intelligence sharing" linkHref={`http://${host}:8081`} />
        <IntegCard name="OpenCTI" status="ok" detail="Cyber threat intelligence platform" linkHref={`http://${host}:8080`} />
        <IntegCard name="TheHive" status="ok" detail="Incident response platform (trial)" linkHref={`http://${host}:9000`} />
        <IntegCard name="Cortex" status="ok" detail="Observable analysis engine" linkHref={`http://${host}:9001`} />
        <IntegCard name="Grafana" status="ok" detail="Platform metrics dashboard" linkHref={`http://${host}:3001`} />
        <IntegCard name="Prometheus" status="ok" detail="Metrics collection" linkHref={`http://${host}:9090`} />
        <IntegCard name="MinIO" status="ok" detail="Object storage for reports" linkHref={`http://${host}:9101`} />
        <IntegCard name="RabbitMQ" status="ok" detail="Message broker" linkHref={`http://${host}:15672`} />
        <IntegCard name="Ollama" status="ok" detail="Local LLM (llama3.2 + mistral)" linkHref={`http://${host}:11434`} />
        <IntegCard name="Vault" status="ok" detail="Secrets management" linkHref={`http://${host}:8200`} />
      </div>

      <Panel title="Configuration notes" subtitle="Items requiring manual configuration">
        <div className="config-notes">
          <div className="config-note config-note--warn">
            <strong>MISP API key</strong> — Set <code>MISP_KEY</code> in <code>.env</code> with a valid MISP automation key to enable MISP intelligence sync.
          </div>
          <div className="config-note config-note--warn">
            <strong>TheHive license</strong> — TheHive 5.x is running on a 15-day platinum trial. Configure a license before it expires.
          </div>
          <div className="config-note config-note--warn">
            <strong>OpenCTI token</strong> — Set <code>OPENCTI_TOKEN</code> to a valid admin token to enable OpenCTI synchronization.
          </div>
          <div className="config-note config-note--info">
            <strong>OTX / Abuse.ch keys</strong> — Set <code>OTX_API_KEY</code> and <code>ABUSE_CH_AUTH_KEY</code> to enable those feeds.
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ─── Root portal ──────────────────────────────────────────────────────────────
export default function AdminPortal() {
  const navigate = useNavigate();
  const { section = "dashboard" } = useParams();
  const { role, user, logout } = useAuth();
  const [alertCount, setAlertCount] = useState(null);

  useEffect(() => {
    alerts.list({ status: "open" }).then((r) => setAlertCount(r.data.length)).catch(() => {});
  }, []);

  const items = ADMIN_ITEMS.map((item) =>
    item.key === "alerts" && alertCount ? { ...item, badge: alertCount, badgeTone: "red" } : item
  );

  const valid = items.some((i) => i.key === section);
  const active = valid ? section : "dashboard";

  if (role !== "admin_soc") return <Navigate to="/login" replace />;
  if (active !== section) return <Navigate to={`/admin/${active}`} replace />;

  const VIEWS = {
    dashboard: <AdminDashboardView navTo={(s) => navigate(`/admin/${s}`)} />,
    clients: <AdminClientsView />,
    sources: <AdminSourcesView />,
    collections: <AdminCollectionsView />,
    jobs: <AdminHuntingView />,
    iocs: <AdminIoCsView />,
    alerts: <AdminAlertsView />,
    reports: <AdminReportsView />,
    platform: <AdminPlatformView />,
  };

  return (
    <PortalShell
      title="Admin Workspace"
      subtitle="SOC operational command interface"
      role={role}
      user={user}
      items={items}
      activeKey={active}
      onNavigate={(s) => navigate(`/admin/${s}`)}
      onLogout={logout}
    >
      {VIEWS[active]}
    </PortalShell>
  );
}
