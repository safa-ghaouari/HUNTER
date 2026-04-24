
// ── CONSTELLATION CANVAS ─────────────────────────────────────────────────
function Constellation({ width, height }) {
  const canvasRef = React.useRef(null);
  const animRef = React.useRef(null);
  const frameRef = React.useRef(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    const nodes = [
      // Sources (left)
      { id: 'otx',    x: .09, y: .22, r: 11, col: '#5ba4f5', label: 'OTX',        type: 'src' },
      { id: 'abuse',  x: .09, y: .38, r: 10, col: '#a78bfa', label: 'Abuse.ch',   type: 'src' },
      { id: 'circl',  x: .09, y: .54, r: 10, col: '#12c492', label: 'CIRCL',      type: 'src' },
      { id: 'secwk',  x: .09, y: .70, r: 11, col: '#f4a20e', label: 'Secureworks',type: 'src' },
      { id: 'feodo',  x: .09, y: .84, r: 9,  col: '#0dbab5', label: 'Feodo',      type: 'src' },
      // Process (center-left)
      { id: 'collect',x: .34, y: .30, r: 16, col: '#5ba4f5', label: 'Collect',    type: 'proc' },
      { id: 'hunt',   x: .34, y: .55, r: 18, col: '#0dbab5', label: 'Hunt',       type: 'proc' },
      { id: 'nlp',    x: .34, y: .78, r: 14, col: '#a78bfa', label: 'NLP',        type: 'proc' },
      // Correlate (center)
      { id: 'corr',   x: .55, y: .40, r: 20, col: '#f4a20e', label: 'Correlate',  type: 'core' },
      { id: 'alert',  x: .55, y: .68, r: 16, col: '#f04565', label: 'Alert',      type: 'core', critical: true },
      // Clients (right)
      { id: 'acme',   x: .78, y: .22, r: 13, col: '#0dbab5', label: 'Acme Corp',  type: 'client' },
      { id: 'tvault', x: .78, y: .42, r: 12, col: '#5ba4f5', label: 'TechVault',  type: 'client' },
      { id: 'gbank',  x: .78, y: .60, r: 13, col: '#f04565', label: 'GlobalBank', type: 'client', critical: true },
      { id: 'med',    x: .78, y: .78, r: 11, col: '#12c492', label: 'MedGroup',   type: 'client' },
      // Outputs
      { id: 'report', x: .93, y: .34, r: 10, col: '#12c492', label: 'Report',     type: 'out' },
      { id: 'case',   x: .93, y: .65, r: 10, col: '#f04565', label: 'Case',       type: 'out' },
    ];

    const edges = [
      ['otx','collect'], ['abuse','collect'], ['circl','nlp'], ['secwk','hunt'],
      ['feodo','hunt'], ['otx','hunt'], ['abuse','nlp'],
      ['collect','corr'], ['hunt','corr'], ['nlp','corr'],
      ['corr','alert'], ['corr','acme'], ['corr','tvault'],
      ['alert','gbank'], ['alert','med'],
      ['acme','report'], ['tvault','report'], ['gbank','case'], ['med','case'],
    ];

    const getPos = id => { const n = nodes.find(n => n.id === id); return n ? [n.x * W, n.y * H] : null; };

    // Particles per edge
    const particles = [];
    edges.forEach(([f, t]) => {
      const cnt = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < cnt; i++) {
        particles.push({ from: f, to: t, t: Math.random(), speed: .0015 + Math.random() * .002 });
      }
    });

    let critPulse = 0;

    function draw() {
      frameRef.current++;
      const fr = frameRef.current;
      ctx.clearRect(0, 0, W, H);

      // Draw edges
      edges.forEach(([f, t]) => {
        const fp = getPos(f), tp = getPos(t);
        if (!fp || !tp) return;
        const fn = nodes.find(n => n.id === f);
        const tn = nodes.find(n => n.id === t);
        const grd = ctx.createLinearGradient(...fp, ...tp);
        grd.addColorStop(0, (fn?.col || '#0dbab5') + '30');
        grd.addColorStop(1, (tn?.col || '#0dbab5') + '55');
        ctx.beginPath(); ctx.moveTo(...fp); ctx.lineTo(...tp);
        ctx.strokeStyle = grd; ctx.lineWidth = .9; ctx.stroke();
      });

      // Draw particles
      particles.forEach(p => {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;
        const fp = getPos(p.from), tp = getPos(p.to);
        if (!fp || !tp) return;
        const px = fp[0] + (tp[0] - fp[0]) * p.t;
        const py = fp[1] + (tp[1] - fp[1]) * p.t;
        const fn = nodes.find(n => n.id === p.from);
        const col = fn?.col || '#0dbab5';
        const grd = ctx.createRadialGradient(px, py, 0, px, py, 3.5);
        grd.addColorStop(0, col + 'ee'); grd.addColorStop(1, col + '00');
        ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
      });

      // Draw nodes
      nodes.forEach(n => {
        const px = n.x * W, py = n.y * H;

        // Glow halo
        const grd = ctx.createRadialGradient(px, py, 0, px, py, n.r * 3);
        grd.addColorStop(0, n.col + '28'); grd.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(px, py, n.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();

        // Ring
        ctx.beginPath(); ctx.arc(px, py, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.col + '1a'; ctx.fill();
        ctx.strokeStyle = n.col + (n.type === 'core' ? 'cc' : '77');
        ctx.lineWidth = n.type === 'core' ? 1.5 : 1.2; ctx.stroke();

        // Inner dot
        ctx.beginPath(); ctx.arc(px, py, n.r * .32, 0, Math.PI * 2);
        ctx.fillStyle = n.col + 'dd'; ctx.fill();

        // Critical pulse ring
        if (n.critical) {
          const phase = (fr % 90) / 90;
          const pr = n.r + phase * n.r * 2.8;
          const alpha = Math.floor((1 - phase) * 80).toString(16).padStart(2, '0');
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.strokeStyle = n.col + alpha; ctx.lineWidth = 1.2; ctx.stroke();
        }

        // Label — adapt to theme
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        ctx.font = `10px 'IBM Plex Mono', monospace`;
        ctx.fillStyle = isDark ? 'rgba(180,210,240,0.65)' : 'rgba(30,60,90,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, px, py + n.r + 13);
      });

      // Occasional alert burst
      if (fr % 200 === 0) critPulse = fr;
      if (fr - critPulse < 40 && critPulse > 0) {
        const n = nodes.find(n => n.id === 'gbank');
        if (n) {
          const phase = (fr - critPulse) / 40;
          const px = n.x * W, py = n.y * H;
          const pr = n.r + phase * 60;
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(240,69,101,${(1 - phase) * 0.5})`;
          ctx.lineWidth = 2; ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: '100%', display: 'block' }}/>;
}

// ── ICONS ─────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16, col, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={col || 'currentColor'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
  </svg>
);

const ICONS = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  launch: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  clients: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2','M23 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75'],
  sources: 'M12 2a10 10 0 0 1 0 20A10 10 0 0 1 2 12m10-8v16M2 12h20M4.9 5A15.7 15.7 0 0 1 12 4c3 0 5.6.8 7.1 2M4.9 19A15.7 15.7 0 0 0 12 20c3 0 5.6-.8 7.1-2',
  collections: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  jobs: 'M22 12h-4l-3 9L9 3l-3 9H2',
  ioc: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  alerts: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  reports: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  platform: 'M2 12h2M6 12h2M10 12h2M14 12h2M18 12h2M4 6h16M4 18h16M4 9v6M20 9v6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  chevronRight: 'M9 18l6-6-6-6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  plus: 'M12 5v14M5 12h14',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  target: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z','M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z','M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  globe: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 1 2 12m10-8v16M2 12h20M4.9 5A15.7 15.7 0 0 1 12 4c3 0 5.6.8 7.1 2M4.9 19A15.7 15.7 0 0 0 12 20c3 0 5.6-.8 7.1-2',
  box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  server: ['M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z','M2 15a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z','M6 8h.01M6 18h.01'],
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  trending: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
};

// ── SIDEBAR ──────────────────────────────────────────────────────────────
const ADMIN_NAV = [
  { id: 'dashboard',   label: 'Overview',      icon: 'dashboard',   group: 'main' },
  { id: 'launch',      label: 'Launch Center', icon: 'launch',      group: 'main' },
  { id: 'clients',     label: 'Clients',       icon: 'clients',     group: 'ops' },
  { id: 'sources',     label: 'Sources',       icon: 'sources',     group: 'ops' },
  { id: 'collections', label: 'Collections',   icon: 'collections', group: 'ops' },
  { id: 'jobs',        label: 'Hunting Jobs',  icon: 'jobs',        group: 'intel' },
  { id: 'ioc',         label: 'IoC Center',    icon: 'ioc',         group: 'intel' },
  { id: 'alerts',      label: 'Alerts',        icon: 'alerts',      group: 'intel', badgeColor: 'red' },
  { id: 'reports',     label: 'Reports',       icon: 'reports',     group: 'intel' },
  { id: 'platform',    label: 'Platform',      icon: 'platform',    group: 'system' },
  { id: 'settings',    label: 'Settings',      icon: 'settings',    group: 'system' },
];

const CLIENT_NAV = [
  { id: 'c-dashboard', label: 'Overview',      icon: 'dashboard',   group: 'main' },
  { id: 'c-alerts',    label: 'Alerts',        icon: 'alerts',      group: 'main', badgeColor: 'red' },
  { id: 'c-reports',   label: 'Reports',       icon: 'reports',     group: 'main' },
  { id: 'c-hunt',      label: 'Hunt Status',   icon: 'jobs',        group: 'main' },
  { id: 'c-assets',    label: 'Asset Exposure',icon: 'shield',      group: 'main' },
  { id: 'c-account',   label: 'Account',       icon: 'user',        group: 'settings' },
];

const GROUP_LABELS = { main: 'MAIN', ops: 'OPERATIONS', intel: 'INTELLIGENCE', system: 'SYSTEM', settings: 'SETTINGS' };

function Sidebar({ page, setPage, portal, theme, setTheme }) {
  const nav = portal === 'admin' ? ADMIN_NAV : CLIENT_NAV;
  let lastGroup = null;

  // Live sidebar badge counts — pages call window.__hunterSetBadges({id: count})
  const [badges, setBadges] = React.useState({});
  React.useEffect(() => {
    window.__hunterSetBadges = (updates) => setBadges(b => Object.assign({}, b, updates));
    return () => { delete window.__hunterSetBadges; };
  }, []);

  // Resolve user display info from persisted context
  const user = window.__hunterUser || {};
  const userEmail = user.email || '';
  const userInitials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : (portal === 'admin' ? 'AD' : 'CL');
  const userDisplay = userEmail || (portal === 'admin' ? 'Admin' : 'Client');
  const userRole = portal === 'admin' ? 'SOC Admin' : 'Client Portal';

  return (
    <div style={{ width: 'var(--sw, 232px)', background: 'var(--bg1)', borderRight: '1px solid var(--b1)',
      display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0, overflow: 'hidden' }}>

      {/* Logo */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--b1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#0dbab5,#5ba4f5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon d={ICONS.target} size={15} col="#fff"/>
          </div>
          <div>
            <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 15, letterSpacing: '.04em', color: 'var(--t1)' }}>HUNTER</div>
            <div style={{ fontSize: 9.5, color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 1 }}>Threat Intelligence</div>
          </div>
        </div>
      </div>

      {/* Role badge */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--b1)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6,
          background: portal === 'admin' ? 'var(--tealbg)' : 'var(--icebg)',
          border: `1px solid ${portal === 'admin' ? 'var(--bacc)' : 'rgba(77,168,255,0.28)'}` }}>
          <Icon d={portal === 'admin' ? ICONS.shield : ICONS.user} size={11}
            col={portal === 'admin' ? 'var(--teal)' : 'var(--ice)'}/>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
            color: portal === 'admin' ? 'var(--teal)' : 'var(--ice)' }}>
            {portal === 'admin' ? 'SOC ADMIN' : 'CLIENT'}
          </span>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {nav.map(item => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          const active = page === item.id;
          return (
            <React.Fragment key={item.id}>
              {showGroup && (
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--t4)', letterSpacing: '.1em',
                  textTransform: 'uppercase', padding: '14px 8px 5px', marginTop: 2 }}>
                  {GROUP_LABELS[item.group]}
                </div>
              )}
              <button onClick={() => setPage(item.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                borderRadius: 7, background: active ? 'var(--tealbg)' : 'transparent',
                border: `1px solid ${active ? 'var(--bacc)' : 'transparent'}`,
                color: active ? 'var(--teal)' : 'var(--t2)', cursor: 'pointer', transition: 'all .13s',
                fontSize: 13, fontWeight: active ? 600 : 400, marginBottom: 1 }}>
                <Icon d={ICONS[item.icon]} size={15} col={active ? 'var(--teal)' : 'var(--t3)'}/>
                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                {badges[item.id] !== undefined && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, minWidth: 20, textAlign: 'center',
                    background: item.badgeColor === 'red' ? 'var(--redbg)' : 'var(--bg4)',
                    color: item.badgeColor === 'red' ? 'var(--red)' : 'var(--t3)',
                    border: `1px solid ${item.badgeColor === 'red' ? 'rgba(240,69,101,0.3)' : 'var(--b2)'}` }}>
                    {badges[item.id]}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Bottom: theme toggle + user */}
      <div style={{ borderTop: '1px solid var(--b1)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px',
            background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 7,
            color: 'var(--t2)', cursor: 'pointer', fontSize: 12, width: '100%', transition: 'all .14s' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon d={theme === 'dark' ? ICONS.sun : ICONS.moon} size={13} col="var(--teal)"/>
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </span>
          <div style={{ width: 32, height: 17, borderRadius: 9, background: theme === 'dark' ? 'var(--bg4)' : 'var(--teal)',
            border: '1px solid var(--b2)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#fff', position: 'absolute',
              top: 2, left: theme === 'dark' ? 2 : 17, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}/>
          </div>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 6px' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#0dbab5,#5ba4f5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {userInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userDisplay}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{userRole}</div>
          </div>
          <button onClick={() => window.__hunterLogout && window.__hunterLogout()}
            title="Sign out"
            style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:5, display:'flex', alignItems:'center', color:'var(--t3)', transition:'color .13s' }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--red)'}
            onMouseLeave={e=>e.currentTarget.style.color='var(--t3)'}>
            <Icon d={ICONS.logout} size={14} col="currentColor"/>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── COMMAND PALETTE ───────────────────────────────────────────────────────
const CMD_ITEMS = [
  // Admin pages
  { type:'page', label:'SOC Overview',      desc:'Admin dashboard',         page:'dashboard',   icon:'dashboard',  portal:'admin' },
  { type:'page', label:'Launch Center',     desc:'Start a new hunt',        page:'launch',      icon:'launch',     portal:'admin' },
  { type:'page', label:'Clients',           desc:'Tenant management',       page:'clients',     icon:'clients',    portal:'admin' },
  { type:'page', label:'Sources',           desc:'Threat feed registry',    page:'sources',     icon:'sources',    portal:'admin' },
  { type:'page', label:'Collections',       desc:'Collection run history',  page:'collections', icon:'collections',portal:'admin' },
  { type:'page', label:'Hunting Jobs',      desc:'Async job queue',         page:'jobs',        icon:'jobs',       portal:'admin' },
  { type:'page', label:'IoC Center',        desc:'Indicator workstation',   page:'ioc',         icon:'ioc',        portal:'admin' },
  { type:'page', label:'Alerts & Cases',    desc:'SOC triage queue',        page:'alerts',      icon:'alerts',     portal:'admin' },
  { type:'page', label:'Reports',           desc:'Hunt report library',     page:'reports',     icon:'reports',    portal:'admin' },
  { type:'page', label:'Platform',          desc:'Integration health',      page:'platform',    icon:'platform',   portal:'admin' },
  { type:'page', label:'Settings',          desc:'Platform preferences',    page:'settings',    icon:'settings',   portal:'admin' },
  // Client pages
  { type:'page', label:'Client Overview',   desc:'Security dashboard',      page:'c-dashboard', icon:'dashboard',  portal:'client' },
  { type:'page', label:'My Alerts',         desc:'Active detections',       page:'c-alerts',    icon:'alerts',     portal:'client' },
  { type:'page', label:'My Reports',        desc:'SOC-delivered reports',   page:'c-reports',   icon:'reports',    portal:'client' },
  { type:'page', label:'Hunt Status',       desc:'Active hunts',            page:'c-hunt',      icon:'jobs',       portal:'client' },
  { type:'page', label:'Asset Exposure',    desc:'Impacted hosts',          page:'c-assets',    icon:'shield',     portal:'client' },
  // Recent IoCs
  { type:'ioc',  label:'45.33.32.156',      desc:'IPv4 · Critical · APT29 C2',  page:'ioc', icon:'ioc' },
  { type:'ioc',  label:'d4c1e92ab7f3.xyz',  desc:'Domain · High · Phishing',    page:'ioc', icon:'ioc' },
  { type:'ioc',  label:'CVE-2024-3094',     desc:'CVE · Critical · XZ Backdoor',page:'ioc', icon:'ioc' },
  // Recent clients
  { type:'client',label:'Acme Corp',        desc:'Risk 42 · 3 alerts',      page:'clients', icon:'clients' },
  { type:'client',label:'MedGroup Health',  desc:'Risk 94 · 12 alerts',     page:'clients', icon:'clients' },
  { type:'client',label:'TechVault Inc',    desc:'Risk 71 · 7 alerts',      page:'clients', icon:'clients' },
  // Recent alerts
  { type:'alert', label:'ALT-001: Cobalt Strike Beacon',   desc:'Critical · MedGroup',  page:'alerts', icon:'alerts' },
  { type:'alert', label:'ALT-002: C2 Communication',       desc:'Critical · GlobalBank', page:'alerts', icon:'alerts' },
  // Recent jobs
  { type:'job',   label:'HJ-0421-007 Full Hunt',           desc:'Completed · Acme Corp', page:'jobs', icon:'jobs' },
  { type:'job',   label:'HJ-0421-006 IoC Enrichment',      desc:'Running · TechVault',   page:'jobs', icon:'jobs' },
];

const TYPE_COLORS = { page:'var(--teal)', ioc:'var(--purple)', client:'var(--ice)', alert:'var(--red)', job:'var(--amber)' };
const TYPE_LABELS = { page:'Page', ioc:'IoC', client:'Client', alert:'Alert', job:'Job' };

function CommandPalette({ open, onClose, setPage, portal }) {
  const [q, setQ] = React.useState('');
  const inputRef = React.useRef(null);
  const [sel, setSel] = React.useState(0);

  React.useEffect(() => {
    if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  React.useEffect(() => {
    const fn = e => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') setSel(s => Math.min(s+1, filtered.length-1));
      if (e.key === 'ArrowUp') setSel(s => Math.max(s-1, 0));
      if (e.key === 'Enter' && filtered[sel]) { setPage(filtered[sel].page); onClose(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, sel, q]);

  const filtered = React.useMemo(() => {
    const lq = q.toLowerCase();
    const items = CMD_ITEMS.filter(i => !i.portal || i.portal === portal || portal === 'admin');
    if (!lq) return items.slice(0, 10);
    return items.filter(i => i.label.toLowerCase().includes(lq) || i.desc.toLowerCase().includes(lq)).slice(0, 12);
  }, [q, portal]);

  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(3,8,16,.7)', zIndex:600, backdropFilter:'blur(4px)' }}/>
      <div className="fadeUp" style={{ position:'fixed', top:'18%', left:'50%', transform:'translateX(-50%)',
        width:560, background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:14,
        zIndex:601, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,.6)' }}>
        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', borderBottom:'1px solid var(--b1)' }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
            placeholder="Search pages, clients, IoCs, alerts, jobs…"
            style={{ flex:1, background:'none', border:'none', color:'var(--t1)', fontSize:14, outline:'none' }}/>
          <kbd style={{ fontSize:10.5, color:'var(--t3)', background:'var(--bg4)', border:'1px solid var(--b2)',
            padding:'2px 6px', borderRadius:4 }}>ESC</kbd>
        </div>
        {/* Results */}
        <div style={{ maxHeight:360, overflowY:'auto' }}>
          {!q && <div style={{ fontSize:10.5, color:'var(--t3)', padding:'10px 18px 6px', letterSpacing:'.07em', textTransform:'uppercase' }}>Recent & Quick Navigation</div>}
          {filtered.map((item, i) => (
            <div key={i} onClick={() => { setPage(item.page); onClose(); }}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 18px', cursor:'pointer',
                background:sel===i?'var(--bghov)':'transparent', transition:'background .1s',
                borderBottom:'1px solid var(--b1)' }}
              onMouseEnter={() => setSel(i)}>
              <div style={{ width:30, height:30, borderRadius:7, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                background:TYPE_COLORS[item.type]+'15', border:`1px solid ${TYPE_COLORS[item.type]}30` }}>
                <Icon d={ICONS[item.icon]} size={14} col={TYPE_COLORS[item.type]}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:500, color:'var(--t1)' }}>{item.label}</div>
                <div style={{ fontSize:11.5, color:'var(--t3)', marginTop:1 }}>{item.desc}</div>
              </div>
              <span style={{ fontSize:10.5, fontWeight:600, padding:'2px 7px', borderRadius:4,
                background:TYPE_COLORS[item.type]+'18', color:TYPE_COLORS[item.type] }}>
                {TYPE_LABELS[item.type]}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding:'32px 18px', textAlign:'center', color:'var(--t3)', fontSize:13.5 }}>
              No results for "{q}"
            </div>
          )}
        </div>
        <div style={{ padding:'8px 18px', borderTop:'1px solid var(--b1)', display:'flex', gap:16 }}>
          {[['↑↓','Navigate'],['↵','Open'],['Esc','Close']].map(([k,l]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <kbd style={{ fontSize:10.5, color:'var(--t3)', background:'var(--bg4)', border:'1px solid var(--b2)', padding:'1px 6px', borderRadius:3 }}>{k}</kbd>
              <span style={{ fontSize:11, color:'var(--t4)' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── TOPBAR ────────────────────────────────────────────────────────────────
function TopBar({ page, portal, setPage, onCmd }) {
  const [notifOpen, setNotifOpen] = React.useState(false);

  const notifs = [
    { cat:'critical', title:'Cobalt Strike beacon on CORP-WS-042', client:'MedGroup Health', time:'2m ago',  color:'var(--red)',   page:'alerts' },
    { cat:'job',      title:'Hunt HJ-0421-007 completed — 14 IoCs', client:'Acme Corp',      time:'14m ago', color:'var(--green)', page:'jobs' },
    { cat:'source',   title:'MalwareBazaar returning high latency', client:'Global',         time:'28m ago', color:'var(--amber)', page:'sources' },
    { cat:'report',   title:'Report REP-041 ready for download',   client:'Acme Corp',      time:'45m ago', color:'var(--ice)',   page:'reports' },
    { cat:'source',   title:'TheHive integration offline',          client:'Platform',       time:'1h ago',  color:'var(--red)',   page:'platform' },
  ];
  const catLabels = { critical:'Critical Alert', job:'Job', source:'Source', report:'Report' };

  const health = [
    { label:'API', ok:true }, { label:'MISP', ok:true }, { label:'Elastic', ok:true },
    { label:'TheHive', ok:false }, { label:'Redis', ok:true },
  ];

  return (
    <div style={{ height:52, background:'var(--bg1)', borderBottom:'1px solid var(--b1)',
      display:'flex', alignItems:'center', paddingLeft:24, paddingRight:16,
      gap:12, flexShrink:0, position:'relative', zIndex:10 }}>

      {/* Breadcrumb */}
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
        <span style={{ fontSize:11, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em' }}>
          {portal==='admin'?'SOC Admin':'Client Portal'}
        </span>
        <Icon d={ICONS.chevronRight} size={12} col="var(--t4)"/>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--t1)' }}>
          {[...ADMIN_NAV,...CLIENT_NAV].find(n=>n.id===page)?.label||'Dashboard'}
        </span>
      </div>

      {/* Health strip */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {health.map(h => (
          <div key={h.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:h.ok?'var(--green)':'var(--red)', flexShrink:0 }}/>
            <span style={{ fontSize:10.5, color:'var(--t3)' }}>{h.label}</span>
          </div>
        ))}
      </div>

      <div style={{ width:1, height:18, background:'var(--b2)' }}/>

      {/* Cmd+K search trigger */}
      <button onClick={onCmd}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 12px', background:'var(--bg2)',
          border:'1px solid var(--b2)', borderRadius:6, color:'var(--t3)', cursor:'pointer', fontSize:12.5, width:220 }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span style={{ flex:1, textAlign:'left' }}>Search…</span>
        <kbd style={{ fontSize:10, background:'var(--bg4)', border:'1px solid var(--b1)', padding:'1px 5px', borderRadius:3 }}>⌘K</kbd>
      </button>

      {/* Notification bell */}
      <div style={{ position:'relative' }}>
        <button onClick={() => setNotifOpen(o => !o)}
          style={{ position:'relative', background:'none', border:'none', color:'var(--t2)', padding:6, borderRadius:6, cursor:'pointer' }}>
          <Icon d={ICONS.bell} size={16}/>
          <span style={{ position:'absolute', top:2, right:2, width:7, height:7, borderRadius:'50%', background:'var(--red)', border:'1.5px solid var(--bg1)' }}/>
        </button>
        {notifOpen && (
          <div style={{ position:'absolute', top:42, right:0, width:320, background:'var(--bg3)', border:'1px solid var(--b2)',
            borderRadius:11, zIndex:100, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,.45)' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--b1)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:13.5, fontWeight:600 }}>Notifications</span>
              <div style={{ display:'flex', gap:8 }}>
                <span style={{ fontSize:11, color:'var(--red)', fontWeight:500, background:'var(--redbg)', padding:'2px 7px', borderRadius:4 }}>2 critical</span>
                <span onClick={() => setNotifOpen(false)} style={{ fontSize:11, color:'var(--teal)', cursor:'pointer' }}>Clear all</span>
              </div>
            </div>
            {notifs.map((n, i) => (
              <div key={i} onClick={() => { setPage(n.page); setNotifOpen(false); }}
                style={{ padding:'10px 16px', borderBottom:i<notifs.length-1?'1px solid var(--b1)':'none',
                  display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', transition:'background .1s' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bghov)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:n.color, marginTop:5, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12.5, color:'var(--t1)', lineHeight:1.4 }}>{n.title}</div>
                  <div style={{ display:'flex', gap:8, marginTop:3 }}>
                    <span style={{ fontSize:10.5, color:'var(--t3)' }}>{catLabels[n.cat]}</span>
                    <span style={{ fontSize:10.5, color:'var(--t3)' }}>·</span>
                    <span style={{ fontSize:10.5, color:'var(--t3)' }}>{n.client}</span>
                    <span style={{ fontSize:10.5, color:'var(--t3)' }}>·</span>
                    <span style={{ fontSize:10.5, color:'var(--t3)' }}>{n.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── APP SHELL ─────────────────────────────────────────────────────────────
function AppShell({ page, setPage, portal, theme, setTheme, children, tenantCtx }) {
  const [cmdOpen, setCmdOpen] = React.useState(false);

  // Cmd+K global shortcut
  React.useEffect(() => {
    const fn = e => { if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); setCmdOpen(o=>!o); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <Sidebar page={page} setPage={setPage} portal={portal} theme={theme} setTheme={setTheme}/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        <TopBar page={page} portal={portal} setPage={setPage} onCmd={() => setCmdOpen(true)}/>
        {/* Tenant context ribbon */}
        {tenantCtx && (
          <div style={{ background:'linear-gradient(90deg,rgba(77,168,255,0.08),transparent)', borderBottom:'1px solid rgba(77,168,255,0.2)',
            padding:'6px 24px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <Icon d={ICONS.clients} size={12} col="var(--ice)"/>
            <span style={{ fontSize:11.5, color:'var(--ice)', fontWeight:500 }}>Viewing: {tenantCtx}</span>
            <span style={{ fontSize:11, color:'var(--t3)' }}>· All data scoped to this tenant</span>
          </div>
        )}
        <div style={{ flex:1, overflowY:'auto', background:'var(--bg0)' }}>
          {children}
        </div>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} setPage={p => { setPage(p); }} portal={portal}/>
      <ToastContainer/>
    </div>
  );
}

Object.assign(window, { Constellation, Icon, ICONS, AppShell, Sidebar, TopBar, CommandPalette });
