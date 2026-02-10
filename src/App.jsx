import { useState, useEffect, useRef, useCallback } from "react";
import { auth, googleProvider, appleProvider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, deleteUser, reauthenticateWithPopup } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const P = {
  bgTop: "#0B0D18", bg: "#0E0F1A", bgBottom: "#14162A",
  glass: "rgba(24,27,48,0.55)", glassBorder: "rgba(46,48,96,0.5)",
  glassSolid: "#181B30",
  gold: "#F3D27A", moon: "#C9D1FF", nebula: "#9C8CFF", aurora: "#6EC5FF",
  text: "#E7E9FF", soft: "#8F96C8", muted: "#6B7099", dim: "#3D4166",
  tierGold: "#F3D27A", tierSilver: "#C9D1FF", tierBronze: "#D4976A",
  divider: "rgba(37,40,71,0.6)",
  btn: "#9C8CFF", btnActive: "#7B6ECC", btnDark: "#2A2555",
};

// ─── ACTIVITY PRESETS (for onboarding) ───────────────────────────────────────
// Each preset defines an activity with scoring rules users can customize later.
// - minDuration: minimum minutes to earn any stars
// - baseStars: stars earned at minDuration
// - midDuration: optional second tier threshold (null if single-tier)
// - midStars: stars earned at midDuration+ (null if single-tier)
// - bonusLabel: what the bonus checkbox says
// - bonusStars: extra stars when bonus is checked
const ACTIVITY_PRESETS = [
  { id: "yoga", label: "Yoga", color: "#9C8CFF", colorLight: "rgba(30,26,58,0.7)",
    minDuration: 30, baseStars: 2, midDuration: null, midStars: null,
    bonusLabel: "Intense (pushed hard)", bonusStars: 1 },
  { id: "walk", label: "Walking", color: "#6EC5FF", colorLight: "rgba(21,29,46,0.7)",
    minDuration: 20, baseStars: 1, midDuration: 45, midStars: 2,
    bonusLabel: "Intentional (no phone / nature)", bonusStars: 1 },
  { id: "run", label: "Running", color: "#6EFFC5", colorLight: "rgba(21,46,36,0.7)",
    minDuration: 15, baseStars: 2, midDuration: 30, midStars: 3,
    bonusLabel: "Pushed pace / intervals", bonusStars: 1 },
  { id: "gym", label: "Gym", color: "#FF9C6E", colorLight: "rgba(46,29,21,0.7)",
    minDuration: 30, baseStars: 2, midDuration: 60, midStars: 3,
    bonusLabel: "Hit a PR / extra effort", bonusStars: 1 },
  { id: "swim", label: "Swimming", color: "#6ED8FF", colorLight: "rgba(21,38,46,0.7)",
    minDuration: 20, baseStars: 2, midDuration: 45, midStars: 3,
    bonusLabel: "Distance or drill focus", bonusStars: 1 },
  { id: "cycle", label: "Cycling", color: "#C5FF6E", colorLight: "rgba(36,46,21,0.7)",
    minDuration: 20, baseStars: 1, midDuration: 45, midStars: 2,
    bonusLabel: "Hills or high intensity", bonusStars: 1 },
  { id: "meditate", label: "Meditation", color: "#FF8CDB", colorLight: "rgba(46,21,40,0.7)",
    minDuration: 10, baseStars: 1, midDuration: 20, midStars: 2,
    bonusLabel: "Deep focus / guided session", bonusStars: 1 },
  { id: "dance", label: "Dance", color: "#FFB86E", colorLight: "rgba(46,38,21,0.7)",
    minDuration: 20, baseStars: 2, midDuration: 45, midStars: 3,
    bonusLabel: "Full routine / performance", bonusStars: 1 },
];

// ─── DEFAULT TARGETS & REWARDS ───────────────────────────────────────────────
const DEFAULT_TARGETS = {
  targetSessionsPerWeek: 4,
  weeklyStarTarget: 6,   // round(targetSessionsPerWeek * 1.6)
  monthlyTarget: 20,
  monthlyStretch: 28,
};

const DEFAULT_REWARDS = [
  "Coffee Trip", "Mini Beauty Treat", "Fresh Flowers", "New Book",
  "Movie Night", "Candle", "Spa Day", "Day trip adventure",
];

// ─── COPY & TEXT ─────────────────────────────────────────────────────────────
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
  constellation: "Your constellation is complete. Choose a reward.",
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

// ─── FIREBASE DATA ───────────────────────────────────────────────────────────
// The new data structure stores everything per user:
//   profile:    { displayName, onboardingComplete, createdAt }
//   activities: [ { id, label, color, colorLight, minDuration } ]
//   targets:    { targetSessionsPerWeek, weeklyStarTarget, monthlyTarget, monthlyStretch }
//   rewards:    [ "reward1", "reward2", ... ]  (soft suggestions for promises)
//   entries:    [ { date, activity_type, duration_min, mindful } ]
//   promises:   { "2026-02-W1": "A quiet coffee" }  (weekly intentions)
//   claimed:    [ "2026-02-W1", ... ]

async function loadUserData(userId) {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (snap.exists()) {
      const data = snap.data();
      // ── MIGRATION: detect old format (no profile field) and convert ──
      if (!data.profile) {
        console.log("Migrating old data format to new structure…");
        const migrated = migrateOldData(data);
        await setDoc(doc(db, "users", userId), migrated);
        return migrated;
      }
      return data;
    }
  } catch (err) { console.error("Load error:", err); }
  // Return null for brand-new users (triggers onboarding)
  return null;
}

function migrateOldData(oldData) {
  // Convert old entries: intensity_flag/intentional_flag/bonus_flag → mindful
  const migratedEntries = (oldData.entries || []).map(e => ({
    date: e.date,
    activity_type: e.activity_type,
    duration_min: e.duration_min,
    mindful: e.mindful || e.bonus_flag || e.intensity_flag || e.intentional_flag || false,
  }));

  return {
    profile: { displayName: "", onboardingComplete: true, createdAt: new Date().toISOString() },
    activities: ACTIVITY_PRESETS.filter(a => a.id === "yoga" || a.id === "walk"),
    targets: { ...DEFAULT_TARGETS },
    rewards: [...DEFAULT_REWARDS],
    entries: migratedEntries,
    promises: oldData.promises || {},
    claimed: oldData.claimed || [],
  };
}

async function saveUserData(userId, data) {
  try { await setDoc(doc(db, "users", userId), data); }
  catch (err) { console.error("Save error:", err); }
}

// ─── SCORING ENGINE ──────────────────────────────────────────────────────────
// 1 base star per session meeting minimum duration.
// Presence bonus: +0.5 if mindful (max 1 per day).
// Reentry multiplier: returning after missed days.
// Diminishing returns: first efforts each day shine brightest (replaces daily cap).

const REENTRY_TABLE = { 0: 1.0, 1: 1.2, 2: 1.35 }; // 3+ → 1.5
const PACING_TABLE = { 1: 1.0, 2: 0.7, 3: 0.5 };   // 4+ → 0.35

function reentryMultiplier(missed) { return REENTRY_TABLE[missed] ?? 1.5; }
function pacingMultiplier(idx) { return PACING_TABLE[idx] ?? 0.35; }

const SESSION_MESSAGES = {
  reentry: ["Welcome back — the sky remembers you.", "Return light. This counts double.", "The stars waited for you."],
  presence: ["Presence noted. The glow deepens.", "A mindful moment — rarer than gold.", "Phone down, sky up. Beautiful."],
  base: ["A star placed. Quietly luminous.", "The sky grows.", "One more light in your constellation."],
};

function scoreSession(entry, activities, allEntries) {
  const act = activities.find(a => a.id === entry.activity_type);
  const empty = { starsEarned: 0, baseStar: 0, presenceBonus: 0, reentryMult: 1, pacingMult: 1, message: "" };
  if (!act || entry.duration_min < act.minDuration) return empty;

  const baseStar = 1;
  let presenceBonus = 0;
  if (entry.mindful) {
    const otherMindful = allEntries.filter(e =>
      e.date === entry.date && e !== entry && e.mindful &&
      e.duration_min >= (activities.find(a => a.id === e.activity_type)?.minDuration || 999)
    );
    if (otherMindful.length === 0) presenceBonus = 0.5;
  }

  const todayBefore = allEntries.filter(e =>
    e.date === entry.date && allEntries.indexOf(e) < allEntries.indexOf(entry) &&
    e.duration_min >= (activities.find(a => a.id === e.activity_type)?.minDuration || 999)
  );
  const sessionIndex = todayBefore.length + 1;
  const missedDays = calcMissedDays(entry.date, allEntries, activities);
  const reentryMult = reentryMultiplier(missedDays);
  const pacingMult = pacingMultiplier(sessionIndex);
  const starsEarned = Math.round((baseStar + presenceBonus) * reentryMult * pacingMult * 100) / 100;

  let msgPool = SESSION_MESSAGES.base;
  if (missedDays >= 1) msgPool = SESSION_MESSAGES.reentry;
  else if (presenceBonus > 0) msgPool = SESSION_MESSAGES.presence;
  const message = msgPool[Math.floor(Math.random() * msgPool.length)];

  return { starsEarned, baseStar, presenceBonus, reentryMult, pacingMult, message };
}

function calcMissedDays(dateStr, allEntries, activities) {
  const d = new Date(dateStr);
  let missed = 0;
  for (let i = 1; i <= 14; i++) {
    const prev = new Date(d); prev.setDate(prev.getDate() - i);
    const prevStr = prev.toISOString().slice(0, 10);
    if (allEntries.some(e => e.date === prevStr && e.duration_min >= (activities.find(a => a.id === e.activity_type)?.minDuration || 999))) break;
    missed++;
  }
  return missed;
}

// Simplified check: did this entry meet minimum duration?
function calcPts(entry, activities) {
  const act = activities.find(a => a.id === entry.activity_type);
  if (!act || entry.duration_min < act.minDuration) return 0;
  return 1;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function entriesFor(entries, ds) { return entries.filter(e => e.date === ds); }

function dailyStars(allEntries, ds, activities) {
  let total = 0;
  for (const entry of entriesFor(allEntries, ds)) {
    total += scoreSession(entry, activities, allEntries).starsEarned;
  }
  return Math.round(total * 10) / 10;
}

function weekOfMonth(d) { return Math.ceil(d.getDate() / 7); }

function weekRange(y, m, wn) {
  const s = (wn - 1) * 7 + 1;
  const e = Math.min(wn * 7, new Date(y, m, 0).getDate());
  return [new Date(y, m - 1, s), new Date(y, m - 1, e)];
}

function weekStars(allEntries, y, m, wn, activities) {
  const [s, e] = weekRange(y, m, wn);
  let total = 0; const cur = new Date(s);
  while (cur <= e) {
    total += dailyStars(allEntries, cur.toISOString().slice(0, 10), activities);
    cur.setDate(cur.getDate() + 1);
  }
  return Math.round(total * 10) / 10;
}

function monthStats(entries, y, m, activities, targets) {
  const days = new Date(y, m, 0).getDate();
  let pts = 0;
  const actCounts = {}, mindfulCounts = {};
  activities.forEach(a => { actCounts[a.id] = 0; mindfulCounts[a.id] = 0; });
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    pts += dailyStars(entries, ds, activities);
    entriesFor(entries, ds).forEach(e => {
      if (calcPts(e, activities) > 0) {
        actCounts[e.activity_type] = (actCounts[e.activity_type] || 0) + 1;
        if (e.mindful) mindfulCounts[e.activity_type] = (mindfulCounts[e.activity_type] || 0) + 1;
      }
    });
  }
  pts = Math.round(pts * 10) / 10;
  return { pts, actCounts, mindfulCounts, target: pts >= targets.monthlyTarget, stretch: pts >= targets.monthlyStretch };
}

