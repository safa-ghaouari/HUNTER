
// ── LOGIN PAGE ─────────────────────────────────────────────────────────────

function AuthBackground() {
  const canvasRef = React.useRef(null);
  const animRef   = React.useRef(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    const dots = Array.from({ length: 70 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - .5) * .00025, vy: (Math.random() - .5) * .00025,
      r: 1.2 + Math.random() * 1.8,
    }));
    function draw() {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      // Grid
      ctx.strokeStyle = 'rgba(40,100,200,0.07)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 52) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y < H; y += 52) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      dots.forEach(d => { d.x=(d.x+d.vx+1)%1; d.y=(d.y+d.vy+1)%1; });
      dots.forEach((a,i) => dots.slice(i+1).forEach(b => {
        const dx=(a.x-b.x)*W, dy=(a.y-b.y)*H, dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<100) { ctx.beginPath(); ctx.moveTo(a.x*W,a.y*H); ctx.lineTo(b.x*W,b.y*H);
          ctx.strokeStyle=`rgba(13,186,181,${(1-dist/100)*.1})`; ctx.lineWidth=.7; ctx.stroke(); }
      }));
      dots.forEach(d => {
        ctx.beginPath(); ctx.arc(d.x*W, d.y*H, d.r, 0, Math.PI*2);
        ctx.fillStyle='rgba(13,186,181,0.3)'; ctx.fill();
      });
      animRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}/>;
}

