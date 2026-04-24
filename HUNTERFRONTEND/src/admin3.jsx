
// ═══════════════════════════════════════════════════════
//  ADMIN PAGE 3 — IoC · Alerts · Reports · Platform · Settings
// ═══════════════════════════════════════════════════════

// ── shared helpers ────────────────────────────────────────────────────────
function _a3FmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function _a3FmtDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toISOString().slice(0, 16).replace('T', ' ');
}
function _a3FmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toTimeString().slice(0, 5);
}
function _a3FmtBytes(n) {
  if (!n) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

const _A3_IOC_TYPE_LABELS = {
  ip: 'IP', domain: 'Domain', url: 'URL', md5: 'MD5', sha1: 'SHA1',
  sha256: 'SHA256', email: 'Email', filename: 'Filename', cve: 'CVE',
  mutex: 'Mutex', other: 'Other',
};
const _A3_SRC_LABELS = {
  otx: 'OTX', abuse_ch: 'Abuse.ch', circl: 'CIRCL', rss: 'RSS',
  misp_feed: 'MISP', secureworks: 'Secureworks', manual: 'Manual',
};
const _A3_IOC_TYPE_COLORS = {
  IP: 'ice', Domain: 'amber', URL: 'red', MD5: 'purple', SHA1: 'purple',
  SHA256: 'purple', Email: 'green', CVE: 'teal', Filename: 'amber', Mutex: 'gray', Other: 'gray',
};

function _adaptIoC3(r) {
  const enriched = !!(r.enrichment && Object.keys(r.enrichment).length > 0);
  return {
    _raw: r,
    id: 'IOC-' + String(r.id).slice(0, 6).toUpperCase(),
    fullId: r.id,
    value: r.value,
    norm: r.value_normalized,
    type: _A3_IOC_TYPE_LABELS[r.type] || r.type,
    sev: r.severity,
    conf: r.confidence,
    tlp: (r.tlp || '').toUpperCase(),
    src: _A3_SRC_LABELS[r.source_type] || r.source_type,
    first: _a3FmtDate(r.first_seen_at),
    last: _a3FmtDate(r.last_seen_at),
    job: r.hunting_job_id ? String(r.hunting_job_id).slice(0, 8) : '—',
    misp: enriched ? 'Synced' : 'Pending',
    octi: enriched ? 'Synced' : 'Pending',
    enriched,
    enrichmentData: r.enrichment || {},
    desc: r.description || 'No description available.',
    active: r.is_active,
  };
}

function _adaptAlert3(r, clientsById) {
  const clientName = (clientsById && r.client_id && clientsById[String(r.client_id)])
    || (String(r.client_id).slice(0, 8) + '…');
  return {
    _raw: r,
    id: 'ALT-' + String(r.id).slice(0, 6).toUpperCase(),
    fullId: r.id,
    sev: r.severity,
    client: clientName,
    title: r.title,
    asset: r.raw_log_ref ? r.raw_log_ref.slice(0, 32) : '—',
    created: _a3FmtTime(r.created_at),
    technique: r.mitre_technique_id || '—',
    hive: r.thehive_case_id || null,
    status: r.status,
    analyst: r.validated_by ? String(r.validated_by).slice(0, 8) : null,
    desc: r.description || '',
  };
}

function _adaptReport3(r, clientsById) {
  const typeMap = {
    threat_hunt: 'Hunt Report', executive_summary: 'Exec Summary',
    ioc_report: 'IoC Report', incident: 'Incident',
  };
  const clientName = (clientsById && r.client_id && clientsById[String(r.client_id)])
    || (String(r.client_id).slice(0, 8) + '…');
  let period = '—';
  if (r.period_start && r.period_end) {
    const s = new Date(r.period_start + 'T00:00:00');
    const e = new Date(r.period_end + 'T00:00:00');
    period = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + '–' + e.toLocaleDateString('en-US', { day: 'numeric' });
  }
  return {
    _raw: r,
    id: 'REP-' + String(r.id).slice(0, 6).toUpperCase(),
    fullId: r.id,
    type: typeMap[r.report_type] || r.report_type,
    client: clientName,
    status: r.status,
    period,
    size: _a3FmtBytes(r.file_size_bytes),
    created: _a3FmtDateTime(r.created_at),
    hunt: r.hunting_job_id ? String(r.hunting_job_id).slice(0, 8) : '—',
    title: r.title,
  };
}

// ── IOC CENTER ────────────────────────────────────────────────────────────
function IoCPage() {
  const [iocs, setIocs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [savedView, setSavedView] = React.useState(null);
  const [enriching, setEnriching] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await API.listIocs({ limit: 200 });
      const adapted = (data || []).map(_adaptIoC3);
      setIocs(adapted);
      if (window.__hunterSetBadges) window.__hunterSetBadges({ ioc: adapted.length });
    } catch (e) {
      setError(e.message || 'Failed to load IoCs');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleEnrich = async () => {
    if (!selected || enriching) return;
    setEnriching(true);
    try {
      const res = await API.enrichIoc(selected.fullId);
      const updatedRaw = Object.assign({}, selected._raw, { enrichment: res.enrichment });
      const updated = _adaptIoC3(updatedRaw);
      setIocs(prev => prev.map(ioc => String(ioc.fullId) === String(selected.fullId) ? updated : ioc));
      setSelected(updated);
    } catch (_) {}
    finally { setEnriching(false); }
  };

  const savedViews = [
    { id: 'high-risk',  label: 'High-risk IPs' },
    { id: 'unenriched', label: 'Unenriched IoCs' },
    { id: 'cves',       label: 'Recent CVEs' },
    { id: 'redamber',   label: 'RED / AMBER only' },
  ];

  const rows = iocs.filter(i => {
    if (search && !i.value.toLowerCase().includes(search.toLowerCase()) && !i.type.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'critical' && i.sev !== 'critical') return false;
    if (filter === 'high' && i.sev !== 'high') return false;
    if (filter === 'unenriched' && i.enriched) return false;
    if (savedView === 'high-risk' && i.type !== 'IP') return false;
    if (savedView === 'unenriched' && i.enriched) return false;
    if (savedView === 'cves' && i.type !== 'CVE') return false;
    if (savedView === 'redamber' && i.tlp !== 'RED' && i.tlp !== 'AMBER') return false;
    return true;
  });

  return (
    <div className="fadeUp">
      <PageHdr title="IoC Center" sub="Analyst workstation — Indicators of Compromise registry and enrichment"
        tag={<Badge color="teal">{iocs.length} indicators</Badge>}
        actions={<><Btn variant="secondary" size="sm" icon={<Icon d={ICONS.shield} size={13}/>}>Bulk Enrich</Btn>
          <Btn variant="primary" size="sm" icon={<Icon d={ICONS.plus} size={13}/>}>Add IoC</Btn></>}/>

      <div style={{ padding: '16px 28px' }}>
        {/* Saved views */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 11.5, color: 'var(--t3)', marginRight: 4 }}>Saved views:</span>
          {savedViews.map(v => (
            <button key={v.id} onClick={() => setSavedView(savedView === v.id ? null : v.id)}
              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                background: savedView === v.id ? 'var(--purplebg)' : 'transparent',
                color: savedView === v.id ? 'var(--purple)' : 'var(--t3)',
                border: `1px solid ${savedView === v.id ? 'rgba(167,139,250,.3)' : 'var(--b1)'}`, transition: 'all .13s' }}>
              {v.label}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <FilterBar filters={[{ id: 'critical', label: 'Critical' }, { id: 'high', label: 'High' }, { id: 'unenriched', label: 'Unenriched' }]}
            active={filter} onChange={setFilter} searchValue={search} onSearch={setSearch}/>
        </div>
        {loading ? (
          [1,2,3,4,5,6].map(i => <Skeleton key={i} height={44}/>)
        ) : error ? (
          <ErrorBanner title="Failed to load IoCs" body={error} onRetry={load}/>
        ) : rows.length === 0 ? (
          <EmptyState icon="🛡" title="No indicators found" body="Adjust your filters or run a new hunt job to populate this view."/>
        ) : (
          <Card pad={0}>
            <DataTable onRowClick={setSelected}
              columns={[
                { key: 'value',    label: 'Indicator',  render: (v) => <Mono small>{v.length > 38 ? v.slice(0, 38) + '…' : v}</Mono> },
                { key: 'type',     label: 'Type',        render: (v) => <Badge color={_A3_IOC_TYPE_COLORS[v] || 'gray'}>{v}</Badge> },
                { key: 'sev',      label: 'Severity',    render: (v) => <Sev level={v}/> },
                { key: 'conf',     label: 'Confidence',  render: (v) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 40, height: 3, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${v}%`, height: '100%', background: v > 80 ? 'var(--green)' : v > 60 ? 'var(--amber)' : 'var(--red)' }}/>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--t2)' }}>{v}%</span>
                  </div>
                )},
                { key: 'tlp',      label: 'TLP',         render: (v) => <TLP level={v}/> },
                { key: 'src',      label: 'Source',       render: (v) => <Badge color="gray">{v}</Badge> },
                { key: 'last',     label: 'Last Seen',    render: (v) => <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'IBM Plex Mono' }}>{v}</span> },
                { key: 'misp',     label: 'MISP',         render: (v) => <Badge color={v === 'Synced' ? 'green' : 'amber'}>{v}</Badge> },
                { key: 'enriched', label: 'Enriched',     render: (v) => v ? <Badge color="green">Yes</Badge> : <Badge color="gray">No</Badge> },
              ]} rows={rows}/>
          </Card>
        )}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} width={560}
        title="IoC Detail" subtitle={selected?.type}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 14, background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--b2)', fontFamily: 'IBM Plex Mono', fontSize: 13, wordBreak: 'break-all', color: 'var(--tmono)' }}>{selected.value}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Sev level={selected.sev}/>
              <TLP level={selected.tlp}/>
              <Badge color={_A3_IOC_TYPE_COLORS[selected.type] || 'gray'}>{selected.type}</Badge>
              {selected.enriched && <Badge color="green">Enriched</Badge>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, background: 'var(--bg3)', padding: 12, borderRadius: 8, border: '1px solid var(--b1)' }}>{selected.desc}</div>

            <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Provenance</div>
              {[
                ['Origin source', selected.src],
                ['Ingest job',    selected.job],
                ['First seen',    selected.first],
                ['Last seen',     selected.last],
                ['Confidence',    `${selected.conf}%`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--b1)' }}>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>{l}</span>
                  <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono', color: 'var(--t1)' }}>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <Badge color="green">Source active</Badge>
                <Badge color="gray">Feed: {selected.src}</Badge>
              </div>
            </div>

            {selected.enriched && Object.keys(selected.enrichmentData).length > 0 && (
              <div>
                <SectionHdr title="Enrichment Results"/>
                {Object.entries(selected.enrichmentData).slice(0, 6).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--b1)' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--t2)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--teal)', fontFamily: 'IBM Plex Mono', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {[
              ['MISP sync',    selected.misp],
              ['OpenCTI sync', selected.octi],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--b1)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{l}</span>
                <span style={{ fontSize: 12.5, fontFamily: 'IBM Plex Mono', color: 'var(--t1)' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" variant="primary" icon={<Icon d={ICONS.shield} size={12}/>} onClick={handleEnrich} disabled={enriching}>
                {enriching ? 'Enriching…' : 'Enrich IoC'}
              </Btn>
              <Btn size="sm" variant="secondary">MISP Push</Btn>
              <Btn size="sm" variant="secondary" onClick={() => navigator.clipboard && navigator.clipboard.writeText(selected.value)}>Copy Value</Btn>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── ALERTS PAGE ────────────────────────────────────────────────────────────
function AlertsPage() {
  const [alerts, setAlerts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState(null);
  const [view, setView] = React.useState('list');
  const [updating, setUpdating] = React.useState(false);
  const clientsRef = React.useRef({});

  const statuses = ['open', 'investigating', 'resolved', 'false_positive'];
  const statusColors = { open: 'ice', investigating: 'amber', resolved: 'green', false_positive: 'gray' };

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alertData, clientData] = await Promise.all([
        API.listAlerts(),
        API.listClients({ limit: 200 }),
      ]);
      const byId = {};
      (clientData || []).forEach(c => { byId[String(c.id)] = c.name; });
      clientsRef.current = byId;
      const adapted = (alertData || []).map(a => _adaptAlert3(a, byId));
      setAlerts(adapted);
      const openCount = adapted.filter(a => a.status === 'open').length;
      if (window.__hunterSetBadges) window.__hunterSetBadges({ alerts: openCount });
    } catch (e) {
      setError(e.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleStatus = async (newStatus) => {
    if (!selected || updating) return;
    setUpdating(true);
    try {
      const res = await API.updateAlert(selected.fullId, { status: newStatus });
      const updated = _adaptAlert3(res, clientsRef.current);
      const updatedAlerts = alerts.map(a => String(a.fullId) === String(selected.fullId) ? updated : a);
      setAlerts(updatedAlerts);
      setSelected(updated);
      const openCount = updatedAlerts.filter(a => a.status === 'open').length;
      if (window.__hunterSetBadges) window.__hunterSetBadges({ alerts: openCount });
    } catch (_) {}
    finally { setUpdating(false); }
  };

  const filtered = filter ? alerts.filter(a => a.status === filter || a.sev === filter) : alerts;

  return (
    <div className="fadeUp">
      <PageHdr title="Alerts & Cases" sub="SOC triage queue — TheHive integrated"
        tag={<Badge color="red">{alerts.filter(a => a.status === 'open' || a.status === 'investigating').length} active</Badge>}
        actions={<><Btn variant="secondary" size="sm">Bulk Assign</Btn>
          <Btn variant="primary" size="sm" icon={<Icon d={ICONS.plus} size={13}/>}>Create Case</Btn></>}/>

      {!loading && !error && (
        <div style={{ padding: '16px 28px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {statuses.map(s => (
            <div key={s} onClick={() => setFilter(filter === s ? null : s)}
              style={{ padding: '14px 16px', background: 'var(--bg3)', border: `1px solid ${filter === s ? 'var(--bacc)' : 'var(--b1)'}`, borderRadius: 9, cursor: 'pointer', transition: 'all .14s' }}>
              <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{s.replace('_', ' ')}</div>
              <div style={{ fontFamily: 'Space Grotesk', fontSize: 24, fontWeight: 700, color: `var(--${statusColors[s]})` }}>
                {alerts.filter(a => a.status === s).length}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '16px 28px' }}>
        {loading ? (
          [1,2,3,4,5,6].map(i => <Skeleton key={i} height={44}/>)
        ) : error ? (
          <ErrorBanner title="Failed to load alerts" body={error} onRetry={load}/>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <FilterBar filters={[
                { id: 'critical',     label: 'Critical' },
                { id: 'high',         label: 'High' },
                { id: 'open',         label: 'Open' },
                { id: 'investigating',label: 'Investigating' },
              ]} active={filter} onChange={setFilter}/>
              <div style={{ display: 'flex', gap: 6 }}>
                {['list', 'kanban'].map(v => (
                  <button key={v} onClick={() => setView(v)}
                    style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      background: view === v ? 'var(--tealbg)' : 'var(--bg3)', color: view === v ? 'var(--teal)' : 'var(--t2)',
                      border: `1px solid ${view === v ? 'var(--bacc)' : 'var(--b2)'}`, transition: 'all .13s', textTransform: 'capitalize' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {view === 'list' ? (
              filtered.length === 0 ? (
                <EmptyState icon="🔔" title="No alerts match this filter" body="Try clearing the filter or running a correlation job."/>
              ) : (
                <Card pad={0}>
                  <DataTable onRowClick={setSelected}
                    columns={[
                      { key: 'sev',       label: 'Sev',      render: (v) => <Sev level={v} compact/> },
                      { key: 'id',        label: 'Alert ID',  render: (v) => <Mono small>{v}</Mono> },
                      { key: 'title',     label: 'Title',     render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
                      { key: 'client',    label: 'Client',    render: (v) => <Badge color="gray">{v}</Badge> },
                      { key: 'asset',     label: 'Log Ref',   render: (v) => <Mono small>{v}</Mono> },
                      { key: 'technique', label: 'MITRE',     render: (v) => <Mono small>{v}</Mono> },
                      { key: 'created',   label: 'Time',      render: (v) => <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'IBM Plex Mono' }}>{v}</span> },
                      { key: 'status',    label: 'Status',    render: (v) => <Badge color={statusColors[v]}>{v.replace('_', ' ')}</Badge> },
                      { key: 'hive',      label: 'Case',      render: (v) => v ? <Mono small>{v}</Mono> : <span style={{ color: 'var(--t3)', fontSize: 11 }}>None</span> },
                    ]} rows={filtered}/>
                </Card>
              )
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                {statuses.map(s => (
                  <div key={s}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: `var(--${statusColors[s]})`, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--${statusColors[s]})`, flexShrink: 0 }}/>
                      {s.replace('_', ' ')} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>({alerts.filter(a => a.status === s).length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {alerts.filter(a => a.status === s).map(a => (
                        <div key={String(a.fullId)} onClick={() => setSelected(a)}
                          style={{ padding: 12, background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 8, cursor: 'pointer', transition: 'all .14s',
                            borderLeft: `3px solid var(--${a.sev === 'critical' ? 'red' : a.sev === 'high' ? 'amber' : 'ice'})` }}>
                          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--t3)', marginBottom: 4 }}>{a.id}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 6, lineHeight: 1.4 }}>{a.title}</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Sev level={a.sev}/><Badge color="gray">{a.client}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} width={580}
        title={selected?.id} subtitle={selected?.title}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Sev level={selected.sev}/>
              <Badge color={statusColors[selected.status]}>{selected.status.replace('_', ' ')}</Badge>
              <Badge color="gray">{selected.client}</Badge>
              {selected.hive && <Mono small>{selected.hive}</Mono>}
            </div>
            <div style={{ padding: 14, background: 'var(--redbg)', border: '1px solid rgba(240,69,101,.25)', borderRadius: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--red)', marginBottom: 6 }}>Detection Summary</div>
              <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.7 }}>
                {selected.desc || `Suspicious activity detected on ${selected.asset}. MITRE: ${selected.technique}. Immediate investigation recommended.`}
              </div>
            </div>
            {[
              ['Alert ID',        <Mono>{selected.id}</Mono>],
              ['Client',          selected.client],
              ['Log Reference',   <Mono small>{selected.asset}</Mono>],
              ['MITRE Technique', <Mono small>{selected.technique}</Mono>],
              ['Detected',        <Mono small>{selected.created}</Mono>],
              ['TheHive Case',    selected.hive ? <Mono>{selected.hive}</Mono> : <span style={{ color: 'var(--t3)' }}>Not created</span>],
              ['Analyst',         selected.analyst || <span style={{ color: 'var(--t3)' }}>Unassigned</span>],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--b1)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{l}</span>{v}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selected.status === 'open' && (
                <Btn size="sm" variant="primary" onClick={() => handleStatus('investigating')} disabled={updating}>
                  {updating ? <Spinner size={13} color="#fff"/> : 'Assign to Me'}
                </Btn>
              )}
              {selected.status === 'investigating' && (
                <Btn size="sm" variant="outline" onClick={() => handleStatus('resolved')} disabled={updating}>
                  {updating ? <Spinner size={13} color="var(--teal)"/> : 'Validate'}
                </Btn>
              )}
              {(selected.status === 'open' || selected.status === 'investigating') && (
                <Btn size="sm" variant="danger" onClick={() => handleStatus('false_positive')} disabled={updating}>False Positive</Btn>
              )}
              <Btn size="sm" variant="secondary">Create Case</Btn>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── REPORT PREVIEW ────────────────────────────────────────────────────────
function ReportPreview({ report }) {
  const sections = [
    { title: 'Executive Summary', body: `During the period ${report.period}, the HUNTER platform conducted automated threat intelligence hunts. Findings were compiled for ${report.client}.` },
    { title: 'Critical Findings', body: 'Indicators of Compromise were analyzed and correlated against client telemetry. Relevant findings are detailed in the technical appendix.' },
    { title: 'Threat Actor Context', body: 'Activity patterns are consistent with known threat actor TTPs. MITRE ATT&CK techniques observed are documented in the linked hunt job.' },
    { title: 'Recommendations', body: '1. Review all open alerts in the triage queue. 2. Update firewall rules to block identified C2 infrastructure. 3. Reset credentials on affected accounts.' },
  ];
  return (
    <div style={{ background: 'var(--bg0)', border: '1px solid var(--b1)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(135deg,var(--bg3),var(--bg4))', padding: '24px 28px', borderBottom: '1px solid var(--b1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,var(--teal),var(--ice))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={ICONS.target} size={18} col="#fff"/>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>HUNTER Platform</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Threat Intelligence Report</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Client: <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{report.client}</span></div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Period: <span style={{ color: 'var(--t1)' }}>{report.period}</span></div>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>Generated: <span style={{ color: 'var(--t1)' }}>{report.created}</span></div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <Badge color="teal">{report.type}</Badge>
          <TLP level="AMBER"/>
          {report.status === 'ready' && <Badge color="green">Ready</Badge>}
        </div>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 280, overflowY: 'auto' }}>
        {sections.map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>{s.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.7 }}>{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsPage() {
  const [reports, setReports] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState(null);
  const [downloading, setDownloading] = React.useState(false);
  const clientsRef = React.useRef({});

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [repData, clientData] = await Promise.all([
        API.listReports({ limit: 100 }),
        API.listClients({ limit: 200 }),
      ]);
      const byId = {};
      (clientData || []).forEach(c => { byId[String(c.id)] = c.name; });
      clientsRef.current = byId;
      const adapted = (repData || []).map(r => _adaptReport3(r, byId));
      setReports(adapted);
    } catch (e) {
      setError(e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleDownload = async (r, e) => {
    if (e) e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      const data = await API.getReportDownload(r.fullId);
      if (data && data.download_url) window.open(data.download_url, '_blank');
    } catch (_) {}
    finally { setDownloading(false); }
  };

  const filtered = filter ? reports.filter(r => r.status === filter || r.type === filter) : reports;

  return (
    <div className="fadeUp">
      <PageHdr title="Reports" sub="Hunt report library — executive summaries and technical analyses"
        tag={<Badge color="green">{reports.filter(r => r.status === 'ready').length} ready</Badge>}
        actions={<Btn variant="primary" size="sm" icon={<Icon d={ICONS.plus} size={13}/>}>Generate Report</Btn>}/>
      <div style={{ padding: '16px 28px' }}>
        {loading ? (
          [1,2,3,4].map(i => <Skeleton key={i} height={80}/>)
        ) : error ? (
          <ErrorBanner title="Failed to load reports" body={error} onRetry={load}/>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <FilterBar filters={[
                { id: 'ready',        label: 'Ready' },
                { id: 'generating',   label: 'Generating' },
                { id: 'failed',       label: 'Failed' },
                { id: 'Exec Summary', label: 'Exec Summary' },
                { id: 'Hunt Report',  label: 'Hunt Report' },
              ]} active={filter} onChange={setFilter}/>
            </div>
            {filtered.length === 0 ? (
              <EmptyState icon="📄" title="No reports found" body="Generate a report from a completed hunt job to see it here."/>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map(r => (
                  <div key={String(r.fullId)} onClick={() => setSelected(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
                      background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 10, cursor: 'pointer', transition: 'all .14s' }}>
                    <div style={{ width: 40, height: 48, borderRadius: 6,
                      background: r.status === 'ready' ? 'var(--greenbg)' : r.status === 'generating' ? 'var(--tealbg)' : 'var(--redbg)',
                      border: `1px solid ${r.status === 'ready' ? 'rgba(18,196,146,.3)' : r.status === 'generating' ? 'var(--bacc)' : 'rgba(240,69,101,.3)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon d={ICONS.reports} size={18} col={r.status === 'ready' ? 'var(--green)' : r.status === 'generating' ? 'var(--teal)' : 'var(--red)'}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.title}</span>
                        <Badge color={r.type === 'Exec Summary' ? 'ice' : 'teal'}>{r.type}</Badge>
                        <Badge color={r.status === 'ready' ? 'green' : r.status === 'generating' ? 'amber' : 'red'}>{r.status}</Badge>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>{r.client} · {r.period}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'IBM Plex Mono', marginBottom: 4 }}>{r.size}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>{r.created}</div>
                    </div>
                    {r.status === 'ready' && (
                      <Btn size="sm" variant="outline" icon={<Icon d={ICONS.download} size={12}/>} onClick={(e) => handleDownload(r, e)}>Download</Btn>
                    )}
                    {r.status === 'generating' && <Spinner size={18}/>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <Drawer open={!!selected} onClose={() => setSelected(null)} width={540}
        title={selected?.id} subtitle={selected ? `${selected.client} · ${selected.period}` : ''}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Badge color={selected.type === 'Exec Summary' ? 'ice' : 'teal'}>{selected.type}</Badge>
              <Badge color={selected.status === 'ready' ? 'green' : selected.status === 'generating' ? 'amber' : 'red'}>{selected.status}</Badge>
            </div>
            {selected.status === 'ready' ? (
              <ReportPreview report={selected}/>
            ) : selected.status === 'generating' ? (
              <div style={{ height: 180, background: 'var(--bg0)', borderRadius: 10, border: '1px solid var(--b2)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Spinner size={28}/>
                <div style={{ fontSize: 13, color: 'var(--t2)', fontWeight: 500 }}>Generating report…</div>
                <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>Pulling findings from hunt {selected.hunt}</div>
              </div>
            ) : (
              <ErrorBanner title="Report generation failed" body="An error occurred. You can retry or check the linked hunt job for details."/>
            )}
            {[
              ['Report ID',  <Mono>{selected.id}</Mono>],
              ['Client',     selected.client],
              ['Type',       selected.type],
              ['Period',     selected.period],
              ['Size',       selected.size],
              ['Created',    <Mono small>{selected.created}</Mono>],
              ['Hunt Job',   <Mono small>{selected.hunt}</Mono>],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--b1)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{l}</span>{v}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              {selected.status === 'ready' && (
                <Btn size="sm" variant="primary" icon={<Icon d={ICONS.download} size={12}/>}
                  onClick={() => handleDownload(selected)} disabled={downloading}>
                  {downloading ? 'Downloading…' : 'Download PDF'}
                </Btn>
              )}
              <Btn size="sm" variant="secondary">Share Link</Btn>
              <Btn size="sm" variant="secondary">Regenerate</Btn>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── PLATFORM PAGE ──────────────────────────────────────────────────────────
const PLATFORM_SERVICES = [
  { name:'MISP',          cat:'Intel',   status:'healthy', latency:'12ms', lastSync:'08:47', uptime:99.9, err:null,  spark:[100,100,99,100,100,99,99.9], failRate:0   },
  { name:'OpenCTI',       cat:'Intel',   status:'healthy', latency:'28ms', lastSync:'08:42', uptime:99.7, err:null,  spark:[100,99,100,100,99,100,99.7], failRate:0   },
  { name:'Elasticsearch', cat:'Storage', status:'healthy', latency:'6ms',  lastSync:'live',  uptime:100,  err:null,  spark:[100,100,100,100,100,100,100],failRate:0   },
  { name:'MinIO',         cat:'Storage', status:'healthy', latency:'8ms',  lastSync:'live',  uptime:100,  err:null,  spark:[100,100,100,100,100,100,100],failRate:0   },
  { name:'Vault',         cat:'Secrets', status:'healthy', latency:'4ms',  lastSync:'live',  uptime:100,  err:null,  spark:[100,100,100,100,100,100,100],failRate:0   },
  { name:'TheHive',       cat:'Cases',   status:'offline', latency:'—',    lastSync:'06:12', uptime:94.2, err:'Connection refused on port 9000', spark:[100,100,98,80,40,0,0], failRate:100 },
  { name:'OpenVAS',       cat:'Scan',    status:'healthy', latency:'44ms', lastSync:'07:00', uptime:99.1, err:null,  spark:[99,100,99,100,98,99,99.1],   failRate:0   },
  { name:'Secureworks',   cat:'EDR',     status:'healthy', latency:'120ms',lastSync:'08:35', uptime:99.5, err:null,  spark:[100,99,100,99,100,99,99.5],  failRate:0   },
  { name:'Redis',         cat:'Cache',   status:'healthy', latency:'2ms',  lastSync:'live',  uptime:100,  err:null,  spark:[100,100,100,100,100,100,100],failRate:0   },
  { name:'PostgreSQL',    cat:'DB',      status:'healthy', latency:'5ms',  lastSync:'live',  uptime:100,  err:null,  spark:[100,100,100,100,100,100,100],failRate:0   },
  { name:'Prometheus',    cat:'Monitor', status:'healthy', latency:'18ms', lastSync:'live',  uptime:99.8, err:null,  spark:[100,100,99,100,100,99,99.8], failRate:0   },
  { name:'Grafana',       cat:'Monitor', status:'warning', latency:'340ms',lastSync:'08:10', uptime:98.3, err:'High query latency detected', spark:[100,99,98,96,95,97,98.3], failRate:4 },
];

function PlatformPage() {
  const cats = [...new Set(PLATFORM_SERVICES.map(s => s.cat))];
  const depFlow = [
    { stage:'Ingest',     services:['AlienVault OTX','Abuse.ch','CIRCL','Secureworks'] },
    { stage:'Process',    services:['Elasticsearch','Redis','NLP Engine'] },
    { stage:'Correlate',  services:['MISP','OpenCTI','OpenVAS'] },
    { stage:'Case',       services:['TheHive','Vault'] },
    { stage:'Report',     services:['MinIO','PostgreSQL','Grafana'] },
  ];

  return (
    <div className="fadeUp">
      <PageHdr title="Platform & Integrations" sub="Control plane — stack health and service dependency map"
        actions={<><Btn variant="secondary" size="sm" icon={<Icon d={ICONS.refresh} size={13}/>}>Refresh All</Btn>
          <Btn variant="primary" size="sm" icon={<Icon d={ICONS.activity} size={13}/>}>Run Diagnostics</Btn></>}/>
      <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {cats.map(cat => (
          <div key={cat}>
            <SectionHdr title={cat} sub={`${PLATFORM_SERVICES.filter(s => s.cat === cat && s.status === 'healthy').length}/${PLATFORM_SERVICES.filter(s => s.cat === cat).length} healthy`}/>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {PLATFORM_SERVICES.filter(s => s.cat === cat).map(s => (
                <Card key={s.name} style={{ borderTop: `2px solid ${s.status === 'healthy' ? 'var(--green)' : s.status === 'warning' ? 'var(--amber)' : 'var(--red)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                    <StatusDot status={s.status}/>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    {[['Latency',s.latency],['Last Sync',s.lastSync],['Uptime',`${s.uptime}%`],['24h Err',`${s.failRate}%`]].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 12, fontFamily: 'IBM Plex Mono', color: 'var(--t1)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <Sparkline data={s.spark} color={s.status === 'healthy' ? 'var(--green)' : s.status === 'warning' ? 'var(--amber)' : 'var(--red)'} width={160} height={24} fill={true}/>
                  {s.err && <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--amber)', background: 'var(--amberbg)', padding: '6px 10px', borderRadius: 5 }}>⚠ {s.err}</div>}
                </Card>
              ))}
            </div>
          </div>
        ))}

        <div>
          <SectionHdr title="Service Dependency Flow" sub="Ingest → Process → Correlate → Case → Report"/>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflow: 'auto', padding: '20px 10px' }}>
              {depFlow.map((stage, i) => (
                <React.Fragment key={stage.stage}>
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 130 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>{stage.stage}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {stage.services.map(sv => {
                        const svc = PLATFORM_SERVICES.find(s => s.name === sv) || { status: 'healthy' };
                        return (
                          <div key={sv} style={{ padding: '6px 10px', background: 'var(--bg2)',
                            border: `1px solid ${svc.status === 'healthy' ? 'var(--bacc)' : svc.status === 'warning' ? 'rgba(244,162,14,.3)' : 'rgba(240,69,101,.3)'}`,
                            borderRadius: 6, fontSize: 11.5, fontWeight: 500 }}>
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                              background: svc.status === 'healthy' ? 'var(--green)' : svc.status === 'warning' ? 'var(--amber)' : 'var(--red)',
                              marginRight: 6, verticalAlign: 'middle' }}/>
                            {sv}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {i < depFlow.length - 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', marginTop: 22, flexShrink: 0 }}>
                      <div style={{ width: 30, height: 1, background: 'var(--b2)' }}/>
                      <span style={{ fontSize: 14, color: 'var(--t3)' }}>›</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS PAGE ──────────────────────────────────────────────────────────
function SettingsPage() {
  const [tab, setTab] = React.useState('profile');
  const [notifEmail, setNotifEmail] = React.useState(true);
  const [notifSlack, setNotifSlack] = React.useState(false);
  const [density, setDensity] = React.useState('comfortable');

  const user = window.__hunterUser || {};
  const userEmail = user.email || 'admin@hunter.soc';
  const userInitials = userEmail.slice(0, 2).toUpperCase();
  const userRole = user.role === 'admin_soc' ? 'SOC Admin' : 'Client Portal';

  return (
    <div className="fadeUp">
      <PageHdr title="Settings" sub="Platform preferences and administrator configuration"/>
      <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[['profile','Profile'],['notifications','Notifications'],['appearance','Appearance'],['security','Security & RBAC'],['audit','Audit Log']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: '8px 12px', borderRadius: 7, textAlign: 'left', fontSize: 13, fontWeight: tab === id ? 600 : 400,
                background: tab === id ? 'var(--tealbg)' : 'transparent', color: tab === id ? 'var(--teal)' : 'var(--t2)',
                border: `1px solid ${tab === id ? 'var(--bacc)' : 'transparent'}`, cursor: 'pointer', transition: 'all .13s' }}>{label}</button>
          ))}
        </div>
        <Card>
          {tab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8, paddingBottom: 16, borderBottom: '1px solid var(--b1)' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#0dbab5,#5ba4f5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>{userInitials}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{userEmail}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>{userRole} · {userEmail}</div>
                </div>
              </div>
              <Inp label="Email" value={userEmail} onChange={() => {}} type="email"/>
              <Inp label="Role" value={userRole} onChange={() => {}}/>
              <Sel label="Default Dashboard" value="dashboard" onChange={() => {}} options={['SOC Overview','Launch Center','IoC Center']}/>
              <Btn variant="primary">Save Changes</Btn>
            </div>
          )}
          {tab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
              <SectionHdr title="Notification Channels"/>
              {[['Email Alerts', notifEmail, setNotifEmail], ['Slack Webhook', notifSlack, setNotifSlack]].map(([l, v, s]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--b1)' }}>
                  <span style={{ fontSize: 13.5 }}>{l}</span>
                  <div onClick={() => s(!v)}
                    style={{ width: 42, height: 24, borderRadius: 12, background: v ? 'var(--teal)' : 'var(--bg4)', border: '1px solid var(--b2)', position: 'relative', cursor: 'pointer', transition: 'all .2s' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: v ? 20 : 2, transition: 'left .2s' }}/>
                  </div>
                </div>
              ))}
              <SectionHdr title="Alert Thresholds"/>
              <Sel label="Notify on severity ≥" value="high" onChange={() => {}} options={['Critical only','High and above','Medium and above','All alerts']}/>
            </div>
          )}
          {tab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
              <Sel label="UI Density" value={density} onChange={setDensity} options={[{value:'compact',label:'Compact'},{value:'comfortable',label:'Comfortable'},{value:'spacious',label:'Spacious'}]}/>
              <Sel label="Default Table Page Size" value="25" onChange={() => {}} options={['10','25','50','100']}/>
              <Sel label="Date Format" value="iso" onChange={() => {}} options={[{value:'iso',label:'ISO 8601 (2026-04-21)'},{value:'us',label:'US (04/21/2026)'},{value:'eu',label:'EU (21/04/2026)'}]}/>
            </div>
          )}
          {tab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              {[
                ['RBAC Scope',    user.role || 'N/A'],
                ['MFA Status',    'Enabled (TOTP)'],
                ['Session Timeout','8 hours'],
                ['Last Login',    'Current session'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid var(--b1)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{l}</span>
                  <span style={{ fontSize: 12.5, fontFamily: 'IBM Plex Mono', color: 'var(--t1)' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'audit' && (
            <div>
              <SectionHdr title="Audit Log" sub="Recent admin actions"/>
              <Timeline events={[
                { title: 'Logged in to admin portal', time: _a3FmtDateTime(new Date().toISOString()), color: 'var(--teal)' },
                { title: 'Session active', time: _a3FmtDateTime(new Date().toISOString()), color: 'var(--t3)' },
              ]}/>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { IoCPage, AlertsPage, ReportsPage, PlatformPage, SettingsPage });