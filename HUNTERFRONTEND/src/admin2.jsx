
// ═══════════════════════════════════════════════════════
//  ADMIN PAGE 2 — Clients · Sources · Collections · Jobs
// ═══════════════════════════════════════════════════════

// ── Shared data-adapter helpers ───────────────────────────────────────────

function _fmtTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return iso.slice(11, 16) || '—'; }
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try { return iso.slice(0, 10); } catch (_) { return '—'; }
}

function _fmtDuration(startIso, endIso) {
  if (!startIso) return '—';
  if (!endIso) return 'ongoing';
  try {
    const ms = new Date(endIso) - new Date(startIso);
    const s = Math.floor(Math.abs(ms) / 1000);
    return Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's';
  } catch (_) { return '—'; }
}

function _fmtBytes(bytes) {
  if (!bytes) return '—';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// Build an id→{name,…} lookup from an array
function _byId(arr) {
  const map = {};
  (arr || []).forEach(item => { if (item && item.id) map[item.id] = item; });
  return map;
}

function _adaptClient(c) {
  const typeMap = { openvas: 'VPN', secureworks: 'API', onpremise: 'SSH' };
  return {
    id: c.id,
    name: c.name,
    type: typeMap[c.connection_type] || 'API',
    ip: c.vpn_ip || '—',
    active: c.is_active,
    health: c.is_active ? 'healthy' : 'offline',
    lastHunt: _fmtDate(c.created_at),
    lastReport: '—',
    alerts: 0,
    critical: 0,
    users: 0,
    riskScore: 0,
    env: c.connection_type || '—',
    _raw: c,
  };
}

function _adaptSource(s) {
  const fails = s.consecutive_failures || 0;
  const health = !s.is_active ? 'offline' : fails > 0 ? 'warning' : 'healthy';
  const typeDisplayMap = {
    rss: 'RSS', misp_feed: 'MISP', otx: 'OTX',
    abuse_ch: 'Abuse.ch', circl: 'CIRCL', secureworks: 'API', manual: 'Manual',
  };
  return {
    id: s.id,
    name: s.name,
    type: typeDisplayMap[s.type] || s.type || '—',
    url: s.url || '—',
    interval: (s.polling_interval_minutes || 60) + 'm',
    auth: !!s.api_key_vault_path,
    active: s.is_active,
    lastPoll: _fmtTime(s.last_polled_at),
    quality: fails > 5 ? 'Low' : fails > 0 ? 'Medium' : 'High',
    health: health,
    items: 0,
    uptime: fails > 0 ? 90 : 99.9,
    uptimeSpark: [100, 100, 100, 100, 100, 100, fails > 0 ? 90 : 99.9],
    failRate24h: fails > 0 ? 100 : 0,
    _raw: s,
  };
}

function _adaptCollection(c, sourcesById) {
  const summary = c.result_summary || {};
  const statusMap = { success: 'completed', failed: 'failed', running: 'running', pending: 'pending' };
  return {
    id: c.id.slice(0, 8).toUpperCase(),
    source: (sourcesById[c.source_id] || {}).name || '—',
    by: c.initiated_by ? 'User' : 'System',
    created: _fmtTime(c.created_at),
    start: _fmtTime(c.started_at),
    end: _fmtTime(c.finished_at),
    items: summary.items_processed || summary.items_collected || 0,
    iocs: summary.iocs_extracted || summary.ioc_count || 0,
    misp: summary.misp_synced ? 'Synced' : 'Pending',
    octi: summary.octi_synced ? 'Synced' : 'Pending',
    status: statusMap[c.status] || c.status || 'pending',
    _raw: c,
  };
}

function _adaptJob(j, clientsById) {
  const statusMap = {
    success: 'completed', failed: 'failed', running: 'running',
    pending: 'pending', cancelled: 'cancelled',
  };
  const result = j.result_summary || {};
  return {
    id: j.id.slice(0, 8).toUpperCase(),
    type: j.type || 'full_hunt',
    client: (clientsById[j.client_id] || {}).name || '—',
    source: j.source_id ? j.source_id.slice(0, 6) : '—',
    status: statusMap[j.status] || j.status,
    created: _fmtTime(j.created_at),
    runtime: _fmtDuration(j.started_at, j.finished_at),
    iocs: result.iocs_extracted !== undefined ? result.iocs_extracted : '—',
    alerts: result.alerts_created !== undefined ? result.alerts_created : '—',
    report: !!result.report_id,
    _raw: j,
  };
}

// ── TYPE BADGE ────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const colMap = {
    VPN: 'ice', API: 'teal', SSH: 'amber',
    OTX: 'ice', 'Abuse.ch': 'red', MISP: 'purple', RSS: 'gray',
    full_hunt: 'teal', 'Full Hunt': 'teal',
    enrich: 'purple', 'IoC Enrich': 'purple',
    collection: 'ice', Collection: 'ice',
    telemetry: 'amber', Telemetry: 'amber',
    report: 'green', 'Report Gen': 'green',
  };
  return <Badge color={colMap[type] || 'gray'}>{type}</Badge>;
}

