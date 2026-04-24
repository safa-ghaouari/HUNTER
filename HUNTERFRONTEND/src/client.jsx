
// ═══════════════════════════════════════════════════════
//  CLIENT PORTAL — All 6 client-facing screens
// ═══════════════════════════════════════════════════════

const CLIENT_ALERTS = [
  { id:'ALT-001', sev:'critical', title:'Cobalt Strike Beacon Detected',        asset:'CORP-WS-042',    time:'08:47', technique:'T1071.001', status:'open',        soc:'Investigating — analyst assigned' },
  { id:'ALT-002', sev:'critical', title:'C2 Communication to Malicious IP',     asset:'GBANK-WKS-011',  time:'08:32', technique:'T1071.004', status:'investigating',soc:'Case management case created. Containment pending.' },
  { id:'ALT-003', sev:'high',     title:'Lateral Movement via WMI',             asset:'TV-DC-PROD-01',  time:'07:58', technique:'T1047',     status:'open',        soc:'Under review by SOC team' },
  { id:'ALT-004', sev:'high',     title:'Credential Dump — LSASS Access',       asset:'MG-SRV-PROD-02', time:'07:32', technique:'T1003.001', status:'open',        soc:'Awaiting forensic snapshot' },
  { id:'ALT-005', sev:'medium',   title:'Suspicious PowerShell Execution',      asset:'ACME-WS-018',    time:'06:15', technique:'T1059.001', status:'investigating',soc:'Analyst reviewing script content' },
  { id:'ALT-006', sev:'medium',   title:'Anomalous DNS Query to Unknown Domain', asset:'TV-WKS-007',    time:'05:44', technique:'T1071.004', status:'open',        soc:'Under review — your SOC team is investigating the flagged network activity' },
  { id:'ALT-007', sev:'low',      title:'File Downloaded from External URL',    asset:'ACME-WS-031',    time:'04:22', technique:'T1105',     status:'resolved',    soc:'False positive confirmed. Closed.' },
];

const CLIENT_REPORTS = [
  { id:'REP-041', type:'Exec Summary', period:'Apr 14–21, 2026', created:'2026-04-21', size:'2.4 MB', status:'ready',      highlights:'3 alerts raised, 0 critical, 14 threat indicators identified. Low risk posture.' },
  { id:'REP-036', type:'Exec Summary', period:'Apr 7–14, 2026',  created:'2026-04-18', size:'1.9 MB', status:'ready',      highlights:'2 alerts raised, 0 critical. Network scan activity noted.' },
  { id:'REP-030', type:'Hunt Report',  period:'Mar 31–Apr 7',    created:'2026-04-11', size:'3.8 MB', status:'ready',      highlights:'Technical analysis. Lateral movement attempt detected and blocked.' },
  { id:'REP-023', type:'Exec Summary', period:'Mar 24–31, 2026', created:'2026-04-04', size:'2.1 MB', status:'ready',      highlights:'Clean week. No significant threats detected.' },
  { id:'REP-038', type:'Hunt Report',  period:'Apr 14–21, 2026', created:'2026-04-21', size:'—',      status:'generating', highlights:'Technical threat hunt report — generating' },
];

const CLIENT_HUNTS = [
  { id:'HJ-0421-007', type:'Security Scan', status:'completed', start:'2026-04-21 08:28', end:'2026-04-21 08:32', progress:100, outcome:'14 threat indicators identified. 2 alerts raised. Executive report generated and ready to download.', risk:'Medium' },
  { id:'HJ-0421-006', type:'Threat Intelligence Update', status:'running', start:'2026-04-21 08:45', end:'—', progress:62, outcome:'In progress — your SOC team is analysing the latest threat intelligence against your environment.', risk:'—' },
  { id:'HJ-0420-002', type:'Security Scan', status:'completed', start:'2026-04-20 14:00', end:'2026-04-20 14:05', progress:100, outcome:'27 threat indicators identified across your environment. 5 alerts raised. High-risk week — SOC is actively investigating.', risk:'High' },
  { id:'HJ-0419-004', type:'Security Scan', status:'completed', start:'2026-04-19 09:00', end:'2026-04-19 09:07', progress:100, outcome:'9 indicators reviewed. 1 low-severity alert. No significant findings — normal baseline activity.', risk:'Low' },
];

