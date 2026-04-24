
// ═══════════════════════════════════════════════════════
//  ADMIN PAGE 1 — Dashboard + Launch Center
// ═══════════════════════════════════════════════════════

// ── MOCK DATA ──────────────────────────────────────────
const MOCK_ACTIVITY = [
  { title: 'Critical alert raised — GlobalBank C2 beacon', time: '2026-04-21 08:47', color: 'var(--red)', badge: <Badge color="red">Critical</Badge> },
  { title: 'Hunt HJ-0421-003 completed — 14 IoCs extracted', time: '2026-04-21 08:32', color: 'var(--green)', badge: <Badge color="green">Completed</Badge> },
  { title: 'CIRCL collection batch — 89 items ingested', time: '2026-04-21 08:15', color: 'var(--teal)', badge: <Badge color="teal">Collected</Badge> },
  { title: 'MedGroup VPN tunnel degraded', time: '2026-04-21 07:58', color: 'var(--amber)', badge: <Badge color="amber">Warning</Badge> },
  { title: 'Report REP-2024-041 ready for TechVault', time: '2026-04-21 07:44', color: 'var(--ice)', badge: <Badge color="ice">Report</Badge> },
  { title: 'New IoC enrichment batch — VirusTotal 48/73', time: '2026-04-21 07:30', color: 'var(--purple)', badge: <Badge color="purple">Enriched</Badge> },
];

const ATTACK_MATRIX = [
  { tactic: 'Initial Access', techs: [8,0,5,2,0,0,3] },
  { tactic: 'Execution',      techs: [6,9,0,4,0,7,1] },
  { tactic: 'Persistence',    techs: [3,0,2,0,8,0,0] },
  { tactic: 'Defense Evasion',techs: [0,4,7,0,2,5,0] },
  { tactic: 'Credential',     techs: [5,0,0,3,0,0,9] },
  { tactic: 'Discovery',      techs: [2,1,0,0,4,0,0] },
  { tactic: 'Lateral',        techs: [0,8,0,6,0,3,0] },
  { tactic: 'Exfiltration',   techs: [4,0,2,0,0,7,0] },
];