function calcStreak(entries, activities) {
  const active = new Set(entries.filter(e => calcPts(e, activities) > 0).map(e => e.date));
  if (!active.size) return 0;
  let streak = 0, d = new Date();
  while (active.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function goalMet(pts, targets) { return pts >= targets.weeklyStarTarget; }

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

// ─── VISUAL COMPONENTS ───────────────────────────────────────────────────────
function StarParticles() {
  const particles = useRef(Array.from({ length: 10 }, (_, i) => ({
    id: i, x: Math.random()*100, size: 1+Math.random()*2,
    duration: 25+Math.random()*35, delay: Math.random()*-40,
    opacity: 0.04+Math.random()*0.1, drift: (Math.random()-0.5)*20,
  }))).current;
  return (
    <div className="particle-field">
      {particles.map(p => (
        <div key={p.id} className="particle" style={{
          left:`${p.x}%`, width:p.size, height:p.size,
          animationDuration:`${p.duration}s`, animationDelay:`${p.delay}s`,
          opacity:p.opacity, "--drift":`${p.drift}px`,
        }} />
      ))}
    </div>
  );
}

function ProgressRing({ current, target, stretch }) {
  const pct = target > 0 ? Math.min(current/target, 1) : 0;
  const isStretch = current >= stretch, isTarget = current >= target, remaining = target - current;
  const r=72, cx=120, cy=120, lw=14, circ=2*Math.PI*r, offset=circ*(1-pct);
  const strokeColor = isStretch ? P.gold : P.nebula, glowColor = isStretch ? P.gold : P.nebula;
  const subText = isStretch ? "You reached the far stars."
    : isTarget ? "Monthly constellation complete."
    : `${NUM_WORDS[remaining]||remaining} star${remaining!==1?"s":""} until the sky begins to connect.`;
  return (
    <div className="ring-container">
      <div className="ring-glow" style={{ background:`radial-gradient(circle, ${glowColor}22 0%, transparent 65%)` }} />
      <svg width="240" height="240" viewBox="0 0 240 240" className="ring-svg">
        <circle cx={cx} cy={cy} r={r+18} fill="none" stroke={glowColor} strokeWidth="1" className="halo-ring" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={P.dim} strokeWidth={lw} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={strokeColor} strokeWidth={lw} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition:"stroke-dashoffset 0.8s ease, stroke 0.5s ease" }} />
        <text x={cx} y={cy-10} textAnchor="middle" fill={P.text}
          style={{ fontSize:"36px", fontFamily:"'Cormorant Garamond', Georgia, serif", fontWeight:600 }}>{current}</text>
        <text x={cx} y={cy+18} textAnchor="middle" fill={P.soft}
          style={{ fontSize:"13px", fontFamily:"'Inter', sans-serif" }}>of {target} stars</text>
      </svg>
      <p className="ring-sub" style={{ color: isStretch ? P.gold : isTarget ? P.nebula : P.soft }}>
        {isStretch && <span className="sparkle-icon">✦ </span>}{subText}
      </p>
    </div>
  );
}

function GlassCard({ children, className="", glow=false, glowColor=P.nebula, style={} }) {
  return (
    <div className={`glass-card ${glow?"glass-glow":""} ${className}`}
      style={{ "--glow-color":glowColor, ...style }}>
      {children}
    </div>
  );
}

function ConstellationBar({ pts, target }) {
  const pct = target > 0 ? Math.min(pts / target, 1) : 0;
  const hit = pts >= target;
  return (
    <div className="tier-row">
      <div className="tier-bar-bg">
        <div className="tier-bar-fill" style={{ width: `${pct * 100}%`, background: hit ? P.gold : `linear-gradient(90deg, ${P.nebula}, ${P.aurora})` }} />
        <div className="tier-bar-text">
          <span className="tier-award" style={{ color: hit ? (pct > 0.5 ? P.bg : P.gold) : P.soft }}>
            ✦ <span style={{ fontWeight: hit ? 600 : 400 }}>Constellation goal</span>
          </span>
          <span style={{ color: hit ? (pct > 0.5 ? P.bg : P.gold) : P.muted, fontSize: 12 }}>
            {hit ? "✓ Complete" : `${Math.round((target - pts) * 10) / 10} to go`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── DYNAMIC LOG MODAL ───────────────────────────────────────────────────────
// Now reads from the user's activities config instead of hardcoded yoga/walk

function LogModal({ onClose, onLog, activities, allEntries }) {
  const [activityId, setActivityId] = useState(activities[0]?.id || "");
  const [duration, setDuration] = useState(30);
  const [mindful, setMindful] = useState(false);

  const act = activities.find(a => a.id === activityId);
  // Preview: simulate adding this entry
  const previewEntry = { date: todayStr(), activity_type: activityId, duration_min: duration, mindful };
  const preview = act ? scoreSession(previewEntry, activities, [...allEntries, previewEntry]) : { starsEarned: 0, message: "" };

  const handleLog = () => {
    onLog({
      date: todayStr(),
      activity_type: activityId,
      duration_min: duration,
      mindful,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:26, fontWeight:600, marginBottom:24 }}>
          Add a Moment
        </h2>
        <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:20, flexWrap:"wrap" }}>
          {activities.map(a => (
            <button key={a.id} onClick={() => { setActivityId(a.id); setMindful(false); }}
              className={`activity-btn ${activityId===a.id ? "active" : ""}`}
              style={{ "--accent": a.color }}>
              <span className="activity-star">✦</span> {a.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"center", marginBottom:16 }}>
          <span style={{ color:P.soft, fontSize:14 }}>Duration</span>
          <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="duration-select">
            {[10,15,20,25,30,35,40,45,50,60,75,90,120].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <span style={{ color:P.muted, fontSize:14 }}>min</span>
        </div>
        <label className="flag-label" style={{ "--accent": P.gold }}>
          <input type="checkbox" checked={mindful} onChange={e => setMindful(e.target.checked)} />
          <span className="flag-star">✦</span>
          Mindful session (phone-free / fully present)
        </label>
        <p style={{ color:P.gold, fontSize:16, fontWeight:600, textAlign:"center", margin:"16px 0" }}>
          → +{preview.starsEarned} star{preview.starsEarned !== 1 ? "s" : ""}
        </p>
        {act && duration < act.minDuration && (
          <p style={{ color:P.muted, fontSize:11, textAlign:"center", marginBottom:8 }}>
            {act.label} needs {act.minDuration}+ min to earn a star
          </p>
        )}
        {preview.starsEarned > 0 && (
          <p style={{ color:P.soft, fontSize:11, textAlign:"center", fontStyle:"italic", marginBottom:8 }}>
            {preview.message}
          </p>
        )}
        <div style={{ display:"flex", gap:12, justifyContent:"center", marginTop:20 }}>
          <button className="btn-primary" onClick={handleLog}>✦ Place This Star</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── DYNAMIC REWARD MODAL ────────────────────────────────────────────────────

function PromiseModal({ wk, rk, onClose, onSetPromise, suggestions }) {
  const [text, setText] = useState("");
  const softSuggestions = suggestions || [
    "A quiet coffee moment",
    "Time to read something I enjoy",
    "Feeling steady and proud",
    "Rest without guilt",
    "A walk just for the joy of it",
  ];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-reward" onClick={e => e.stopPropagation()}>
        <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:22, fontWeight:600, marginBottom:8 }}>
          This Week
        </h2>
        <p style={{ color:P.soft, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:15, lineHeight:1.7, marginBottom:20 }}>
          What's something you care about — or something you'd like to look forward to?
        </p>
        <p style={{ color:P.muted, fontSize:11, fontStyle:"italic", marginBottom:16 }}>
          It can be small. It should feel meaningful.
        </p>
        <input type="text" value={text} onChange={e => setText(e.target.value)}
          placeholder="Something for this week…"
          className="onboard-input"
          style={{ marginBottom:16, fontSize:14, padding:"12px 14px" }}
          autoFocus />
        {!text && (
          <div style={{ marginBottom:16 }}>
            <p style={{ color:P.dim, fontSize:11, marginBottom:8 }}>Or choose one:</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {softSuggestions.map(s => (
                <button key={s} onClick={() => setText(s)}
                  style={{
                    background:P.glass, border:`1px solid ${P.glassBorder}`, borderRadius:20,
                    color:P.soft, fontSize:12, padding:"6px 12px", cursor:"pointer",
                    fontFamily:"'Cormorant Garamond', Georgia, serif",
                  }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:"flex", gap:12, justifyContent:"center", marginTop:8 }}>
          <button className="btn-primary" disabled={!text.trim()}
            onClick={() => { onSetPromise(rk, text.trim()); onClose(); }}>
            I'm committing to this
          </button>
          <button className="btn-ghost" onClick={onClose}>Not this week</button>
        </div>
      </div>
    </div>
  );
}

function ReflectModal({ wk, rk, promise, exceeded, onClose, onClaim }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign:"center" }}>
        <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:22, fontWeight:600, marginBottom:16 }}>
          {exceeded ? "You Went Beyond" : "You Showed Up"}
        </h2>
        <p style={{ color:P.soft, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:14, lineHeight:1.7, marginBottom:20 }}>
          {exceeded
            ? "You went beyond what you asked of yourself. That deserves acknowledgment."
            : "You showed up in a way that aligns with what you said mattered."}
        </p>
        {promise && (
          <div style={{
            background:P.glass, border:`1px solid ${P.glassBorder}`, borderRadius:14,
            padding:"16px 20px", margin:"0 auto 24px", maxWidth:300,
          }}>
            <p style={{ color:P.muted, fontSize:11, marginBottom:6, fontStyle:"italic" }}>
              This week, you promised yourself:
            </p>
            <p style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:16, fontWeight:500, lineHeight:1.5 }}>
              "{promise}"
            </p>
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
          <button className="btn-primary" onClick={() => { onClaim(rk); onClose(); }}>
            Commit to what I promised myself
          </button>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize:13, color:P.dim }}>
            Not this week
          </button>
        </div>
      </div>
    </div>
  );
}

function CelebrateModal({ promise, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign:"center" }}>
        <div className="celebrate-burst">✦</div>
        <p style={{ color:P.gold, fontWeight:600, fontSize:16, fontFamily:"'Cormorant Garamond', Georgia, serif", margin:"16px 0" }}>
          {promise ? `"${promise}"` : "A promise kept."}
        </p>
        <p style={{ color:P.soft, fontStyle:"italic", fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:14 }}>
          You honored what mattered to you.
        </p>
        <button className="btn-primary" onClick={onClose} style={{ marginTop:24 }}>Glow On</button>
      </div>
    </div>
  );
}

// ─── ONBOARDING WIZARD ───────────────────────────────────────────────────────
// Shown to new users (no data in Firestore yet). Guides them through:
//   Step 1: Welcome — enter name
//   Step 2: Choose activities from presets
//   Step 3: Customize scoring rules per activity
//   Step 4: Set weekly/monthly targets
//   Step 5: Pick rewards for each tier
//   Step 6: Launch