// ── CLIENTS LIST ──────────────────────────────────────────────────────────
function ClientsList() {
  const [clients,  setClients]  = React.useState([]);
  const [loading,  setLoading]  = React.useState(true);
  const [error,    setError]    = React.useState(null);
  const [search,   setSearch]   = React.useState('');
  const [filter,   setFilter]   = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [view,     setView]     = React.useState('table');

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await API.listClients({ limit: 200 });
      const adapted = (data || []).map(_adaptClient);
      setClients(adapted);
      window.__hunterSetBadges?.({ clients: adapted.length });
    } catch (err) {
      setError(err.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = clients.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.ip.includes(search)) return false;
    if (filter === 'active'   && !c.active) return false;
    if (filter === 'degraded' && c.health !== 'degraded' && c.health !== 'warning') return false;
    if (filter === 'critical' && c.critical === 0) return false;
    return true;
  });

  const activeCount   = clients.filter(c => c.active).length;
  const criticalCount = clients.reduce((s, c) => s + (c.critical || 0), 0);

  return (
    <div className="fadeUp">
      <PageHdr title="Clients" sub="Tenant management and operational dossiers"
        tag={<Badge color="teal">{clients.length} tenants</Badge>}
        actions={<>
          <Btn variant="secondary" size="sm" icon={<Icon d={ICONS.refresh} size={13}/>} onClick={load}>Refresh</Btn>
          <Btn variant="primary"   size="sm" icon={<Icon d={ICONS.plus}    size={13}/>}>Add Client</Btn>
        </>}/>

      <div style={{ padding: '16px 28px 0', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        {[
          ['Active Clients',      activeCount,        'var(--green)'],
          ['Total Tenants',       clients.length,     'var(--teal)'],
          ['Failing Connections', clients.filter(c=>c.health==='offline').length, 'var(--red)'],
          ['Critical Alerts',     criticalCount,      'var(--red)'],
          ['Avg Risk Score',      clients.length ? Math.round(clients.reduce((s,c)=>s+c.riskScore,0)/clients.length) : 0, 'var(--amber)'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>{l}</div>
            <div style={{ fontFamily: 'Space Grotesk', fontSize: 22, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <FilterBar filters={[{ id: 'active', label: 'Active' }, { id: 'degraded', label: 'Degraded' }, { id: 'critical', label: 'Has Critical' }]}
            active={filter} onChange={setFilter} searchValue={search} onSearch={setSearch}/>
          <div style={{ display: 'flex', gap: 6 }}>
            {['table', 'card'].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: view === v ? 'var(--tealbg)' : 'var(--bg3)', color: view === v ? 'var(--teal)' : 'var(--t2)',
                  border: `1px solid ${view === v ? 'var(--bacc)' : 'var(--b2)'}`, transition: 'all .13s', textTransform: 'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1,2,3,4].map(i => <Skeleton key={i} height={44}/>)}
          </div>
        ) : error ? (
          <ErrorBanner title="Failed to load clients" body={error} onRetry={load}/>
        ) : filtered.length === 0 ? (
          <EmptyState icon="👥" title="No clients found" body="Add a client or adjust your filters"/>
        ) : view === 'table' ? (
          <Card pad={0}>
            <DataTable
              onRowClick={setSelected}
              columns={[
                { key: 'name',      label: 'Client',   render: (v,r) => <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:28,height:28,borderRadius:7,background:'var(--tealbg)',border:'1px solid var(--bacc)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--teal)',flexShrink:0}}>{v[0]}</div><div><div style={{fontSize:13,fontWeight:600}}>{v}</div><div style={{fontSize:11,color:'var(--t3)'}}>{r.env}</div></div></div> },
                { key: 'type',      label: 'Type',     render: v => <TypeBadge type={v}/> },
                { key: 'ip',        label: 'VPN / IP', render: v => <Mono>{v}</Mono> },
                { key: 'health',    label: 'Health',   render: v => <StatusDot status={v} label={v.charAt(0).toUpperCase()+v.slice(1)}/> },
                { key: 'alerts',    label: 'Alerts',   render: (v,r) => v > 0 ? <span style={{color:r.critical>0?'var(--red)':'var(--amber)',fontWeight:600,fontFamily:'IBM Plex Mono',fontSize:12}}>{v}</span> : <span style={{color:'var(--t3)',fontFamily:'IBM Plex Mono',fontSize:12}}>0</span> },
                { key: 'riskScore', label: 'Risk',     render: v => <div style={{display:'flex',alignItems:'center',gap:7}}><div style={{width:50,height:4,background:'var(--bg4)',borderRadius:4,overflow:'hidden'}}><div style={{width:`${v}%`,height:'100%',background:v>70?'var(--red)':v>40?'var(--amber)':'var(--green)'}}/></div><span style={{fontSize:11,fontFamily:'IBM Plex Mono',color:'var(--t2)'}}>{v}</span></div> },
                { key: 'lastHunt',  label: 'Created',  render: v => <span style={{fontSize:12,color:'var(--t3)'}}>{v}</span> },
                { key: 'active',    label: 'Status',   render: v => <Badge color={v?'green':'gray'}>{v?'Active':'Inactive'}</Badge> },
              ]}
              rows={filtered}
            />
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {filtered.map(c => (
              <Card key={c.id} onClick={() => setSelected(c)} style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width:36,height:36,borderRadius:9,background:'var(--tealbg)',border:'1px solid var(--bacc)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'var(--teal)' }}>{c.name[0]}</div>
                    <div><div style={{ fontSize:14,fontWeight:600 }}>{c.name}</div><div style={{ fontSize:11,color:'var(--t3)' }}>{c.env}</div></div>
                  </div>
                  <StatusDot status={c.health}/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[['Type',<TypeBadge type={c.type}/>],['IP',<Mono>{c.ip}</Mono>],['Alerts',<span style={{color:c.alerts>0?'var(--amber)':'var(--t3)',fontWeight:600}}>{c.alerts}</span>],['Status',<Badge color={c.active?'green':'gray'}>{c.active?'Active':'Inactive'}</Badge>]].map(([l,v])=>(
                    <div key={l}><div style={{fontSize:10.5,color:'var(--t3)',marginBottom:3}}>{l}</div>{v}</div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} width={540}
        title={selected?.name} subtitle={`${selected?.type} · ${selected?.env}`}>
        {selected && <ClientDetailDrawer client={selected} onTestConnection={async () => {
          try {
            await API.testClientConnection(selected.id);
            toast.success('Connection test passed', selected.name);
          } catch (err) {
            toast.error('Connection test failed', err.message);
          }
        }}/>}
      </Drawer>
    </div>
  );
}

function ClientDetailDrawer({ client, onTestConnection }) {
  const [tab, setTab] = React.useState('overview');
  const riskSpark = [0, 0, 0, 0, 0, client.riskScore || 0];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <StatusDot status={client.health} label={client.health.charAt(0).toUpperCase()+client.health.slice(1)}/>
        <Badge color={client.active ? 'green' : 'gray'}>{client.active ? 'Active' : 'Inactive'}</Badge>
        <TypeBadge type={client.type}/>
        <TLP level="AMBER"/>
      </div>
      <Tabs tabs={[{ id:'overview',label:'Overview' },{ id:'config',label:'Config & Tests' }]}
        active={tab} onChange={setTab}/>
      <div style={{ marginTop: 16 }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['Client ID',   <Mono>{client.id.slice(0,16)}…</Mono>],
              ['VPN IP',      <Mono>{client.ip}</Mono>],
              ['Type',        <TypeBadge type={client.type}/>],
              ['Status',      <Badge color={client.active?'green':'gray'}>{client.active?'Active':'Inactive'}</Badge>],
              ['Created',     client.lastHunt],
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:12,borderBottom:'1px solid var(--b1)' }}>
                <span style={{ fontSize:12.5,color:'var(--t2)' }}>{l}</span>
                <span style={{ fontSize:12.5,color:'var(--t1)' }}>{v}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['Connection Type', <TypeBadge type={client.type}/>],
              ['Vault Path',      <Mono small>{client._raw.api_key_vault_path || 'Not configured'}</Mono>],
              ['OpenVAS URL',     <Mono small>{client._raw.openvas_url || '—'}</Mono>],
              ['Secureworks URL', <Mono small>{client._raw.secureworks_url || '—'}</Mono>],
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex',justifyContent:'space-between',paddingBottom:12,borderBottom:'1px solid var(--b1)' }}>
                <span style={{ fontSize:12.5,color:'var(--t2)' }}>{l}</span>{v}
              </div>
            ))}
            <Btn variant="outline" icon={<Icon d={ICONS.activity} size={13}/>} onClick={onTestConnection}>
              Run Connection Test
            </Btn>
          </div>
        )}
      </div>
      <div style={{ display:'flex',gap:8,marginTop:20,paddingTop:16,borderTop:'1px solid var(--b1)' }}>
        <Btn size="sm" variant="primary" icon={<Icon d={ICONS.launch} size={12}/>}>Launch Hunt</Btn>
        <Btn size="sm" variant="secondary">Test Connection</Btn>
      </div>
    </div>
  );
}

// ── SOURCES PAGE ──────────────────────────────────────────────────────────
function SourcesPage() {
  const [sources,  setSources]  = React.useState([]);
  const [loading,  setLoading]  = React.useState(true);
  const [error,    setError]    = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [filter,   setFilter]   = React.useState(null);
  const [search,   setSearch]   = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await API.listSources({ limit: 200 });
      setSources((data || []).map(_adaptSource));
    } catch (err) {
      setError(err.message || 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const rows = sources.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'active'  && !s.active)             return false;
    if (filter === 'failing' && s.health === 'healthy') return false;
    return true;
  });

  const typeColors = { OTX: 'ice', 'Abuse.ch': 'red', MISP: 'purple', RSS: 'gray', API: 'teal', CIRCL: 'green', Manual: 'amber' };

  return (
    <div className="fadeUp">
      <PageHdr title="Intelligence Sources" sub="Threat feed registry and polling configuration"
        tag={<Badge color="teal">{sources.filter(s => s.active).length} active</Badge>}
        actions={<>
          <Btn variant="secondary" size="sm" icon={<Icon d={ICONS.refresh} size={13}/>} onClick={load}>Refresh</Btn>
          <Btn variant="primary"   size="sm" icon={<Icon d={ICONS.plus}    size={13}/>}>Add Source</Btn>
        </>}/>
      <div style={{ padding: '16px 28px' }}>
        <div style={{ marginBottom: 14 }}>
          <FilterBar filters={[{ id:'active',label:'Active' },{ id:'failing',label:'Failing' }]}
            active={filter} onChange={setFilter} searchValue={search} onSearch={setSearch}/>
        </div>

        {loading ? (
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {[1,2,3,4].map(i => <Skeleton key={i} height={44}/>)}
          </div>
        ) : error ? (
          <ErrorBanner title="Failed to load sources" body={error} onRetry={load}/>
        ) : (
          <Card pad={0}>
            <DataTable onRowClick={setSelected}
              columns={[
                { key:'name',     label:'Source',    render:(v,r)=><div style={{display:'flex',alignItems:'center',gap:8}}><Badge color={typeColors[r.type]||'gray'}>{r.type}</Badge><span style={{fontWeight:500}}>{v}</span></div> },
                { key:'url',      label:'Endpoint',  render:v=><Mono small>{v.length>38?v.slice(0,38)+'…':v}</Mono> },
                { key:'interval', label:'Interval',  render:v=><Badge color="gray">{v}</Badge> },
                { key:'auth',     label:'Auth',      render:v=><Badge color={v?'green':'gray'}>{v?'Configured':'None'}</Badge> },
                { key:'active',   label:'State',     render:v=><StatusDot status={v?'active':'inactive'} label={v?'Active':'Inactive'}/> },
                { key:'lastPoll', label:'Last Poll', render:v=><span style={{fontFamily:'IBM Plex Mono',fontSize:12,color:'var(--t2)'}}>{v}</span> },
                { key:'quality',  label:'Quality',   render:v=><Badge color={v==='High'?'green':v==='Medium'?'amber':'gray'}>{v}</Badge> },
                { key:'health',   label:'Health',    render:v=><StatusDot status={v}/> },
              ]}
              rows={rows}/>
          </Card>
        )}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name}
        subtitle={`${selected?.type} · ${selected?.interval} poll`} width={480}>
        {selected && (
          <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
            {[
              ['Type',         <TypeBadge type={selected.type}/>],
              ['URL',          <Mono small>{selected.url}</Mono>],
              ['Interval',     selected.interval],
              ['Auth',         <Badge color={selected.auth?'green':'gray'}>{selected.auth?'Configured':'None'}</Badge>],
              ['Health',       <StatusDot status={selected.health} label={selected.health}/>],
              ['Last Poll',    <Mono>{selected.lastPoll}</Mono>],
              ['Quality',      <Badge color={selected.quality==='High'?'green':'amber'}>{selected.quality}</Badge>],
              ['Failures',     <span style={{color:selected._raw.consecutive_failures>0?'var(--red)':'var(--green)',fontFamily:'IBM Plex Mono',fontWeight:600}}>{selected._raw.consecutive_failures||0}</span>],
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:12,borderBottom:'1px solid var(--b1)' }}>
                <span style={{ fontSize:12.5,color:'var(--t2)' }}>{l}</span>{v}
              </div>
            ))}

            <div style={{ background:'var(--bg2)',border:'1px solid var(--b1)',borderRadius:8,padding:'12px 14px' }}>
              <div style={{ fontSize:11,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 }}>Historical Health — Last 7 Days</div>
              <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10.5,color:'var(--t3)',marginBottom:4 }}>Uptime trend</div>
                  <Sparkline data={selected.uptimeSpark} color={selected.uptime>97?'var(--green)':selected.uptime>90?'var(--amber)':'var(--red)'} width={140} height={32}/>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:10.5,color:'var(--t3)',marginBottom:2 }}>Uptime</div>
                  <div style={{ fontSize:18,fontWeight:700,fontFamily:'Space Grotesk',color:selected.uptime>97?'var(--green)':selected.uptime>90?'var(--amber)':'var(--red)' }}>{selected.uptime}%</div>
                </div>
              </div>
              {selected._raw.last_error_message && (
                <div style={{ marginTop:8,fontSize:11.5,color:'var(--amber)',background:'var(--amberbg)',padding:'6px 10px',borderRadius:5 }}>
                  ⚠ {selected._raw.last_error_message}
                </div>
              )}
            </div>

            <div style={{ display:'flex',gap:8 }}>
              <Btn size="sm" variant="primary"    icon={<Icon d={ICONS.refresh} size={12}/>}>Poll Now</Btn>
              <Btn size="sm" variant="secondary">Edit Source</Btn>
              <Btn size="sm" variant="danger">Deactivate</Btn>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── COLLECTIONS PAGE ──────────────────────────────────────────────────────