const CLIENT_ASSETS = [
  { host:'CORP-WS-042',   ip:'192.168.10.42', type:'Workstation', os:'Windows 11',      alerts:2, sev:'critical', lastSeen:'08:47', tags:['C2','Beacon'] },
  { host:'MG-SRV-PROD-02',ip:'10.20.5.12',   type:'Server',      os:'Windows Server 22',alerts:2, sev:'high',    lastSeen:'07:32', tags:['Credential Dump'] },
  { host:'TV-DC-PROD-01', ip:'172.16.0.10',  type:'Domain Ctrl', os:'Windows Server 19',alerts:1, sev:'high',    lastSeen:'07:58', tags:['Lateral Movement'] },
  { host:'ACME-WS-018',   ip:'192.168.1.18', type:'Workstation', os:'Windows 10',       alerts:2, sev:'medium',  lastSeen:'06:15', tags:['PowerShell','Download'] },
  { host:'TV-WKS-007',    ip:'172.16.1.7',   type:'Workstation', os:'Windows 11',       alerts:1, sev:'medium',  lastSeen:'05:44', tags:['DNS Anomaly'] },
  { host:'CORP-FW-01',    ip:'10.0.0.1',     type:'Firewall',    os:'pfSense 2.7',      alerts:0, sev:'low',     lastSeen:'04:00', tags:[] },
  { host:'GBANK-WKS-011', ip:'10.8.0.91',    type:'Workstation', os:'Windows 11',       alerts:1, sev:'critical',lastSeen:'08:32', tags:['C2'] },
];