// ─── ONBOARDING QUESTIONS ────────────────────────────────────────────────────
const ONBOARD_QUESTIONS = [
  {
    id: "movement_feeling", type: "single",
    question: "How does movement feel to you right now?",
    options: ["Calm and grounding", "Hopeful but inconsistent", "Neutral", "Overwhelming", "Resistant", "Curious but unsure"],
  },
  {
    id: "past_friction", type: "multi",
    question: "What has most often made movement hard to stick with?",
    subtitle: "Select all that apply",
    options: ["Lack of time", "Low energy", "Motivation comes and goes", "All-or-nothing thinking", "Comparison or intimidation", "Physical discomfort"],
  },
  {
    id: "intention", type: "single",
    question: "Which intention feels most important right now?",
    options: ["Consistency, not intensity", "Gentle structure", "Freedom and flexibility", "Feeling strong", "Feeling calm in my body"],
  },
  {
    id: "current_baseline", type: "single",
    question: "On average, how often do you intentionally move your body?",
    options: ["Rarely or just starting", "1–2 days per week", "3–4 days per week", "5 or more days per week"],
  },
  {
    id: "movement_types", type: "multi",
    question: "What kinds of movement do you enjoy, even a little?",
    subtitle: "Select all that apply",
    options: ["Walking", "Running", "Gym workouts", "Pilates or yoga", "Stretching or mobility", "Swimming", "Cycling", "Dancing", "Meditation", "I'm still exploring"],
  },
  {
    id: "time_realism", type: "single",
    question: "On a regular day, how much time feels realistic for movement?",
    options: ["5–10 minutes", "15–20 minutes", "30 minutes", "45 minutes or more"],
  },
  {
    id: "three_month_vision", type: "multi",
    question: "Three months from now, what would feeling \"better\" look like?",
    subtitle: "Select all that resonate",
    options: ["More energy", "Less stress", "Better sleep", "Feeling stronger", "More confidence", "A steady routine"],
  },
  {
    id: "goal_focus", type: "single",
    question: "Which focus matters most to you right now?",
    options: ["Mental health and emotional balance", "Physical strength", "Appearance or aesthetics", "Discipline and routine", "Recovery and gentleness"],
  },
  {
    id: "life_fit", type: "single",
    question: "How do you want movement to fit into your life?",
    options: ["A grounding ritual", "A personal challenge", "A non-negotiable habit", "A flexible support system"],
  },
  {
    id: "motivation_style", type: "single",
    question: "What motivates you most?",
    options: ["Checking things off", "Seeing visual progress", "Earning rewards", "Internal pride"],
  },
  {
    id: "missed_day", type: "single",
    question: "If you miss a day, what helps you come back?",
    options: ["Gentle reassurance", "Clear structure to restart", "Accountability", "Permission to rest"],
  },
  {
    id: "tracking_comfort", type: "single",
    question: "How do you feel about tracking progress?",
    options: ["I enjoy it", "I'm neutral", "Only if it's simple", "I prefer minimal tracking"],
  },
  {
    id: "reward_types", type: "multi",
    question: "What actually feels rewarding to you?",
    subtitle: "Select all that apply",
    options: ["Coffee or small treats", "Beauty or self-care items", "Experiences or outings", "Extra rest or free time", "Visual achievements (stars, glow, milestones)"],
  },
  {
    id: "reward_pacing", type: "single",
    question: "When do rewards feel best?",
    options: ["Small and frequent", "Milestone-based", "Surprise-based", "Long-term goals"],
  },
  {
    id: "progress_style", type: "single",
    question: "What makes progress feel good rather than stressful?",
    options: ["Streaks", "Point accumulation", "Personal bests", "Simply showing up"],
  },
  {
    id: "tone_preference", type: "single",
    question: "What tone feels most supportive to you?",
    options: ["Soft and nurturing", "Calm and neutral", "Motivational", "Lightly playful"],
  },
  {
    id: "boundaries", type: "multi",
    question: "What should Star Flow never emphasize?",
    subtitle: "Select all that apply",
    options: ["Weight", "Calories", "Comparison to others", "Guilt or shame language"],
  },
];

// Map movement_types answers to activity preset IDs
const MOVEMENT_TO_PRESET = {
  "Walking": "walk",
  "Running": "run",
  "Gym workouts": "gym",
  "Pilates or yoga": "yoga",
  "Stretching or mobility": "yoga",
  "Swimming": "swim",
  "Cycling": "cycle",
  "Dancing": "dance",
  "Meditation": "meditate",
  "I'm still exploring": null,
};

