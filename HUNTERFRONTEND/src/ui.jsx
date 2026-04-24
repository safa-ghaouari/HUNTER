
const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ═══════════════════════════════════════════════════
//  DESIGN TOKENS — single source of truth
// ═══════════════════════════════════════════════════
const SEVERITY_TOKENS = {
  critical: { color: 'var(--red)',    bg: 'var(--redbg)',    border: 'rgba(240,69,101,.3)',  label: 'Critical' },
  high:     { color: 'var(--amber)',  bg: 'var(--amberbg)',  border: 'rgba(244,162,14,.3)',  label: 'High' },
  medium:   { color: 'var(--ice)',    bg: 'var(--icebg)',    border: 'rgba(77,168,255,.3)',  label: 'Medium' },
  low:      { color: 'var(--teal)',   bg: 'var(--tealbg)',   border: 'var(--bacc)',          label: 'Low' },
  info:     { color: 'var(--t3)',     bg: 'var(--bghov)',    border: 'var(--b1)',            label: 'Info' },
};
const JOB_STATUS_TOKENS = {
  running:   { color: 'var(--teal)',  bg: 'var(--tealbg)',  label: 'Running',   dot: true },
  completed: { color: 'var(--green)', bg: 'var(--greenbg)', label: 'Completed', dot: false },
  failed:    { color: 'var(--red)',   bg: 'var(--redbg)',   label: 'Failed',    dot: false },
  pending:   { color: 'var(--amber)', bg: 'var(--amberbg)', label: 'Pending',   dot: true },
  cancelled: { color: 'var(--t3)',    bg: 'var(--bghov)',   label: 'Cancelled', dot: false },
};
const TLP_TOKENS = {
  CLEAR: { color: '#c8d8e8', bg: 'rgba(200,216,232,.1)', label: 'TLP:CLEAR' },
  GREEN: { color: 'var(--green)', bg: 'var(--greenbg)',  label: 'TLP:GREEN' },
  AMBER: { color: 'var(--amber)', bg: 'var(--amberbg)',  label: 'TLP:AMBER' },
  RED:   { color: 'var(--red)',   bg: 'var(--redbg)',    label: 'TLP:RED' },
  // Legacy alias
  WHITE: { color: '#c8d8e8', bg: 'rgba(200,216,232,.1)', label: 'TLP:CLEAR' },
};
const SOURCE_TYPE_TOKENS = {
  'OTX':      { color: 'var(--ice)',    label: 'OTX' },
  'Abuse.ch': { color: 'var(--red)',    label: 'Abuse.ch' },
  'MISP':     { color: 'var(--purple)', label: 'MISP' },
  'RSS':      { color: 'var(--t2)',     label: 'RSS' },
  'API':      { color: 'var(--teal)',   label: 'API' },
  'Manual':   { color: 'var(--amber)',  label: 'Manual' },
  'Telemetry':{ color: 'var(--green)',  label: 'Telemetry' },
};
const HEALTH_TOKENS = {
  healthy:  { color: 'var(--green)', label: 'Healthy' },
  warning:  { color: 'var(--amber)', label: 'Warning' },
  degraded: { color: 'var(--amber)', label: 'Degraded' },
  offline:  { color: 'var(--red)',   label: 'Offline' },
  active:   { color: 'var(--green)', label: 'Active' },
  inactive: { color: 'var(--t3)',    label: 'Inactive' },
};
const REPORT_STATUS_TOKENS = {
  ready:      { color: 'var(--green)', bg: 'var(--greenbg)', label: 'Ready' },
  generating: { color: 'var(--amber)', bg: 'var(--amberbg)', label: 'Generating' },
  failed:     { color: 'var(--red)',   bg: 'var(--redbg)',   label: 'Failed' },
};

Object.assign(window, { SEVERITY_TOKENS, JOB_STATUS_TOKENS, TLP_TOKENS, SOURCE_TYPE_TOKENS, HEALTH_TOKENS, REPORT_STATUS_TOKENS });