// ── CLIENT DASHBOARD ──────────────────────────────────────────────────────
function ClientDashboard() {
  const sevCols = { critical:'var(--red)', high:'var(--amber)', medium:'var(--ice)', low:'var(--green)' };
  const activities = [
    { title:'Full threat hunt completed — 14 threat indicators identified', time:'08:32', col:'var(--green)' },
    { title:'Critical alert raised on CORP-WS-042', time:'08:47', col:'var(--red)' },
    { title:'Executive report REP-041 generated', time:'07:44', col:'var(--ice)' },
    { title:'Alert ALT-002 moved to investigating', time:'07:30', col:'var(--amber)' },
    { title:'Threat intelligence update completed — 38 indicators', time:'07:15', col:'var(--teal)' },
    { title:'Collection run completed — Threat feed', time:'08:00', col:'var(--teal)' },
  ];

  // Risk arc data — last 7 days
  const riskData = [32, 28, 41, 58, 71, 68, 94];
  const riskLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const maxRisk = 100;
  const svgW = 340, svgH = 100;

  const pts = riskData.map((v, i) => [
    (i / (riskData.length - 1)) * (svgW - 40) + 20,
    svgH - 16 - (v / maxRisk) * (svgH - 32)
  ]);
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length-1][0]} ${svgH-16} L ${pts[0][0]} ${svgH-16} Z`;

  return (
    <div className="fadeUp">
      <PageHdr title="Security Overview" sub="Acme Corp · Threat posture summary — April 21, 2026"
        actions={<><Btn variant="secondary" size="sm" icon={<Icon d={ICONS.download} size={13}/>}>Download Report</Btn></>}/>

      {/* KPI strip */}
      <div style={{ padding:'16px 28px 0', display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
        {[
          { label:'Active Alerts',  value:'7',    color:'var(--amber)', accent:'var(--amber)' },
          { label:'Critical Alerts',value:'2',    color:'var(--red)',   accent:'var(--red)' },
          { label:'Hunt Status',    value:'Live',  color:'var(--teal)',  accent:'var(--teal)' },
          { label:'Ready Reports',  value:'4',    color:'var(--green)', accent:'var(--green)' },
          { label:'Impacted Assets',value:'5',    color:'var(--ice)',   accent:'var(--ice)' },
        ].map(k => <StatCard key={k.label} {...k}/>)}
      </div>

      <div style={{ padding:'20px 28px', display:'grid', gridTemplateColumns:'1fr 320px', gap:20 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Risk Arc / Exposure Wave */}
          <Card>
            <SectionHdr title="Exposure Wave" sub="Risk score over the last 7 days — current: 94 / 100"
              style={{ padding:'14px 18px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}
              action={<Badge color="red">High Risk</Badge>}/>
            <div style={{ padding:'20px 18px', overflow:'hidden' }}>
              <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display:'block' }}>
                <defs>
                  <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--red)" stopOpacity=".25"/>
                    <stop offset="100%" stopColor="var(--red)" stopOpacity=".0"/>
                  </linearGradient>
                </defs>
                <path d={areaD} fill="url(#riskGrad)"/>
                <path d={pathD} fill="none" stroke="var(--red)" strokeWidth="2" strokeLinejoin="round"/>
                {pts.map((p, i) => (
                  <g key={i}>
                    <circle cx={p[0]} cy={p[1]} r={3} fill="var(--red)"/>
                    <text x={p[0]} y={svgH - 2} textAnchor="middle" fontSize="9" fill="var(--t3)">{riskLabels[i]}</text>
                    <text x={p[0]} y={p[1] - 7} textAnchor="middle" fontSize="9" fill="var(--t2)">{riskData[i]}</text>
                  </g>
                ))}
              </svg>
            </div>
          </Card>

          {/* Recent alerts */}
          <Card>
            <SectionHdr title="Recent Alerts" action={<Btn size="sm" variant="ghost">View all →</Btn>}
              style={{ padding:'14px 18px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ display:'flex', flexDirection:'column' }}>
              {CLIENT_ALERTS.slice(0, 5).map((a, i) => (
                <div key={a.id} style={{ display:'flex', gap:12, padding:'12px 18px', borderBottom: i < 4 ? '1px solid var(--b1)' : 'none', alignItems:'center' }}>
                  <Sev level={a.sev} compact/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.title}</div>
                    <div style={{ fontSize:11.5, color:'var(--t3)', marginTop:2, fontFamily:'IBM Plex Mono' }}>{a.asset}</div>
                  </div>
                  <Badge color={{ open:'ice', investigating:'amber', resolved:'green', false_positive:'gray' }[a.status]}>{a.status.replace('_',' ')}</Badge>
                  <span style={{ fontSize:11, color:'var(--t3)', flexShrink:0 }}>{a.time}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Asset exposure summary */}
          <Card>
            <SectionHdr title="Top Impacted Assets" style={{ padding:'14px 18px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}
              action={<Btn size="sm" variant="ghost">View all →</Btn>}/>
            <DataTable compact columns={[
              { key:'host', label:'Hostname', render:v=><Mono small>{v}</Mono> },
              { key:'type', label:'Type', render:v=><Badge color="gray">{v}</Badge> },
              { key:'alerts', label:'Alerts', render:(v,r)=><span style={{ fontFamily:'IBM Plex Mono', fontSize:12, color: v>0?sevCols[r.sev]:'var(--t3)', fontWeight:600 }}>{v}</span> },
              { key:'sev', label:'Max Sev', render:v=><Sev level={v}/> },
              { key:'lastSeen', label:'Last Activity', render:v=><span style={{ fontFamily:'IBM Plex Mono', fontSize:11.5, color:'var(--t3)' }}>{v}</span> },
            ]} rows={CLIENT_ASSETS.filter(a=>a.alerts>0).slice(0,4)}/>
          </Card>
        </div>

        {/* Right panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* SOC Activity feed */}
          <Card style={{ flex:1 }}>
            <SectionHdr title="SOC Activity" sub="Actions taken on your account"
              style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'14px 16px' }}>
              <Timeline events={activities.map(a => ({ title:a.title, time:a.time, color:a.col }))}/>
            </div>
          </Card>

          {/* Severity distribution */}
          <Card>
            <SectionHdr title="Alert Severity" sub="7 open alerts" style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
              {[['Critical','var(--red)',2],['High','var(--amber)',2],['Medium','var(--ice)',2],['Low','var(--green)',1]].map(([l,c,n]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, color:'var(--t2)', width:55, flexShrink:0 }}>{l}</span>
                  <div style={{ flex:1, background:'var(--bg4)', borderRadius:3, height:5 }}>
                    <div style={{ width:`${(n/7)*100}%`, height:'100%', background:c, borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, fontFamily:'IBM Plex Mono', color:'var(--t3)', width:16, textAlign:'right' }}>{n}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Next hunt */}
          <Card>
            <SectionHdr title="Upcoming Hunt" style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--b1)', margin:0 }}/>
            <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>Security Scan</div>
              <div style={{ fontSize:12, color:'var(--t3)' }}>Scheduled: Today 09:00</div>
              <div style={{ fontSize:12, color:'var(--t2)' }}>7-day window · All sources · Analysis + correlation</div>
              <Badge color="teal" dot>Scheduled</Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── CLIENT ALERTS ──────────────────────────────────────────────────────────
function ClientAlerts() {
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState(null);
  const statusColors = { open:'ice', investigating:'amber', resolved:'green', false_positive:'gray' };

  return (
    <div className="fadeUp">
      <PageHdr title="My Alerts" sub="Security detections for your environment — client-safe view"
        tag={<Badge color="red">2 critical</Badge>}/>
      <div style={{ padding:'16px 28px 0', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {['open','investigating','resolved','false_positive'].map(s => (
          <div key={s} onClick={()=>setFilter(filter===s?null:s)} style={{ padding:'12px 16px', background:'var(--bg3)', border:`1px solid ${filter===s?'var(--bacc)':'var(--b1)'}`, borderRadius:8, cursor:'pointer', transition:'all .14s' }}>
            <div style={{ fontSize:10, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>{s.replace('_',' ')}</div>
            <div style={{ fontFamily:'Space Grotesk', fontSize:22, fontWeight:700, color:`var(--${statusColors[s]})` }}>{CLIENT_ALERTS.filter(a=>a.status===s).length}</div>
          </div>
        ))}
      </div>
      <div style={{ padding:'16px 28px' }}>
        <div style={{ marginBottom:14 }}>
          <FilterBar filters={[{id:'critical',label:'Critical'},{id:'high',label:'High'},{id:'open',label:'Open'},{id:'investigating',label:'Investigating'}]}
            active={filter} onChange={setFilter}/>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {(filter ? CLIENT_ALERTS.filter(a=>a.status===filter||a.sev===filter) : CLIENT_ALERTS).map(a => (
            <div key={a.id} onClick={()=>setSelected(a)} style={{ padding:'16px 20px', background:'var(--bg3)', border:'1px solid var(--b1)',
              borderLeft:`4px solid var(--${a.sev==='critical'?'red':a.sev==='high'?'amber':a.sev==='medium'?'ice':'green'})`,
              borderRadius:10, cursor:'pointer', transition:'all .14s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <Sev level={a.sev}/><span style={{ fontSize:14, fontWeight:600, flex:1 }}>{a.title}</span>
                <Badge color={statusColors[a.status]}>{a.status.replace('_',' ')}</Badge>
                <span style={{ fontSize:11.5, color:'var(--t3)', fontFamily:'IBM Plex Mono' }}>{a.time}</span>
              </div>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <Icon d={ICONS.server} size={12} col="var(--t3)"/>
                  <Mono small>{a.asset}</Mono>
                </div>
                <div style={{ fontSize:12, color:'var(--t3)' }}>MITRE: <Mono small>{a.technique}</Mono></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Drawer open={!!selected} onClose={()=>setSelected(null)} width={540} title={selected?.id} subtitle={selected?.title}>
        {selected && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', gap:6 }}><Sev level={selected.sev}/><Badge color={statusColors[selected.status]}>{selected.status.replace('_',' ')}</Badge></div>
            <div style={{ padding:14, background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:8, display:'flex', flexDirection:'column', gap:10 }}>
              {[['What was detected', `A suspicious ${selected.sev}-severity security event was identified on ${selected.asset}. The system observed behavior consistent with ${selected.title.toLowerCase()}.`],
                ['Where it was seen', `Affected host: ${selected.asset}`],
                ['Why it matters', 'This type of activity may indicate an active threat actor attempting to compromise your environment or move laterally.'],
                ['What the SOC is doing', selected.soc],
                ['What you may need to do', selected.status==='resolved'?'No action required. This has been resolved.':'Please avoid using the affected system until cleared by the SOC team. Contact your account manager if you have questions.']
              ].map(([q,a])=>(
                <div key={q} style={{ paddingBottom:10, borderBottom:'1px solid var(--b1)' }}>
                  <div style={{ fontSize:11.5, fontWeight:600, color:'var(--teal)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' }}>{q}</div>
                  <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.7 }}>{a}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Btn size="sm" variant="secondary">Contact SOC</Btn>
              <Btn size="sm" variant="ghost">Download Details</Btn>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── CLIENT REPORTS ──────────────────────────────────────────────────────────
function ClientReports() {
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState(null);

  return (
    <div className="fadeUp">
      <PageHdr title="My Reports" sub="Security reports delivered by your SOC team"
        tag={<Badge color="green">{CLIENT_REPORTS.filter(r=>r.status==='ready').length} ready</Badge>}/>
      <div style={{ padding:'16px 28px' }}>
        <div style={{ marginBottom:14 }}>
          <FilterBar filters={[{id:'ready',label:'Ready'},{id:'generating',label:'Generating'},{id:'Exec Summary',label:'Exec Summary'},{id:'Hunt Report',label:'Hunt Report'}]}
            active={filter} onChange={setFilter}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
          {(filter ? CLIENT_REPORTS.filter(r=>r.status===filter||r.type===filter) : CLIENT_REPORTS).map(r => (
            <div key={r.id} onClick={()=>setSelected(r)} style={{ padding:'20px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:10, cursor:'pointer', transition:'all .14s', display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ width:40, height:48, borderRadius:6, background:r.status==='ready'?'var(--greenbg)':'var(--tealbg)', border:'1px solid var(--bacc)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Icon d={ICONS.reports} size={18} col={r.status==='ready'?'var(--green)':'var(--teal)'}/>
                </div>
                <Badge color={r.status==='ready'?'green':'amber'}>{r.status}</Badge>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>{r.id} — {r.type}</div>
                <div style={{ fontSize:12.5, color:'var(--t2)', marginBottom:6 }}>Period: {r.period}</div>
                <div style={{ fontSize:12, color:'var(--t3)', lineHeight:1.6 }}>{r.highlights}</div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11.5, color:'var(--t3)' }}>{r.created} · {r.size}</span>
                {r.status==='ready' && <Btn size="sm" variant="outline" icon={<Icon d={ICONS.download} size={12}/>} onClick={e=>e.stopPropagation()}>Download</Btn>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Drawer open={!!selected} onClose={()=>setSelected(null)} width={500} title={selected?.id} subtitle={selected?.period}>
        {selected && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', gap:6 }}>
              <Badge color={selected.type==='Exec Summary'?'ice':'teal'}>{selected.type}</Badge>
              <Badge color={selected.status==='ready'?'green':'amber'}>{selected.status}</Badge>
            </div>
            <div style={{ height:180, background:'var(--bg0)', borderRadius:10, border:'1px solid var(--b2)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
              <Icon d={ICONS.reports} size={32} col="var(--t3)"/><span style={{ fontSize:12.5, color:'var(--t3)' }}>Document Preview</span>
            </div>
            <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.7, padding:14, background:'var(--bg3)', borderRadius:8, border:'1px solid var(--b1)' }}>{selected.highlights}</div>
            {[['Report ID',<Mono>{selected.id}</Mono>],['Period',selected.period],['Created',selected.created],['File Size',selected.size]].map(([l,v])=>(
              <div key={l} style={{ display:'flex', justifyContent:'space-between', paddingBottom:10, borderBottom:'1px solid var(--b1)' }}>
                <span style={{ fontSize:12.5, color:'var(--t2)' }}>{l}</span>{v}
              </div>
            ))}
            {selected.status==='ready' && <Btn variant="primary" icon={<Icon d={ICONS.download} size={13}/>}>Download PDF</Btn>}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── CLIENT HUNT STATUS ──────────────────────────────────────────────────────
function ClientHunt() {
  const [selected, setSelected] = React.useState(null);
  const statusColors = { completed:'green', running:'teal', failed:'red', pending:'amber' };

  return (
    <div className="fadeUp">
      <PageHdr title="Hunt Status" sub="Ongoing and completed threat hunts for your environment"/>
      <div style={{ padding:'16px 28px 0', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {[['Completed Hunts','3','var(--green)'],['Active Hunt','1','var(--teal)'],['Avg Hunt Time','5m 44s','var(--ice)']].map(([l,v,c])=>(
          <div key={l} style={{ padding:'14px 16px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:9 }}>
            <div style={{ fontSize:10, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>{l}</div>
            <div style={{ fontFamily:'Space Grotesk', fontSize:24, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ padding:'16px 28px', display:'flex', flexDirection:'column', gap:10 }}>
        {CLIENT_HUNTS.map(h => (
          <div key={h.id} onClick={()=>setSelected(h)} style={{ padding:'18px 20px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:10, cursor:'pointer', transition:'all .14s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
              <Mono small>{h.id}</Mono>
              <Badge color={h.type.includes('Hunt')?'teal':'purple'}>{h.type}</Badge>
              <StatusDot status={h.status} label={h.status.charAt(0).toUpperCase()+h.status.slice(1)}/>
              <span style={{ marginLeft:'auto', fontSize:11.5, color:'var(--t3)' }}>{h.start}</span>
            </div>
            <ProgressBar value={h.progress} height={5} color={h.status==='failed'?'var(--red)':h.status==='running'?'var(--teal)':'var(--green)'}/>
            <div style={{ fontSize:12.5, color:'var(--t2)', marginTop:10, lineHeight:1.6 }}>{h.outcome}</div>
          </div>
        ))}
      </div>
      <Drawer open={!!selected} onClose={()=>setSelected(null)} width={480} title={selected?.id} subtitle={selected?.type}>
        {selected && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <StatusDot status={selected.status} label={selected.status.charAt(0).toUpperCase()+selected.status.slice(1)}/>
            <ProgressBar value={selected.progress} showPct height={6} color={selected.status==='running'?'var(--teal)':'var(--green)'}/>
            {[['Type',selected.type],['Status',selected.status],['Started',selected.start],['Completed',selected.end||'In progress'],['Risk Level',<Badge color={selected.risk==='High'?'red':selected.risk==='Medium'?'amber':selected.risk==='Low'?'green':'gray'}>{selected.risk}</Badge>]].map(([l,v])=>(
              <div key={l} style={{ display:'flex', justifyContent:'space-between', paddingBottom:12, borderBottom:'1px solid var(--b1)' }}>
                <span style={{ fontSize:12.5, color:'var(--t2)' }}>{l}</span>{v}
              </div>
            ))}
            <div style={{ padding:12, background:'var(--bg3)', borderRadius:8, border:'1px solid var(--b1)', fontSize:13, color:'var(--t2)', lineHeight:1.7 }}>{selected.outcome}</div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ── CLIENT ASSETS ───────────────────────────────────────────────────────────
function ClientAssets() {
  const [filter, setFilter] = React.useState(null);
  const rows = filter ? CLIENT_ASSETS.filter(a=>a.sev===filter) : CLIENT_ASSETS;

  return (
    <div className="fadeUp">
      <PageHdr title="Asset Exposure" sub="Impacted hosts and exposure patterns across your environment"/>
      <div style={{ padding:'16px 28px 0', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {[['Total Assets',CLIENT_ASSETS.length,'var(--t1)'],['Impacted',CLIENT_ASSETS.filter(a=>a.alerts>0).length,'var(--amber)'],['Critical',CLIENT_ASSETS.filter(a=>a.sev==='critical').length,'var(--red)'],['Clean',CLIENT_ASSETS.filter(a=>a.alerts===0).length,'var(--green)']].map(([l,v,c])=>(
          <div key={l} style={{ padding:'12px 16px', background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:9 }}>
            <div style={{ fontSize:10, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>{l}</div>
            <div style={{ fontFamily:'Space Grotesk', fontSize:22, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ padding:'16px 28px' }}>
        <div style={{ marginBottom:14 }}>
          <FilterBar filters={[{id:'critical',label:'Critical'},{id:'high',label:'High'},{id:'medium',label:'Medium'}]}
            active={filter} onChange={setFilter}/>
        </div>
        <Card pad={0}>
          <DataTable columns={[
            { key:'host',    label:'Hostname',    render:v=><Mono small>{v}</Mono> },
            { key:'ip',      label:'IP Address',  render:v=><Mono small>{v}</Mono> },
            { key:'type',    label:'Type',        render:v=><Badge color="gray">{v}</Badge> },
            { key:'os',      label:'OS',          render:v=><span style={{fontSize:12,color:'var(--t2)'}}>{v}</span> },
            { key:'alerts',  label:'Alerts',      render:(v,r)=><span style={{fontFamily:'IBM Plex Mono',fontSize:12,fontWeight:600,color:v>0?`var(--${r.sev==='critical'?'red':r.sev==='high'?'amber':'ice'})`:'var(--t3)'}}>{v}</span> },
            { key:'sev',     label:'Max Severity',render:v=><Sev level={v}/> },
            { key:'tags',    label:'Tags',        render:v=><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{v.map(t=><Badge key={t} color="gray">{t}</Badge>)}</div> },
            { key:'lastSeen',label:'Last Activity',render:v=><span style={{fontFamily:'IBM Plex Mono',fontSize:11.5,color:'var(--t3)'}}>{v}</span> },
          ]} rows={rows}/>
        </Card>
      </div>
    </div>
  );
}

// ── CLIENT ACCOUNT ──────────────────────────────────────────────────────────
// NotifToggle: proper component — useState must NOT be called inside .map()
// This component is defined once and instantiated per row via JSX, which is correct.
function NotifToggle({ label, defaultOn }) {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0', borderBottom:'1px solid var(--b1)' }}>
      <span style={{ fontSize:13 }}>{label}</span>
      <button onClick={() => setOn(v => !v)} aria-pressed={on}
        style={{ width:40, height:22, borderRadius:11, background:on?'var(--teal)':'var(--bg4)',
          border:'1px solid var(--b2)', position:'relative', cursor:'pointer', transition:'all .2s',
          outline:'none' }}>
        <div style={{ width:16, height:16, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left:on?20:2, transition:'left .2s' }}/>
      </button>
    </div>
  );
}

function ClientAccount() {
  const [tab, setTab] = React.useState('profile');

  return (
    <div className="fadeUp">
      <PageHdr title="Account & Support" sub="Profile, preferences, and contact your SOC team"/>
      <div style={{ padding:'20px 28px', display:'grid', gridTemplateColumns:'200px 1fr', gap:24 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {[['profile','My Profile'],['org','Organization'],['notifications','Notifications'],['downloads','Download History'],['support','Support']].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{ padding:'8px 12px', borderRadius:7, textAlign:'left', fontSize:13, fontWeight:tab===id?600:400,
              background:tab===id?'var(--tealbg)':'transparent', color:tab===id?'var(--teal)':'var(--t2)',
              border:`1px solid ${tab===id?'var(--bacc)':'transparent'}`, cursor:'pointer', transition:'all .13s' }}>{label}</button>
          ))}
        </div>
        <Card style={{ minHeight:320 }}>
          {tab==='profile' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:440 }}>
              <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:8, paddingBottom:16, borderBottom:'1px solid var(--b1)' }}>
                <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#0dbab5,#5ba4f5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, color:'#fff' }}>SC</div>
                <div><div style={{ fontSize:16, fontWeight:700 }}>Sarah Chen</div><div style={{ fontSize:12.5, color:'var(--t3)' }}>Security Manager · Acme Corp</div></div>
              </div>
              <Inp label="Full Name" value="Sarah Chen" onChange={()=>{}}/>
              <Inp label="Email" value="s.chen@acmecorp.com" onChange={()=>{}} type="email"/>
              <Inp label="Job Title" value="Security Manager" onChange={()=>{}}/>
              <Btn variant="primary">Save Changes</Btn>
            </div>
          )}
          {tab==='org' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:440 }}>
              {[['Organization','Acme Corp'],['Client ID',<Mono>C001</Mono>],['Environment','On-Prem + AWS'],['Active Users',8],['Contract','Enterprise — Annual'],['SOC Account Manager','James Dalton'],['Account Manager Email',<Mono small>james.dalton@hunter.soc</Mono>]].map(([l,v])=>(
                <div key={l} style={{ display:'flex', justifyContent:'space-between', paddingBottom:12, borderBottom:'1px solid var(--b1)' }}>
                  <span style={{ fontSize:12.5, color:'var(--t2)' }}>{l}</span>{v}
                </div>
              ))}
            </div>
          )}
          {tab==='support' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:480 }}>
              <div style={{ padding:18, background:'var(--tealbg)', border:'1px solid var(--bacc)', borderRadius:10 }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>24/7 SOC Hotline</div>
                <div style={{ fontSize:13, color:'var(--t2)' }}>For critical incidents, call your dedicated SOC number</div>
                <div style={{ fontFamily:'IBM Plex Mono', fontSize:16, fontWeight:600, color:'var(--teal)', marginTop:8 }}>+1 (800) 555-0199</div>
              </div>
              <div style={{ padding:16, background:'var(--bg3)', border:'1px solid var(--b1)', borderRadius:10 }}>
                <div style={{ fontSize:13.5, fontWeight:600, marginBottom:8 }}>Escalation Contacts</div>
                {[['Tier 1 — Alert Triage','soc-tier1@hunter.soc'],['Tier 2 — Incident Response','ir@hunter.soc'],['Account Manager','james.dalton@hunter.soc']].map(([l,e])=>(
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', paddingBottom:10, borderBottom:'1px solid var(--b1)', marginBottom:10 }}>
                    <span style={{ fontSize:12, color:'var(--t2)' }}>{l}</span><Mono small>{e}</Mono>
                  </div>
                ))}
              </div>
              <Btn variant="outline" icon={<Icon d={ICONS.link} size={13}/>}>Open Support Ticket</Btn>
            </div>
          )}
          {tab==='downloads' && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <SectionHdr title="Download History" sub="Recent file downloads"/>
              {[['REP-041 — Acme Corp Exec Summary.pdf','2.4 MB','2026-04-21 07:44'],['REP-036 — Exec Summary.pdf','1.9 MB','2026-04-18 16:00'],['REP-030 — Hunt Report.pdf','3.8 MB','2026-04-11 12:00']].map(([n,s,t])=>(
                <div key={n} style={{ display:'flex', gap:12, padding:'12px 16px', background:'var(--bg3)', borderRadius:8, border:'1px solid var(--b1)', alignItems:'center' }}>
                  <Icon d={ICONS.download} size={15} col="var(--teal)"/>
                  <div style={{ flex:1 }}><div style={{ fontSize:13 }}>{n}</div><div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{s} · {t}</div></div>
                  <Btn size="sm" variant="ghost" icon={<Icon d={ICONS.download} size={12}/>}>Re-download</Btn>
                </div>
              ))}
            </div>
          )}
          {tab==='notifications' && (
            <div style={{ maxWidth:440 }}>
              <SectionHdr title="Notification Preferences"/>
              {[['Email on Critical Alert',true],['Email on Report Ready',true],['Email on Hunt Completion',false],['Weekly Digest',true]].map(([l,def])=>(
                <NotifToggle key={l} label={l} defaultOn={def}/>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { ClientDashboard, ClientAlerts, ClientReports, ClientHunt, ClientAssets, ClientAccount });