function OnboardingWizard({ user, onComplete }) {
  const [phase, setPhase] = useState("welcome"); // welcome | questions | generating | review
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [fadeState, setFadeState] = useState("in"); // in | out
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [reviewStep, setReviewStep] = useState(0); // 0–6 for 7 post-assessment screens

  // AI-generated plan
  const [generatedActivities, setGeneratedActivities] = useState([]);
  const [generatedTargets, setGeneratedTargets] = useState({ ...DEFAULT_TARGETS });
  const [generatedRewards, setGeneratedRewards] = useState([...DEFAULT_REWARDS]);
  const [aiExplanation, setAiExplanation] = useState("");

  const totalQuestions = ONBOARD_QUESTIONS.length;
  const currentQ = ONBOARD_QUESTIONS[qIndex];

  // Current answer for this question
  const currentAnswer = answers[currentQ?.id];
  const hasAnswer = currentQ?.type === "multi"
    ? (currentAnswer && currentAnswer.length > 0)
    : !!currentAnswer;

  // Select an option
  const selectOption = (option) => {
    if (!currentQ) return;
    if (currentQ.type === "multi") {
      setAnswers(prev => {
        const arr = prev[currentQ.id] || [];
        return {
          ...prev,
          [currentQ.id]: arr.includes(option)
            ? arr.filter(o => o !== option)
            : [...arr, option],
        };
      });
    } else {
      setAnswers(prev => ({ ...prev, [currentQ.id]: option }));
      // Auto-advance after brief pause for single select
      setTimeout(() => goNext(), 400);
    }
  };

  // Navigate with fade
  const fadeTo = (cb) => {
    setFadeState("out");
    setTimeout(() => {
      cb();
      setFadeState("in");
    }, 300);
  };

  const goNext = () => {
    if (qIndex < totalQuestions - 1) {
      fadeTo(() => setQIndex(q => q + 1));
    } else {
      fadeTo(() => {
        setPhase("generating");
        generatePlan();
      });
    }
  };

  const goBack = () => {
    if (qIndex > 0) {
      fadeTo(() => setQIndex(q => q - 1));
    } else {
      fadeTo(() => setPhase("welcome"));
    }
  };

  // ── Build AI prompt from all answers ──
  const generatePlan = async () => {
    setAiLoading(true);
    setAiError("");

    // Map selected movements to activity presets
    const selectedMovements = answers.movement_types || [];
    const presetIds = [...new Set(
      selectedMovements
        .map(m => MOVEMENT_TO_PRESET[m])
        .filter(Boolean)
    )];
    // Fallback if "still exploring" or nothing maps
    const selectedPresets = presetIds.length > 0
      ? presetIds.map(id => ACTIVITY_PRESETS.find(p => p.id === id)).filter(Boolean)
      : [ACTIVITY_PRESETS[0], ACTIVITY_PRESETS[1]]; // yoga + walking default

    const answersText = ONBOARD_QUESTIONS.map(q => {
      const a = answers[q.id];
      const val = Array.isArray(a) ? a.join(", ") : (a || "No answer");
      return `${q.question}\n→ ${val}`;
    }).join("\n\n");

    const prompt = `You are a thoughtful wellness coach designing a personalized movement tracking plan. The user has completed a detailed assessment. Use their answers to create a plan that feels genuinely tailored — not generic.

USER NAME: ${displayName}

FULL ASSESSMENT:
${answersText}

SELECTED ACTIVITY PRESETS (use these as base templates):
${JSON.stringify(selectedPresets.map(a => ({ id: a.id, label: a.label, color: a.color, colorLight: a.colorLight })), null, 2)}

CRITICAL GUIDELINES BASED ON THEIR ANSWERS:
- Movement feeling "${answers.movement_feeling || ""}" → adjust difficulty & encouragement style
- Past friction: "${(answers.past_friction || []).join(", ")}" → remove those barriers
- Current baseline "${answers.current_baseline || ""}" → calibrate minimum durations
- Time realism "${answers.time_realism || ""}" → set minDuration to fit their schedule
- Goal focus "${answers.goal_focus || ""}" → weight toward their priority
- Motivation style "${answers.motivation_style || ""}" → shape encouragement
- Reward preferences: "${(answers.reward_types || []).join(", ")}" → personalize reward suggestions
- Tone preference "${answers.tone_preference || ""}" → inform the explanation voice
- Boundaries: "${(answers.boundaries || []).join(", ")}" → NEVER include these in rewards or language
- Tracking comfort "${answers.tracking_comfort || ""}" → simpler setup for minimal trackers

THE SCORING MODEL (do NOT change this, it is built into the app):
- Each session earns exactly 1 base star if it meets the activity's minDuration
- Presence bonus: +0.5 star if the session is mindful/phone-free (max 1 per day)
- Reentry bonus: multiplier for returning after missed days (1.2x after 1 day, 1.5x after 3+)
- Pacing: diminishing returns for multiple sessions per day (no daily cap)
- There are NO tiers (no bronze/silver/gold). Just a single weekly constellation goal.

Respond with ONLY a JSON object (no markdown, no backticks, no explanation outside JSON):
{
  "activities": [
    {
      "id": "preset_id",
      "label": "Activity Name",
      "color": "#hex",
      "colorLight": "rgba(...)",
      "minDuration": 20
    }
  ],
  "targets": {
    "targetSessionsPerWeek": 4,
    "weeklyStarTarget": 6,
    "monthlyTarget": 22,
    "monthlyStretch": 30
  },
  "rewards": ["reward1", "reward2", "reward3", "reward4", "reward5", "reward6", "reward7", "reward8"],
  "explanation": "A warm 2-3 sentence message in an ethereal, third-person voice — as if the stars or the sky are speaking. NEVER use 'I' or 'we'. Instead use phrases like 'This sky was shaped around...', 'The stars noticed...', 'Your constellation honors...'. Address ${displayName} by name. Match the tone they selected: ${answers.tone_preference || "calm and neutral"}. Example tone: 'This sky was shaped around your need for calm, grounding movement, ${displayName}. The stars honor consistency over intensity.'"
}

RULES FOR ACTIVITY minDuration:
- "Rarely or just starting" → very low (5-15min)
- "5 or more days per week" → moderate (20-30min)
- "5–10 minutes" time realism → 5-10min
- "45 minutes or more" → 30-45min

RULES FOR TARGETS:
- targetSessionsPerWeek: 2-5 based on their baseline
- weeklyStarTarget = round(targetSessionsPerWeek * 1.6) — must be very reachable
- monthlyTarget and monthlyStretch should feel achievable, not stressful

RULES FOR REWARDS (flat list of 6-8 items):
- Match their reward_types preferences
- Mix small treats and bigger experiences
- NEVER violate boundaries (weight, calories, etc.)`;

    try {
      const response = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const text = data.content?.map(item => item.text || "").join("\n") || "";
      const clean = text.replace(/```json|```/g, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        else throw new Error("Could not parse AI response");
      }

      setGeneratedActivities(parsed.activities || []);
      setGeneratedTargets(parsed.targets || { ...DEFAULT_TARGETS });
      setGeneratedRewards(Array.isArray(parsed.rewards) ? parsed.rewards : [...DEFAULT_REWARDS]);
      setAiExplanation(parsed.explanation || "This sky was shaped around you. The stars honor consistency over intensity.");
      setReviewStep(0);
      setPhase("review");
    } catch (err) {
      console.error("AI generation error:", err);
      setAiError("Something went wrong generating your plan.");
      // Fall back to presets
      setGeneratedActivities(selectedPresets.map(p => ({ ...p })));
      setGeneratedTargets({ ...DEFAULT_TARGETS });
      setGeneratedRewards([...DEFAULT_REWARDS]);
      setAiExplanation("");
      setReviewStep(0);
      setPhase("review");
    }
    setAiLoading(false);
  };

  // Update rewards on review screen
  const updateReward = (idx, value) => {
    setGeneratedRewards(prev => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };
  const addReward = () => {
    setGeneratedRewards(prev => [...prev, ""]);
  };
  const removeReward = (idx) => {
    setGeneratedRewards(prev => prev.filter((_, i) => i !== idx));
  };

  // Final save
  const handleLaunch = async () => {
    const userData = {
      profile: {
        displayName,
        onboardingComplete: true,
        createdAt: new Date().toISOString(),
        assessmentAnswers: answers,
      },
      activities: generatedActivities,
      targets: generatedTargets,
      rewards: generatedRewards.filter(r => r.trim()),
      entries: [],
      promises: {},
      claimed: [],
    };
    await saveUserData(user.uid, userData);
    onComplete(userData);
  };

  // Progress percentage — questions flow into review steps seamlessly
  const totalReviewSteps = 7;
  const progress = phase === "welcome" ? 0
    : phase === "questions" ? ((qIndex + 1) / (totalQuestions + totalReviewSteps)) * 100
    : phase === "generating" ? ((totalQuestions) / (totalQuestions + totalReviewSteps)) * 100
    : ((totalQuestions + reviewStep + 1) / (totalQuestions + totalReviewSteps)) * 100;

  return (
    <div className="star-flow-app">
      <style>{STYLES}</style>
      <StarParticles />
      <div className="app-scroll" style={{ maxWidth: 480, paddingTop: 40 }}>

        {/* ── Progress Bar ── */}
        {phase !== "welcome" && (
          <div className="onboard-progress-bar">
            <div className="onboard-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* ── WELCOME ── */}
        {phase === "welcome" && (
          <div className="onboard-step onboard-fade-in">
            <div className="onboard-glow" />
            <h1 style={{ color: P.gold, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 48, textAlign: "center", marginBottom: 8 }}>✦</h1>
            <h2 style={{ color: P.gold, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, textAlign: "center", marginBottom: 8 }}>Welcome to Star Flow</h2>
            <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", textAlign: "center", marginBottom: 32, fontSize: 15 }}>
              A few questions to create your personal sky.
            </p>
            <GlassCard>
              <label style={{ color: P.soft, fontSize: 13, display: "block", marginBottom: 8 }}>What should we call you?</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name" className="onboard-input" autoFocus />
            </GlassCard>
            <div style={{ textAlign: "center", marginTop: 28 }}>
              <button className="btn-primary btn-large" onClick={() => fadeTo(() => setPhase("questions"))}
                disabled={!displayName.trim()}>
                Begin ✦
              </button>
            </div>
          </div>
        )}

        {/* ── QUESTIONS ── */}
        {phase === "questions" && currentQ && (
          <div className={`onboard-step onboard-fade-${fadeState}`} key={qIndex}>
            <p className="onboard-q-count">
              {qIndex + 1} of {totalQuestions}
            </p>
            <h2 className="onboard-q-title">{currentQ.question}</h2>
            {currentQ.subtitle && (
              <p className="onboard-q-subtitle">{currentQ.subtitle}</p>
            )}

            <div className="onboard-options">
              {currentQ.options.map(option => {
                const isSelected = currentQ.type === "multi"
                  ? (currentAnswer || []).includes(option)
                  : currentAnswer === option;
                return (
                  <button key={option}
                    className={`onboard-option ${isSelected ? "selected" : ""}`}
                    onClick={() => selectOption(option)}>
                    {currentQ.type === "multi" && (
                      <span className="onboard-check">{isSelected ? "✦" : ""}</span>
                    )}
                    <span className="onboard-option-text">{option}</span>
                  </button>
                );
              })}
            </div>

            <div className="onboard-nav">
              <button className="btn-ghost" onClick={goBack}>Back</button>
              {currentQ.type === "multi" && (
                <button className="btn-primary" onClick={goNext} disabled={!hasAnswer}>
                  {qIndex === totalQuestions - 1 ? "Finish ✦" : "Next"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── GENERATING ── */}
        {phase === "generating" && (
          <div className="onboard-step onboard-fade-in">
            <div style={{ textAlign: "center", paddingTop: 80 }}>
              <div className="generating-glow" />
              <h2 style={{ color: P.gold, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, marginBottom: 12 }}>
                Reading your stars…
              </h2>
              <p style={{ color: P.soft, fontSize: 14, marginBottom: 32 }}>
                Creating a plan shaped around you.
              </p>
              <div className="generating-stars">
                <span className="gen-star" style={{ animationDelay: "0s" }}>✦</span>
                <span className="gen-star" style={{ animationDelay: "0.3s" }}>✦</span>
                <span className="gen-star" style={{ animationDelay: "0.6s" }}>✦</span>
              </div>
            </div>
          </div>
        )}

        {/* ── POST-ASSESSMENT FLOW (7 screens) ── */}
        {phase === "review" && (
          <div className={`onboard-step onboard-fade-${fadeState}`} key={`review-${reviewStep}`}>

            {/* SCREEN 1 — Arrival */}
            {reviewStep === 0 && (
              <div style={{ textAlign: "center", paddingTop: 40 }}>
                <div className="onboard-glow" />
                <h1 style={{ color: P.gold, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 48, marginBottom: 16 }}>✦</h1>
                <h2 style={{ color: P.gold, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, fontWeight: 600, marginBottom: 20 }}>
                  Your Sky Is Set
                </h2>
                {aiExplanation && (
                  <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 15, lineHeight: 1.7, maxWidth: 340, margin: "0 auto 32px" }}>
                    {aiExplanation}
                  </p>
                )}
                {!aiExplanation && (
                  <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 15, lineHeight: 1.7, maxWidth: 340, margin: "0 auto 32px" }}>
                    This sky was shaped around you. The stars don't ask you to push — they ask you to return.
                  </p>
                )}
                {aiError && (
                  <p style={{ color: P.muted, fontSize: 12, marginBottom: 16 }}>
                    {aiError} We used thoughtful defaults.
                  </p>
                )}
                <button className="btn-primary btn-large" onClick={() => fadeTo(() => setReviewStep(1))}>
                  Continue
                </button>
              </div>
            )}

            {/* SCREEN 2 — Philosophy */}
            {reviewStep === 1 && (
              <div style={{ textAlign: "center", paddingTop: 48 }}>
                <h2 style={{ color: P.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
                  How Progress Works Here
                </h2>
                <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.8, maxWidth: 340, margin: "0 auto 40px" }}>
                  Star Flow rewards showing up, not pushing harder. Small sessions still count. Returning after a pause matters most.
                </p>
                <button className="btn-primary btn-large" onClick={() => fadeTo(() => setReviewStep(2))}>
                  That feels right
                </button>
              </div>
            )}

            {/* SCREEN 3 — Starlight, Gently Explained */}
            {reviewStep === 2 && (
              <div style={{ textAlign: "center", paddingTop: 48 }}>
                <h2 style={{ color: P.gold, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600, marginBottom: 32 }}>
                  About Starlight
                </h2>
                <div style={{ textAlign: "left", maxWidth: 340, margin: "0 auto 24px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
                    <span style={{ color: P.aurora, fontSize: 14 }}>✦</span>
                    <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.6 }}>
                      Showing up creates starlight
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
                    <span style={{ color: P.gold, fontSize: 14 }}>✦</span>
                    <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.6 }}>
                      Presence adds a little glow
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
                    <span style={{ color: P.nebula, fontSize: 14 }}>✦</span>
                    <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.6 }}>
                      Coming back after a break shines brightest
                    </p>
                  </div>
                </div>
                <p style={{ color: P.muted, fontSize: 12, fontStyle: "italic", maxWidth: 300, margin: "0 auto 36px", lineHeight: 1.6 }}>
                  There are no daily limits. Some efforts simply shine more softly.
                </p>
                <button className="btn-primary btn-large" onClick={() => fadeTo(() => setReviewStep(3))}>
                  Continue
                </button>
              </div>
            )}

            {/* SCREEN 4 — Movement Possibilities */}
            {reviewStep === 3 && (
              <div style={{ textAlign: "center", paddingTop: 48 }}>
                <h2 style={{ color: P.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
                  Ways You Might Move
                </h2>
                <p style={{ color: P.muted, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 14, marginBottom: 28 }}>
                  These are invitations, not requirements.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "0 auto 36px" }}>
                  {generatedActivities.map(act => (
                    <div key={act.id} style={{
                      background: act.colorLight || P.glass,
                      border: `1px solid color-mix(in srgb, ${act.color} 25%, transparent)`,
                      borderRadius: 16, padding: "14px 18px",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <span style={{ color: act.color, fontSize: 16 }}>✦</span>
                      <span style={{ color: P.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 17, fontWeight: 500 }}>
                        {act.label}
                      </span>
                    </div>
                  ))}
                </div>
                <button className="btn-primary btn-large" onClick={() => fadeTo(() => setReviewStep(4))}>
                  Continue
                </button>
              </div>
            )}

            {/* SCREEN 5 — Your First Week (Abstract) */}
            {reviewStep === 4 && (
              <div style={{ textAlign: "center", paddingTop: 48 }}>
                <h2 style={{ color: P.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
                  This Week's Focus
                </h2>
                <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.8, maxWidth: 320, margin: "0 auto 20px" }}>
                  A few intentional moments this week are more than enough. Your constellation grows through gentle consistency.
                </p>
                <p style={{ color: P.muted, fontSize: 12, fontStyle: "italic", maxWidth: 300, margin: "0 auto 40px" }}>
                  You'll see your progress take shape over time.
                </p>
                <button className="btn-primary btn-large" onClick={() => fadeTo(() => setReviewStep(5))}>
                  I'm ready
                </button>
              </div>
            )}

            {/* SCREEN 6 — Weekly Intentions (Reframed) */}
            {reviewStep === 5 && (
              <div style={{ textAlign: "center", paddingTop: 48 }}>
                <h2 style={{ color: P.gold, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
                  A Weekly Promise
                </h2>
                <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.8, maxWidth: 340, margin: "0 auto 20px" }}>
                  Each week, you'll choose something meaningful to look forward to — a small promise to yourself.
                </p>
                <p style={{ color: P.muted, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 14, lineHeight: 1.7, maxWidth: 320, margin: "0 auto 28px" }}>
                  When your constellation brightens, you honor that promise. It's not a reward you earn — it's a commitment you keep.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 280, margin: "0 auto 36px" }}>
                  {["A quiet coffee moment", "Rest without guilt"].map((ex, i) => (
                    <div key={i} style={{
                      background: P.glass, border: `1px solid ${P.glassBorder}`,
                      borderRadius: 14, padding: "12px 16px",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ color: P.gold, fontSize: 12 }}>✦</span>
                      <span style={{ color: P.soft, fontSize: 14, fontStyle: "italic", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{ex}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-primary btn-large" onClick={() => fadeTo(() => setReviewStep(6))}>
                  Continue
                </button>
              </div>
            )}

            {/* SCREEN 7 — Day One Invitation */}
            {reviewStep === 6 && (
              <div style={{ textAlign: "center", paddingTop: 60 }}>
                <div className="onboard-glow" />
                <h1 style={{ color: P.gold, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 48, marginBottom: 16 }}>✦</h1>
                <h2 style={{ color: P.text, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, fontWeight: 600, marginBottom: 24 }}>
                  Day One
                </h2>
                <p style={{ color: P.soft, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, lineHeight: 1.8, maxWidth: 320, margin: "0 auto 40px" }}>
                  Today can be simple. A short walk, a stretch, or even just noticing your body counts.
                </p>
                <button className="btn-primary btn-large" onClick={handleLaunch}>
                  Begin gently
                </button>
                <p style={{ marginTop: 20 }}>
                  <button className="btn-ghost" onClick={handleLaunch}
                    style={{ fontSize: 13, color: P.dim }}>
                    I'll start later
                  </button>
                </p>
              </div>
            )}

            {/* Back navigation (screens 1–6) */}
            {reviewStep > 0 && reviewStep < 6 && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button className="btn-ghost" onClick={() => fadeTo(() => setReviewStep(s => s - 1))}
                  style={{ fontSize: 13, color: P.dim }}>Back</button>
              </div>
            )}
          </div>
        )}

        <div style={{ height: 60 }} />
      </div>
    </div>
  );
}

// ─── SETTINGS & ACCOUNT MODAL ────────────────────────────────────────────────

function SettingsModal({ user, userData, onClose, onSignOut, onAccountDeleted }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteTyped, setDeleteTyped] = useState("");

  const providerIds = user.providerData?.map(p => p.providerId) || [];
  const isGoogle = providerIds.includes("google.com");
  const isApple = providerIds.includes("apple.com");
  const isEmail = providerIds.includes("password");

  const signInMethod = isGoogle ? "Google" : isApple ? "Apple" : isEmail ? "Email" : "Unknown";
  const createdAt = userData?.profile?.createdAt
    ? new Date(userData.profile.createdAt).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })
    : "Unknown";
  const totalEntries = userData?.entries?.length || 0;
  const totalClaimed = userData?.claimed?.length || 0;

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      // Delete Firestore data first
      await deleteDoc(doc(db, "users", user.uid));

      // Then delete the Firebase Auth account
      // This may require reauthentication if the session is old
      try {
        await deleteUser(user);
      } catch (reAuthErr) {
        if (reAuthErr.code === "auth/requires-recent-login") {
          // Reauthenticate based on provider
          if (isGoogle) {
            await reauthenticateWithPopup(user, googleProvider);
          } else if (isApple) {
            await reauthenticateWithPopup(user, appleProvider);
          } else {
            setDeleteError("For security, please sign out and sign back in, then try deleting again.");
            setDeleteLoading(false);
            return;
          }
          // Retry delete after reauth
          await deleteUser(user);
        } else {
          throw reAuthErr;
        }
      }

      onAccountDeleted();
    } catch (err) {
      console.error("Delete error:", err);
      if (err.code === "auth/requires-recent-login") {
        setDeleteError("Session expired. Please sign out, sign back in, and try again.");
      } else {
        setDeleteError("Something went wrong. Please try again.");
      }
    }
    setDeleteLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-reward" onClick={e => e.stopPropagation()} style={{ maxWidth:420 }}>
        <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:24, fontWeight:600, marginBottom:20 }}>
          Settings
        </h2>

        {/* ── Account Info ── */}
        <div className="settings-section">
          <h4 className="settings-section-title">Account</h4>
          <div className="settings-info-grid">
            {user.photoURL && (
              <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}>
                <img src={user.photoURL} alt="" style={{ width:56, height:56, borderRadius:"50%", border:`2px solid ${P.dim}` }} />
              </div>
            )}
            <div className="settings-info-row">
              <span className="settings-info-label">Name</span>
              <span className="settings-info-value">{userData?.profile?.displayName || user.displayName || "—"}</span>
            </div>
            <div className="settings-info-row">
              <span className="settings-info-label">Email</span>
              <span className="settings-info-value">{user.email || "—"}</span>
            </div>
            <div className="settings-info-row">
              <span className="settings-info-label">Sign-in method</span>
              <span className="settings-info-value">{signInMethod}</span>
            </div>
            <div className="settings-info-row">
              <span className="settings-info-label">Member since</span>
              <span className="settings-info-value">{createdAt}</span>
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="settings-section">
          <h4 className="settings-section-title">Data</h4>
          <div className="settings-info-grid">
            <div className="settings-info-row">
              <span className="settings-info-label">Activities tracked</span>
              <span className="settings-info-value">{userData?.activities?.length || 0}</span>
            </div>
            <div className="settings-info-row">
              <span className="settings-info-label">Total entries</span>
              <span className="settings-info-value">{totalEntries}</span>
            </div>
            <div className="settings-info-row">
              <span className="settings-info-label">Rewards claimed</span>
              <span className="settings-info-value">{totalClaimed}</span>
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="settings-section">
          <button className="settings-action-btn" onClick={() => { onClose(); onSignOut(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>

          <div className="divider" />

          {!confirmDelete ? (
            <button className="settings-action-btn danger" onClick={() => setConfirmDelete(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
              Delete Account
            </button>
          ) : (
            <div className="delete-confirm">
              <p style={{ color:"#FF9C8C", fontSize:13, fontWeight:500, marginBottom:8 }}>
                This will permanently delete your account and all your data. This cannot be undone.
              </p>
              <p style={{ color:P.soft, fontSize:12, marginBottom:10 }}>
                Type <strong style={{ color:P.text }}>DELETE</strong> to confirm:
              </p>
              <input type="text" value={deleteTyped} onChange={e => setDeleteTyped(e.target.value)}
                className="onboard-input" placeholder="Type DELETE"
                style={{ fontSize:14, padding:"10px 14px", marginBottom:10, textTransform:"uppercase" }} />
              {deleteError && <p style={{ color:"#FF9C8C", fontSize:12, marginBottom:8 }}>{deleteError}</p>}
              <div style={{ display:"flex", gap:10 }}>
                <button className="btn-primary" onClick={handleDeleteAccount}
                  disabled={deleteTyped.toUpperCase() !== "DELETE" || deleteLoading}
                  style={{ background: deleteTyped.toUpperCase() === "DELETE" ? "#C0392B" : P.dim, flex:1 }}>
                  {deleteLoading ? (
                    <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                      <span className="ai-spinner" style={{ borderTopColor:"#FF9C8C" }} /> Deleting…
                    </span>
                  ) : "Permanently Delete"}
                </button>
                <button className="btn-ghost" onClick={() => { setConfirmDelete(false); setDeleteTyped(""); setDeleteError(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {!confirmDelete && (
          <div style={{ textAlign:"center", marginTop:16 }}>
            <button className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ────────────────────────────────────────────────────────────
function LoginScreen({ onGoogleSignIn, onAppleSignIn, onEmailSignIn, onEmailSignUp, onPasswordReset, loading, authError }) {
  const [mode, setMode] = useState("landing"); // "landing" | "email-signin" | "email-signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const clearForm = () => { setEmail(""); setPassword(""); setDisplayName(""); setConfirmPassword(""); setLocalError(""); setResetSent(false); };

  const handleEmailSignUp = () => {
    if (!displayName.trim()) { setLocalError("Please enter your name."); return; }
    if (!email.trim()) { setLocalError("Please enter your email."); return; }
    if (password.length < 6) { setLocalError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setLocalError("Passwords don't match."); return; }
    setLocalError("");
    onEmailSignUp(email, password, displayName);
  };

  const handleEmailSignIn = () => {
    if (!email.trim() || !password.trim()) { setLocalError("Please enter email and password."); return; }
    setLocalError("");
    onEmailSignIn(email, password);
  };

  const handleReset = async () => {
    if (!email.trim()) { setLocalError("Please enter your email address."); return; }
    setLocalError("");
    const ok = await onPasswordReset(email);
    if (ok) setResetSent(true);
  };

  const error = localError || authError;

  return (
    <div className="login-screen"><StarParticles /><div className="login-content"><div className="login-glow" />

      {/* ── Landing ── */}
      {mode === "landing" && (<>
        <h1 className="login-title">✦</h1>
        <h2 className="login-name">Star Flow</h2>
        <p className="login-tagline">A quiet companion for movement and healing</p>

        <div className="auth-buttons">
          <button className="auth-btn google-btn" onClick={onGoogleSignIn} disabled={loading}>
            <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink:0 }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {loading ? "Connecting…" : "Continue with Google"}
          </button>

          <button className="auth-btn apple-btn" onClick={onAppleSignIn} disabled={loading}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink:0 }}>
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </button>

          <div className="auth-divider">
            <span className="auth-divider-line" />
            <span className="auth-divider-text">or</span>
            <span className="auth-divider-line" />
          </div>

          <button className="auth-btn email-btn" onClick={() => { clearForm(); setMode("email-signin"); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            Continue with Email
          </button>
        </div>

        <p className="login-note">Your stars are saved securely. Sign in to track from any device.</p>
      </>)}

      {/* ── Email Sign In ── */}
      {mode === "email-signin" && (<>
        <h2 className="login-name" style={{ fontSize:28, marginBottom:4 }}>Welcome Back</h2>
        <p className="login-tagline" style={{ marginBottom:28 }}>Sign in with your email</p>

        <div className="auth-form">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="onboard-input" autoFocus />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="onboard-input" onKeyDown={e => e.key === "Enter" && handleEmailSignIn()} />
          {error && <p className="auth-error">{error}</p>}
          <button className="btn-primary btn-large" style={{ width:"100%" }} onClick={handleEmailSignIn} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
          <button className="btn-ghost" onClick={() => { clearForm(); setMode("reset"); }}
            style={{ fontSize:13, color:P.muted }}>Forgot password?</button>
        </div>

        <div className="auth-switch">
          <span style={{ color:P.soft, fontSize:13 }}>Don't have an account?</span>
          <button className="btn-ghost" onClick={() => { clearForm(); setMode("email-signup"); }}
            style={{ color:P.nebula, fontSize:13, padding:"4px 8px" }}>Sign Up</button>
        </div>
        <button className="btn-ghost" onClick={() => { clearForm(); setMode("landing"); }}
          style={{ marginTop:8, fontSize:13 }}>← Back</button>
      </>)}

      {/* ── Email Sign Up ── */}
      {mode === "email-signup" && (<>
        <h2 className="login-name" style={{ fontSize:28, marginBottom:4 }}>Create Your Sky</h2>
        <p className="login-tagline" style={{ marginBottom:28 }}>Set up your Star Flow account</p>

        <div className="auth-form">
          <input type="text" placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)}
            className="onboard-input" autoFocus />
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="onboard-input" />
          <input type="password" placeholder="Password (6+ characters)" value={password} onChange={e => setPassword(e.target.value)}
            className="onboard-input" />
          <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            className="onboard-input" onKeyDown={e => e.key === "Enter" && handleEmailSignUp()} />
          {error && <p className="auth-error">{error}</p>}
          <button className="btn-primary btn-large" style={{ width:"100%" }} onClick={handleEmailSignUp} disabled={loading}>
            {loading ? "Creating account…" : "✦ Create Account"}
          </button>
        </div>

        <div className="auth-switch">
          <span style={{ color:P.soft, fontSize:13 }}>Already have an account?</span>
          <button className="btn-ghost" onClick={() => { clearForm(); setMode("email-signin"); }}
            style={{ color:P.nebula, fontSize:13, padding:"4px 8px" }}>Sign In</button>
        </div>
        <button className="btn-ghost" onClick={() => { clearForm(); setMode("landing"); }}
          style={{ marginTop:8, fontSize:13 }}>← Back</button>
      </>)}

      {/* ── Password Reset ── */}
      {mode === "reset" && (<>
        <h2 className="login-name" style={{ fontSize:28, marginBottom:4 }}>Reset Password</h2>
        <p className="login-tagline" style={{ marginBottom:28 }}>We'll send you a link to get back in</p>

        <div className="auth-form">
          {resetSent ? (
            <div style={{ textAlign:"center", padding:"16px 0" }}>
              <p style={{ color:P.nebula, fontSize:15, fontWeight:500, marginBottom:8 }}>✦ Reset email sent</p>
              <p style={{ color:P.soft, fontSize:13 }}>Check your inbox for the reset link.</p>
            </div>
          ) : (<>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="onboard-input" autoFocus onKeyDown={e => e.key === "Enter" && handleReset()} />
            {error && <p className="auth-error">{error}</p>}
            <button className="btn-primary btn-large" style={{ width:"100%" }} onClick={handleReset} disabled={loading}>
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
          </>)}
        </div>

        <button className="btn-ghost" onClick={() => { clearForm(); setMode("email-signin"); }}
          style={{ marginTop:12, fontSize:13 }}>← Back to sign in</button>
      </>)}

    </div></div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function StarFlow() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // User data (all read from Firestore now)
  const [userData, setUserData] = useState(null); // null = not loaded yet
  const [dataLoaded, setDataLoaded] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Derived from userData for convenience
  const entries = userData?.entries || [];
  const claimed = userData?.claimed || [];
  const activities = userData?.activities || [];
  const targets = userData?.targets || DEFAULT_TARGETS;
  const rewards = userData?.rewards || DEFAULT_REWARDS;
  const promises = userData?.promises || {}; // { "2026-02-W2": "A quiet coffee moment" }

  const [showLog, setShowLog] = useState(false);
  const [rewardModal, setRewardModal] = useState(null); // { wk, rk, wkPts }
  const [promiseModal, setPromiseModal] = useState(null); // { wk, rk } — set intention
  const [celebrate, setCelebrate] = useState(null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [encouragement] = useState(() => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [devTaps, setDevTaps] = useState(0);
  const [showDev, setShowDev] = useState(false);
  const devTimer = useRef(null);
  const saveTimer = useRef(null);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u); setAuthLoading(false);
      if (!u) { setUserData(null); setDataLoaded(false); setNeedsOnboarding(false); }
    });
    return () => unsub();
  }, []);

  // Load user data
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const data = await loadUserData(user.uid);
      if (cancelled) return;
      if (data === null) {
        // Brand new user — show onboarding
        setNeedsOnboarding(true);
        setDataLoaded(true);
      } else {
        setUserData(data);
        setNeedsOnboarding(false);
        setDataLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Save helper — debounced write to Firestore
  const saveToCloud = useCallback((updatedData) => {
    if (!user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveUserData(user.uid, updatedData), 500);
  }, [user]);

  // Update a piece of userData and save
  const updateData = useCallback((partial) => {
    setUserData(prev => {
      const next = { ...prev, ...partial };
      saveToCloud(next);
      return next;
    });
  }, [saveToCloud]);

  // ── Auth helpers ──

  // ── Dev Mode: triple-tap title to reveal seed/clear buttons ──
  const handleTitleTap = () => {
    setDevTaps(prev => {
      const next = prev + 1;
      if (devTimer.current) clearTimeout(devTimer.current);
      devTimer.current = setTimeout(() => setDevTaps(0), 800);
      if (next >= 3) {
        setShowDev(d => !d);
        return 0;
      }
      return next;
    });
  };

  const seedTestData = () => {
    if (!userData || !activities.length) return;
    const today = new Date();
    const testEntries = [];

    // Generate 14 days of realistic data working backward from today
    for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      const ds = d.toISOString().slice(0, 10);

      // ~70% chance of activity on any day (realistic consistency)
      if (Math.random() > 0.7) continue; // skip day — creates reentry gaps

      // Pick a random activity from user's configured activities
      const act = activities[Math.floor(Math.random() * activities.length)];
      const duration = act.minDuration + Math.floor(Math.random() * 20);
      const mindful = Math.random() > 0.55; // ~45% mindful

      testEntries.push({ date: ds, activity_type: act.id, duration_min: duration, mindful });

      // ~25% chance of second session that day
      if (Math.random() < 0.25 && activities.length > 1) {
        const act2 = activities.find(a => a.id !== act.id) || act;
        testEntries.push({
          date: ds,
          activity_type: act2.id,
          duration_min: act2.minDuration + Math.floor(Math.random() * 15),
          mindful: false,
        });
      }
    }

    // Also add 1 entry for today so Tonight section is populated
    const todayStr2 = today.toISOString().slice(0, 10);
    if (!testEntries.some(e => e.date === todayStr2)) {
      const act = activities[0];
      testEntries.push({ date: todayStr2, activity_type: act.id, duration_min: act.minDuration + 10, mindful: true });
    }

    // Seed some weekly promises
    const testPromises = {};
    const curMonth = today.getMonth() + 1;
    const curYear = today.getFullYear();
    const curWeek = weekOfMonth(today);
    const totalWks = Math.ceil(new Date(curYear, curMonth, 0).getDate() / 7);
    const samplePromises = [
      "A quiet coffee with no phone",
      "Twenty minutes with my book",
      "A long bath without rushing",
      "Cooking something just for me",
    ];
    for (let w = 1; w <= Math.min(curWeek, totalWks); w++) {
      const wk = `${curYear}-${String(curMonth).padStart(2,"0")}-W${w}`;
      testPromises[wk] = samplePromises[(w - 1) % samplePromises.length];
    }

    // Claim week 1 to show "Honored" state
    const wk1 = `${curYear}-${String(curMonth).padStart(2,"0")}-W1`;
    updateData({ entries: testEntries, claimed: [wk1], promises: testPromises });
    setShowDev(false);
  };

  const clearTestData = () => {
    updateData({ entries: [], claimed: [], promises: {} });
    setShowDev(false);
  };

  const friendlyError = (code) => {
    const map = {
      "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password. Try again or reset it.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment.",
      "auth/popup-closed-by-user": "",
      "auth/cancelled-popup-request": "",
    };
    return map[code] || "Something went wrong. Please try again.";
  };

  const handleGoogleSignIn = async () => {
    setLoginLoading(true); setAuthError("");
    try { await signInWithPopup(auth, googleProvider); }
    catch (err) { setAuthError(friendlyError(err.code)); }
    setLoginLoading(false);
  };

  const handleAppleSignIn = async () => {
    setLoginLoading(true); setAuthError("");
    try { await signInWithPopup(auth, appleProvider); }
    catch (err) { setAuthError(friendlyError(err.code)); }
    setLoginLoading(false);
  };

  const handleEmailSignIn = async (email, password) => {
    setLoginLoading(true); setAuthError("");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (err) { setAuthError(friendlyError(err.code)); }
    setLoginLoading(false);
  };

  const handleEmailSignUp = async (email, password, displayName) => {
    setLoginLoading(true); setAuthError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
    } catch (err) { setAuthError(friendlyError(err.code)); }
    setLoginLoading(false);
  };

  const handlePasswordReset = async (email) => {
    setLoginLoading(true); setAuthError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setLoginLoading(false);
      return true;
    } catch (err) {
      setAuthError(friendlyError(err.code));
      setLoginLoading(false);
      return false;
    }
  };

  const handleSignOut = async () => { await signOut(auth); };

  const addEntry = (entry) => {
    updateData({ entries: [...entries, entry] });
  };
  const delEntry = (idx) => {
    const te = entries.map((e, i) => ({ ...e, _i: i })).filter(e => e.date === todayStr());
    if (idx < te.length) {
      updateData({ entries: entries.filter((_, i) => i !== te[idx]._i) });
    }
  };
  const claimReward = (rk) => {
    const promiseText = promises[rk] || "";
    updateData({ claimed: [...claimed, rk] });
    setCelebrate({ promise: promiseText });
  };
  const unclaim = (rk) => {
    updateData({ claimed: claimed.filter(c => c !== rk) });
  };
  const setPromise = (rk, text) => {
    updateData({ promises: { ...promises, [rk]: text } });
  };

  // Onboarding complete callback
  const handleOnboardingComplete = (data) => {
    setUserData(data);
    setNeedsOnboarding(false);
  };

  // ── Loading states ──
  if (authLoading) return (
    <div className="star-flow-app loading-screen"><style>{STYLES}</style><StarParticles />
      <p style={{ color:P.soft, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:18 }}>✦</p>
    </div>
  );

  if (!user) return (
    <div className="star-flow-app"><style>{STYLES}</style>
      <LoginScreen
        onGoogleSignIn={handleGoogleSignIn}
        onAppleSignIn={handleAppleSignIn}
        onEmailSignIn={handleEmailSignIn}
        onEmailSignUp={handleEmailSignUp}
        onPasswordReset={handlePasswordReset}
        loading={loginLoading}
        authError={authError}
      />
    </div>
  );

  if (!dataLoaded) return (
    <div className="star-flow-app loading-screen"><style>{STYLES}</style><StarParticles />
      <p style={{ color:P.soft, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:18 }}>Loading your stars…</p>
    </div>
  );

  if (needsOnboarding) return (
    <OnboardingWizard user={user} onComplete={handleOnboardingComplete} />
  );

  // ── Computed values (all dynamic from user config) ──
  const now = new Date(), today = todayStr(), cw = weekOfMonth(now);
  const stats = monthStats(entries, viewYear, viewMonth, activities, targets);
  const wp = weekStars(entries, now.getFullYear(), now.getMonth() + 1, cw, activities);
  const streak = calcStreak(entries, activities);
  const todayEntries = entriesFor(entries, today);
  const todayStarsVal = dailyStars(entries, today, activities);
  const goalHit = wp >= targets.weeklyStarTarget;
  const numWeeks = Math.ceil(new Date(viewYear, viewMonth, 0).getDate() / 7);
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1;
  const curWeekKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-W${cw}`;
  const curPromise = promises[curWeekKey] || "";

  let milestone = "";
  if (stats.stretch) milestone = MILESTONE_COPY.monthly_stretch;
  else if (stats.target) milestone = MILESTONE_COPY.monthly_target;
  else if (goalHit) milestone = MILESTONE_COPY.constellation || "Your constellation is taking shape.";
  else if (streak >= 14) milestone = MILESTONE_COPY.streak_14;
  else if (streak >= 7) milestone = MILESTONE_COPY.streak_7;
  else if (streak >= 3) milestone = MILESTONE_COPY.streak_3;

  let peekText = "";
  if (!goalHit) {
    const remaining = Math.round((targets.weeklyStarTarget - wp) * 10) / 10;
    peekText = curPromise
      ? `${remaining} stars toward: "${curPromise}"`
      : `${remaining} stars from your constellation goal`;
  } else {
    peekText = curPromise
      ? `Ready to honor: "${curPromise}"`
      : "Your constellation is bright this week.";
  }

  const prevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); };

  return (
    <div className="star-flow-app"><style>{STYLES}</style><StarParticles />
    <div className="app-scroll">
      {/* ── Header ── */}
      <header className="app-header">
        <div>
          <h1 className="app-title" onClick={handleTitleTap} style={{ cursor: "default" }}>
            <span className="title-star">✦</span> Star Flow
          </h1>
          <p className="app-date">{now.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button className="help-btn" onClick={() => setShowGuide(!showGuide)}>?</button>
          <button className="help-btn settings-btn" onClick={() => setShowSettings(true)} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          {user.photoURL
            ? <img src={user.photoURL} alt="" className="avatar" onClick={() => setShowSettings(true)} title="Account" />
            : <button className="help-btn" onClick={() => setShowSettings(true)} title="Account">↩</button>}
        </div>
      </header>

      {/* ── Dev Mode Panel (triple-tap title to toggle) ── */}
      {showDev && (
        <div style={{
          background: "rgba(255,200,50,0.08)", border: "1px solid rgba(255,200,50,0.25)",
          borderRadius: 12, padding: "12px 16px", margin: "0 0 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: P.gold, fontSize: 12, fontWeight: 600 }}>⚙ Dev Mode</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={seedTestData} style={{
              background: P.nebula, color: P.bg, border: "none", borderRadius: 8,
              padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>Seed 14 days</button>
            <button onClick={clearTestData} style={{
              background: "transparent", color: P.muted, border: `1px solid ${P.dim}`,
              borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer",
            }}>Clear all</button>
            <button onClick={() => setShowDev(false)} style={{
              background: "none", color: P.dim, border: "none", fontSize: 14, cursor: "pointer",
            }}>×</button>
          </div>
        </div>
      )}

      {/* ── Progress Ring ── */}
      <ProgressRing current={stats.pts} target={targets.monthlyTarget} stretch={targets.monthlyStretch} />
      <p className="encouragement">{encouragement}</p>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <button className="btn-primary btn-large" onClick={() => setShowLog(true)}>✦ Add a Moment</button>
      </div>

      {/* ── Calendar ── */}
      <GlassCard className="section-card">
        <div className="cal-nav">
          <button className="cal-arrow" onClick={prevMonth}>‹</button>
          <span className="cal-title">{new Date(viewYear, viewMonth-1).toLocaleDateString("en-US", { month:"long", year:"numeric" })}</span>
          <button className="cal-arrow" onClick={nextMonth}>›</button>
        </div>
        <div className="cal-grid">
          {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => <div key={d} className="cal-dayname">{d}</div>)}
          {calendarWeeks(viewYear, viewMonth).flat().map((day, i) => {
            if (day === 0) return <div key={`e${i}`} className="cal-cell empty" />;
            const ds = `${viewYear}-${String(viewMonth).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const es = entriesFor(entries, ds);
            const hasAct = es.some(e => calcPts(e, activities) > 0);
            const isToday = isCurrentMonth && day === now.getDate();
            const dp = dailyStars(entries, ds, activities);

            // Build dots dynamically from user's activities
            const dotCounts = {};
            activities.forEach(act => {
              const count = es.filter(e => e.activity_type === act.id && calcPts(e, activities) > 0).length;
              if (count > 0) dotCounts[act.id] = Math.min(count, 2);
            });

            return (
              <div key={ds} className={`cal-cell ${isToday?"today":""} ${hasAct?"active":""}`}>
                <span className="cal-day">{day}</span>
                {Object.keys(dotCounts).length > 0 && (
                  <div className="cal-dots">
                    {activities.map(act =>
                      Array.from({ length: dotCounts[act.id] || 0 }, (_, j) => (
                        <span key={`${act.id}${j}`} className="dot" style={{ background: act.color }} />
                      ))
                    )}
                  </div>
                )}
                {dp > 0 && <span className="cal-pts">{dp}</span>}
              </div>
            );
          })}
        </div>
        <div className="cal-legend">
          {activities.map(act => (
            <span key={act.id}><span className="dot" style={{ background: act.color }} /> {act.label}</span>
          ))}
        </div>
        <p style={{ textAlign:"center", color:P.soft, fontSize:12, marginTop:4, paddingBottom:10 }}>
          {activities.map(act => {
            const count = stats.actCounts[act.id] || 0;
            const mindful = stats.mindfulCounts?.[act.id] || 0;
            return `${count} ${act.label.toLowerCase()}${mindful ? ` (${mindful}✦)` : ""}`;
          }).join(" · ")}
        </p>
      </GlassCard>

      {/* ── Tonight ── */}
      <GlassCard className="section-card">
        <div className="card-header">
          <h3 className="card-title">Tonight</h3>
          <span className="card-pts" style={{ color:P.gold }}>{todayStarsVal} stars</span>
        </div>
        {todayEntries.length === 0
          ? <p className="empty-state">The sky is quiet tonight. Your first star is waiting.</p>
          : todayEntries.map((entry, i) => {
              const act = activities.find(a => a.id === entry.activity_type);
              const result = scoreSession(entry, activities, entries);
              const accent = act?.color || P.nebula;
              const bgLight = act?.colorLight || P.glass;
              return (
                <div key={i} className="entry-card" style={{ "--accent": accent, background: bgLight }}>
                  <div className="entry-left">
                    <span style={{ color: accent }}>✦</span>
                    <span className="entry-name">{act?.label || entry.activity_type} · {entry.duration_min} min</span>
                    {entry.mindful && <span className="bonus-star" style={{ color:P.gold }}>✦</span>}
                  </div>
                  <div className="entry-right">
                    <span style={{ color: accent, fontWeight:600 }}>+{result.starsEarned}</span>
                    <button className="del-btn" onClick={() => delEntry(i)}>×</button>
                  </div>
                </div>
              );
            })
        }
      </GlassCard>

      {/* ── Week ── */}
      <GlassCard className="section-card">
        <div className="card-header">
          <h3 className="card-title">Week {cw}</h3>
          <span className="card-pts" style={{ color:P.nebula }}>{wp} / {targets.weeklyStarTarget}</span>
        </div>
        {streak > 0
          ? <p style={{ color:P.gold, fontSize:13, marginBottom:6 }}>✦ {streak}-night glow</p>
          : <p style={{ color:P.soft, fontSize:13, marginBottom:6 }}>Every star counts, even small ones.</p>}
        {curPromise && (
          <p style={{ color:P.soft, fontFamily:"'Cormorant Garamond', Georgia, serif", fontStyle:"italic", fontSize:13, marginBottom:8, lineHeight:1.5 }}>
            This week: "{curPromise}"
          </p>
        )}
        {!curPromise && !claimed.includes(curWeekKey) && (
          <button className="btn-ghost" style={{ fontSize:12, color:P.nebula, padding:"2px 0", marginBottom:8 }}
            onClick={() => setPromiseModal({ wk: cw, rk: curWeekKey })}>
            ✦ Set a weekly intention
          </button>
        )}
        {milestone && <p className="milestone">{milestone}</p>}
        <div className="divider" />
        <p style={{ color:P.soft, fontSize:12, fontWeight:600, marginBottom:8 }}>Constellation Goal</p>
        <ConstellationBar pts={wp} target={targets.weeklyStarTarget} />
        <p style={{ color:P.soft, fontSize:12, marginTop:12 }}>
          {goalHit ? `✦ ${peekText}` : `☽ ${peekText}`}
        </p>
      </GlassCard>

      {/* ── Weekly Sky ── */}
      <div className="section-header">
        <h3 style={{ color:P.text, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:18 }}>Weekly Sky</h3>
      </div>
      <div className="week-pills">
        {Array.from({ length: numWeeks }, (_, i) => i + 1).map(wk => {
          const wkPts = weekStars(entries, viewYear, viewMonth, wk, activities);
          const wkGoal = wkPts >= targets.weeklyStarTarget;
          const isCur = isCurrentMonth && wk === cw;
          return (
            <GlassCard key={wk} className={`week-pill ${isCur ? "current" : ""}`} glow={isCur} glowColor={P.nebula}>
              <span className="wp-label">W{wk}</span>
              <span className="wp-pts">{wkPts}</span>
              {wkGoal
                ? <span className="wp-tier" style={{ color: P.gold }}>✦</span>
                : <span className="wp-tier" style={{ color: P.dim }}>·</span>}
            </GlassCard>
          );
        })}
      </div>

      {/* ── Weekly Intentions ── */}
      <div className="section-header" style={{ marginTop:20 }}>
        <h3 style={{ color:P.text, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:18 }}>☽ Weekly Intentions</h3>
      </div>
      {Array.from({ length: numWeeks }, (_, i) => i + 1).map(wk => {
        const wkPts = weekStars(entries, viewYear, viewMonth, wk, activities);
        const wkGoal = wkPts >= targets.weeklyStarTarget;
        const exceeded = wkPts >= targets.weeklyStarTarget * 1.5;
        const rk = `${viewYear}-${String(viewMonth).padStart(2,"0")}-W${wk}`;
        const isClaimed = claimed.includes(rk);
        const hasPromise = !!promises[rk];
        const promiseText = promises[rk] || "";
        const [ws, we] = weekRange(viewYear, viewMonth, wk);
        const weekPast = new Date() > we;
        const isCurWeek = isCurrentMonth && wk === cw;
        const dateLabel = `Week ${wk} · ${ws.toLocaleDateString("en-US",{month:"short",day:"numeric"})}–${we.getDate()}`;

        return (
          <GlassCard key={rk} className="section-card reward-row">
            <div style={{ marginBottom: hasPromise ? 8 : 0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ color:P.text, fontSize:13 }}>{dateLabel}</span>
                {/* State: no promise set yet, current or future week */}
                {!hasPromise && (isCurWeek || !weekPast) && !isClaimed && (
                  <button className="btn-ghost" style={{ fontSize:12, padding:"4px 12px", color:P.nebula }}
                    onClick={() => setPromiseModal({ wk, rk })}>
                    Set intention
                  </button>
                )}
                {/* State: no promise, past week, never claimed */}
                {!hasPromise && weekPast && !isCurWeek && !isClaimed && (
                  <span style={{ color:P.dim, fontSize:12 }}>No intention set</span>
                )}
                {/* State: goal not met yet */}
                {hasPromise && !wkGoal && !weekPast && (
                  <span style={{ color:P.dim, fontSize:12 }}>
                    {Math.round((targets.weeklyStarTarget - wkPts) * 10) / 10} stars to go
                  </span>
                )}
                {/* State: goal met, not claimed — ready to reflect */}
                {hasPromise && wkGoal && !isClaimed && (
                  <button className="btn-primary" style={{ fontSize:12, padding:"4px 14px" }}
                    onClick={() => setRewardModal({ wk, rk, exceeded })}>
                    Reflect
                  </button>
                )}
                {/* State: goal not met, week is over */}
                {hasPromise && !wkGoal && weekPast && !isClaimed && (
                  <span style={{ color:P.soft, fontSize:12, fontStyle:"italic" }}>
                    Your intention still matters
                  </span>
                )}
                {/* State: claimed */}
                {isClaimed && (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ color:P.gold, fontSize:13 }}>✦ Honored</span>
                    <button className="btn-ghost" style={{ fontSize:11, padding:"2px 8px" }} onClick={() => unclaim(rk)}>undo</button>
                  </div>
                )}
              </div>
              {/* Show promise text if set */}
              {hasPromise && (
                <p style={{ color:P.soft, fontFamily:"'Cormorant Garamond', Georgia, serif", fontStyle:"italic", fontSize:13, marginTop:6, lineHeight:1.5 }}>
                  "{promiseText}"
                </p>
              )}
            </div>
          </GlassCard>
        );
      })}

      <div style={{ height:50 }} />
    </div>

    {/* ── Modals ── */}
    {showLog && <LogModal onClose={() => setShowLog(false)} onLog={addEntry} activities={activities} allEntries={entries} />}
    {promiseModal && <PromiseModal {...promiseModal} onClose={() => setPromiseModal(null)}
      onSetPromise={(rk, text) => setPromise(rk, text)} suggestions={rewards} />}
    {rewardModal && <ReflectModal {...rewardModal} promise={promises[rewardModal.rk]}
      onClose={() => setRewardModal(null)} onClaim={(rk) => claimReward(rk)} />}
    {celebrate && <CelebrateModal {...celebrate} onClose={() => setCelebrate(null)} />}

    {/* ── How Starlight Works ── */}
    {showGuide && (
      <div className="modal-overlay" onClick={() => setShowGuide(false)}>
        <div className="modal-content modal-reward" onClick={e => e.stopPropagation()}>
          <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:22 }}>
            How Starlight Works
          </h2>
          <div style={{ textAlign:"left", marginTop:16 }}>
            <div style={{ background:P.glass, border:`1px solid ${P.glassBorder}`, borderRadius:14, padding:14, marginBottom:10 }}>
              <p style={{ color:P.aurora, fontWeight:600, fontSize:14, marginBottom:4 }}>✦ Show Up</p>
              <p style={{ color:P.soft, fontSize:12, lineHeight:1.5 }}>
                Any intentional movement counts. Meet the minimum for your activity and a star appears in your sky.
              </p>
            </div>
            <div style={{ background:P.glass, border:`1px solid ${P.glassBorder}`, borderRadius:14, padding:14, marginBottom:10 }}>
              <p style={{ color:P.gold, fontWeight:600, fontSize:14, marginBottom:4 }}>✦ Add Presence</p>
              <p style={{ color:P.soft, fontSize:12, lineHeight:1.5 }}>
                Phone-free or fully focused? That extra attention earns a presence glow — once per day, it deepens your star.
              </p>
            </div>
            <div style={{ background:P.glass, border:`1px solid ${P.glassBorder}`, borderRadius:14, padding:14, marginBottom:10 }}>
              <p style={{ color:P.nebula, fontWeight:600, fontSize:14, marginBottom:4 }}>✦ Return Light</p>
              <p style={{ color:P.soft, fontSize:12, lineHeight:1.5 }}>
                Coming back after a pause? Your return is celebrated, not punished. Missed days make your next star shine brighter.
              </p>
            </div>
            <div className="divider" />
            <p style={{ color:P.muted, fontSize:11, fontStyle:"italic", lineHeight:1.6 }}>
              Soft pacing: your first effort each day shines brightest. More sessions still count — with a gentler glow.
              There's no daily cap. Just natural rhythm.
            </p>
            <div className="divider" />
            <p style={{ color:P.soft, fontSize:12, marginTop:4 }}>
              Weekly constellation goal: <span style={{ color:P.gold }}>{targets.weeklyStarTarget} stars</span> · Monthly: <span style={{ color:P.nebula }}>{targets.monthlyTarget}</span> · Stretch: <span style={{ color:P.gold }}>{targets.monthlyStretch}</span>
            </p>
          </div>
          <button className="btn-primary" onClick={() => setShowGuide(false)} style={{ marginTop:20 }}>I understand</button>
        </div>
      </div>
    )}

    {/* ── Settings & Account ── */}
    {showSettings && (
      <SettingsModal
        user={user}
        userData={userData}
        onClose={() => setShowSettings(false)}
        onSignOut={handleSignOut}
        onAccountDeleted={() => { setShowSettings(false); }}
      />
    )}
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