// ── SEVERITY TIMELINE CHART ───────────────────────────
function SeverityTimeline() {
  const canvasRef = React.useRef(null);
  const animRef   = React.useRef(null);
  const [range, setRange] = React.useState('30d');
  const [tooltip, setTooltip] = React.useState(null);

  // Generate realistic 30-day data
  const labels30 = ['Mar 22','Mar 24','Mar 26','Mar 28','Mar 30','Apr 1','Apr 3','Apr 5','Apr 7','Apr 9','Apr 11','Apr 13','Apr 15','Apr 17','Apr 19','Apr 21'];
  const series = {
    Critical: [4,6,3,8,5,7,4,3,9,6,5,11,7,8,114,7],
    High:     [18,24,20,30,22,26,19,18,28,22,20,38,28,32,68,18],
    Medium:   [22,28,24,38,26,31,23,22,34,27,25,42,32,38,42,20],
    Low:      [8,10,9,14,10,12,9,8,13,10,9,16,12,14,18,8],
  };
  const colors = { Critical:'#f04565', High:'#f4a20e', Medium:'#5ba4f5', Low:'#0dbab5' };
  const fillColors = { Critical:'rgba(240,69,101,', High:'rgba(244,162,14,', Medium:'rgba(91,164,245,', Low:'rgba(13,186,181,' };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      render(rect.width, rect.height);
    };

    const PAD = { top: 36, right: 24, bottom: 48, left: 52 };
    let animProgress = 0;

    function render(W, H) {
      ctx.clearRect(0, 0, W, H);
      const cW = W - PAD.left - PAD.right;
      const cH = H - PAD.top  - PAD.bottom;
      const pts = labels30.length;
      const maxY = 130;
      const yTicks = [0, 20, 40, 60, 80, 100, 120];

      // Background
      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, W, H);

      // Grid lines + Y labels
      ctx.font = `11px 'IBM Plex Mono', monospace`;
      ctx.textAlign = 'right';
      yTicks.forEach(v => {
        const y = PAD.top + cH - (v / maxY) * cH;
        ctx.strokeStyle = 'rgba(94,132,172,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
        ctx.fillStyle = 'rgba(120,149,181,0.6)';
        ctx.fillText(v, PAD.left - 8, y + 4);
      });

      // Y axis label
      ctx.save();
      ctx.translate(13, PAD.top + cH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.font = `10px 'IBM Plex Sans', sans-serif`;
      ctx.fillStyle = 'rgba(120,149,181,0.5)';
      ctx.fillText('Threat Count', 0, 0);
      ctx.restore();

      // X labels (every 2)
      ctx.textAlign = 'center';
      ctx.font = `10px 'IBM Plex Mono', monospace`;
      ctx.fillStyle = 'rgba(120,149,181,0.6)';
      labels30.forEach((l, i) => {
        if (i % 2 !== 0) return;
        const x = PAD.left + (i / (pts - 1)) * cW;
        ctx.fillText(l, x, PAD.top + cH + 18);
      });

      // Draw each series
      Object.entries(series).reverse().forEach(([name, data]) => {
        const col  = colors[name];
        const fill = fillColors[name];
        const getX = i => PAD.left + (i / (pts - 1)) * cW;
        const getY = v => PAD.top + cH - Math.min(animProgress, 1) * (v / maxY) * cH;

        // Filled area gradient
        const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
        grad.addColorStop(0, fill + '0.22)');
        grad.addColorStop(1, fill + '0.0)');

        ctx.beginPath();
        ctx.moveTo(getX(0), PAD.top + cH);
        data.forEach((v, i) => ctx.lineTo(getX(i), getY(v)));
        ctx.lineTo(getX(pts - 1), PAD.top + cH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        data.forEach((v, i) => {
          const x = getX(i), y = getY(v);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Dots
        data.forEach((v, i) => {
          const x = getX(i), y = getY(v);
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(10,16,24,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
        });
      });
    }

    function animate(W, H) {
      animProgress += 0.04;
      if (animProgress > 1) animProgress = 1;
      render(W, H);
      if (animProgress < 1) animRef.current = requestAnimationFrame(() => animate(W, H));
    }

    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    animProgress = 0;
    animate(rect.width, rect.height);

    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, [range]);

  // Mouse hover for tooltip
  const handleMove = e => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const PAD_L = 52, PAD_R = 24;
    const cW    = rect.width - PAD_L - PAD_R;
    const pts   = labels30.length;
    const idx   = Math.round(((mx - PAD_L) / cW) * (pts - 1));
    if (idx >= 0 && idx < pts) {
      setTooltip({ idx, x: mx, label: labels30[idx],
        values: Object.entries(series).map(([n, d]) => ({ name: n, val: d[idx], col: colors[n] })) });
    } else setTooltip(null);
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px 10px', borderBottom:'1px solid var(--b1)' }}>
        <div>
          <div style={{ fontSize:13.5, fontWeight:600 }}>Severity Timeline</div>
          <div style={{ fontSize:11, color:'var(--t3)', marginTop:1 }}>Alert volume by severity — last 30 days</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Legend */}
          <div style={{ display:'flex', gap:14 }}>
            {Object.entries(colors).map(([n, c]) => (
              <div key={n} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:c }}/>
                <span style={{ fontSize:11.5, color:'var(--t2)' }}>{n}</span>
              </div>
            ))}
          </div>
          {/* Range selector */}
          <div style={{ display:'flex', background:'var(--bg0)', borderRadius:6, border:'1px solid var(--b2)', overflow:'hidden' }}>
            {['7d','30d','90d'].map(r => (
              <button key={r} onClick={() => setRange(r)}
                style={{ padding:'4px 10px', fontSize:11.5, fontWeight:500, cursor:'pointer',
                  background: range === r ? 'var(--bg4)' : 'transparent',
                  color: range === r ? 'var(--teal)' : 'var(--t3)', border:'none' }}>
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position:'relative', height:280, padding:'4px 0 0' }}>
        <canvas ref={canvasRef} onMouseMove={handleMove} onMouseLeave={() => setTooltip(null)}
          style={{ width:'100%', height:'100%', display:'block', cursor:'crosshair' }}/>

        {/* Tooltip */}
        {tooltip && (
          <div style={{ position:'absolute', top:20, left: Math.min(tooltip.x + 12, 520),
            background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:8,
            padding:'10px 14px', pointerEvents:'none', zIndex:10,
            boxShadow:'0 4px 20px rgba(0,0,0,0.4)', minWidth:130 }}>
            <div style={{ fontSize:11, fontFamily:'IBM Plex Mono', color:'var(--t3)', marginBottom:6 }}>{tooltip.label}</div>
            {tooltip.values.map(v => (
              <div key={v.name} style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:3 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:v.col, flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:'var(--t2)' }}>{v.name}</span>
                </div>
                <span style={{ fontSize:12, fontFamily:'IBM Plex Mono', fontWeight:600, color:v.col }}>{v.val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ADMIN DASHBOARD ───────────────────────────────────
function AdminDashboard({ setPage }) {
  const kpis = [
    { label:'Open Alerts',   value:'31',  sub:'7 critical',    accent:'var(--red)',    color:'var(--red)', trendDir:'up', trend:'5 new',   sparkData:[18,22,19,25,28,24,31], onClick:()=>setPage('alerts') },
    { label:'IoCs Today',    value:'247', sub:'+38 enriched',  accent:'var(--amber)',  trendDir:'up', trend:'18%',          sparkData:[140,165,158,190,210,228,247], onClick:()=>setPage('ioc') },
    { label:'Running Jobs',  value:'4',   sub:'avg 12m',       accent:'var(--teal)',   trendDir:null, trend:null,           sparkData:[2,5,3,4,6,3,4], onClick:()=>setPage('jobs') },
    { label:'Reports Ready', value:'6',   sub:'2 generating',  accent:'var(--green)',  trendDir:'down', trend:'2',          sparkData:[3,4,5,6,4,7,6], onClick:()=>setPage('reports') },
  ];

  const topClients = [
    { name:'MedGroup Health', alerts:12, risk:94, trend:[60,72,80,88,90,94] },
    { name:'TechVault Inc',   alerts:7,  risk:71, trend:[40,50,55,62,68,71] },
    { name:'Acme Corp',       alerts:3,  risk:42, trend:[55,48,44,40,42,42] },
    { name:'Nexus Digital',   alerts:1,  risk:18, trend:[22,20,19,18,18,18] },
  ];

  const iocTypes = [
    { type:'IP Addresses', count:98,  pct:40, color:'var(--red)' },
    { type:'Domains',      count:74,  pct:30, color:'var(--amber)' },
    { type:'URLs',         count:42,  pct:17, color:'var(--ice)' },
    { type:'Hashes',       count:21,  pct:9,  color:'var(--purple)' },
    { type:'CVEs',         count:12,  pct:4,  color:'var(--teal)' },
  ];

  const platformHealth = [
    { name:'MISP',          ok:true,  latency:'12ms', uptime:99.9 },
    { name:'OpenCTI',       ok:true,  latency:'28ms', uptime:99.7 },
    { name:'Elasticsearch', ok:true,  latency:'6ms',  uptime:100  },
    { name:'TheHive',       ok:false, latency:'—',    uptime:94.2 },
    { name:'Vault',         ok:true,  latency:'4ms',  uptime:100  },
    { name:'OpenVAS',       ok:true,  latency:'44ms', uptime:99.1 },
  ];

  // Evidence stream
  const evidence = [
    { type:'IoC', value:'45.33.32.156', desc:'C2 match on MedGroup hunt', time:'08:47', color:'var(--red)' },
    { type:'Match', value:'T1071.001', desc:'C2 over HTTPS · MG-SRV-02', time:'08:45', color:'var(--amber)' },
    { type:'IoC', value:'d4c1e92ab7f3.xyz', desc:'Phishing domain · 31/73 VT', time:'08:32', color:'var(--amber)' },
    { type:'Enrich', value:'CVE-2024-3094', desc:'CVSS 10.0 · XZ backdoor', time:'08:20', color:'var(--purple)' },
    { type:'IoC', value:'AgentTesla.exe', desc:'SHA256 match · MalwareBazaar', time:'08:15', color:'var(--red)' },
    { type:'Corr', value:'HJ-0421-005', desc:'89 items collected · CIRCL', time:'08:02', color:'var(--teal)' },
  ];

  // Critical incident strip data
  const criticals = [
    { client:'MedGroup Health', issue:'Cobalt Strike beacon on CORP-WS-042', sev:'critical' },
    { client:'TechVault Inc',   issue:'TheHive integration offline — cases not syncing', sev:'high' },
    { client:'(Platform)',      issue:'MalwareBazaar returning degraded data quality', sev:'high' },
  ];

  // Source health summary
  const sourceHealth = [
    { name:'OTX',       ok:true,  freshness:'2m',  yield:142, quality:95 },
    { name:'Abuse.ch',  ok:true,  freshness:'8m',  yield:89,  quality:88 },
    { name:'CIRCL',     ok:true,  freshness:'1h',  yield:34,  quality:76 },
    { name:'MalwareBazaar',ok:false,freshness:'stale',yield:0, quality:0 },
    { name:'Feodo',     ok:true,  freshness:'12m', yield:21,  quality:92 },
  ];

  return (
    <div className="fadeUp">

      {/* ── Critical Incident Strip ── */}
      <div style={{ background:'linear-gradient(90deg,rgba(240,69,101,0.09),rgba(240,69,101,0.04))',
        borderBottom:'1px solid rgba(240,69,101,0.2)', padding:'8px 28px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--red)', letterSpacing:'.06em', textTransform:'uppercase', flexShrink:0 }}>
          ⚡ Active Incidents
        </span>
        <div style={{ display:'flex', gap:14, flex:1, overflowX:'auto', scrollbarWidth:'none' }}>
          {criticals.map((c,i) => (
            <div key={i} onClick={()=>setPage('alerts')}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 12px', borderRadius:6, flexShrink:0,
                background:'rgba(240,69,101,0.08)', border:`1px solid ${c.sev==='critical'?'rgba(240,69,101,.3)':'rgba(244,162,14,.3)'}`,
                cursor:'pointer', transition:'all .14s' }}>
              <span style={{ width:6,height:6,borderRadius:'50%',background:c.sev==='critical'?'var(--red)':'var(--amber)',flexShrink:0 }}/>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--t2)' }}>{c.client}</span>
              <span style={{ fontSize:12, color:'var(--t3)' }}>—</span>
              <span style={{ fontSize:12, color:'var(--t1)' }}>{c.issue}</span>
            </div>
          ))}
        </div>
        <Btn size="sm" variant="danger" onClick={()=>setPage('alerts')}>View All →</Btn>
      </div>

      <PageHdr title="SOC Overview" sub="Real-time threat intelligence operations — April 21, 2026"
        actions={<>
          <Btn variant="secondary" size="sm" icon={<Icon d={ICONS.refresh} size={13}/>}>Refresh</Btn>
          <Btn variant="primary" size="sm" icon={<Icon d={ICONS.launch} size={13}/>} onClick={()=>setPage('launch')}>New Hunt</Btn>
        </>}/>

      {/* 4-up KPIs with sparklines + drilldown */}
      <div style={{ padding:'16px 28px 0', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {kpis.map(k => <StatCard key={k.label} {...k}/>)}
      </div>

      {/* Main grid */}
      <div style={{ padding:'14px 28px', display:'grid', gridTemplateColumns:'1fr 308px', gap:16 }}>

        {/* LEFT column */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Constellation hero — toggled by Tweaks */}
          {window.__showConstellation !== false && (
          <Card style={{ overflow:'hidden' }}>
            <div style={{ padding:'13px 18px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--b1)' }}>
              <div>
                <div style={{ fontSize:13.5, fontWeight:600 }}>Threat Flow Constellation</div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:1 }}>Live intelligence pipeline · sources → hunt → correlate → clients</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <Badge color="red" dot>3 critical</Badge>
                <Badge color="teal" dot>Live</Badge>
              </div>
            </div>
            <div style={{ height:280, background:'var(--bg0)' }}>
              <Constellation width={900} height={280}/>
            </div>
          </Card>
          )}

          {/* Severity Timeline */}
          <Card style={{ overflow:'hidden' }}>
            <SeverityTimeline/>
          </Card>

          {/* ATT&CK + IoC types */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Card>
              <SectionHdr title="ATT&CK Coverage" sub="Last 30 days"
                style={{ padding:'13px 16px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}
                action={<GlossaryDot term="ATT&CK Heatmap" definition="Each cell = technique hit count. Red = highest frequency threat technique observed this period."/>}/>
              <div style={{ padding:'12px 16px', overflowX:'auto' }}>
                {ATTACK_MATRIX.map(row => (
                  <div key={row.tactic} style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5 }}>
                    <span style={{ fontSize:10, color:'var(--t3)', width:88, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.tactic}</span>
                    <div style={{ display:'flex', gap:3 }}>
                      {row.techs.map((v,i) => <HeatCell key={i} v={v} max={10}/>)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <SectionHdr title="IoC Distribution" sub="Today — 247 total"
                style={{ padding:'13px 16px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}
                action={<Btn size="sm" variant="ghost" onClick={()=>setPage('ioc')}>→</Btn>}/>
              <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                {iocTypes.map(t => (
                  <div key={t.type}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:12, color:'var(--t1)' }}>{t.type}</span>
                      <span style={{ fontSize:11, color:'var(--t3)', fontFamily:'IBM Plex Mono' }}>{t.count}</span>
                    </div>
                    <ProgressBar value={t.pct} color={t.color} height={4}/>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Recent hunt jobs */}
          <Card>
            <SectionHdr title="Recent Hunt Jobs"
              action={<Btn size="sm" variant="ghost" onClick={()=>setPage('jobs')}>View all →</Btn>}
              style={{ padding:'13px 16px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <DataTable compact stickyHead
              columns={[
                { key:'id',     label:'Job ID',   render:v=><Mono small>{v}</Mono> },
                { key:'type',   label:'Type' },
                { key:'client', label:'Client' },
                { key:'status', label:'Status',   render:v=><StatusDot status={v} label={v}/> },
                { key:'iocs',   label:'IoCs',     render:v=><span style={{ fontFamily:'IBM Plex Mono', fontSize:12 }}>{v}</span> },
                { key:'time',   label:'Time',     render:v=><span style={{ fontSize:11.5, color:'var(--t3)' }}>{v}</span> },
              ]}
              rows={[
                { id:'HJ-0421-007', type:'Full Hunt',   client:'Acme Corp',    status:'completed', iocs:14,  time:'08:32' },
                { id:'HJ-0421-006', type:'IoC Enrich',  client:'TechVault',    status:'running',   iocs:'—', time:'live'  },
                { id:'HJ-0421-005', type:'Collection',  client:'CIRCL',        status:'completed', iocs:89,  time:'08:15' },
                { id:'HJ-0421-004', type:'Full Hunt',   client:'MedGroup',     status:'failed',    iocs:0,   time:'07:58' },
                { id:'HJ-0420-003', type:'Full Hunt',   client:'GlobalBank',   status:'completed', iocs:32,  time:'Yest.' },
              ]}/>
          </Card>
        </div>

        {/* RIGHT sidebar */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Secondary KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              { label:'Active Clients', value:'14', sub:'2 degraded', color:'var(--teal)' },
              { label:'Live Sources',   value:'23', sub:'1 failing',  color:'var(--ice)' },
            ].map(k => (
              <div key={k.label} style={{ background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:9, padding:'11px 13px' }}>
                <div style={{ fontSize:10, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>{k.label}</div>
                <div style={{ fontFamily:'Space Grotesk', fontSize:20, fontWeight:700, color:k.color }}>{k.value}</div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Source health mini-panel */}
          <Card>
            <SectionHdr title="Source Feed Health" sub="Freshness & yield"
              action={<Btn size="sm" variant="ghost" onClick={()=>setPage('sources')}>→</Btn>}
              style={{ padding:'13px 14px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
              {sourceHealth.map(s => (
                <div key={s.name} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:6,height:6,borderRadius:'50%',background:s.ok?'var(--green)':'var(--red)',flexShrink:0 }}/>
                  <span style={{ fontSize:12, flex:1, color:s.ok?'var(--t1)':'var(--t3)' }}>{s.name}</span>
                  {s.ok ? (
                    <>
                      <span style={{ fontSize:10.5, color:'var(--t3)', fontFamily:'IBM Plex Mono' }}>{s.freshness}</span>
                      <span style={{ fontSize:10.5, color:'var(--teal)', fontFamily:'IBM Plex Mono', fontWeight:600 }}>{s.yield}</span>
                    </>
                  ) : (
                    <Badge color="red">Stale</Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Platform posture */}
          <Card>
            <SectionHdr title="Platform Posture"
              action={<Btn size="sm" variant="ghost" onClick={()=>setPage('platform')}>→</Btn>}
              style={{ padding:'13px 14px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:7 }}>
              {platformHealth.map(p => (
                <div key={p.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <span style={{ width:6,height:6,borderRadius:'50%',background:p.ok?'var(--green)':'var(--red)',flexShrink:0 }}/>
                    <span style={{ fontSize:12, color:p.ok?'var(--t1)':'var(--t3)' }}>{p.name}</span>
                    {!p.ok && <Badge color="red">Down</Badge>}
                  </div>
                  <span style={{ fontSize:10.5, color:'var(--t3)', fontFamily:'IBM Plex Mono' }}>{p.latency}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Top risky clients with sparklines */}
          <Card>
            <SectionHdr title="Risk Leaderboard"
              action={<Btn size="sm" variant="ghost" onClick={()=>setPage('clients')}>→</Btn>}
              style={{ padding:'13px 14px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:10 }}>
              {topClients.map(c => (
                <div key={c.name}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:12, color:'var(--t1)', fontWeight:500 }}>{c.name}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <Sparkline data={c.trend} color={c.risk>70?'var(--red)':c.risk>40?'var(--amber)':'var(--green)'} width={44} height={20}/>
                      <span style={{ fontSize:11, fontFamily:'IBM Plex Mono', fontWeight:700,
                        color:c.risk>70?'var(--red)':c.risk>40?'var(--amber)':'var(--green)' }}>{c.risk}</span>
                    </div>
                  </div>
                  <ProgressBar value={c.risk} color={c.risk>80?'var(--red)':c.risk>50?'var(--amber)':'var(--green)'} height={3}/>
                </div>
              ))}
            </div>
          </Card>

          {/* Latest Evidence Stream */}
          <Card style={{ flex:1 }}>
            <SectionHdr title="Evidence Stream" sub="Recent matches & enrichments"
              style={{ padding:'13px 14px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:0 }}>
              {evidence.map((e,i) => (
                <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'8px 0',
                  borderBottom:i<evidence.length-1?'1px solid var(--b1)':'none' }}>
                  <span style={{ width:6,height:6,borderRadius:'50%',background:e.color,marginTop:5,flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:2 }}>
                      <span style={{ fontSize:10, color:e.color, fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>{e.type}</span>
                      <CopyValue value={e.value} small/>
                    </div>
                    <div style={{ fontSize:11.5, color:'var(--t3)' }}>{e.desc}</div>
                  </div>
                  <span style={{ fontSize:10.5, color:'var(--t4)', fontFamily:'IBM Plex Mono', flexShrink:0 }}>{e.time}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Alert severity distribution */}
          <Card>
            <SectionHdr title="Alert Severity" sub="31 open"
              style={{ padding:'13px 14px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}
              action={<Btn size="sm" variant="ghost" onClick={()=>setPage('alerts')}>→</Btn>}/>
            <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:7 }}>
              {[['Critical','var(--red)',7],['High','var(--amber)',12],['Medium','var(--ice)',9],['Low','var(--teal)',3]].map(([l,c,n])=>(
                <div key={l} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, color:'var(--t2)', width:54, flexShrink:0 }}>{l}</span>
                  <div style={{ flex:1, background:'var(--bg4)', borderRadius:3, height:5, overflow:'hidden' }}>
                    <div style={{ width:`${(n/31)*100}%`, height:'100%', background:c, borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, color:'var(--t3)', fontFamily:'IBM Plex Mono', width:14, textAlign:'right' }}>{n}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── LAUNCH CENTER ──────────────────────────────────────
function LaunchCenter() {
  const [jobType, setJobType] = React.useState('full_hunt');
  const [client,  setClient]  = React.useState('acme');
  const [source,  setSource]  = React.useState('all');
  const [theme,   setTheme_]  = React.useState('');
  const [period,  setPeriod]  = React.useState('7');
  const [launched,setLaunched]= React.useState(false);
  const [launching,setLaunching]=React.useState(false);
  const [step,    setStep]    = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);
  const timerRef = React.useRef(null);

  const PRESETS = [
    { id:'ransomware', label:'Ransomware Hunt',    theme:'ransomware LockBit encryption lateral movement',  color:'var(--red)',    icon:ICONS.target },
    { id:'phishing',   label:'Phishing Sweep',     theme:'phishing spearphishing credential harvest email', color:'var(--amber)',  icon:ICONS.alerts },
    { id:'apt',        label:'APT IoC Refresh',    theme:'APT29 Cozy Bear nation-state persistence',         color:'var(--purple)', icon:ICONS.shield },
    { id:'telemetry',  label:'Telemetry Check',    theme:'',                                                 color:'var(--ice)',    icon:ICONS.server },
    { id:'health',     label:'Client Health Sweep',theme:'',                                                 color:'var(--green)',  icon:ICONS.activity },
  ];

  const actionCards = [
    { id:'full_hunt',  icon:ICONS.target,      label:'Full Threat Hunt',          desc:'Collect → NLP → correlate → alert → report',  color:'var(--teal)' },
    { id:'collection', icon:ICONS.collections, label:'Intelligence Collection',   desc:'Pull and ingest from threat intelligence feeds', color:'var(--ice)' },
    { id:'enrich',     icon:ICONS.shield,      label:'IoC Enrichment',            desc:'Enrich via VirusTotal, Shodan, AbuseIPDB',      color:'var(--purple)' },
    { id:'telemetry',  icon:ICONS.server,      label:'Client Telemetry',          desc:'Collect logs and telemetry from client env',    color:'var(--amber)' },
    { id:'report',     icon:ICONS.reports,     label:'Report Generation',         desc:'Generate executive or technical hunt report',   color:'var(--green)' },
    { id:'test',       icon:ICONS.activity,    label:'Connection Test',           desc:'Validate VPN, API, and credential health',      color:'var(--teal)' },
  ];

  const stages = ['Collection','NLP','Correlation','Alerts','Report'];
  const stageValid = [true, jobType==='full_hunt'||jobType==='collection', jobType==='full_hunt', jobType==='full_hunt', jobType==='full_hunt'||jobType==='report'];

  // Estimated output based on config
  const estimate = {
    iocs:       jobType==='full_hunt'?'10–40':jobType==='collection'?'20–120':'—',
    correlation:jobType==='full_hunt'?'Yes':'No',
    report:     jobType==='full_hunt'||jobType==='report'?'PDF generated':'None',
    connected:  client!=='',
    duration:   jobType==='full_hunt'?'4–8 min':jobType==='collection'?'2–4 min':'1–2 min',
  };

  const jobId = React.useMemo(() => `HJ-${new Date().toISOString().slice(5,10).replace('-','')}-${Math.floor(Math.random()*900)+100}`, []);

  const handleLaunch = () => {
    setLaunching(true); setStep(0); setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e+1), 1000);
    const interval = setInterval(() => setStep(s => {
      if (s >= 4) { clearInterval(interval); clearInterval(timerRef.current); setLaunched(true); setLaunching(false);
        toast.success('Hunt launched', `Job ${jobId} is now running`); return s; }
      return s+1;
    }), 550);
  };

  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  return (
    <div className="fadeUp">
      <PageHdr title="Launch Center" sub="Operational job launchpad — configure, validate and execute"
        actions={<Btn variant="secondary" size="sm" icon={<Icon d={ICONS.jobs} size={13}/>} onClick={()=>{}}>View Running Jobs</Btn>}/>

      <div style={{ padding:'16px 28px', display:'grid', gridTemplateColumns:'1fr 360px', gap:22 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

          {/* Hunt presets */}
          <div>
            <SectionHdr title="Hunt Presets" sub="One-click operation templates"/>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => { setJobType('full_hunt'); setTheme_(p.theme); }}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:8, cursor:'pointer',
                    background:'var(--bg3)', border:'1px solid var(--b2)', transition:'all .15s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=p.color}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--b2)'}>
                  <Icon d={p.icon} size={13} col={p.color}/>
                  <span style={{ fontSize:12.5, fontWeight:500, color:'var(--t1)' }}>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Operation type cards */}
          <div>
            <SectionHdr title="Operation Type" sub="Select or use a preset above"/>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:9 }}>
              {actionCards.map(a => (
                <div key={a.id} onClick={() => setJobType(a.id)}
                  style={{ padding:'13px', borderRadius:9, border:`1px solid ${jobType===a.id?a.color+'66':'var(--b1)'}`,
                    background:jobType===a.id?a.color+'0d':'var(--bg3)', cursor:'pointer', transition:'all .14s' }}>
                  <div style={{ width:30,height:30,borderRadius:7,background:a.color+'18',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:7 }}>
                    <Icon d={a.icon} size={14} col={a.color}/>
                  </div>
                  <div style={{ fontSize:12.5, fontWeight:600, marginBottom:3 }}>{a.label}</div>
                  <div style={{ fontSize:11, color:'var(--t3)', lineHeight:1.4 }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Launch form */}
          <Card>
            <SectionHdr title="Configure Job" style={{ padding:'14px 18px 12px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'18px', display:'flex', flexDirection:'column', gap:13 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Sel label="Client *" value={client} onChange={setClient} options={[
                  {value:'acme',label:'Acme Corp'},{value:'tech',label:'TechVault Inc'},
                  {value:'bank',label:'GlobalBank Ltd'},{value:'med',label:'MedGroup Health'},{value:'nexus',label:'Nexus Digital'}]}/>
                <Sel label="Source" value={source} onChange={setSource} options={[
                  {value:'all',label:'All Active Sources'},{value:'otx',label:'AlienVault OTX'},
                  {value:'abuse',label:'Abuse.ch'},{value:'circl',label:'CIRCL MISP'}]}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <Inp label="Hunt Theme / Seed" value={theme} onChange={setTheme_} placeholder="ransomware, APT29, lateral movement…"/>
                <Inp label="Period (days)" value={period} onChange={setPeriod} type="number"/>
              </div>
              {/* Inline validation */}
              <div style={{ background:'var(--bg2)', border:'1px solid var(--b1)', borderRadius:8, padding:'12px 14px' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>
                  Estimated Output
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                  {[['Likely IoCs',estimate.iocs,'var(--teal)'],['Correlation',estimate.correlation,'var(--ice)'],
                    ['Report',estimate.report,'var(--green)'],['Duration',estimate.duration,'var(--amber)']].map(([l,v,c])=>(
                    <div key={l} style={{ textAlign:'center', padding:'8px 6px', background:'var(--bg3)', borderRadius:6 }}>
                      <div style={{ fontSize:10.5, color:'var(--t3)', marginBottom:4 }}>{l}</div>
                      <div style={{ fontSize:12.5, fontWeight:600, color:c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {!estimate.connected && <ErrorBanner title="No client selected" body="Select a client to validate the connection before launching."/>}
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <Btn variant="secondary">Save as Template</Btn>
                <Btn variant="primary" loading={launching} onClick={handleLaunch} icon={<Icon d={ICONS.launch} size={14}/>}>
                  Launch Job
                </Btn>
              </div>
            </div>
          </Card>

          {/* Live monitor after launch */}
          {(launching||launched) && (
            <div className="fadeUp" style={{ background:launched?'var(--greenbg)':'var(--tealbg)',
              border:`1px solid ${launched?'rgba(18,196,146,.3)':'var(--bacc)'}`, borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {!launched && <Spinner size={15}/>}
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:launched?'var(--green)':'var(--teal)' }}>
                      {launched?'✓ Job Completed':'● Running…'}
                    </div>
                    <div style={{ fontSize:11.5, color:'var(--t2)', marginTop:2 }}>
                      {launched?'All stages finished successfully':`Stage ${step+1}/5 · Elapsed ${fmt(elapsed)}`}
                    </div>
                  </div>
                </div>
                <Mono>{jobId}</Mono>
              </div>
              <div style={{ padding:'14px 18px', display:'flex', gap:8 }}>
                <Btn size="sm" variant="outline">View Job →</Btn>
                {launched && <><Btn size="sm" variant="secondary">Open IoC Center</Btn><Btn size="sm" variant="secondary">View Alerts</Btn><Btn size="sm" variant="secondary">Download Report</Btn></>}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — workflow + schedule */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Card>
            <SectionHdr title="Pipeline Preview" sub="Stages activate as config validates"
              style={{ padding:'14px 16px 12px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'18px 16px', display:'flex', flexDirection:'column', gap:12 }}>
              {stages.map((s,i) => {
                const active=launching&&step>=i, done=launched||(launching&&step>i);
                return (
                  <div key={s} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:30,height:30,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
                      background:done?'var(--greenbg)':active?'var(--tealbg)':stageValid[i]?'var(--tealbg)':'var(--bg4)',
                      border:`2px solid ${done?'var(--green)':active||stageValid[i]?'var(--teal)':'var(--b2)'}`,
                      color:done?'var(--green)':active||stageValid[i]?'var(--teal)':'var(--t3)', fontSize:11, fontWeight:700 }}>
                      {done?'✓':active?<Spinner size={13}/>:i+1}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:stageValid[i]||done?'var(--t1)':'var(--t3)' }}>{s}</div>
                      <div style={{ fontSize:11, color:'var(--t3)' }}>
                        {['Sources · '+period+'d window','Entity extraction · NLP pipeline','Cross-source IoC matching','Severity scoring · TheHive sync','PDF generation · client delivery'][i]}
                      </div>
                    </div>
                    {(done||stageValid[i])&&!active&&<span style={{ fontSize:10.5, color:done?'var(--green)':'var(--teal)' }}>{done?'Done':'Ready'}</span>}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Scheduled runs */}
          <Card>
            <SectionHdr title="Scheduled Jobs" sub="Next 24h"
              style={{ padding:'14px 16px 12px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:9 }}>
              {[['09:00','Full Hunt — Acme Corp','var(--teal)','Recurring · Daily'],
                ['11:00','Collection — All Sources','var(--ice)','One-time'],
                ['14:00','Telemetry — MedGroup','var(--amber)','Recurring · Weekly'],
                ['18:00','Full Hunt — TechVault','var(--teal)','Recurring · Daily'],
                ['22:00','Report Gen — GlobalBank','var(--green)','Triggered by hunt']].map(([t,l,c,sub])=>(
                <div key={t} style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ fontFamily:'IBM Plex Mono', fontSize:11, color:'var(--t3)', flexShrink:0, width:40 }}>{t}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12.5, color:'var(--t1)' }}>{l}</div>
                    <div style={{ fontSize:10.5, color:'var(--t4)' }}>{sub}</div>
                  </div>
                  <span style={{ width:6,height:6,borderRadius:'50%',background:c,flexShrink:0 }}/>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHdr title="Resource Usage" style={{ padding:'14px 16px 12px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
              <ProgressBar label="CPU" value={43} showPct color="var(--teal)"/>
              <ProgressBar label="Memory" value={67} showPct color="var(--amber)"/>
              <ProgressBar label="Elastic Disk" value={54} showPct color="var(--ice)"/>
              <ProgressBar label="MinIO" value={31} showPct color="var(--green)"/>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}


Object.assign(window, { AdminDashboard, LaunchCenter });