function CollectionsPage() {
  const [collections, setCollections] = React.useState([]);
  const [loading,     setLoading]     = React.useState(true);
  const [error,       setError]       = React.useState(null);
  const [selected,    setSelected]    = React.useState(null);
  const [filter,      setFilter]      = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cols, srcs] = await Promise.all([
        API.listCollections({ limit: 200 }),
        API.listSources({ limit: 200 }),
      ]);
      const sourcesById = _byId(srcs || []);
      setCollections((cols || []).map(c => _adaptCollection(c, sourcesById)));
    } catch (err) {
      setError(err.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const rows = filter ? collections.filter(c => c.status === filter) : collections;

  return (
    <div className="fadeUp">
      <PageHdr title="Collections" sub="Intelligence collection run history and audit log"
        tag={<Badge color="teal">{collections.length} total</Badge>}
        actions={<>
          <Btn variant="secondary" size="sm" icon={<Icon d={ICONS.refresh} size={13}/>} onClick={load}>Refresh</Btn>
          <Btn variant="primary"   size="sm" icon={<Icon d={ICONS.collections} size={13}/>}>Run Collection</Btn>
        </>}/>
      <div style={{ padding: '16px 28px' }}>
        <div style={{ marginBottom: 14 }}>
          <FilterBar filters={[{ id:'completed',label:'Completed' },{ id:'failed',label:'Failed' },{ id:'running',label:'Running' }]}
            active={filter} onChange={setFilter}/>
        </div>

        {loading ? (
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {[1,2,3,4].map(i => <Skeleton key={i} height={44}/>)}
          </div>
        ) : error ? (
          <ErrorBanner title="Failed to load collections" body={error} onRetry={load}/>
        ) : rows.length === 0 ? (
          <EmptyState icon="📥" title="No collection runs" body="Collections will appear here after intelligence sources are polled"/>
        ) : (
          <Card pad={0}>
            <DataTable onRowClick={setSelected}
              columns={[
                { key:'id',     label:'Run ID',    render:v=><Mono small>{v}</Mono> },
                { key:'source', label:'Source',    render:v=><span style={{fontWeight:500}}>{v}</span> },
                { key:'by',     label:'Initiated', render:v=><Badge color="gray">{v}</Badge> },
                { key:'start',  label:'Started',   render:v=><span style={{fontFamily:'IBM Plex Mono',fontSize:12,color:'var(--t2)'}}>{v}</span> },
                { key:'end',    label:'Finished',  render:v=><span style={{fontFamily:'IBM Plex Mono',fontSize:12,color:'var(--t2)'}}>{v}</span> },
                { key:'items',  label:'Items',     render:v=><span style={{fontFamily:'IBM Plex Mono',fontSize:12}}>{v}</span> },
                { key:'iocs',   label:'IoCs',      render:v=><span style={{fontFamily:'IBM Plex Mono',fontSize:12,fontWeight:600,color:'var(--teal)'}}>{v}</span> },
                { key:'misp',   label:'MISP',      render:v=><Badge color={v==='Synced'?'green':v==='Failed'?'red':'amber'}>{v}</Badge> },
                { key:'octi',   label:'OpenCTI',   render:v=><Badge color={v==='Synced'?'green':v==='Failed'?'red':'amber'}>{v}</Badge> },
                { key:'status', label:'Status',    render:v=><StatusDot status={v} label={v.charAt(0).toUpperCase()+v.slice(1)}/> },
              ]}
              rows={rows}/>
          </Card>
        )}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} width={520}
        title={`Collection: ${selected?.id}`}
        subtitle={`${selected?.source} · ${selected?.items} items · ${selected?.iocs} IoCs`}>
        {selected && (
          <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
            {[
              ['Run ID',        <Mono>{selected.id}</Mono>],
              ['Source',        selected.source],
              ['Initiated By',  <Badge color="gray">{selected.by}</Badge>],
              ['Created',       <Mono small>{selected.created}</Mono>],
              ['Started',       <Mono small>{selected.start}</Mono>],
              ['Finished',      <Mono small>{selected.end}</Mono>],
              ['Items Processed', selected.items],
              ['IoCs Extracted',  <span style={{color:'var(--teal)',fontWeight:600}}>{selected.iocs}</span>],
              ['MISP Sync',     <Badge color={selected.misp==='Synced'?'green':'amber'}>{selected.misp}</Badge>],
              ['OpenCTI Sync',  <Badge color={selected.octi==='Synced'?'green':'amber'}>{selected.octi}</Badge>],
              ['Status',        <StatusDot status={selected.status} label={selected.status}/>],
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:12,borderBottom:'1px solid var(--b1)' }}>
                <span style={{ fontSize:12.5,color:'var(--t2)' }}>{l}</span>{v}
              </div>
            ))}
            {selected._raw.error_message && (
              <ErrorBanner title="Collection error" body={selected._raw.error_message}/>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── HUNTING JOBS PAGE ─────────────────────────────────────────────────────
function JobsPage() {
  const [jobs,     setJobs]     = React.useState([]);
  const [loading,  setLoading]  = React.useState(true);
  const [error,    setError]    = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [filter,   setFilter]   = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [jobsData, clientsData] = await Promise.all([
        API.listJobs({ limit: 200 }),
        API.listClients({ limit: 200 }),
      ]);
      const clientsById = _byId(clientsData || []);
      const adapted = (jobsData || []).map(j => _adaptJob(j, clientsById));
      setJobs(adapted);
      const running = adapted.filter(j => j.status === 'running').length;
      if (running > 0) window.__hunterSetBadges?.({ jobs: running });
    } catch (err) {
      setError(err.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const jobSteps = ['Collection', 'NLP Analysis', 'IoC Correlation', 'Alert Gen', 'Report'];
  const rows = filter ? jobs.filter(j => j.status === filter) : jobs;
  const runningCount = jobs.filter(j => j.status === 'running').length;

  const handleCancel = async (jobId) => {
    try {
      await API.cancelJob(jobId);
      toast.success('Job cancelled', jobId);
      load();
    } catch (err) {
      toast.error('Cancel failed', err.message);
    }
  };

  return (
    <div className="fadeUp">
      <PageHdr title="Hunting Jobs" sub="Async operation queue and execution history"
        tag={runningCount > 0 ? <Badge color="amber">{runningCount} running</Badge> : <Badge color="teal">{jobs.length} total</Badge>}
        actions={<>
          <Btn variant="secondary" size="sm" icon={<Icon d={ICONS.refresh} size={13}/>} onClick={load}>Refresh</Btn>
          <Btn variant="primary"   size="sm" icon={<Icon d={ICONS.launch}  size={13}/>}>New Job</Btn>
        </>}/>
      <div style={{ padding: '16px 28px' }}>
        <div style={{ marginBottom: 14 }}>
          <FilterBar filters={[
            { id:'running',label:'Running' },{ id:'completed',label:'Completed' },
            { id:'failed',label:'Failed' },{ id:'pending',label:'Pending' },
          ]}
            active={filter} onChange={setFilter}/>
        </div>

        {loading ? (
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {[1,2,3,4].map(i => <Skeleton key={i} height={44}/>)}
          </div>
        ) : error ? (
          <ErrorBanner title="Failed to load jobs" body={error} onRetry={load}/>
        ) : rows.length === 0 ? (
          <EmptyState icon="🎯" title="No hunting jobs" body="Launch a hunt from the Launch Center to get started"/>
        ) : (
          <Card pad={0}>
            <DataTable onRowClick={setSelected}
              columns={[
                { key:'id',      label:'Job ID',   render:v=><Mono small>{v}</Mono> },
                { key:'type',    label:'Type',     render:v=><TypeBadge type={v}/> },
                { key:'client',  label:'Client',   render:v=><span style={{fontWeight:500}}>{v}</span> },
                { key:'status',  label:'Status',   render:v=><StatusDot status={v} label={v.charAt(0).toUpperCase()+v.slice(1)}/> },
                { key:'created', label:'Created',  render:v=><span style={{fontSize:12,color:'var(--t3)',fontFamily:'IBM Plex Mono'}}>{v}</span> },
                { key:'runtime', label:'Runtime',  render:v=><span style={{fontSize:12,fontFamily:'IBM Plex Mono',color:v==='ongoing'?'var(--teal)':'var(--t2)'}}>{v}</span> },
                { key:'iocs',    label:'IoCs',     render:v=><span style={{fontFamily:'IBM Plex Mono',fontSize:12,color:'var(--teal)'}}>{v}</span> },
                { key:'alerts',  label:'Alerts',   render:v=><span style={{fontFamily:'IBM Plex Mono',fontSize:12,color:Number(v)>0?'var(--amber)':'var(--t3)'}}>{v}</span> },
                { key:'report',  label:'Report',   render:v=>v?<Badge color="green">Ready</Badge>:<Badge color="gray">None</Badge> },
              ]}
              rows={rows}/>
          </Card>
        )}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} width={560}
        title={selected?.id} subtitle={`${selected?.type} · ${selected?.client}`}>
        {selected && (
          <div style={{ display:'flex',flexDirection:'column',gap:18 }}>
            <Stepper steps={jobSteps}
              active={selected.status==='failed'?1:selected.status==='running'?2:4}/>
            <div style={{ padding:14,
              background:selected.status==='failed'?'var(--redbg)':selected.status==='running'?'var(--tealbg)':'var(--greenbg)',
              borderRadius:8,
              border:`1px solid ${selected.status==='failed'?'rgba(240,69,101,.3)':selected.status==='running'?'var(--bacc)':'rgba(18,196,146,.3)'}`}}>
              <div style={{ fontSize:13,fontWeight:600,
                color:selected.status==='failed'?'var(--red)':selected.status==='running'?'var(--teal)':'var(--green)',
                marginBottom:4 }}>
                {selected.status==='failed' ? '✗ Job Failed'
                 : selected.status==='running' ? '● Running…'
                 : '✓ Job Completed Successfully'}
              </div>
              {selected.status === 'running' && (
                <div style={{ fontSize:11.5,color:'var(--t2)' }}>Celery task active</div>
              )}
              {selected._raw.error_message && (
                <div style={{ fontSize:11.5,color:'var(--red)',marginTop:4 }}>{selected._raw.error_message}</div>
              )}
            </div>
            {[
              ['Job ID',          <Mono>{selected._raw.id}</Mono>],
              ['Type',            <TypeBadge type={selected.type}/>],
              ['Client',          selected.client],
              ['Status',          <StatusDot status={selected.status} label={selected.status}/>],
              ['Created',         <Mono small>{selected.created}</Mono>],
              ['Runtime',         <Mono small>{selected.runtime}</Mono>],
              ['IoCs Extracted',  <span style={{color:'var(--teal)',fontWeight:600,fontFamily:'IBM Plex Mono'}}>{selected.iocs}</span>],
              ['Alerts Created',  <span style={{color:Number(selected.alerts)>0?'var(--amber)':'var(--t3)',fontWeight:600}}>{selected.alerts}</span>],
              ['Report',          selected.report?<Badge color="green">Ready</Badge>:<Badge color="gray">Not generated</Badge>],
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:12,borderBottom:'1px solid var(--b1)' }}>
                <span style={{ fontSize:12.5,color:'var(--t2)' }}>{l}</span>{v}
              </div>
            ))}
            <div style={{ display:'flex', gap:8 }}>
              {selected.status === 'running' && (
                <Btn size="sm" variant="danger" onClick={() => handleCancel(selected._raw.id)}>Cancel Job</Btn>
              )}
              <Btn size="sm" variant="secondary">View IoCs</Btn>
              {Number(selected.alerts) > 0 && <Btn size="sm" variant="outline">View Alerts</Btn>}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

Object.assign(window, { ClientsList, SourcesPage, CollectionsPage, JobsPage, TypeBadge });