/* ── Login ── */
.login-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;}
.login-content{position:relative;z-index:2;text-align:center;padding:40px;max-width:380px;width:100%;}
.login-glow{position:absolute;width:300px;height:300px;top:50%;left:50%;transform:translate(-50%,-60%);background:radial-gradient(circle,${P.nebula}18 0%,transparent 65%);border-radius:50%;animation:breathe 6s ease-in-out infinite;pointer-events:none;}
.login-title{font-size:72px;color:${P.gold};margin-bottom:8px;animation:gentle-pulse 4s ease-in-out infinite;}
@keyframes gentle-pulse{0%,100%{opacity:0.8;transform:scale(1);}50%{opacity:1;transform:scale(1.05);}}
.login-name{font-family:'Cormorant Garamond',Georgia,serif;font-size:42px;font-weight:600;color:${P.gold};margin-bottom:8px;}
.login-tagline{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:${P.soft};margin-bottom:48px;}
.login-note{color:${P.dim};font-size:12px;margin-top:20px;max-width:260px;margin-left:auto;margin-right:auto;}

/* ── Auth Buttons & Forms ── */
.auth-buttons{display:flex;flex-direction:column;gap:10px;width:100%;}
.auth-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 24px;border-radius:14px;font-size:15px;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;border:1px solid ${P.glassBorder};}
.auth-btn:disabled{opacity:0.5;cursor:wait;}
.auth-btn.google-btn{background:${P.glassSolid};color:${P.text};}
.auth-btn.google-btn:hover{background:${P.dim};border-color:${P.muted};}
.auth-btn.apple-btn{background:${P.text};color:${P.bg};border-color:${P.text};}
.auth-btn.apple-btn:hover{background:${P.moon};}
.auth-btn.email-btn{background:transparent;color:${P.soft};border-color:${P.dim};}
.auth-btn.email-btn:hover{border-color:${P.nebula};color:${P.nebula};}
.auth-divider{display:flex;align-items:center;gap:12px;margin:4px 0;}
.auth-divider-line{flex:1;height:1px;background:${P.dim};}
.auth-divider-text{color:${P.muted};font-size:12px;}
.auth-form{display:flex;flex-direction:column;gap:12px;width:100%;text-align:left;}
.auth-error{color:#FF6B6B;font-size:13px;text-align:center;padding:4px 0;}
.auth-switch{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:16px;}
.avatar{width:32px;height:32px;border-radius:50%;border:1.5px solid ${P.dim};cursor:pointer;transition:border-color 0.2s;object-fit:cover;}
.avatar:hover{border-color:${P.nebula};}

/* ── Particles ── */
.particle-field{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;}
.particle{position:absolute;bottom:-5px;border-radius:50%;background:${P.moon};animation:float-up linear infinite;}
@keyframes float-up{0%{transform:translateY(0) translateX(0);}100%{transform:translateY(-110vh) translateX(var(--drift));}}

/* ── Header ── */
.app-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
.app-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:600;color:${P.gold};line-height:1.1;}
.title-star{font-size:24px;}
.app-date{color:${P.soft};font-size:14px;margin-top:2px;}
.help-btn{background:transparent;border:1px solid ${P.dim};color:${P.muted};width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px;font-weight:600;transition:all 0.2s;}
.help-btn:hover{border-color:${P.nebula};color:${P.nebula};}