function LoginPage({ onLogin }) {
  const [email,    setEmail]    = React.useState('');
  const [pass,     setPass]     = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  const [loading,  setLoading]  = React.useState(false);
  const [error,    setError]    = React.useState('');

  const doLogin = async (e, p) => {
    setError('');
    if (!e || !e.trim()) { setError('Email address is required'); return; }
    if (!p) { setError('Password is required'); return; }
    setLoading(true);
    try {
      const { portal } = await API.login(e.trim(), p);
      onLogin(portal);
    } catch (err) {
      setError(err.message || 'Login failed — check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg0)' }}>
      {/* Left — brand */}
      <div style={{ flex:1, position:'relative', overflow:'hidden', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', borderRight:'1px solid var(--b1)' }}>
        <AuthBackground/>
        <div style={{ position:'relative', zIndex:1, textAlign:'center', padding:'0 60px' }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:72, height:72, borderRadius:20, marginBottom:24,
            background:'linear-gradient(135deg,rgba(13,186,181,.15),rgba(77,168,255,.15))',
            border:'1px solid rgba(13,186,181,.3)', boxShadow:'0 0 60px rgba(13,186,181,.1)' }}>
            <Icon d={ICONS.target} size={32} col="var(--teal)"/>
          </div>
          <h1 style={{ fontFamily:'Space Grotesk', fontSize:42, fontWeight:700, letterSpacing:'-.02em',
            background:'linear-gradient(135deg,var(--t1) 0%,var(--teal) 55%,var(--ice) 100%)',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:12 }}>HUNTER</h1>
          <p style={{ fontSize:14, color:'var(--t2)', lineHeight:1.75, maxWidth:320, margin:'0 auto 40px' }}>
            Elite threat intelligence platform for MSSP and SOC operations. Multi-tenant, always-on.
          </p>
          <div style={{ display:'flex', gap:28, justifyContent:'center' }}>
            {[['247','IoCs Today'],['14','Clients'],['3','Critical'],['99.8%','Uptime']].map(([v,l])=>(
              <div key={l} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'Space Grotesk', fontSize:22, fontWeight:700, color:'var(--teal)' }}>{v}</div>
                <div style={{ fontSize:10.5, color:'var(--t3)', letterSpacing:'.06em', textTransform:'uppercase', marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position:'absolute', bottom:20, fontSize:10.5, color:'var(--t4)', letterSpacing:'.06em', zIndex:1 }}>
          THREAT INTELLIGENCE OPERATIONS PLATFORM v3.1
        </div>
      </div>

      {/* Right — form */}
      <div style={{ width:460, display:'flex', flexDirection:'column', justifyContent:'center',
        padding:'44px 48px', background:'var(--bg1)', flexShrink:0, overflowY:'auto' }}>

        <div style={{ marginBottom:32 }}>
          <h2 style={{ fontSize:22, fontWeight:700, letterSpacing:'-.02em', marginBottom:6 }}>Sign in</h2>
          <p style={{ fontSize:13, color:'var(--t2)' }}>
            Access is provisioned by your assigned SOC team.
          </p>
        </div>

        {error && (
          <div style={{ background:'var(--redbg)', border:'1px solid rgba(240,69,101,.3)', borderRadius:7, padding:'10px 14px', marginBottom:14, fontSize:13, color:'var(--red)' }}>⚠ {error}</div>
        )}

        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--t2)', marginBottom:5 }}>Email address</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"
            style={{ width:'100%', padding:'10px 14px', background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:7, color:'var(--t1)', fontSize:13 }}/>
        </div>

        <div style={{ marginBottom:22 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'var(--t2)' }}>Password</label>
            <span style={{ fontSize:12, color:'var(--teal)', cursor:'pointer' }}>Forgot password?</span>
          </div>
          <div style={{ position:'relative' }}>
            <input type={showPass?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)}
              placeholder="••••••••••" onKeyDown={e=>e.key==='Enter'&&doLogin(email,pass)}
              style={{ width:'100%', padding:'10px 42px 10px 14px', background:'var(--bg2)', border:'1px solid var(--b2)', borderRadius:7, color:'var(--t1)', fontSize:13 }}/>
            <button onClick={()=>setShowPass(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--t3)', fontSize:10.5, cursor:'pointer' }}>
              {showPass?'HIDE':'SHOW'}
            </button>
          </div>
        </div>

        <button onClick={() => doLogin(email, pass)} disabled={loading}
          style={{ width:'100%', padding:'11px 0', borderRadius:7, fontSize:14, fontWeight:600,
            background:'linear-gradient(90deg,var(--teal) 0%,var(--ice) 100%)',
            color:'#fff', border:'none', cursor:loading?'not-allowed':'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow:'0 4px 24px rgba(13,186,181,.2)', opacity:loading?.8:1, transition:'all .15s' }}>
          {loading?<><Spinner size={15} color="#fff"/>Signing in…</>:'Sign In →'}
        </button>

        <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ textAlign:'center', fontSize:11.5, color:'var(--t3)' }}>
            Protected by RBAC · TLS 1.3 · MFA enforced
          </div>
          <div style={{ textAlign:'center', fontSize:11, color:'var(--t4)', marginTop:4 }}>
            Need access? Contact your SOC account manager to have credentials provisioned.
          </div>
          {/* Dev-preview hint — remove before production */}
          <div style={{ marginTop:12, padding:'10px 14px', background:'var(--bg2)', border:'1px dashed var(--b2)', borderRadius:7 }}>
            <div style={{ fontSize:10.5, fontWeight:600, color:'var(--t4)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>Preview credentials</div>
            <div style={{ display:'flex', gap:16 }}>
              {[['SOC Admin','admin@hunter.soc','Admin@1234'],['Client','s.chen@acmecorp.com','Client@1234']].map(([role, e, p]) => (
                <button key={role} onClick={() => { setEmail(e); setPass(p); }}
                  style={{ flex:1, padding:'7px 10px', background:'transparent', border:'1px solid var(--b1)', borderRadius:6,
                    cursor:'pointer', textAlign:'left', transition:'border-color .13s' }}
                  onMouseEnter={ev => ev.currentTarget.style.borderColor = 'var(--b3)'}
                  onMouseLeave={ev => ev.currentTarget.style.borderColor = 'var(--b1)'}>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--t3)', marginBottom:2 }}>{role}</div>
                  <div style={{ fontSize:10.5, fontFamily:'IBM Plex Mono', color:'var(--t4)' }}>{e}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LoginPage });
