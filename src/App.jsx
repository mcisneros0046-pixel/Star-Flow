import { useState, useEffect, useRef, useCallback } from "react";
import { auth, googleProvider, db } from "./firebase";
import { signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const WEEKLY_TARGET = 9;
const MONTHLY_TARGET = 35;
const MONTHLY_STRETCH = 45;
const DAILY_CAP = 5;

const REWARDS = {
  bronze: ["Coffee Trip", "Mini Beauty Treat ($15)", "Fresh Flowers", "New Book", "YogurtLand"],
  silver: ["Workout Accessory", "Beauty Treat ($30)", "Movie Night", "Candle", "Spa Day"],
  gold: ["Nice dinner out", "Shopping Trip ($100)", "Massage or Facial", "Day trip adventure", "New workout gear"],
};

const ENCOURAGEMENTS = [
  "The stars remember every step you take.",
  "Consistency is its own constellation.",
  "Small lights, vast sky.",
  "Your body is a universe unfolding.",
  "Rest is part of the cosmos.",
  "Growth isn't always visible — like stars at dawn.",
  "You're weaving something luminous.",
  "Gentle with yourself tonight.",
  "Every moment of movement is a star placed.",
  "This is quiet healing in motion.",
];

const MILESTONE_COPY = {
  bronze: "A new constellation is forming.",
  silver: "Your sky is filling with light.",
  gold: "A galaxy of your own making.",
  streak_3: "Three nights glowing — a habit takes shape.",
  streak_7: "A full week of starlight. Powerful.",
  streak_14: "Two weeks luminous. This is who you are now.",
  monthly_target: "Monthly constellation complete — celebrate.",
  monthly_stretch: "You reached the far stars. Legendary.",
};

const NUM_WORDS = {
  1:"One",2:"Two",3:"Three",4:"Four",5:"Five",6:"Six",7:"Seven",8:"Eight",
  9:"Nine",10:"Ten",11:"Eleven",12:"Twelve",13:"Thirteen",14:"Fourteen",
  15:"Fifteen",16:"Sixteen",17:"Seventeen",18:"Eighteen",19:"Nineteen",
  20:"Twenty",21:"Twenty-one",22:"Twenty-two",23:"Twenty-three",24:"Twenty-four",
  25:"Twenty-five",26:"Twenty-six",27:"Twenty-seven",28:"Twenty-eight",
  29:"Twenty-nine",30:"Thirty",31:"Thirty-one",32:"Thirty-two",33:"Thirty-three",
  34:"Thirty-four",35:"Thirty-five",
};

const P = {
  bgTop: "#0B0D18", bg: "#0E0F1A", bgBottom: "#14162A",
  glass: "rgba(24,27,48,0.55)", glassBorder: "rgba(46,48,96,0.5)",
  glassSolid: "#181B30",
  gold: "#F3D27A", moon: "#C9D1FF", nebula: "#9C8CFF", aurora: "#6EC5FF",
  yoga: "#9C8CFF", yogaLight: "rgba(30,26,58,0.7)",
  walk: "#6EC5FF", walkLight: "rgba(21,29,46,0.7)",
  text: "#E7E9FF", soft: "#8F96C8", muted: "#6B7099", dim: "#3D4166",
  tierGold: "#F3D27A", tierSilver: "#C9D1FF", tierBronze: "#D4976A",
  divider: "rgba(37,40,71,0.6)",
  btn: "#9C8CFF", btnActive: "#7B6ECC", btnDark: "#2A2555",
};

// ─── FIREBASE DATA ───────────────────────────────────────────────────────────
async function loadUserData(userId) {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (snap.exists()) return snap.data();
  } catch (err) { console.error("Load error:", err); }
  return { entries: [], claimed: [] };
}

async function saveUserData(userId, data) {
  try { await setDoc(doc(db, "users", userId), data); }
  catch (err) { console.error("Save error:", err); }
}