/* ── Ring ── */
.ring-container{display:flex;flex-direction:column;align-items:center;position:relative;margin:20px 0 8px;}
.ring-glow{position:absolute;width:300px;height:300px;top:50%;left:50%;transform:translate(-50%,-55%);border-radius:50%;pointer-events:none;animation:breathe 6s ease-in-out infinite;}
@keyframes breathe{0%,100%{opacity:0.6;transform:translate(-50%,-55%) scale(1);}50%{opacity:1;transform:translate(-50%,-55%) scale(1.05);}}
.ring-svg{position:relative;z-index:2;}
.halo-ring{opacity:0.2;animation:halo-pulse 6s ease-in-out infinite;}
@keyframes halo-pulse{0%,100%{opacity:0.12;}50%{opacity:0.32;}}
.ring-sub{font-size:13px;margin-top:8px;text-align:center;transition:color 0.4s;}
.sparkle-icon{color:${P.gold};}
.encouragement{text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:14px;color:${P.nebula};margin-bottom:20px;}

/* ── Glass Cards ── */
.glass-card{background:${P.glass};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid ${P.glassBorder};border-radius:20px;padding:20px;transition:border-color 0.3s;}
.glass-card.glass-glow{box-shadow:0 0 20px color-mix(in srgb,var(--glow-color) 15%,transparent);border-color:color-mix(in srgb,var(--glow-color) 30%,transparent);}
.section-card{margin-bottom:12px;}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.card-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-weight:600;color:${P.text};}
.card-pts{font-weight:600;font-size:15px;}
.empty-state{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:${P.dim};padding:8px 0;}
.divider{height:1px;background:${P.divider};margin:12px 0;}
.milestone{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:${P.nebula};margin-bottom:8px;}

