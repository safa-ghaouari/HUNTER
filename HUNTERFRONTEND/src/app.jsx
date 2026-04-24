
// ═══════════════════════════════════════════════════════
//  APP — Main router, theme, tweaks, entry point
// ═══════════════════════════════════════════════════════

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentColor": "#0dbab5",
  "sidebarWidth": 232,
  "compactMode": false,
  "showConstellation": true
}/*EDITMODE-END*/;

function TweaksPanel({ show, tweaks, setTweaks }) {
  const [collapsed, setCollapsed] = React.useState(false);
  if (!show) return null;
  const update = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    window.parent?.postMessage({ type: '__edit_mode_set_keys', edits: next }, '*');
  };
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, width: 260, background: 'var(--bg3)',
      border: '1px solid var(--b2)', borderRadius: 12, zIndex: 500, overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', transition: 'all .2s' }}>
      <div style={{ padding: '12px 16px', borderBottom: collapsed ? 'none' : '1px solid var(--b1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg2)', cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em' }}>Tweaks</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge color="teal">Live</Badge>
          <span style={{ fontSize: 16, color: 'var(--t3)', lineHeight: 1, userSelect: 'none', transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>⌃</span>
        </div>
      </div>
      {!collapsed && (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Accent color */}
        <div>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--t2)', marginBottom: 6 }}>Accent Color</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['#0dbab5','#5ba4f5','#a78bfa','#f4a20e','#f04565'].map(c => (
              <div key={c} onClick={() => { update('accentColor', c); document.documentElement.style.setProperty('--teal', c); }}
                style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: tweaks.accentColor === c ? '3px solid white' : '2px solid transparent', transition: 'all .14s' }}/>
            ))}
          </div>
        </div>

        {/* Compact mode */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5 }}>Compact Tables</span>
          <button onClick={() => update('compactMode', !tweaks.compactMode)} aria-pressed={tweaks.compactMode}
            style={{ width: 38, height: 20, borderRadius: 10, background: tweaks.compactMode ? 'var(--teal)' : 'var(--bg4)',
              border: '1px solid var(--b2)', position: 'relative', cursor: 'pointer', transition: 'all .18s', outline: 'none' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute',
              top: 2, left: tweaks.compactMode ? 20 : 2, transition: 'left .18s' }}/>
          </button>
        </div>

        {/* Constellation toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5 }}>Show Constellation</span>
          <button onClick={() => update('showConstellation', !tweaks.showConstellation)} aria-pressed={tweaks.showConstellation}
            style={{ width: 38, height: 20, borderRadius: 10, background: tweaks.showConstellation ? 'var(--teal)' : 'var(--bg4)',
              border: '1px solid var(--b2)', position: 'relative', cursor: 'pointer', transition: 'all .18s', outline: 'none' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute',
              top: 2, left: tweaks.showConstellation ? 20 : 2, transition: 'left .18s' }}/>
          </button>
        </div>

        {/* Sidebar width */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--t2)' }}>Sidebar Width</label>
            <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--t3)' }}>{tweaks.sidebarWidth}px</span>
          </div>
          <input type="range" min={180} max={300} value={tweaks.sidebarWidth}
            onChange={e => update('sidebarWidth', Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--teal)' }}/>
        </div>
      </div>
      )}
    </div>
  );
}

function App() {
  const savedTheme  = localStorage.getItem('hunter-theme')  || 'light';
  const savedPage   = localStorage.getItem('hunter-page')   || 'dashboard';
  // Use persisted portal, or derive from restored user context
  const savedPortal = localStorage.getItem('hunter-portal')
    || (window.__hunterUser && window.__hunterUser.portal)
    || 'admin';

  // Auto-restore session when a valid JWT + user context exist in localStorage
  const [authed,   setAuthed]   = React.useState(() =>
    !!(window.API && window.API.getToken() && window.__hunterUser)
  );
  const [theme,    setTheme]    = React.useState(savedTheme);
  const [page,     setPage]     = React.useState(savedPage);
  const [portal,   setPortal]   = React.useState(savedPortal);
  const [tweaks,   setTweaks]   = React.useState(TWEAK_DEFAULTS);
  const [showTwks, setShowTwks] = React.useState(false);

  // Persist state
  React.useEffect(() => {
    localStorage.setItem('hunter-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  React.useEffect(() => { localStorage.setItem('hunter-page',   page); },  [page]);
  React.useEffect(() => { localStorage.setItem('hunter-portal', portal); }, [portal]);

  // Logout handler
  React.useEffect(() => {
    window.__hunterLogout = () => {
      API.logout();
      setAuthed(false);
      setPage('dashboard');
    };
    return () => { delete window.__hunterLogout; };
  }, []);

  // Apply tweaks as CSS vars + global flags
  React.useEffect(() => {
    document.documentElement.style.setProperty('--sw', tweaks.sidebarWidth + 'px');
    document.documentElement.style.setProperty('--teal', tweaks.accentColor);
    document.documentElement.setAttribute('data-compact', tweaks.compactMode ? '1' : '0');
    window.__showConstellation = tweaks.showConstellation;
  }, [tweaks]);

  // Tweaks host integration
  React.useEffect(() => {
    const handler = e => {
      if (e.data?.type === '__activate_edit_mode')   setShowTwks(true);
      if (e.data?.type === '__deactivate_edit_mode') setShowTwks(false);
    };
    window.addEventListener('message', handler);
    window.parent?.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const navTo = p => setPage(p);

  const adminPages = {
    dashboard:   <AdminDashboard setPage={navTo}/>,
    launch:      <LaunchCenter/>,
    clients:     <ClientsList/>,
    sources:     <SourcesPage/>,
    collections: <CollectionsPage/>,
    jobs:        <JobsPage/>,
    ioc:         <IoCPage/>,
    alerts:      <AlertsPage/>,
    reports:     <ReportsPage/>,
    platform:    <PlatformPage/>,
    settings:    <SettingsPage/>,
  };

  const clientPages = {
    'c-dashboard': <ClientDashboard/>,
    'c-alerts':    <ClientAlerts/>,
    'c-reports':   <ClientReports/>,
    'c-hunt':      <ClientHunt/>,
    'c-assets':    <ClientAssets/>,
    'c-account':   <ClientAccount/>,
  };

  if (!authed) {
    return <LoginPage
      onLogin={(role) => {
        setPortal(role);
        setPage(role === 'admin' ? 'dashboard' : 'c-dashboard');
        setAuthed(true);
      }}/>;
  }

  const currentPage = portal === 'admin' ? (adminPages[page] || adminPages.dashboard) : (clientPages[page] || clientPages['c-dashboard']);

  return (
    <>
      <AppShell page={page} setPage={navTo} portal={portal} theme={theme} setTheme={setTheme}>
        {currentPage}
      </AppShell>
      <TweaksPanel show={showTwks} tweaks={tweaks} setTweaks={setTweaks}/>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