// ─── POINT SYSTEM ────────────────────────────────────────────────────────────
function calcPts(entry) {
  const { activity_type: a, duration_min: d, intensity_flag, intentional_flag } = entry;
  if (a === "yoga") return d >= 30 ? 2 + (intensity_flag ? 1 : 0) : 0;
  if (a === "walk") {
    const base = d >= 45 ? 2 : d >= 20 ? 1 : 0;
    return base > 0 ? base + (intentional_flag ? 1 : 0) : 0;
  }
  return 0;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function entriesFor(entries, ds) { return entries.filter(e => e.date === ds); }
function dailyPts(entries, ds) {
  return Math.min(DAILY_CAP, entriesFor(entries, ds).reduce((s, e) => s + calcPts(e), 0));
}
function weekOfMonth(d) { return Math.ceil(d.getDate() / 7); }
function weekRange(y, m, wn) {
  const s = (wn - 1) * 7 + 1;
  const e = Math.min(wn * 7, new Date(y, m, 0).getDate());
  return [new Date(y, m - 1, s), new Date(y, m - 1, e)];
}
function weekPts(entries, y, m, wn) {
  const [s, e] = weekRange(y, m, wn);
  let total = 0; const cur = new Date(s);
  while (cur <= e) { total += dailyPts(entries, cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
  return total;
}
function monthStats(entries, y, m) {
  const days = new Date(y, m, 0).getDate();
  let pts = 0, yc = 0, wc = 0, ys = 0, ws = 0;
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const es = entriesFor(entries, ds); let dp = 0;
    es.forEach(e => {
      dp += calcPts(e);
      if (e.activity_type === "yoga" && e.duration_min >= 30) { yc++; if (e.intensity_flag) ys++; }
      if (e.activity_type === "walk" && e.duration_min >= 20) { wc++; if (e.intentional_flag) ws++; }
    });
    pts += Math.min(DAILY_CAP, dp);
  }
  return { pts, yc, wc, ys, ws, target: pts >= MONTHLY_TARGET, stretch: pts >= MONTHLY_STRETCH };
}
function calcStreak(entries) {
  const active = new Set(entries.filter(e => calcPts(e) > 0).map(e => e.date));
  if (!active.size) return 0;
  let streak = 0, d = new Date();
  while (active.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
function topTier(pts) { if (pts >= 15) return "gold"; if (pts >= 12) return "silver"; if (pts >= WEEKLY_TARGET) return "bronze"; return null; }
function availTiers(pts) { const t = []; if (pts >= 9) t.push("bronze"); if (pts >= 12) t.push("silver"); if (pts >= 15) t.push("gold"); return t; }
function tierColor(t) { return { gold: P.tierGold, silver: P.tierSilver, bronze: P.tierBronze }[t] || P.muted; }
function calendarWeeks(y, m) {
  const firstDay = new Date(y, m - 1, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const weeks = []; let week = Array(offset).fill(0);
  for (let d = 1; d <= daysInMonth; d++) { week.push(d); if (week.length === 7) { weeks.push(week); week = []; } }
  if (week.length > 0) { while (week.length < 7) week.push(0); weeks.push(week); }
  return weeks;
}
function fridayOf(y, m, wn) { const [s, e] = weekRange(y, m, wn); const cur = new Date(s); while (cur <= e) { if (cur.getDay() === 5) return cur; cur.setDate(cur.getDate() + 1); } return e; }
function sundayOf(y, m, wn) { const [s, e] = weekRange(y, m, wn); const cur = new Date(s); while (cur <= e) { if (cur.getDay() === 0) return cur; cur.setDate(cur.getDate() + 1); } return e; }

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function StarParticles() {
  const particles = useRef(Array.from({ length: 10 }, (_, i) => ({ id: i, x: Math.random()*100, size: 1+Math.random()*2, duration: 25+Math.random()*35, delay: Math.random()*-40, opacity: 0.04+Math.random()*0.1, drift: (Math.random()-0.5)*20 }))).current;
  return (<div className="particle-field">{particles.map(p => (<div key={p.id} className="particle" style={{ left:`${p.x}%`, width:p.size, height:p.size, animationDuration:`${p.duration}s`, animationDelay:`${p.delay}s`, opacity:p.opacity, "--drift":`${p.drift}px` }} />))}</div>);
}

function ProgressRing({ current, target, stretch }) {
  const pct = target > 0 ? Math.min(current/target,1) : 0;
  const isStretch = current >= stretch, isTarget = current >= target, remaining = target - current;
  const r=72, cx=120, cy=120, lw=14, circ=2*Math.PI*r, offset=circ*(1-pct);
  const strokeColor = isStretch ? P.gold : P.nebula, glowColor = isStretch ? P.gold : P.nebula;
  const subText = isStretch ? "You reached the far stars." : isTarget ? "Monthly constellation complete." : `${NUM_WORDS[remaining]||remaining} star${remaining!==1?"s":""} until the sky begins to connect.`;
  return (
    <div className="ring-container">
      <div className="ring-glow" style={{ background:`radial-gradient(circle, ${glowColor}22 0%, transparent 65%)` }} />
      <svg width="240" height="240" viewBox="0 0 240 240" className="ring-svg">
        <circle cx={cx} cy={cy} r={r+18} fill="none" stroke={glowColor} strokeWidth="1" className="halo-ring" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={P.dim} strokeWidth={lw} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={strokeColor} strokeWidth={lw} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${cx} ${cy})`} style={{ transition:"stroke-dashoffset 0.8s ease, stroke 0.5s ease" }} />
        <text x={cx} y={cy-10} textAnchor="middle" fill={P.text} style={{ fontSize:"36px", fontFamily:"'Cormorant Garamond', Georgia, serif", fontWeight:600 }}>{current}</text>
        <text x={cx} y={cy+18} textAnchor="middle" fill={P.soft} style={{ fontSize:"13px", fontFamily:"'Inter', sans-serif" }}>of {target} stars</text>
      </svg>
      <p className="ring-sub" style={{ color: isStretch ? P.gold : isTarget ? P.nebula : P.soft }}>{isStretch && <span className="sparkle-icon">✦ </span>}{subText}</p>
    </div>
  );
}

function GlassCard({ children, className="", glow=false, glowColor=P.nebula, style={} }) {
  return <div className={`glass-card ${glow?"glass-glow":""} ${className}`} style={{ "--glow-color":glowColor, ...style }}>{children}</div>;
}

function TierBar({ name, need, pts, color }) {
  const hit = pts >= need, pct = Math.min(pts/need,1);
  return (<div className="tier-row"><div className="tier-bar-bg"><div className="tier-bar-fill" style={{ width:`${pct*100}%`, background:hit?color:P.btnDark }} /><div className="tier-bar-text"><span className="tier-award" style={{ color:hit?(pct>0.5?P.bg:color):P.muted }}>✦ <span style={{ fontWeight:hit?600:400 }}>{name} ({need} stars)</span></span><span style={{ color:hit?(pct>0.5?P.bg:color):P.muted, fontSize:12 }}>{hit?"✓":`${need-pts} to go`}</span></div></div></div>);
}

function LogModal({ onClose, onLog }) {
  const [activity, setActivity] = useState("yoga");
  const [duration, setDuration] = useState(30);
  const [flag, setFlag] = useState(false);
  const preview = calcPts({ activity_type:activity, duration_min:duration, intensity_flag:activity==="yoga"?flag:false, intentional_flag:activity==="walk"?flag:false });
  const handleLog = () => { onLog({ date:todayStr(), activity_type:activity, duration_min:duration, intensity_flag:activity==="yoga"?flag:false, intentional_flag:activity==="walk"?flag:false }); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal-content" onClick={e=>e.stopPropagation()}>
      <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:26, fontWeight:600, marginBottom:24 }}>Add a Moment</h2>
      <div style={{ display:"flex", gap:16, justifyContent:"center", marginBottom:20 }}>
        {["yoga","walk"].map(a => (<button key={a} onClick={()=>{setActivity(a);setFlag(false);}} className={`activity-btn ${activity===a?"active":""}`} style={{ "--accent":a==="yoga"?P.yoga:P.walk }}><span className="activity-star">✦</span> {a.charAt(0).toUpperCase()+a.slice(1)}</button>))}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"center", marginBottom:16 }}>
        <span style={{ color:P.soft, fontSize:14 }}>Duration</span>
        <select value={duration} onChange={e=>setDuration(Number(e.target.value))} className="duration-select">
          {[15,20,25,30,35,40,45,50,60,75,90].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span style={{ color:P.muted, fontSize:14 }}>min</span>
      </div>
      <label className="flag-label" style={{ "--accent":activity==="yoga"?P.yoga:P.walk }}>
        <input type="checkbox" checked={flag} onChange={e=>setFlag(e.target.checked)} />
        <span className="flag-star">✦</span>
        {activity==="yoga" ? "Intense (pushed hard)" : "Intentional (no phone / nature)"}
      </label>
      <p style={{ color:P.gold, fontSize:16, fontWeight:600, textAlign:"center", margin:"16px 0" }}>→ +{preview} star{preview!==1?"s":""}</p>
      <div style={{ display:"flex", gap:12, justifyContent:"center", marginTop:20 }}>
        <button className="btn-primary" onClick={handleLog}>✦ Place This Star</button>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div></div>
  );
}

function RewardModal({ wk, avail, rk, onClose, onClaim }) {
  const highest = avail[avail.length-1]||"bronze";
  const [selected, setSelected] = useState(`${highest}:${REWARDS[highest][0]}`);
  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal-content modal-reward" onClick={e=>e.stopPropagation()}>
      <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:24, fontWeight:600 }}>Select a Little Joy</h2>
      <p style={{ color:P.soft, fontSize:13, marginBottom:20 }}>Week {wk}</p>
      {["gold","silver","bronze"].map(tier => {
        const ok = avail.includes(tier), need = tier==="gold"?15:tier==="silver"?12:9;
        return (<div key={tier} style={{ marginBottom:16 }}>
          <p style={{ color:ok?tierColor(tier):P.dim, fontWeight:600, fontSize:14, marginBottom:6 }}>✦ {tier.toUpperCase()} ({need}+ stars) {!ok&&"🔒"}</p>
          {REWARDS[tier].map(rw => (<label key={rw} className="reward-option" style={{ opacity:ok?1:0.35, pointerEvents:ok?"auto":"none" }}><input type="radio" name="reward" value={`${tier}:${rw}`} checked={selected===`${tier}:${rw}`} onChange={()=>setSelected(`${tier}:${rw}`)} /><span style={{ color:P.text, fontSize:13 }}>{rw}</span></label>))}
        </div>);
      })}
      <div style={{ display:"flex", gap:12, justifyContent:"center", marginTop:20 }}>
        <button className="btn-primary" onClick={()=>{onClaim(rk,selected);onClose();}}>✦ Receive Your Star</button>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div></div>
  );
}

function CelebrateModal({ tier, reward, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal-content" onClick={e=>e.stopPropagation()} style={{ textAlign:"center" }}>
      <div className="celebrate-burst">✦</div>
      <p style={{ color:tierColor(tier), fontWeight:700, fontSize:18, fontFamily:"'Cormorant Garamond', Georgia, serif" }}>{tier.toUpperCase()}</p>
      <p style={{ color:P.gold, fontSize:16, fontWeight:600, margin:"16px 0" }}>{reward}</p>
      <p style={{ color:P.soft, fontStyle:"italic", fontFamily:"'Cormorant Garamond', Georgia, serif" }}>You earned this light.</p>
      <button className="btn-primary" onClick={onClose} style={{ marginTop:20 }}>Glow On</button>
    </div></div>
  );
}

function LoginScreen({ onGoogleSignIn, loading }) {
  return (
    <div className="login-screen"><StarParticles /><div className="login-content"><div className="login-glow" />
      <h1 className="login-title">✦</h1>
      <h2 className="login-name">Star Flow</h2>
      <p className="login-tagline">A quiet companion for movement and healing</p>
      <button className="google-btn" onClick={onGoogleSignIn} disabled={loading}>
        <svg width="20" height="20" viewBox="0 0 48 48" style={{ marginRight:10, flexShrink:0 }}><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        {loading ? "Connecting…" : "Continue with Google"}
      </button>
      <p className="login-note">Your stars are saved securely. Sign in to track from any device.</p>
    </div></div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function StarFlow() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [claimed, setClaimed] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [rewardModal, setRewardModal] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth()+1);
  const [encouragement] = useState(() => ENCOURAGEMENTS[Math.floor(Math.random()*ENCOURAGEMENTS.length)]);
  const [showGuide, setShowGuide] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); if(!u){setEntries([]);setClaimed([]);setDataLoaded(false);} });
    getRedirectResult(auth).catch(err => console.error("Redirect error:", err));
    return () => unsub();
  }, []);

  useEffect(() => {
    if(!user) return; let cancelled=false;
    (async()=>{ const data=await loadUserData(user.uid); if(!cancelled){setEntries(data.entries||[]);setClaimed(data.claimed||[]);setDataLoaded(true);} })();
    return ()=>{cancelled=true;};
  }, [user]);

  const saveToCloud = useCallback((ne,nc) => {
    if(!user) return;
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>saveUserData(user.uid,{entries:ne,claimed:nc}),500);
  }, [user]);

  const handleGoogleSignIn = async()=>{ setLoginLoading(true); try{await signInWithRedirect(auth,googleProvider);}catch(err){console.error(err);setLoginLoading(false);} };
  const handleSignOut = async()=>{ await signOut(auth); };

  const addEntry = (entry)=>{ const next=[...entries,entry]; setEntries(next); saveToCloud(next,claimed); };
  const delEntry = (idx)=>{ const te=entries.map((e,i)=>({...e,_i:i})).filter(e=>e.date===todayStr()); if(idx<te.length){const next=entries.filter((_,i)=>i!==te[idx]._i); setEntries(next); saveToCloud(next,claimed);} };
  const claimReward = (rk,sel)=>{ const next=[...claimed,rk]; setClaimed(next); saveToCloud(entries,next); const[tier,reward]=sel.split(":",2); setCelebrate({tier,reward}); };
  const unclaim = (rk)=>{ const next=claimed.filter(c=>c!==rk); setClaimed(next); saveToCloud(entries,next); };

  const now = new Date(), today = todayStr(), cw = weekOfMonth(now);
  const stats = monthStats(entries,viewYear,viewMonth);
  const wp = weekPts(entries,now.getFullYear(),now.getMonth()+1,cw);
  const streak = calcStreak(entries), todayEntries = entriesFor(entries,today);
  const todayPtsVal = dailyPts(entries,today), tier = topTier(wp);
  const numWeeks = Math.ceil(new Date(viewYear,viewMonth,0).getDate()/7);
  const isCurrentMonth = viewYear===now.getFullYear() && viewMonth===now.getMonth()+1;

  let milestone = "";
  if(stats.stretch) milestone=MILESTONE_COPY.monthly_stretch;
  else if(stats.target) milestone=MILESTONE_COPY.monthly_target;
  else if(tier&&MILESTONE_COPY[tier]) milestone=MILESTONE_COPY[tier];
  else if(streak>=14) milestone=MILESTONE_COPY.streak_14;
  else if(streak>=7) milestone=MILESTONE_COPY.streak_7;
  else if(streak>=3) milestone=MILESTONE_COPY.streak_3;

  let peekText = "";
  if(!tier){peekText=`${WEEKLY_TARGET-wp} stars from a weekend gift`;}
  else{const at=availTiers(wp),h=at[at.length-1]||"bronze",sample=REWARDS[h][Math.floor(Math.random()*REWARDS[h].length)];peekText=`Unlocked — perhaps: ${sample}`;}

  const prevMonth = ()=>{if(viewMonth===1){setViewMonth(12);setViewYear(viewYear-1);}else setViewMonth(viewMonth-1);};
  const nextMonth = ()=>{if(viewMonth===12){setViewMonth(1);setViewYear(viewYear+1);}else setViewMonth(viewMonth+1);};

  if(authLoading) return (<div className="star-flow-app loading-screen"><style>{STYLES}</style><StarParticles /><p style={{color:P.soft,fontFamily:"'Cormorant Garamond', Georgia, serif",fontSize:18}}>✦</p></div>);
  if(!user) return (<div className="star-flow-app"><style>{STYLES}</style><LoginScreen onGoogleSignIn={handleGoogleSignIn} loading={loginLoading} /></div>);
  if(!dataLoaded) return (<div className="star-flow-app loading-screen"><style>{STYLES}</style><StarParticles /><p style={{color:P.soft,fontFamily:"'Cormorant Garamond', Georgia, serif",fontSize:18}}>Loading your stars…</p></div>);

  return (
    <div className="star-flow-app"><style>{STYLES}</style><StarParticles />
    <div className="app-scroll">
      <header className="app-header"><div>
        <h1 className="app-title"><span className="title-star">✦</span> Star Flow</h1>
        <p className="app-date">{now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p>
      </div><div style={{display:"flex",alignItems:"center",gap:8}}>
        <button className="help-btn" onClick={()=>setShowGuide(!showGuide)}>?</button>
        {user.photoURL ? <img src={user.photoURL} alt="" className="avatar" onClick={handleSignOut} title="Sign out" /> : <button className="help-btn" onClick={handleSignOut} title="Sign out">↩</button>}
      </div></header>

      <ProgressRing current={stats.pts} target={MONTHLY_TARGET} stretch={MONTHLY_STRETCH} />
      <p className="encouragement">{encouragement}</p>
      <div style={{textAlign:"center",marginBottom:28}}><button className="btn-primary btn-large" onClick={()=>setShowLog(true)}>✦ Add a Moment</button></div>

      <GlassCard className="section-card">
        <div className="cal-nav"><button className="cal-arrow" onClick={prevMonth}>‹</button><span className="cal-title">{new Date(viewYear,viewMonth-1).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span><button className="cal-arrow" onClick={nextMonth}>›</button></div>
        <div className="cal-grid">
          {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d=><div key={d} className="cal-dayname">{d}</div>)}
          {calendarWeeks(viewYear,viewMonth).flat().map((day,i)=>{
            if(day===0) return <div key={`e${i}`} className="cal-cell empty" />;
            const ds=`${viewYear}-${String(viewMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const es=entriesFor(entries,ds), hasAct=es.some(e=>calcPts(e)>0), isToday=isCurrentMonth&&day===now.getDate();
            const yc=es.filter(e=>e.activity_type==="yoga"&&e.duration_min>=30).length, wc=es.filter(e=>e.activity_type==="walk"&&e.duration_min>=20).length, dp=dailyPts(entries,ds);
            return (<div key={ds} className={`cal-cell ${isToday?"today":""} ${hasAct?"active":""}`}><span className="cal-day">{day}</span>
              {(yc>0||wc>0)&&<div className="cal-dots">{Array(Math.min(yc,2)).fill(0).map((_,j)=><span key={`y${j}`} className="dot yoga" />)}{Array(Math.min(wc,2)).fill(0).map((_,j)=><span key={`w${j}`} className="dot walk" />)}</div>}
              {dp>0&&<span className="cal-pts">{dp}</span>}</div>);
          })}
        </div>
        <div className="cal-legend"><span><span className="dot yoga" /> Yoga</span><span><span className="dot walk" /> Walk</span><span><span className="dot bonus" /> Star bonus</span></div>
        <p style={{textAlign:"center",color:P.soft,fontSize:12,marginTop:4,paddingBottom:10}}>{stats.yc} yoga ({stats.ys}✦) · {stats.wc} walks ({stats.ws}✦)</p>
      </GlassCard>

      <GlassCard className="section-card">
        <div className="card-header"><h3 className="card-title">Tonight</h3><span className="card-pts" style={{color:P.gold}}>{todayPtsVal} stars</span></div>
        {todayEntries.length===0 ? <p className="empty-state">The sky is quiet tonight. Your first star is waiting.</p> :
          todayEntries.map((entry,i)=>{const a=entry.activity_type,pts=calcPts(entry),hasFlag=entry.intensity_flag||entry.intentional_flag,accent=a==="yoga"?P.yoga:P.walk;
            return (<div key={i} className="entry-card" style={{"--accent":accent,background:a==="yoga"?P.yogaLight:P.walkLight}}><div className="entry-left"><span style={{color:accent}}>✦</span><span className="entry-name">{a.charAt(0).toUpperCase()+a.slice(1)} · {entry.duration_min} min</span>{hasFlag&&<span className="bonus-star" style={{color:P.gold}}>✦</span>}</div><div className="entry-right"><span style={{color:accent,fontWeight:600}}>+{pts}</span><button className="del-btn" onClick={()=>delEntry(i)}>×</button></div></div>);
          })}
      </GlassCard>

      <GlassCard className="section-card">
        <div className="card-header"><h3 className="card-title">Week {cw}</h3><span className="card-pts" style={{color:P.nebula}}>{wp} / {WEEKLY_TARGET}</span></div>
        {streak>0 ? <p style={{color:P.gold,fontSize:13,marginBottom:6}}>🔥 {streak}-night glow</p> : <p style={{color:P.soft,fontSize:13,marginBottom:6}}>Every star counts, even small ones.</p>}
        {milestone&&<p className="milestone">{milestone}</p>}
        <div className="divider" />
        <p style={{color:P.soft,fontSize:12,fontWeight:600,marginBottom:8}}>Constellation Progress</p>
        <TierBar name="Bronze" need={9} pts={wp} color={P.tierBronze} />
        <TierBar name="Silver" need={12} pts={wp} color={P.tierSilver} />
        <TierBar name="Gold" need={15} pts={wp} color={P.tierGold} />
        <p style={{color:P.soft,fontSize:12,marginTop:12}}>{tier?`✦ ${peekText}`:`☽ ${peekText}`}</p>
      </GlassCard>

      <div className="section-header"><h3 style={{color:P.text,fontFamily:"'Cormorant Garamond', Georgia, serif",fontSize:18}}>Weekly Sky</h3></div>
      <div className="week-pills">
        {Array.from({length:numWeeks},(_,i)=>i+1).map(wk=>{const wkPts=weekPts(entries,viewYear,viewMonth,wk),wkTier=topTier(wkPts),isCur=isCurrentMonth&&wk===cw;
          return (<GlassCard key={wk} className={`week-pill ${isCur?"current":""}`} glow={isCur} glowColor={P.nebula}><span className="wp-label">W{wk}</span><span className="wp-pts">{wkPts}</span>{wkTier?<span className="wp-tier" style={{color:tierColor(wkTier)}}>✦</span>:<span className="wp-tier" style={{color:P.dim}}>·</span>}</GlassCard>);
        })}
      </div>

      <div className="section-header" style={{marginTop:20}}><h3 style={{color:P.text,fontFamily:"'Cormorant Garamond', Georgia, serif",fontSize:18}}>☽ Weekend Stars</h3><span style={{color:P.muted,fontSize:12}}>Fri – Sun</span></div>
      {Array.from({length:numWeeks},(_,i)=>i+1).map(wk=>{
        const wkPts=weekPts(entries,viewYear,viewMonth,wk),avail=availTiers(wkPts),tt=topTier(wkPts);
        const rk=`${viewYear}-${String(viewMonth).padStart(2,"0")}-W${wk}`,isClaimed=claimed.includes(rk);
        const fri=fridayOf(viewYear,viewMonth,wk),sun=sundayOf(viewYear,viewMonth,wk),unlocked=new Date()>=fri;
        const dateLabel=`Week ${wk} · ${fri.toLocaleDateString("en-US",{month:"short",day:"numeric"})}–${sun.getDate()}`;
        return (<GlassCard key={rk} className="section-card reward-row"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:P.text,fontSize:13}}>{dateLabel}</span>
          {!avail.length ? <span style={{color:P.dim,fontSize:12}}>{WEEKLY_TARGET-wkPts} stars away</span>
          : !unlocked ? <span style={{color:P.dim,fontSize:12}}>🔒 Fri–Sun</span>
          : isClaimed ? <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{color:P.nebula,fontSize:13}}>{tt&&"✦ "}Received</span><button className="btn-ghost" style={{fontSize:11,padding:"2px 8px"}} onClick={()=>unclaim(rk)}>undo</button></div>
          : <div style={{display:"flex",alignItems:"center",gap:8}}>{avail.map(t=><span key={t} style={{color:tierColor(t),fontSize:14}}>✦</span>)}<button className="btn-primary" style={{fontSize:12,padding:"4px 14px"}} onClick={()=>setRewardModal({wk,avail,rk})}>Receive</button></div>}
        </div></GlassCard>);
      })}
      <div style={{height:50}} />
    </div>

    {showLog&&<LogModal onClose={()=>setShowLog(false)} onLog={addEntry} />}
    {rewardModal&&<RewardModal {...rewardModal} onClose={()=>setRewardModal(null)} onClaim={(rk,sel)=>claimReward(rk,sel)} />}
    {celebrate&&<CelebrateModal {...celebrate} onClose={()=>setCelebrate(null)} />}
    {showGuide&&<div className="modal-overlay" onClick={()=>setShowGuide(false)}><div className="modal-content modal-reward" onClick={e=>e.stopPropagation()}>
      <h2 style={{color:P.gold,fontFamily:"'Cormorant Garamond', Georgia, serif",fontSize:22}}>How Stars Work</h2>
      <div style={{textAlign:"left",marginTop:16}}>
        <p style={{color:P.yoga,fontWeight:600,fontSize:14}}>✦ YOGA</p>
        <p style={{color:P.text,fontSize:12,margin:"2px 0 2px 16px"}}>30+ min → 2 stars</p>
        <p style={{color:P.text,fontSize:12,margin:"2px 0 10px 16px"}}>30+ min + Intense → 3 stars</p>
        <p style={{color:P.walk,fontWeight:600,fontSize:14}}>✦ WALK</p>
        <p style={{color:P.text,fontSize:12,margin:"2px 0 2px 16px"}}>20–44 min → 1 star · 45+ min → 2 stars</p>
        <p style={{color:P.text,fontSize:12,margin:"2px 0 10px 16px"}}>+ Intentional → +1 star</p>
        <div className="divider" />
        <p style={{color:P.text,fontWeight:600,fontSize:14}}>Goals</p>
        <p style={{color:P.soft,fontSize:12,margin:"2px 0 2px 16px"}}>Daily cap: {DAILY_CAP} · Weekly: {WEEKLY_TARGET} · Monthly: {MONTHLY_TARGET} · Stretch: {MONTHLY_STRETCH}</p>
        <div className="divider" />
        <p style={{color:P.text,fontWeight:600,fontSize:14}}>Constellations</p>
        <p style={{color:P.soft,fontSize:12,margin:"2px 0 2px 16px"}}>Bronze: 9+ · Silver: 12+ · Gold: 15+ stars per week</p>
      </div>
      <button className="btn-primary" onClick={()=>setShowGuide(false)} style={{marginTop:20}}>I understand</button>
    </div></div>}
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
.star-flow-app{min-height:100vh;background:linear-gradient(180deg,${P.bgTop} 0%,${P.bg} 40%,${P.bgBottom} 100%);font-family:'Inter','Helvetica Neue',sans-serif;color:${P.text};position:relative;overflow-x:hidden;}
.app-scroll{position:relative;z-index:2;max-width:520px;margin:0 auto;padding:28px 20px;}
.loading-screen{display:flex;align-items:center;justify-content:center;}
.login-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;}
.login-content{position:relative;z-index:2;text-align:center;padding:40px;}
.login-glow{position:absolute;width:300px;height:300px;top:50%;left:50%;transform:translate(-50%,-60%);background:radial-gradient(circle,${P.nebula}18 0%,transparent 65%);border-radius:50%;animation:breathe 6s ease-in-out infinite;pointer-events:none;}
.login-title{font-size:72px;color:${P.gold};margin-bottom:8px;animation:gentle-pulse 4s ease-in-out infinite;}
@keyframes gentle-pulse{0%,100%{opacity:0.8;transform:scale(1);}50%{opacity:1;transform:scale(1.05);}}
.login-name{font-family:'Cormorant Garamond',Georgia,serif;font-size:42px;font-weight:600;color:${P.gold};margin-bottom:8px;}
.login-tagline{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:${P.soft};margin-bottom:48px;}
.google-btn{display:inline-flex;align-items:center;justify-content:center;background:${P.glassSolid};border:1px solid ${P.glassBorder};color:${P.text};padding:14px 32px;border-radius:14px;font-size:15px;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;}
.google-btn:hover{background:${P.dim};border-color:${P.muted};}
.google-btn:disabled{opacity:0.5;cursor:wait;}
.login-note{color:${P.dim};font-size:12px;margin-top:20px;max-width:260px;margin-left:auto;margin-right:auto;}
.avatar{width:32px;height:32px;border-radius:50%;border:1.5px solid ${P.dim};cursor:pointer;transition:border-color 0.2s;object-fit:cover;}
.avatar:hover{border-color:${P.nebula};}
.particle-field{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;}
.particle{position:absolute;bottom:-5px;border-radius:50%;background:${P.moon};animation:float-up linear infinite;}
@keyframes float-up{0%{transform:translateY(0) translateX(0);}100%{transform:translateY(-110vh) translateX(var(--drift));}}
.app-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
.app-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:600;color:${P.gold};line-height:1.1;}
.title-star{font-size:24px;}
.app-date{color:${P.soft};font-size:14px;margin-top:2px;}
.help-btn{background:transparent;border:1px solid ${P.dim};color:${P.muted};width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;font-weight:600;transition:all 0.2s;}
.help-btn:hover{border-color:${P.nebula};color:${P.nebula};}
.ring-container{display:flex;flex-direction:column;align-items:center;position:relative;margin:20px 0 8px;}
.ring-glow{position:absolute;width:300px;height:300px;top:50%;left:50%;transform:translate(-50%,-55%);border-radius:50%;pointer-events:none;animation:breathe 6s ease-in-out infinite;}
@keyframes breathe{0%,100%{opacity:0.6;transform:translate(-50%,-55%) scale(1);}50%{opacity:1;transform:translate(-50%,-55%) scale(1.05);}}
.ring-svg{position:relative;z-index:2;}
.halo-ring{opacity:0.2;animation:halo-pulse 6s ease-in-out infinite;}
@keyframes halo-pulse{0%,100%{opacity:0.12;}50%{opacity:0.32;}}
.ring-sub{font-size:13px;margin-top:8px;text-align:center;transition:color 0.4s;}
.sparkle-icon{color:${P.gold};}
.encouragement{text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:14px;color:${P.nebula};margin-bottom:20px;}
.glass-card{background:${P.glass};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid ${P.glassBorder};border-radius:20px;padding:20px;transition:border-color 0.3s;}
.glass-card.glass-glow{box-shadow:0 0 20px color-mix(in srgb,var(--glow-color) 15%,transparent);border-color:color-mix(in srgb,var(--glow-color) 30%,transparent);}
.section-card{margin-bottom:12px;}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.card-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:600;color:${P.text};}
.card-pts{font-weight:600;font-size:15px;}
.empty-state{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:${P.dim};padding:8px 0;}
.divider{height:1px;background:${P.divider};margin:12px 0;}
.milestone{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:${P.nebula};margin-bottom:8px;}
.entry-card{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:14px;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);margin-bottom:6px;}
.entry-left{display:flex;align-items:center;gap:8px;}
.entry-name{font-size:13px;font-weight:500;}
.bonus-star{font-size:10px;}
.entry-right{display:flex;align-items:center;gap:10px;}
.del-btn{background:none;border:none;color:${P.muted};cursor:pointer;font-size:16px;padding:0 4px;transition:color 0.2s;}
.del-btn:hover{color:${P.text};}
.tier-row{margin-bottom:4px;}
.tier-bar-bg{position:relative;height:30px;border-radius:8px;background:${P.divider};overflow:hidden;}
.tier-bar-fill{position:absolute;top:0;left:0;bottom:0;border-radius:8px;transition:width 0.6s ease;}
.tier-bar-text{position:absolute;inset:0;display:flex;justify-content:space-between;align-items:center;padding:0 10px;font-size:12px;}
.tier-award{display:flex;align-items:center;gap:4px;}
.section-header{display:flex;justify-content:space-between;align-items:center;padding:0 4px;margin-bottom:10px;}
.week-pills{display:flex;gap:8px;justify-content:center;margin-bottom:8px;}
.week-pill{text-align:center;padding:10px 14px !important;min-width:60px;}
.week-pill.current{border-color:${P.nebula};}
.wp-label{display:block;font-size:11px;font-weight:500;color:${P.text};}
.wp-pts{display:block;font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;font-weight:600;color:${P.text};}
.wp-tier{display:block;font-size:14px;}
.reward-row{padding:14px 18px;margin-bottom:6px;}
.btn-primary{background:${P.nebula};color:${P.text};border:none;border-radius:12px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;}
.btn-primary:hover{background:${P.btnActive};}
.btn-large{padding:14px 40px;font-size:16px;}
.btn-ghost{background:transparent;color:${P.muted};border:none;padding:8px 16px;font-size:14px;cursor:pointer;transition:color 0.2s;font-family:'Inter',sans-serif;}
.btn-ghost:hover{color:${P.text};}
.cal-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.cal-arrow{background:none;border:none;color:${P.moon};font-size:22px;font-weight:700;cursor:pointer;padding:4px 10px;transition:color 0.2s;}
.cal-arrow:hover{color:${P.text};}
.cal-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;font-weight:600;color:${P.text};}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
.cal-dayname{text-align:center;font-size:10px;font-weight:600;color:${P.muted};padding:4px 0;}
.cal-cell{position:relative;aspect-ratio:1.2;border-radius:8px;padding:3px 4px;display:flex;flex-direction:column;min-height:42px;}
.cal-cell.empty{background:transparent;}
.cal-cell.today{background:rgba(30,26,58,0.6);border:1.5px solid ${P.nebula};}
.cal-cell.active{background:rgba(25,21,53,0.5);border:1px solid ${P.dim};}
.cal-day{font-size:10px;color:${P.muted};}
.cal-cell.today .cal-day,.cal-cell.active .cal-day{color:${P.text};font-weight:600;}
.cal-dots{display:flex;gap:2px;margin-top:auto;}
.dot{width:6px;height:6px;border-radius:50%;display:inline-block;}
.dot.yoga{background:${P.yoga};}
.dot.walk{background:${P.walk};}
.dot.bonus{background:${P.gold};}
.cal-pts{position:absolute;top:3px;right:5px;font-size:8px;color:${P.soft};}
.cal-legend{display:flex;justify-content:center;gap:16px;padding:8px 0 4px;font-size:11px;color:${P.soft};}
.cal-legend span{display:flex;align-items:center;gap:4px;}
.cal-legend .dot{width:8px;height:8px;}
.modal-overlay{position:fixed;inset:0;background:rgba(8,9,18,0.85);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;animation:fade-in 0.2s ease;}
@keyframes fade-in{from{opacity:0;}to{opacity:1;}}
.modal-content{background:${P.glassSolid};border:1px solid ${P.glassBorder};border-radius:24px;padding:32px;max-width:400px;width:90%;max-height:90vh;overflow-y:auto;animation:modal-up 0.3s ease;}
.modal-reward{max-height:80vh;}
@keyframes modal-up{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
.activity-btn{background:transparent;border:1.5px solid ${P.dim};color:${P.muted};padding:10px 24px;border-radius:14px;font-size:15px;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;}
.activity-btn:hover{border-color:var(--accent);color:var(--accent);}
.activity-btn.active{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);}
.activity-star{font-size:13px;}
.duration-select{background:${P.glassSolid};border:1px solid ${P.dim};color:${P.text};padding:6px 10px;border-radius:8px;font-size:14px;font-family:'Inter',sans-serif;}
.duration-select option{background:${P.glassSolid};color:${P.text};}
.flag-label{display:flex;align-items:center;gap:8px;justify-content:center;color:var(--accent);font-size:13px;cursor:pointer;}
.flag-label input[type="checkbox"]{accent-color:var(--accent);width:16px;height:16px;}
.flag-star{font-size:12px;}
.reward-option{display:flex;align-items:center;gap:8px;padding:3px 0 3px 18px;cursor:pointer;}
.reward-option input[type="radio"]{accent-color:${P.nebula};}
.celebrate-burst{font-size:48px;color:${P.gold};animation:spin-burst 1.2s ease;margin-bottom:12px;}
@keyframes spin-burst{0%{transform:scale(0) rotate(0deg);opacity:0;}50%{transform:scale(1.3) rotate(180deg);opacity:1;}100%{transform:scale(1) rotate(360deg);opacity:1;}}
::-webkit-scrollbar{width:6px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:${P.dim};border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:${P.muted};}
`;