// ── TOAST SYSTEM ───────────────────────────────────────────────────────────
let _toastSetFn = null;
const toast = {
  success: (msg, sub) => _toastSetFn?.({ type:'success', msg, sub, id: Date.now() }),
  error:   (msg, sub) => _toastSetFn?.({ type:'error',   msg, sub, id: Date.now() }),
  info:    (msg, sub) => _toastSetFn?.({ type:'info',    msg, sub, id: Date.now() }),
  warn:    (msg, sub) => _toastSetFn?.({ type:'warn',    msg, sub, id: Date.now() }),
};

function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    _toastSetFn = (t) => {
      setToasts(prev => [...prev.slice(-3), t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4000);
    };
  }, []);
  const icons = { success:'✓', error:'✗', info:'ℹ', warn:'⚠' };
  const cols  = { success:'var(--green)', error:'var(--red)', info:'var(--ice)', warn:'var(--amber)' };
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:1000, display:'flex', flexDirection:'column', gap:8, pointerEvents:'none' }}>
      {toasts.map(t => (
        <div key={t.id} className="slideInR" style={{ display:'flex', alignItems:'flex-start', gap:10,
          padding:'12px 16px', background:'var(--bg3)', border:`1px solid ${cols[t.type]}44`,
          borderLeft:`3px solid ${cols[t.type]}`, borderRadius:9,
          boxShadow:'0 8px 28px rgba(0,0,0,0.4)', minWidth:260, maxWidth:360, pointerEvents:'all' }}>
          <span style={{ fontSize:13, color:cols[t.type], flexShrink:0, marginTop:1 }}>{icons[t.type]}</span>
          <div>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--t1)' }}>{t.msg}</div>
            {t.sub && <div style={{ fontSize:11.5, color:'var(--t2)', marginTop:2 }}>{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── CONFIRM MODAL ───────────────────────────────────────────────────────────
function ConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel='Confirm', danger=false }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(5,8,14,.65)', zIndex:400, backdropFilter:'blur(3px)' }}/>
      <div className="fadeUp" style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:420, background:'var(--bg3)', border:'1px solid var(--b2)', borderRadius:12, zIndex:401, padding:28 }}>
        <h3 style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>{title}</h3>
        <p style={{ fontSize:13.5, color:'var(--t2)', lineHeight:1.7, marginBottom:24 }}>{body}</p>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant={danger?'danger':'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Btn>
        </div>
      </div>
    </>
  );
}

// ── SKELETON ───────────────────────────────────────────────────────────────
function Skeleton({ width='100%', height=16, radius=4, style }) {
  return (
    <div style={{ width, height, borderRadius:radius, background:'var(--bg4)',
      backgroundImage:'linear-gradient(90deg, var(--bg4) 25%, var(--bg3) 50%, var(--bg4) 75%)',
      backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite', ...style }}/>
  );
}

// ── INLINE ERROR BANNER ─────────────────────────────────────────────────────
function ErrorBanner({ title, body, onRetry }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 16px',
      background:'var(--redbg)', border:'1px solid rgba(240,69,101,.28)', borderRadius:9 }}>
      <span style={{ color:'var(--red)', fontSize:15, flexShrink:0 }}>✗</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--red)', marginBottom:2 }}>{title}</div>
        {body && <div style={{ fontSize:12, color:'var(--t2)', lineHeight:1.6 }}>{body}</div>}
      </div>
      {onRetry && <Btn size="sm" variant="danger" onClick={onRetry}>Retry</Btn>}
    </div>
  );
}

// ── PARTIAL DATA BANNER ─────────────────────────────────────────────────────
function PartialDataBanner({ msg }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
      background:'var(--amberbg)', border:'1px solid rgba(244,162,14,.25)', borderRadius:7, marginBottom:12 }}>
      <span style={{ color:'var(--amber)', fontSize:13 }}>⚠</span>
      <span style={{ fontSize:12.5, color:'var(--t2)' }}>{msg}</span>
    </div>
  );
}