/* ── Entries ── */
.entry-card{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:14px;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);margin-bottom:6px;}
.entry-left{display:flex;align-items:center;gap:8px;}
.entry-name{font-size:13px;font-weight:500;}
.bonus-star{font-size:10px;}
.entry-right{display:flex;align-items:center;gap:10px;}
.del-btn{background:none;border:none;color:${P.muted};cursor:pointer;font-size:16px;padding:0 4px;transition:color 0.2s;}
.del-btn:hover{color:${P.text};}

/* ── Tiers ── */
.tier-row{margin-bottom:4px;}
.tier-bar-bg{position:relative;height:30px;border-radius:8px;background:${P.divider};overflow:hidden;}
.tier-bar-fill{position:absolute;top:0;left:0;bottom:0;border-radius:8px;transition:width 0.6s ease;}
.tier-bar-text{position:absolute;inset:0;display:flex;justify-content:space-between;align-items:center;padding:0 10px;font-size:12px;}
.tier-award{display:flex;align-items:center;gap:4px;}

/* ── Weekly ── */
.section-header{display:flex;justify-content:space-between;align-items:center;padding:0 4px;margin-bottom:10px;}
.week-pills{display:flex;gap:8px;justify-content:center;margin-bottom:8px;flex-wrap:wrap;}
.week-pill{text-align:center;padding:10px 14px !important;min-width:60px;}
.week-pill.current{border-color:${P.nebula};}
.wp-label{display:block;font-size:11px;font-weight:500;color:${P.text};}
.wp-pts{display:block;font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;font-weight:600;color:${P.text};}
.wp-tier{display:block;font-size:14px;}
.reward-row{padding:14px 18px;margin-bottom:6px;}

/* ── Buttons ── */
.btn-primary{background:${P.nebula};color:${P.text};border:none;border-radius:12px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;}
.btn-primary:hover{background:${P.btnActive};}
.btn-primary:disabled{opacity:0.4;cursor:not-allowed;}
.btn-large{padding:14px 40px;font-size:16px;}
.btn-ghost{background:transparent;color:${P.muted};border:none;padding:8px 16px;font-size:14px;cursor:pointer;transition:color 0.2s;font-family:'Inter',sans-serif;}
.btn-ghost:hover{color:${P.text};}

/* ── Calendar ── */
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
.cal-pts{position:absolute;top:3px;right:5px;font-size:8px;color:${P.soft};}
.cal-legend{display:flex;justify-content:center;gap:16px;padding:8px 0 4px;font-size:11px;color:${P.soft};flex-wrap:wrap;}
.cal-legend span{display:flex;align-items:center;gap:4px;}
.cal-legend .dot{width:8px;height:8px;}

/* ── Modals ── */
.modal-overlay{position:fixed;inset:0;background:rgba(8,9,18,0.85);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;animation:fade-in 0.2s ease;}
@keyframes fade-in{from{opacity:0;}to{opacity:1;}}
.modal-content{background:${P.glassSolid};border:1px solid ${P.glassBorder};border-radius:24px;padding:32px;max-width:400px;width:90%;max-height:90vh;overflow-y:auto;animation:modal-up 0.3s ease;}
.modal-reward{max-height:80vh;}
@keyframes modal-up{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
.activity-btn{background:transparent;border:1.5px solid ${P.dim};color:${P.muted};padding:10px 20px;border-radius:14px;font-size:14px;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;}
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

/* ── Onboarding ── */
.onboard-step{animation:fade-in 0.3s ease;}
.onboard-glow{position:absolute;width:250px;height:250px;top:20%;left:50%;transform:translateX(-50%);background:radial-gradient(circle,${P.nebula}18 0%,transparent 65%);border-radius:50%;pointer-events:none;animation:breathe 6s ease-in-out infinite;}
.onboard-title{color:${P.gold};font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;text-align:center;margin-bottom:6px;}
.onboard-subtitle{color:${P.soft};font-size:13px;text-align:center;margin-bottom:24px;}
.onboard-input{background:${P.glassSolid};border:1px solid ${P.dim};color:${P.text};padding:12px 16px;border-radius:12px;font-size:15px;font-family:'Inter',sans-serif;width:100%;outline:none;transition:border-color 0.2s;}
.onboard-input:focus{border-color:${P.nebula};}
.onboard-input::placeholder{color:${P.dim};}
textarea.onboard-input{font-family:'Inter',sans-serif;line-height:1.5;}
.onboard-nav{display:flex;justify-content:space-between;align-items:center;margin-top:28px;}

/* ── Progress Bar ── */
.onboard-progress-bar{width:100%;height:3px;background:${P.dim};border-radius:2px;margin-bottom:40px;overflow:hidden;}
.onboard-progress-fill{height:100%;background:linear-gradient(90deg,${P.nebula},${P.gold});border-radius:2px;transition:width 0.5s ease;}

/* ── Fade Transitions ── */
.onboard-fade-in{animation:onboard-fade-in 0.3s ease forwards;}
.onboard-fade-out{animation:onboard-fade-out 0.25s ease forwards;}
@keyframes onboard-fade-in{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
@keyframes onboard-fade-out{from{opacity:1;transform:translateY(0);}to{opacity:0;transform:translateY(-8px);}}

/* ── Question Screen ── */
.onboard-q-count{color:${P.dim};font-size:12px;text-align:center;margin-bottom:8px;letter-spacing:0.5px;font-weight:500;}
.onboard-q-title{color:${P.text};font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;text-align:center;margin-bottom:6px;line-height:1.35;}
.onboard-q-subtitle{color:${P.muted};font-size:12px;text-align:center;margin-bottom:20px;}

/* ── Options ── */
.onboard-options{display:flex;flex-direction:column;gap:8px;margin-top:20px;}
.onboard-option{display:flex;align-items:center;gap:12px;padding:14px 18px;background:transparent;border:1.5px solid ${P.dim};border-radius:14px;cursor:pointer;transition:all 0.2s;text-align:left;font-family:'Inter',sans-serif;}
.onboard-option:hover{border-color:${P.nebula};background:rgba(156,140,255,0.04);}
.onboard-option.selected{border-color:${P.nebula};background:rgba(156,140,255,0.1);box-shadow:0 0 12px rgba(156,140,255,0.08);}
.onboard-option-text{font-size:14px;color:${P.text};font-weight:500;line-height:1.3;}
.onboard-option.selected .onboard-option-text{color:${P.nebula};}
.onboard-check{width:20px;height:20px;border:1.5px solid ${P.dim};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:${P.nebula};flex-shrink:0;transition:all 0.2s;}
.onboard-option.selected .onboard-check{border-color:${P.nebula};background:rgba(156,140,255,0.15);}

/* ── Generating Screen ── */
.generating-glow{width:120px;height:120px;margin:0 auto 24px;background:radial-gradient(circle,${P.gold}20 0%,${P.nebula}10 50%,transparent 70%);border-radius:50%;animation:breathe 3s ease-in-out infinite;}
.generating-stars{display:flex;justify-content:center;gap:16px;}
.gen-star{color:${P.gold};font-size:20px;animation:gen-pulse 1.5s ease-in-out infinite;}
@keyframes gen-pulse{0%,100%{opacity:0.3;transform:scale(0.8);}50%{opacity:1;transform:scale(1.2);}}

/* ── AI Spinner ── */
.ai-spinner{display:inline-block;width:16px;height:16px;border:2px solid ${P.dim};border-top-color:${P.gold};border-radius:50%;animation:spin 0.8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}

/* ── Review Plan ── */
.review-section-title{color:${P.soft};font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-weight:600;margin-bottom:10px;padding-left:4px;}
.review-rules{padding:4px 0;}
.review-targets{display:flex;flex-direction:column;gap:6px;}
.review-target-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:13px;}

.target-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${P.divider};}
.target-row:last-child{border-bottom:none;}
.target-btn{background:${P.glassSolid};border:1px solid ${P.dim};color:${P.text};width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:600;transition:all 0.2s;display:flex;align-items:center;justify-content:center;}
.target-btn:hover{border-color:${P.nebula};color:${P.nebula};}

/* ── Settings ── */
.settings-section{margin-bottom:16px;}
.settings-section-title{color:${P.soft};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;}
.settings-info-grid{display:flex;flex-direction:column;gap:2px;}
.settings-info-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid ${P.divider};}
.settings-info-row:last-child{border-bottom:none;}
.settings-info-label{color:${P.muted};font-size:13px;}
.settings-info-value{color:${P.text};font-size:13px;font-weight:500;text-align:right;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.settings-action-btn{display:flex;align-items:center;gap:10px;width:100%;padding:12px 0;background:none;border:none;color:${P.text};font-size:14px;font-weight:500;cursor:pointer;transition:color 0.2s;font-family:'Inter',sans-serif;text-align:left;}
.settings-action-btn:hover{color:${P.nebula};}
.settings-action-btn.danger{color:${P.muted};}
.settings-action-btn.danger:hover{color:#FF9C8C;}
.delete-confirm{padding:12px 16px;background:rgba(192,57,43,0.08);border:1px solid rgba(192,57,43,0.2);border-radius:14px;}
.settings-btn svg{display:block;}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:6px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:${P.dim};border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:${P.muted};}
`;