// ── SPARKLINE ──────────────────────────────────────────────────────────────
function Sparkline({ data, color='var(--teal)', width=80, height=28, fill=true }) {
  const max = Math.max(...data, 1), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - 4 - ((v - min) / range) * (height - 8)
  ]);
  const line = pts.map((p, i) => `${i===0?'M':'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length-1][0]} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} style={{ display:'block', flexShrink:0 }}>
      {fill && <path d={area} fill={color} fillOpacity=".15"/>}
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.5" fill={color}/>
    </svg>
  );
}

// ── SPINNER ──────────────────────────────────────────────────────────────
function Spinner({ size = 18, color = 'var(--teal)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="spin" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="2" strokeOpacity=".2"/>
      <path d="M10 2a8 8 0 0 1 8 8" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ── BUTTON ───────────────────────────────────────────────────────────────
function Btn({ children, variant = 'primary', size = 'md', icon, onClick, disabled, loading, style, title }) {
  const [hov, setHov] = useState(false);
  const sz = size === 'sm' ? { padding: '4px 10px', fontSize: 12, gap: 5 }
           : size === 'lg' ? { padding: '10px 20px', fontSize: 14, gap: 7 }
           :                  { padding: '6px 14px', fontSize: 13, gap: 6 };
  const variants = {
    primary:   { background: hov ? 'var(--tealb)' : 'var(--teal)', color: '#fff', border: '1px solid transparent' },
    secondary: { background: hov ? 'var(--bg4)' : 'var(--bg3)', color: 'var(--t1)', border: '1px solid var(--b2)' },
    ghost:     { background: hov ? 'var(--bghov)' : 'transparent', color: 'var(--t2)', border: '1px solid transparent' },
    danger:    { background: hov ? 'rgba(240,69,101,.18)' : 'var(--redbg)', color: 'var(--red)', border: '1px solid rgba(240,69,101,.35)' },
    outline:   { background: hov ? 'var(--tealbg)' : 'transparent', color: 'var(--teal)', border: '1px solid var(--bacc)' },
    ice:       { background: hov ? 'rgba(77,168,255,.16)' : 'var(--icebg)', color: 'var(--ice)', border: '1px solid rgba(77,168,255,.3)' },
    amber:     { background: hov ? 'rgba(244,162,14,.18)' : 'var(--amberbg)', color: 'var(--amber)', border: '1px solid rgba(244,162,14,.3)' },
  };
  return (
    <button title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={!disabled && !loading ? onClick : undefined}
      style={{ display:'inline-flex', alignItems:'center', fontWeight:500, borderRadius:6,
        cursor:disabled?'not-allowed':'pointer', opacity:disabled?.45:1,
        transition:'all .14s', whiteSpace:'nowrap', outline:'none',
        ...sz, ...variants[variant], ...style }}>
      {loading ? <Spinner size={13} color="currentColor"/> : icon ? icon : null}
      {children}
    </button>
  );
}

// ── BADGE ────────────────────────────────────────────────────────────────
function Badge({ children, color = 'gray', dot, style }) {
  const pal = {
    teal:   ['var(--tealbg)', 'var(--teal)', 'var(--bacc)'],
    red:    ['var(--redbg)', 'var(--red)', 'rgba(240,69,101,.3)'],
    amber:  ['var(--amberbg)', 'var(--amber)', 'rgba(244,162,14,.28)'],
    green:  ['var(--greenbg)', 'var(--green)', 'rgba(18,196,146,.28)'],
    ice:    ['var(--icebg)', 'var(--ice)', 'rgba(77,168,255,.28)'],
    purple: ['var(--purplebg)', 'var(--purple)', 'rgba(167,139,250,.28)'],
    gray:   ['var(--bghov)', 'var(--t2)', 'var(--b2)'],
  };
  const [bg, col, brd] = pal[color] || pal.gray;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px',
      borderRadius:99, fontSize:11, fontWeight:600, letterSpacing:'.025em',
      background:bg, color:col, border:`1px solid ${brd}`, whiteSpace:'nowrap', ...style }}>
      {dot && <span style={{ width:5, height:5, borderRadius:'50%', background:col, flexShrink:0 }}/>}
      {children}
    </span>
  );
}

// ── SEVERITY ─────────────────────────────────────────────────────────────
function Sev({ level, compact }) {
  const tok = SEVERITY_TOKENS[(level||'info').toLowerCase()] || SEVERITY_TOKENS.info;
  if (compact) return <span style={{ width:8, height:8, borderRadius:'50%', background:tok.color, display:'inline-block', flexShrink:0 }}/>;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px',
      borderRadius:99, fontSize:11, fontWeight:600, background:tok.bg, color:tok.color, border:`1px solid ${tok.border}` }}>
      {tok.label}
    </span>
  );
}

// ── STATUS DOT ───────────────────────────────────────────────────────────
function StatusDot({ status, label, size = 7 }) {
  const tok = HEALTH_TOKENS[(status||'').toLowerCase()];
  const col = tok?.color || 'var(--t3)';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
      <span style={{ width:size, height:size, borderRadius:'50%', background:col, flexShrink:0, boxShadow:`0 0 0 2px ${col}22` }}/>
      {label && <span style={{ fontSize:12, color:'var(--t2)' }}>{label || tok?.label || status}</span>}
    </span>
  );
}

// ── TLP ──────────────────────────────────────────────────────────────────
function TLP({ level }) {
  const tok = TLP_TOKENS[level] || TLP_TOKENS.WHITE;
  return (
    <span style={{ fontFamily:'IBM Plex Mono', fontSize:10, fontWeight:500, color:tok.color,
      background:tok.bg, border:`1px solid ${tok.color}44`, padding:'1px 6px',
      borderRadius:3, letterSpacing:'.06em', whiteSpace:'nowrap' }}>
      TLP:{level}
    </span>
  );
}

// ── MONO VALUE ───────────────────────────────────────────────────────────
function Mono({ children, dim, small }) {
  return (
    <code style={{ fontFamily:'IBM Plex Mono', fontSize:small?'0.8em':'0.88em',
      color:dim?'var(--t3)':'var(--tmono)', background:'rgba(91,184,255,0.07)',
      padding:'1px 5px', borderRadius:3 }}>
      {children}
    </code>
  );
}

// ── COPY VALUE ────────────────────────────────────────────────────────────
function CopyValue({ value, display, small }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).catch(()=>{});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
    toast.success('Copied to clipboard', value.length > 40 ? value.slice(0,40)+'…' : value);
  };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
      <Mono small={small}>{display || value}</Mono>
      <button onClick={copy} title="Copy" style={{ background:'none', border:'none', cursor:'pointer',
        color:copied?'var(--green)':'var(--t3)', fontSize:10, padding:'2px 4px', borderRadius:3,
        transition:'color .15s' }}>
        {copied ? '✓' : '⎘'}
      </button>
    </span>
  );
}

// ── STAT CARD ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, trend, trendDir, color, icon, accent, onClick, sparkData }) {
  const [hov, setHov] = useState(false);
  const tCol = trendDir==='up'?'var(--red)':trendDir==='down'?'var(--green)':'var(--t3)';
  const tArrow = trendDir==='up'?'↑':trendDir==='down'?'↓':'→';
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{ background:hov&&onClick?'var(--bg4)':'var(--bg3)', border:`1px solid var(--b2)`,
        borderRadius:10, padding:'16px 18px', cursor:onClick?'pointer':'default',
        transition:'all .15s', position:'relative', overflow:'hidden',
        borderTop:accent?`2px solid ${accent}`:undefined }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
        <span style={{ fontSize:10.5, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.07em' }}>{label}</span>
        {icon && <span style={{ opacity:.5 }}>{icon}</span>}
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
        <div style={{ fontFamily:'Space Grotesk', fontSize:28, fontWeight:700, color:color||'var(--t1)', lineHeight:1, letterSpacing:'-.02em' }}>{value}</div>
        {sparkData && <Sparkline data={sparkData} color={color||'var(--teal)'} width={64} height={28}/>}
      </div>
      {(sub||trend) && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
          {trend && <span style={{ fontSize:11, color:tCol, fontWeight:600 }}>{tArrow} {trend}</span>}
          {sub && <span style={{ fontSize:11, color:'var(--t3)' }}>{sub}</span>}
        </div>
      )}
      {onClick && hov && <div style={{ position:'absolute', bottom:8, right:12, fontSize:10, color:'var(--teal)', letterSpacing:'.04em' }}>VIEW →</div>}
    </div>
  );
}

// ── TABS ─────────────────────────────────────────────────────────────────
function Tabs({ tabs, active, onChange, style }) {
  return (
    <div style={{ display:'flex', borderBottom:'1px solid var(--b1)', ...style }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding:'10px 16px', fontSize:13, fontWeight:500,
          color:active===t.id?'var(--teal)':'var(--t2)',
          background:'none', border:'none', cursor:'pointer', transition:'all .14s',
          borderBottom:`2px solid ${active===t.id?'var(--teal)':'transparent'}`,
          marginBottom:-1, display:'flex', alignItems:'center', gap:6, outline:'none' }}>
          {t.icon && t.icon}{t.label}
          {t.count !== undefined && (
            <span style={{ fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:99,
              background:active===t.id?'var(--tealglow)':'var(--bghov)',
              color:active===t.id?'var(--teal)':'var(--t3)' }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── SEARCH INPUT ─────────────────────────────────────────────────────────
function SearchInput({ placeholder, value, onChange, style, width }) {
  return (
    <div style={{ position:'relative', width:width||'100%', ...style }}>
      <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', opacity:.4, pointerEvents:'none' }} width={13} height={13} viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder||'Search…'}
        style={{ width:'100%', padding:'7px 10px 7px 30px', background:'var(--bg2)',
          border:'1px solid var(--b2)', borderRadius:6, color:'var(--t1)', fontSize:13 }}/>
    </div>
  );
}

// ── FILTER BAR ───────────────────────────────────────────────────────────
function FilterBar({ filters, active, onChange, searchValue, onSearch, extra }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      {onSearch && <SearchInput value={searchValue} onChange={onSearch} width={220}/>}
      {filters.map(f => (
        <button key={f.id} onClick={() => onChange(active===f.id?null:f.id)}
          style={{ padding:'5px 12px', borderRadius:20, fontSize:11.5, fontWeight:500,
            border:`1px solid ${active===f.id?'var(--bacc)':'var(--b1)'}`,
            background:active===f.id?'var(--tealbg)':'var(--bg3)',
            color:active===f.id?'var(--teal)':'var(--t2)', cursor:'pointer', transition:'all .13s' }}>
          {f.label}{f.count!==undefined?` (${f.count})`:''}
        </button>
      ))}
      {extra}
    </div>
  );
}

// ── DRAWER ───────────────────────────────────────────────────────────────
function Drawer({ open, onClose, title, children, width = 520, subtitle }) {
  useEffect(() => {
    const fn = e => e.key==='Escape'&&onClose();
    if (open) document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(5,8,14,.55)', zIndex:200, backdropFilter:'blur(2px)' }}/>
      <div className="slideInR" style={{ position:'fixed', top:0, right:0, bottom:0, width,
        background:'var(--bg2)', borderLeft:'1px solid var(--b2)', zIndex:201,
        display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 20px', borderBottom:'1px solid var(--b1)', flexShrink:0, background:'var(--bg3)' }}>
          <div>
            <h3 style={{ fontSize:15, fontWeight:600 }}>{title}</h3>
            {subtitle && <div style={{ fontSize:11.5, color:'var(--t3)', marginTop:2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--t2)', fontSize:22, lineHeight:1, opacity:.7, cursor:'pointer' }}>×</button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:20 }}>{children}</div>
      </div>
    </>
  );
}

// ── MODAL ────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, width = 480, footer }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(5,8,14,.65)', zIndex:300, backdropFilter:'blur(3px)' }}/>
      <div className="fadeUp" style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width, maxHeight:'88vh', background:'var(--bg3)', border:'1px solid var(--b2)',
        borderRadius:12, zIndex:301, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'18px 24px', borderBottom:'1px solid var(--b1)', flexShrink:0 }}>
          <h3 style={{ fontSize:15, fontWeight:600 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--t2)', fontSize:22, opacity:.7, cursor:'pointer' }}>×</button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:24 }}>{children}</div>
        {footer && <div style={{ padding:'14px 24px', borderTop:'1px solid var(--b1)', display:'flex', gap:8, justifyContent:'flex-end' }}>{footer}</div>}
      </div>
    </>
  );
}

// ── EMPTY STATE ──────────────────────────────────────────────────────────
function EmptyState({ icon, title, body, action }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'56px 32px', gap:12, textAlign:'center' }}>
      <div style={{ fontSize:30, opacity:.2 }}>{icon||'◈'}</div>
      <div style={{ fontFamily:'Space Grotesk', fontSize:14, fontWeight:600, color:'var(--t2)' }}>{title}</div>
      {body && <div style={{ fontSize:12.5, color:'var(--t3)', maxWidth:280, lineHeight:1.65 }}>{body}</div>}
      {action}
    </div>
  );
}

// ── CARD ─────────────────────────────────────────────────────────────────
function Card({ children, style, onClick, pad = 20 }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{ background:hov&&onClick?'var(--bg4)':'var(--bg3)', border:'1px solid var(--b1)',
        borderRadius:10, padding:pad, transition:'all .14s', cursor:onClick?'pointer':'default', ...style }}>
      {children}
    </div>
  );
}

// ── SECTION HEADER ────────────────────────────────────────────────────────
function SectionHdr({ title, sub, action, icon, style }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, ...style }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {icon && <span style={{ color:'var(--teal)', fontSize:15, opacity:.8 }}>{icon}</span>}
        <div>
          <div style={{ fontSize:13.5, fontWeight:600, color:'var(--t1)' }}>{title}</div>
          {sub && <div style={{ fontSize:11.5, color:'var(--t3)', marginTop:1 }}>{sub}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ── PAGE HEADER ───────────────────────────────────────────────────────────
function PageHdr({ title, sub, actions, crumb, tag }) {
  return (
    <div style={{ padding:'18px 28px 16px', borderBottom:'1px solid var(--b1)', background:'var(--bg1)', flexShrink:0 }}>
      {crumb && <div style={{ fontSize:11, color:'var(--t3)', marginBottom:6, letterSpacing:'.04em', textTransform:'uppercase' }}>{crumb}</div>}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:'-.025em' }}>{title}</h1>
          {tag}
        </div>
        {actions && <div style={{ display:'flex', gap:8, alignItems:'center' }}>{actions}</div>}
      </div>
      {sub && <div style={{ fontSize:12.5, color:'var(--t2)', marginTop:4 }}>{sub}</div>}
    </div>
  );
}

// ── TIMELINE ──────────────────────────────────────────────────────────────
function Timeline({ events }) {
  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display:'flex', gap:12 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:ev.color||'var(--teal)', marginTop:14, zIndex:1, boxShadow:`0 0 0 3px var(--bg2)` }}/>
            {i < events.length-1 && <div style={{ width:1, flex:1, background:'var(--b1)', marginTop:3 }}/>}
          </div>
          <div style={{ paddingBottom:16, paddingTop:10, flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
              <span style={{ fontSize:13, fontWeight:500 }}>{ev.title}</span>
              {ev.badge}
            </div>
            {ev.body && <div style={{ fontSize:12, color:'var(--t2)', lineHeight:1.6 }}>{ev.body}</div>}
            <div style={{ fontSize:11, color:'var(--t3)', marginTop:4, fontFamily:'IBM Plex Mono' }}>{ev.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── PROGRESS BAR ──────────────────────────────────────────────────────────
function ProgressBar({ value, max=100, color, height=4, label, showPct }) {
  const pct = Math.min(100, Math.max(0, (value/max)*100));
  return (
    <div>
      {(label||showPct) && (
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          {label && <span style={{ fontSize:11.5, color:'var(--t2)' }}>{label}</span>}
          {showPct && <span style={{ fontSize:11, color:'var(--t3)', fontFamily:'IBM Plex Mono' }}>{Math.round(pct)}%</span>}
        </div>
      )}
      <div style={{ background:'var(--bg4)', borderRadius:height, height, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color||'var(--teal)', borderRadius:height, transition:'width .6s ease' }}/>
      </div>
    </div>
  );
}

// ── INPUT ──────────────────────────────────────────────────────────────────
function Inp({ label, value, onChange, type='text', placeholder, mono, style, hint, required }) {
  return (
    <div style={style}>
      {label && <label style={{ display:'block', fontSize:11.5, fontWeight:500, color:'var(--t2)', marginBottom:5 }}>
        {label}{required && <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>}
      </label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width:'100%', padding:'8px 12px', background:'var(--bg2)', border:'1px solid var(--b2)',
          borderRadius:6, color:'var(--t1)', fontSize:13, fontFamily:mono?'IBM Plex Mono':'inherit' }}/>
      {hint && <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>{hint}</div>}
    </div>
  );
}

// ── SELECT ──────────────────────────────────────────────────────────────────
function Sel({ label, value, onChange, options, style }) {
  return (
    <div style={style}>
      {label && <label style={{ display:'block', fontSize:11.5, fontWeight:500, color:'var(--t2)', marginBottom:5 }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width:'100%', padding:'8px 12px', background:'var(--bg2)', border:'1px solid var(--b2)',
          borderRadius:6, color:'var(--t1)', fontSize:13, appearance:'none' }}>
        {options.map(o => <option key={o.value!==undefined?o.value:o} value={o.value!==undefined?o.value:o}>{o.label||o}</option>)}
      </select>
    </div>
  );
}

// ── DATA TABLE ──────────────────────────────────────────────────────────────
function DataTable({ columns, rows, onRowClick, emptyState, compact, stickyHead }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [hovRow,  setHovRow]  = useState(null);

  const sorted = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const na = Number(va), nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb) && va !== '' && vb !== '') {
        return sortDir === 'asc' ? na - nb : nb - na;
      }
      const sa = String(va), sb = String(vb);
      // ISO date strings sort correctly as strings
      return sortDir === 'asc' ? sa.localeCompare(sb, undefined, { numeric: true }) : sb.localeCompare(sa, undefined, { numeric: true });
    });
  }, [rows, sortCol, sortDir]);

  const handleSort = col => {
    if (col===sortCol) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  if (!rows.length && emptyState) return emptyState;
  const isCompact = compact || document.documentElement.getAttribute('data-compact') === '1';
  const rh = isCompact ? '5px 9px' : '10px 12px';

  return (
    <div style={{ overflowX:'auto', width:'100%' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
        <thead style={{ position:stickyHead?'sticky':undefined, top:0, zIndex:2 }}>
          <tr style={{ borderBottom:'1px solid var(--b2)', background:'var(--bg2)' }}>
            {columns.map(c => (
              <th key={c.key} onClick={() => c.sort!==false && handleSort(c.key)}
                style={{ padding:rh, textAlign:'left', fontWeight:600, color:'var(--t3)', fontSize:10.5,
                  textTransform:'uppercase', letterSpacing:'.055em', cursor:c.sort!==false?'pointer':'default',
                  whiteSpace:'nowrap', userSelect:'none', background:'var(--bg2)', width:c.w }}>
                {c.label}{sortCol===c.key?(sortDir==='asc'?' ↑':' ↓'):''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.id||i} onClick={() => onRowClick&&onRowClick(row)}
              onMouseEnter={() => setHovRow(i)} onMouseLeave={() => setHovRow(null)}
              style={{ borderBottom:'1px solid var(--b1)', cursor:onRowClick?'pointer':'default',
                background:hovRow===i?'var(--bghov)':'transparent', transition:'background .1s' }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding:rh, color:'var(--t1)', maxWidth:c.maxW||'none', verticalAlign:'middle' }}>
                  {c.render ? c.render(row[c.key], row) : <span style={{ color:row[c.key]?'var(--t1)':'var(--t3)' }}>{row[c.key]||'—'}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── STEPPER ────────────────────────────────────────────────────────────────
function Stepper({ steps, active }) {
  return (
    <div style={{ display:'flex', alignItems:'center' }}>
      {steps.map((s, i) => {
        const done=i<active, cur=i===active;
        const col=done?'var(--green)':cur?'var(--teal)':'var(--t4)';
        return (
          <React.Fragment key={i}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:done?'var(--greenbg)':cur?'var(--tealbg)':'var(--bg4)',
                border:`2px solid ${col}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:col }}>
                {done?'✓':i+1}
              </div>
              <span style={{ fontSize:10.5, color:cur?'var(--t1)':'var(--t3)', fontWeight:cur?600:400, whiteSpace:'nowrap' }}>{s}</span>
            </div>
            {i<steps.length-1 && <div style={{ flex:1, height:1, background:i<active?'var(--green)':'var(--b2)', margin:'-14px 6px 0', minWidth:20 }}/>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── HEAT CELL ─────────────────────────────────────────────────────────────
function HeatCell({ v, max=10, label }) {
  const pct=v/max;
  const col=pct>.7?'var(--red)':pct>.4?'var(--amber)':pct>.1?'var(--teal)':'var(--bg4)';
  return <div title={`${label}: ${v}`} style={{ width:18, height:18, background:col, opacity:Math.max(.15,pct), borderRadius:3, cursor:'default' }}/>;
}

// ── LOG EXCERPT ────────────────────────────────────────────────────────────
function LogExcerpt({ lines }) {
  return (
    <div style={{ background:'var(--bg0)', border:'1px solid var(--b1)', borderRadius:7, padding:'12px 14px',
      fontFamily:'IBM Plex Mono', fontSize:11.5, color:'var(--tmono)', lineHeight:2, overflowX:'auto' }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display:'flex', gap:14 }}>
          <span style={{ color:'var(--t4)', flexShrink:0, userSelect:'none' }}>{String(i+1).padStart(2,'0')}</span>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ── GLOSSARY TOOLTIP ───────────────────────────────────────────────────────
function GlossaryDot({ term, definition }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
      <span onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}
        style={{ width:13, height:13, borderRadius:'50%', background:'var(--bg4)', border:'1px solid var(--b2)',
          display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:8.5, color:'var(--t3)',
          cursor:'help', fontWeight:700, marginLeft:4 }}>?</span>
      {show && (
        <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)',
          background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:7, padding:'8px 12px',
          fontSize:12, color:'var(--t1)', width:220, zIndex:500, boxShadow:'0 4px 20px rgba(0,0,0,.4)',
          lineHeight:1.6, pointerEvents:'none' }}>
          <div style={{ fontWeight:600, color:'var(--teal)', marginBottom:3 }}>{term}</div>
          {definition}
        </div>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// Shimmer style injected once
if (!document.getElementById('ui-styles')) {
  const s = document.createElement('style');
  s.id = 'ui-styles';
  s.textContent = `@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
  document.head.appendChild(s);
}

Object.assign(window, {
  toast, ToastContainer, ConfirmModal, Skeleton, ErrorBanner, PartialDataBanner, Sparkline,
  Spinner, Btn, Badge, Sev, StatusDot, TLP, Mono, CopyValue, StatCard, Tabs,
  SearchInput, FilterBar, Drawer, Modal, EmptyState, Card, SectionHdr,
  PageHdr, Timeline, ProgressBar, Inp, Sel, DataTable, Stepper, HeatCell,
  LogExcerpt, GlossaryDot,
});
