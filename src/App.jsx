import { useState, useEffect, useRef, useCallback } from "react";
import { auth, googleProvider, appleProvider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, deleteUser, reauthenticateWithPopup, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
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
  dailyCap: 5,
  weeklyBronze: 9,
  weeklySilver: 12,
  weeklyGold: 15,
  monthlyTarget: 35,
  monthlyStretch: 45,
};

const DEFAULT_REWARDS = {
  bronze: ["Coffee Trip", "Mini Beauty Treat", "Fresh Flowers", "New Book", "Frozen Yogurt"],
  silver: ["Workout Accessory", "Beauty Treat ($30)", "Movie Night", "Candle", "Spa Day"],
  gold: ["Nice dinner out", "Shopping Trip ($100)", "Massage or Facial", "Day trip adventure", "New workout gear"],
};

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

// ─── FIREBASE DATA ───────────────────────────────────────────────────────────
// The new data structure stores everything per user:
//   profile:    { displayName, onboardingComplete, createdAt }
//   activities: [ { id, label, color, colorLight, minDuration, baseStars, ... } ]
//   targets:    { dailyCap, weeklyBronze, weeklySilver, weeklyGold, monthlyTarget, monthlyStretch }
//   rewards:    { bronze: [...], silver: [...], gold: [...] }
//   entries:    [ { date, activity_type, duration_min, bonus_flag } ]
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
  // Convert old entries: intensity_flag/intentional_flag → unified bonus_flag
  const migratedEntries = (oldData.entries || []).map(e => ({
    date: e.date,
    activity_type: e.activity_type,
    duration_min: e.duration_min,
    bonus_flag: e.intensity_flag || e.intentional_flag || false,
  }));

  return {
    profile: { displayName: "", onboardingComplete: true, createdAt: new Date().toISOString() },
    // Keep the original yoga + walk activities so existing data still scores correctly
    activities: ACTIVITY_PRESETS.filter(a => a.id === "yoga" || a.id === "walk"),
    targets: { ...DEFAULT_TARGETS },
    rewards: { ...DEFAULT_REWARDS },
    entries: migratedEntries,
    claimed: oldData.claimed || [],
  };
}

async function saveUserData(userId, data) {
  try { await setDoc(doc(db, "users", userId), data); }
  catch (err) { console.error("Save error:", err); }
}

// ─── GENERIC POINT SYSTEM ────────────────────────────────────────────────────
// This replaces the old hardcoded calcPts. It reads scoring rules from the
// user's activities config, so any activity type works automatically.

function calcPts(entry, activities) {
  const act = activities.find(a => a.id === entry.activity_type);
  if (!act) return 0;
  const d = entry.duration_min;
  // Must meet minimum duration
  if (d < act.minDuration) return 0;
  // Two-tier scoring: if midDuration exists and duration meets it, use midStars
  let stars = act.baseStars;
  if (act.midDuration && d >= act.midDuration) stars = act.midStars;
  // Bonus flag adds extra stars
  if (entry.bonus_flag && act.bonusStars) stars += act.bonusStars;
  return stars;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function entriesFor(entries, ds) { return entries.filter(e => e.date === ds); }

function dailyPts(entries, ds, activities, dailyCap) {
  return Math.min(dailyCap, entriesFor(entries, ds).reduce((s, e) => s + calcPts(e, activities), 0));
}

function weekOfMonth(d) { return Math.ceil(d.getDate() / 7); }

function weekRange(y, m, wn) {
  const s = (wn - 1) * 7 + 1;
  const e = Math.min(wn * 7, new Date(y, m, 0).getDate());
  return [new Date(y, m - 1, s), new Date(y, m - 1, e)];
}

function weekPts(entries, y, m, wn, activities, dailyCap) {
  const [s, e] = weekRange(y, m, wn);
  let total = 0; const cur = new Date(s);
  while (cur <= e) {
    total += dailyPts(entries, cur.toISOString().slice(0, 10), activities, dailyCap);
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

function monthStats(entries, y, m, activities, targets) {
  const days = new Date(y, m, 0).getDate();
  let pts = 0;
  // Count sessions per activity type
  const actCounts = {};
  const bonusCounts = {};
  activities.forEach(a => { actCounts[a.id] = 0; bonusCounts[a.id] = 0; });

  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const es = entriesFor(entries, ds); let dp = 0;
    es.forEach(e => {
      const p = calcPts(e, activities);
      dp += p;
      if (p > 0) {
        actCounts[e.activity_type] = (actCounts[e.activity_type] || 0) + 1;
        if (e.bonus_flag) bonusCounts[e.activity_type] = (bonusCounts[e.activity_type] || 0) + 1;
      }
    });
    pts += Math.min(targets.dailyCap, dp);
  }
  return {
    pts, actCounts, bonusCounts,
    target: pts >= targets.monthlyTarget,
    stretch: pts >= targets.monthlyStretch,
  };
}

function calcStreak(entries, activities) {
  const active = new Set(entries.filter(e => calcPts(e, activities) > 0).map(e => e.date));
  if (!active.size) return 0;
  let streak = 0, d = new Date();
  while (active.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function topTier(pts, targets) {
  if (pts >= targets.weeklyGold) return "gold";
  if (pts >= targets.weeklySilver) return "silver";
  if (pts >= targets.weeklyBronze) return "bronze";
  return null;
}

function availTiers(pts, targets) {
  const t = [];
  if (pts >= targets.weeklyBronze) t.push("bronze");
  if (pts >= targets.weeklySilver) t.push("silver");
  if (pts >= targets.weeklyGold) t.push("gold");
  return t;
}

function tierColor(t) {
  return { gold: P.tierGold, silver: P.tierSilver, bronze: P.tierBronze }[t] || P.muted;
}

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

function TierBar({ name, need, pts, color }) {
  const hit = pts >= need, pct = Math.min(pts/need, 1);
  return (
    <div className="tier-row">
      <div className="tier-bar-bg">
        <div className="tier-bar-fill" style={{ width:`${pct*100}%`, background:hit?color:P.btnDark }} />
        <div className="tier-bar-text">
          <span className="tier-award" style={{ color:hit?(pct>0.5?P.bg:color):P.muted }}>
            ✦ <span style={{ fontWeight:hit?600:400 }}>{name} ({need} stars)</span>
          </span>
          <span style={{ color:hit?(pct>0.5?P.bg:color):P.muted, fontSize:12 }}>
            {hit ? "✓" : `${need-pts} to go`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── DYNAMIC LOG MODAL ───────────────────────────────────────────────────────
// Now reads from the user's activities config instead of hardcoded yoga/walk

function LogModal({ onClose, onLog, activities }) {
  const [activityId, setActivityId] = useState(activities[0]?.id || "");
  const [duration, setDuration] = useState(30);
  const [bonusFlag, setBonusFlag] = useState(false);

  const act = activities.find(a => a.id === activityId);
  const preview = act ? calcPts({
    activity_type: activityId, duration_min: duration, bonus_flag: bonusFlag
  }, activities) : 0;

  const handleLog = () => {
    onLog({
      date: todayStr(),
      activity_type: activityId,
      duration_min: duration,
      bonus_flag: bonusFlag,
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
            <button key={a.id} onClick={() => { setActivityId(a.id); setBonusFlag(false); }}
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
        {act && act.bonusLabel && (
          <label className="flag-label" style={{ "--accent": act.color }}>
            <input type="checkbox" checked={bonusFlag} onChange={e => setBonusFlag(e.target.checked)} />
            <span className="flag-star">✦</span>
            {act.bonusLabel}
          </label>
        )}
        <p style={{ color:P.gold, fontSize:16, fontWeight:600, textAlign:"center", margin:"16px 0" }}>
          → +{preview} star{preview !== 1 ? "s" : ""}
        </p>
        {act && (
          <p style={{ color:P.muted, fontSize:11, textAlign:"center", marginBottom:8 }}>
            {act.midDuration
              ? `${act.minDuration}+ min → ${act.baseStars}★ · ${act.midDuration}+ min → ${act.midStars}★`
              : `${act.minDuration}+ min → ${act.baseStars}★`}
            {act.bonusStars ? ` · bonus +${act.bonusStars}★` : ""}
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

function RewardModal({ wk, avail, rk, onClose, onClaim, rewards, targets }) {
  const highest = avail[avail.length - 1] || "bronze";
  const [selected, setSelected] = useState(`${highest}:${rewards[highest]?.[0] || ""}`);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-reward" onClick={e => e.stopPropagation()}>
        <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:24, fontWeight:600 }}>
          Select a Little Joy
        </h2>
        <p style={{ color:P.soft, fontSize:13, marginBottom:20 }}>Week {wk}</p>
        {["gold","silver","bronze"].map(tier => {
          const ok = avail.includes(tier);
          const need = tier === "gold" ? targets.weeklyGold : tier === "silver" ? targets.weeklySilver : targets.weeklyBronze;
          const tierRewards = rewards[tier] || [];
          return (
            <div key={tier} style={{ marginBottom:16 }}>
              <p style={{ color:ok?tierColor(tier):P.dim, fontWeight:600, fontSize:14, marginBottom:6 }}>
                ✦ {tier.toUpperCase()} ({need}+ stars) {!ok && "🔒"}
              </p>
              {tierRewards.map(rw => (
                <label key={rw} className="reward-option" style={{ opacity:ok?1:0.35, pointerEvents:ok?"auto":"none" }}>
                  <input type="radio" name="reward" value={`${tier}:${rw}`}
                    checked={selected === `${tier}:${rw}`} onChange={() => setSelected(`${tier}:${rw}`)} />
                  <span style={{ color:P.text, fontSize:13 }}>{rw}</span>
                </label>
              ))}
            </div>
          );
        })}
        <div style={{ display:"flex", gap:12, justifyContent:"center", marginTop:20 }}>
          <button className="btn-primary" onClick={() => { onClaim(rk, selected); onClose(); }}>✦ Receive Your Star</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CelebrateModal({ tier, reward, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign:"center" }}>
        <div className="celebrate-burst">✦</div>
        <p style={{ color:tierColor(tier), fontWeight:700, fontSize:18, fontFamily:"'Cormorant Garamond', Georgia, serif" }}>
          {tier.toUpperCase()}
        </p>
        <p style={{ color:P.gold, fontSize:16, fontWeight:600, margin:"16px 0" }}>{reward}</p>
        <p style={{ color:P.soft, fontStyle:"italic", fontFamily:"'Cormorant Garamond', Georgia, serif" }}>
          You earned this light.
        </p>
        <button className="btn-primary" onClick={onClose} style={{ marginTop:20 }}>Glow On</button>
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

function OnboardingWizard({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [selectedActivities, setSelectedActivities] = useState([]);

  // AI assessment state
  const [fitnessLevel, setFitnessLevel] = useState("");
  const [goal, setGoal] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [notes, setNotes] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // AI-generated plan
  const [generatedActivities, setGeneratedActivities] = useState([]);
  const [generatedTargets, setGeneratedTargets] = useState({ ...DEFAULT_TARGETS });
  const [generatedRewards, setGeneratedRewards] = useState({ ...DEFAULT_REWARDS });
  const [aiExplanation, setAiExplanation] = useState("");

  const totalSteps = 4;

  const toggleActivity = (id) => {
    setSelectedActivities(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  // ── Call AI to generate personalized plan ──
  const generatePlan = async () => {
    setAiLoading(true);
    setAiError("");

    const selectedPresets = selectedActivities.map(id => ACTIVITY_PRESETS.find(p => p.id === id));
    const activityList = selectedPresets.map(a => a.label).join(", ");

    const prompt = `You are a wellness coach creating a personalized movement tracking plan for someone using a star-based reward system app.

USER PROFILE:
- Name: ${displayName}
- Fitness level: ${fitnessLevel}
- Primary goal: ${goal}
- Wants to be active ${daysPerWeek} days per week
- Chosen activities: ${activityList}
${notes ? `- Additional notes: ${notes}` : ""}

ACTIVITY PRESETS (these are the base templates — adjust the scoring based on the user's profile):
${JSON.stringify(selectedPresets.map(a => ({ id: a.id, label: a.label, color: a.color, colorLight: a.colorLight })), null, 2)}

YOUR TASK:
Generate a personalized plan that includes scoring rules, weekly/monthly targets, and rewards. Adjust difficulty based on fitness level — beginners should earn stars more easily to build confidence, advanced users need higher thresholds.

Respond with ONLY a JSON object (no markdown, no backticks, no explanation before or after) with this exact structure:
{
  "activities": [
    {
      "id": "activity_id",
      "label": "Activity Name",
      "color": "#hex",
      "colorLight": "rgba(...)",
      "minDuration": 20,
      "baseStars": 1,
      "midDuration": 40,
      "midStars": 2,
      "bonusLabel": "Description of bonus effort",
      "bonusStars": 1
    }
  ],
  "targets": {
    "dailyCap": 5,
    "weeklyBronze": 8,
    "weeklySilver": 11,
    "weeklyGold": 14,
    "monthlyTarget": 30,
    "monthlyStretch": 42
  },
  "rewards": {
    "bronze": ["reward1", "reward2", "reward3", "reward4", "reward5"],
    "silver": ["reward1", "reward2", "reward3", "reward4", "reward5"],
    "gold": ["reward1", "reward2", "reward3", "reward4", "reward5"]
  },
  "explanation": "A 2-3 sentence explanation of why you chose these settings, addressing the user by name."
}

RULES:
- minDuration must be realistic for the activity and fitness level (lower for beginners)
- midDuration is optional (set to null if single-tier scoring makes more sense)
- midStars should be higher than baseStars
- bonusLabel should be specific and motivating for each activity
- Targets should be achievable at ${daysPerWeek} days/week — don't set them so high that the user can't reach Bronze
- Weekly targets: Bronze should be very reachable, Silver challenging, Gold ambitious
- Monthly target should assume ~${daysPerWeek} active days/week
- Rewards should escalate in value: bronze = small treats ($5-15), silver = medium rewards ($15-50), gold = significant rewards ($50-150)
- Rewards should feel personal and motivating, not generic
- Keep the color and colorLight values from the presets`;

    try {
      const response = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const text = data.content?.map(item => item.text || "").join("\n") || "";
      const clean = text.replace(/```json|```/g, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch (parseErr) {
        // Try to extract JSON from the response
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Could not parse AI response");
        }
      }

      setGeneratedActivities(parsed.activities || []);
      setGeneratedTargets(parsed.targets || { ...DEFAULT_TARGETS });
      setGeneratedRewards(parsed.rewards || { ...DEFAULT_REWARDS });
      setAiExplanation(parsed.explanation || "Your personalized plan is ready.");
      setStep(4);
    } catch (err) {
      console.error("AI generation error:", err);
      setAiError("Something went wrong generating your plan. You can try again or use the defaults.");
      // Fall back to presets
      setGeneratedActivities(selectedActivities.map(id => ({ ...ACTIVITY_PRESETS.find(p => p.id === id) })));
      setGeneratedTargets({ ...DEFAULT_TARGETS });
      setGeneratedRewards({ ...DEFAULT_REWARDS });
      setAiExplanation("");
    }
    setAiLoading(false);
  };

  // Use defaults if AI fails
  const useDefaults = () => {
    setGeneratedActivities(selectedActivities.map(id => ({ ...ACTIVITY_PRESETS.find(p => p.id === id) })));
    setGeneratedTargets({ ...DEFAULT_TARGETS });
    setGeneratedRewards({ ...DEFAULT_REWARDS });
    setAiExplanation("");
    setStep(4);
  };

  // Update a reward in the review step
  const updateReward = (tier, idx, value) => {
    setGeneratedRewards(prev => {
      const next = { ...prev, [tier]: [...prev[tier]] };
      next[tier][idx] = value;
      return next;
    });
  };
  const addReward = (tier) => {
    setGeneratedRewards(prev => ({ ...prev, [tier]: [...prev[tier], ""] }));
  };
  const removeReward = (tier, idx) => {
    setGeneratedRewards(prev => ({ ...prev, [tier]: prev[tier].filter((_, i) => i !== idx) }));
  };

  // Final save
  const handleLaunch = async () => {
    const userData = {
      profile: {
        displayName,
        onboardingComplete: true,
        createdAt: new Date().toISOString(),
      },
      activities: generatedActivities,
      targets: generatedTargets,
      rewards: {
        bronze: generatedRewards.bronze.filter(r => r.trim()),
        silver: generatedRewards.silver.filter(r => r.trim()),
        gold: generatedRewards.gold.filter(r => r.trim()),
      },
      entries: [],
      claimed: [],
    };
    await saveUserData(user.uid, userData);
    onComplete(userData);
  };

  return (
    <div className="star-flow-app">
      <style>{STYLES}</style>
      <StarParticles />
      <div className="app-scroll" style={{ maxWidth:480, paddingTop:60 }}>
        {/* Progress indicator */}
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:32 }}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} style={{
              width: 32, height: 3, borderRadius: 2,
              background: i + 1 <= step ? P.nebula : P.dim,
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        {/* ── STEP 1: Welcome ── */}
        {step === 1 && (
          <div className="onboard-step">
            <div className="onboard-glow" />
            <h1 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:48, textAlign:"center", marginBottom:8 }}>✦</h1>
            <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:28, textAlign:"center", marginBottom:8 }}>Welcome to Star Flow</h2>
            <p style={{ color:P.soft, fontFamily:"'Cormorant Garamond', Georgia, serif", fontStyle:"italic", textAlign:"center", marginBottom:32, fontSize:15 }}>Let's set up your sky.</p>
            <GlassCard>
              <label style={{ color:P.soft, fontSize:13, display:"block", marginBottom:8 }}>What should we call you?</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name" className="onboard-input" autoFocus />
            </GlassCard>
            <div style={{ textAlign:"center", marginTop:28 }}>
              <button className="btn-primary btn-large" onClick={() => setStep(2)} disabled={!displayName.trim()}>Begin ✦</button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Choose Activities ── */}
        {step === 2 && (
          <div className="onboard-step">
            <h2 className="onboard-title">Choose Your Movements</h2>
            <p className="onboard-subtitle">Select the activities you want to track. You can add more later.</p>
            <div className="activity-grid">
              {ACTIVITY_PRESETS.map(a => {
                const sel = selectedActivities.includes(a.id);
                return (
                  <button key={a.id} onClick={() => toggleActivity(a.id)}
                    className={`activity-pick ${sel ? "selected" : ""}`}
                    style={{ "--accent": a.color }}>
                    <span className="activity-pick-star" style={{ color: sel ? a.color : P.dim }}>✦</span>
                    <span className="activity-pick-label">{a.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="onboard-nav">
              <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn-primary" onClick={() => setStep(3)} disabled={selectedActivities.length === 0}>Next ✦</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: AI Assessment ── */}
        {step === 3 && (
          <div className="onboard-step">
            <h2 className="onboard-title">Tell Us About You</h2>
            <p className="onboard-subtitle">We'll create a personalized star system based on your fitness level and goals.</p>

            <GlassCard className="section-card">
              <label className="assess-label">What's your current fitness level?</label>
              <div className="assess-options">
                {[
                  { val:"beginner", label:"Beginner", desc:"Just starting out or getting back into it" },
                  { val:"intermediate", label:"Intermediate", desc:"Active a few times per week" },
                  { val:"advanced", label:"Advanced", desc:"Consistent routine, ready for challenge" },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setFitnessLevel(opt.val)}
                    className={`assess-btn ${fitnessLevel === opt.val ? "selected" : ""}`}>
                    <span className="assess-btn-label">{opt.label}</span>
                    <span className="assess-btn-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="section-card">
              <label className="assess-label">What's your primary goal?</label>
              <div className="assess-options">
                {[
                  { val:"consistency", label:"Build Consistency", desc:"Show up regularly, form the habit" },
                  { val:"performance", label:"Push Performance", desc:"Get stronger, faster, better" },
                  { val:"wellness", label:"Stress Relief", desc:"Move for mental health and calm" },
                  { val:"health", label:"General Health", desc:"Stay active and feel good" },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setGoal(opt.val)}
                    className={`assess-btn ${goal === opt.val ? "selected" : ""}`}>
                    <span className="assess-btn-label">{opt.label}</span>
                    <span className="assess-btn-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="section-card">
              <label className="assess-label">How many days per week do you want to move?</label>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, padding:"12px 0" }}>
                <button className="target-btn" onClick={() => setDaysPerWeek(d => Math.max(1, d-1))}>−</button>
                <span style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:36, fontWeight:600, width:40, textAlign:"center" }}>
                  {daysPerWeek}
                </span>
                <button className="target-btn" onClick={() => setDaysPerWeek(d => Math.min(7, d+1))}>+</button>
              </div>
              <p style={{ color:P.muted, fontSize:12, textAlign:"center" }}>
                {daysPerWeek <= 2 ? "Gentle start — every session counts" :
                 daysPerWeek <= 4 ? "A balanced rhythm" :
                 daysPerWeek <= 5 ? "Dedicated practice" : "Full commitment"}
              </p>
            </GlassCard>

            <GlassCard className="section-card">
              <label className="assess-label">Anything else we should know? <span style={{ color:P.dim, fontWeight:400 }}>(optional)</span></label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                className="onboard-input" placeholder="e.g. I have a knee injury so I keep runs short, I prefer morning workouts, I'm training for a 5K..."
                style={{ resize:"vertical", minHeight:70, fontSize:13, lineHeight:1.5 }} />
            </GlassCard>

            {aiError && (
              <GlassCard className="section-card" style={{ borderColor:"rgba(255,120,100,0.3)" }}>
                <p style={{ color:"#FF9C8C", fontSize:13 }}>{aiError}</p>
                <button className="btn-ghost" onClick={useDefaults} style={{ color:P.nebula, fontSize:13, marginTop:8 }}>
                  Use default settings instead →
                </button>
              </GlassCard>
            )}

            <div className="onboard-nav">
              <button className="btn-ghost" onClick={() => setStep(2)}>Back</button>
              <button className="btn-primary btn-large" onClick={generatePlan}
                disabled={!fitnessLevel || !goal || aiLoading}>
                {aiLoading ? (
                  <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span className="ai-spinner" />Creating your plan…
                  </span>
                ) : "✦ Create My Plan"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Review AI-Generated Plan ── */}
        {step === 4 && (
          <div className="onboard-step">
            <h2 className="onboard-title">Your Personalized Sky</h2>
            {aiExplanation && (
              <p style={{ color:P.soft, fontFamily:"'Cormorant Garamond', Georgia, serif", fontStyle:"italic", textAlign:"center", marginBottom:24, fontSize:14, lineHeight:1.6 }}>
                {aiExplanation}
              </p>
            )}

            {/* Activity Scoring */}
            <h3 className="review-section-title">✦ Scoring Rules</h3>
            {generatedActivities.map(act => (
              <GlassCard key={act.id} className="section-card" style={{ marginBottom:8 }}>
                <h4 style={{ color:act.color, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:17, marginBottom:8 }}>
                  ✦ {act.label}
                </h4>
                <div className="review-rules">
                  <p style={{ color:P.text, fontSize:13 }}>
                    {act.minDuration}+ min → {act.baseStars} star{act.baseStars !== 1 ? "s" : ""}
                    {act.midDuration && ` · ${act.midDuration}+ min → ${act.midStars} star${act.midStars !== 1 ? "s" : ""}`}
                  </p>
                  {act.bonusStars > 0 && (
                    <p style={{ color:P.gold, fontSize:12, marginTop:4 }}>
                      ✦ {act.bonusLabel} → +{act.bonusStars} bonus star{act.bonusStars !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </GlassCard>
            ))}

            {/* Targets */}
            <h3 className="review-section-title" style={{ marginTop:16 }}>☽ Weekly & Monthly Goals</h3>
            <GlassCard className="section-card">
              <div className="review-targets">
                <div className="review-target-row">
                  <span style={{ color:P.soft }}>Daily cap</span>
                  <span style={{ color:P.gold, fontWeight:600 }}>{generatedTargets.dailyCap} stars</span>
                </div>
                <div className="review-target-row">
                  <span style={{ color:P.tierBronze }}>✦ Bronze</span>
                  <span style={{ color:P.text }}>{generatedTargets.weeklyBronze}+ / week</span>
                </div>
                <div className="review-target-row">
                  <span style={{ color:P.tierSilver }}>✦ Silver</span>
                  <span style={{ color:P.text }}>{generatedTargets.weeklySilver}+ / week</span>
                </div>
                <div className="review-target-row">
                  <span style={{ color:P.tierGold }}>✦ Gold</span>
                  <span style={{ color:P.text }}>{generatedTargets.weeklyGold}+ / week</span>
                </div>
                <div className="divider" />
                <div className="review-target-row">
                  <span style={{ color:P.soft }}>Monthly target</span>
                  <span style={{ color:P.nebula, fontWeight:600 }}>{generatedTargets.monthlyTarget} stars</span>
                </div>
                <div className="review-target-row">
                  <span style={{ color:P.soft }}>Stretch goal</span>
                  <span style={{ color:P.gold, fontWeight:600 }}>{generatedTargets.monthlyStretch} stars</span>
                </div>
              </div>
            </GlassCard>

            {/* Rewards */}
            <h3 className="review-section-title" style={{ marginTop:16 }}>★ Your Rewards</h3>
            {["bronze","silver","gold"].map(tier => (
              <GlassCard key={tier} className="section-card" style={{ marginBottom:8 }}>
                <h4 style={{ color:tierColor(tier), fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:15, marginBottom:8 }}>
                  ✦ {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </h4>
                {(generatedRewards[tier] || []).map((rw, idx) => (
                  <div key={idx} style={{ display:"flex", gap:6, marginBottom:5, alignItems:"center" }}>
                    <input type="text" value={rw} onChange={e => updateReward(tier, idx, e.target.value)}
                      className="onboard-input" style={{ flex:1, fontSize:12, padding:"7px 11px" }} />
                    <button onClick={() => removeReward(tier, idx)}
                      style={{ color:P.muted, fontSize:16, background:"none", border:"none", cursor:"pointer", padding:"0 4px" }}>×</button>
                  </div>
                ))}
                <button className="btn-ghost" onClick={() => addReward(tier)}
                  style={{ fontSize:11, color:tierColor(tier), padding:"2px 0" }}>+ Add reward</button>
              </GlassCard>
            ))}

            <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:24, alignItems:"center" }}>
              <button className="btn-primary btn-large" onClick={handleLaunch}>✦ Launch Your Sky</button>
              <div style={{ display:"flex", gap:12 }}>
                <button className="btn-ghost" onClick={() => setStep(3)} style={{ fontSize:13 }}>← Adjust answers</button>
                <button className="btn-ghost" onClick={generatePlan} style={{ fontSize:13, color:P.nebula }}>
                  {aiLoading ? "Regenerating…" : "✦ Regenerate plan"}
                </button>
              </div>
            </div>
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

  const [showLog, setShowLog] = useState(false);
  const [rewardModal, setRewardModal] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [encouragement] = useState(() => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
  const claimReward = (rk, sel) => {
    updateData({ claimed: [...claimed, rk] });
    const [tier, reward] = sel.split(":", 2);
    setCelebrate({ tier, reward });
  };
  const unclaim = (rk) => {
    updateData({ claimed: claimed.filter(c => c !== rk) });
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
  const wp = weekPts(entries, now.getFullYear(), now.getMonth() + 1, cw, activities, targets.dailyCap);
  const streak = calcStreak(entries, activities);
  const todayEntries = entriesFor(entries, today);
  const todayPtsVal = dailyPts(entries, today, activities, targets.dailyCap);
  const tier = topTier(wp, targets);
  const numWeeks = Math.ceil(new Date(viewYear, viewMonth, 0).getDate() / 7);
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1;

  let milestone = "";
  if (stats.stretch) milestone = MILESTONE_COPY.monthly_stretch;
  else if (stats.target) milestone = MILESTONE_COPY.monthly_target;
  else if (tier && MILESTONE_COPY[tier]) milestone = MILESTONE_COPY[tier];
  else if (streak >= 14) milestone = MILESTONE_COPY.streak_14;
  else if (streak >= 7) milestone = MILESTONE_COPY.streak_7;
  else if (streak >= 3) milestone = MILESTONE_COPY.streak_3;

  let peekText = "";
  if (!tier) {
    peekText = `${targets.weeklyBronze - wp} stars from a weekend gift`;
  } else {
    const at = availTiers(wp, targets), h = at[at.length-1] || "bronze";
    const tierRewards = rewards[h] || [];
    const sample = tierRewards[Math.floor(Math.random() * tierRewards.length)] || "a reward";
    peekText = `Unlocked — perhaps: ${sample}`;
  }

  const prevMonth = () => { if (viewMonth === 1) { setViewMonth(12); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewMonth(1); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); };

  return (
    <div className="star-flow-app"><style>{STYLES}</style><StarParticles />
    <div className="app-scroll">
      {/* ── Header ── */}
      <header className="app-header">
        <div>
          <h1 className="app-title"><span className="title-star">✦</span> Star Flow</h1>
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
            const dp = dailyPts(entries, ds, activities, targets.dailyCap);

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
            const bonus = stats.bonusCounts[act.id] || 0;
            return `${count} ${act.label.toLowerCase()}${bonus ? ` (${bonus}✦)` : ""}`;
          }).join(" · ")}
        </p>
      </GlassCard>

      {/* ── Tonight ── */}
      <GlassCard className="section-card">
        <div className="card-header">
          <h3 className="card-title">Tonight</h3>
          <span className="card-pts" style={{ color:P.gold }}>{todayPtsVal} stars</span>
        </div>
        {todayEntries.length === 0
          ? <p className="empty-state">The sky is quiet tonight. Your first star is waiting.</p>
          : todayEntries.map((entry, i) => {
              const act = activities.find(a => a.id === entry.activity_type);
              const pts = calcPts(entry, activities);
              const accent = act?.color || P.nebula;
              const bgLight = act?.colorLight || P.glass;
              return (
                <div key={i} className="entry-card" style={{ "--accent": accent, background: bgLight }}>
                  <div className="entry-left">
                    <span style={{ color: accent }}>✦</span>
                    <span className="entry-name">{act?.label || entry.activity_type} · {entry.duration_min} min</span>
                    {entry.bonus_flag && <span className="bonus-star" style={{ color:P.gold }}>✦</span>}
                  </div>
                  <div className="entry-right">
                    <span style={{ color: accent, fontWeight:600 }}>+{pts}</span>
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
          <span className="card-pts" style={{ color:P.nebula }}>{wp} / {targets.weeklyBronze}</span>
        </div>
        {streak > 0
          ? <p style={{ color:P.gold, fontSize:13, marginBottom:6 }}>🔥 {streak}-night glow</p>
          : <p style={{ color:P.soft, fontSize:13, marginBottom:6 }}>Every star counts, even small ones.</p>}
        {milestone && <p className="milestone">{milestone}</p>}
        <div className="divider" />
        <p style={{ color:P.soft, fontSize:12, fontWeight:600, marginBottom:8 }}>Constellation Progress</p>
        <TierBar name="Bronze" need={targets.weeklyBronze} pts={wp} color={P.tierBronze} />
        <TierBar name="Silver" need={targets.weeklySilver} pts={wp} color={P.tierSilver} />
        <TierBar name="Gold" need={targets.weeklyGold} pts={wp} color={P.tierGold} />
        <p style={{ color:P.soft, fontSize:12, marginTop:12 }}>
          {tier ? `✦ ${peekText}` : `☽ ${peekText}`}
        </p>
      </GlassCard>

      {/* ── Weekly Sky ── */}
      <div className="section-header">
        <h3 style={{ color:P.text, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:18 }}>Weekly Sky</h3>
      </div>
      <div className="week-pills">
        {Array.from({ length: numWeeks }, (_, i) => i + 1).map(wk => {
          const wkPts = weekPts(entries, viewYear, viewMonth, wk, activities, targets.dailyCap);
          const wkTier = topTier(wkPts, targets);
          const isCur = isCurrentMonth && wk === cw;
          return (
            <GlassCard key={wk} className={`week-pill ${isCur ? "current" : ""}`} glow={isCur} glowColor={P.nebula}>
              <span className="wp-label">W{wk}</span>
              <span className="wp-pts">{wkPts}</span>
              {wkTier
                ? <span className="wp-tier" style={{ color: tierColor(wkTier) }}>✦</span>
                : <span className="wp-tier" style={{ color: P.dim }}>·</span>}
            </GlassCard>
          );
        })}
      </div>

      {/* ── Weekend Stars ── */}
      <div className="section-header" style={{ marginTop:20 }}>
        <h3 style={{ color:P.text, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:18 }}>☽ Weekend Stars</h3>
        <span style={{ color:P.muted, fontSize:12 }}>Fri – Sun</span>
      </div>
      {Array.from({ length: numWeeks }, (_, i) => i + 1).map(wk => {
        const wkPts = weekPts(entries, viewYear, viewMonth, wk, activities, targets.dailyCap);
        const avail = availTiers(wkPts, targets), tt = topTier(wkPts, targets);
        const rk = `${viewYear}-${String(viewMonth).padStart(2,"0")}-W${wk}`, isClaimed = claimed.includes(rk);
        const fri = fridayOf(viewYear, viewMonth, wk), sun = sundayOf(viewYear, viewMonth, wk), unlocked = new Date() >= fri;
        const dateLabel = `Week ${wk} · ${fri.toLocaleDateString("en-US",{month:"short",day:"numeric"})}–${sun.getDate()}`;
        return (
          <GlassCard key={rk} className="section-card reward-row">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:P.text, fontSize:13 }}>{dateLabel}</span>
              {!avail.length
                ? <span style={{ color:P.dim, fontSize:12 }}>{targets.weeklyBronze - wkPts} stars away</span>
                : !unlocked
                  ? <span style={{ color:P.dim, fontSize:12 }}>🔒 Fri–Sun</span>
                  : isClaimed
                    ? <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ color:P.nebula, fontSize:13 }}>{tt && "✦ "}Received</span>
                        <button className="btn-ghost" style={{ fontSize:11, padding:"2px 8px" }} onClick={() => unclaim(rk)}>undo</button>
                      </div>
                    : <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        {avail.map(t => <span key={t} style={{ color:tierColor(t), fontSize:14 }}>✦</span>)}
                        <button className="btn-primary" style={{ fontSize:12, padding:"4px 14px" }}
                          onClick={() => setRewardModal({ wk, avail, rk })}>Receive</button>
                      </div>
              }
            </div>
          </GlassCard>
        );
      })}

      <div style={{ height:50 }} />
    </div>

    {/* ── Modals ── */}
    {showLog && <LogModal onClose={() => setShowLog(false)} onLog={addEntry} activities={activities} />}
    {rewardModal && <RewardModal {...rewardModal} onClose={() => setRewardModal(null)}
      onClaim={(rk, sel) => claimReward(rk, sel)} rewards={rewards} targets={targets} />}
    {celebrate && <CelebrateModal {...celebrate} onClose={() => setCelebrate(null)} />}

    {/* ── How Stars Work Guide (dynamic) ── */}
    {showGuide && (
      <div className="modal-overlay" onClick={() => setShowGuide(false)}>
        <div className="modal-content modal-reward" onClick={e => e.stopPropagation()}>
          <h2 style={{ color:P.gold, fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize:22 }}>
            How Stars Work
          </h2>
          <div style={{ textAlign:"left", marginTop:16 }}>
            {activities.map(act => (
              <div key={act.id} style={{ marginBottom:10 }}>
                <p style={{ color:act.color, fontWeight:600, fontSize:14 }}>✦ {act.label.toUpperCase()}</p>
                {act.midDuration ? (
                  <>
                    <p style={{ color:P.text, fontSize:12, margin:"2px 0 2px 16px" }}>
                      {act.minDuration}–{act.midDuration - 1} min → {act.baseStars} star{act.baseStars !== 1 ? "s" : ""}
                    </p>
                    <p style={{ color:P.text, fontSize:12, margin:"2px 0 2px 16px" }}>
                      {act.midDuration}+ min → {act.midStars} star{act.midStars !== 1 ? "s" : ""}
                    </p>
                  </>
                ) : (
                  <p style={{ color:P.text, fontSize:12, margin:"2px 0 2px 16px" }}>
                    {act.minDuration}+ min → {act.baseStars} star{act.baseStars !== 1 ? "s" : ""}
                  </p>
                )}
                {act.bonusStars > 0 && (
                  <p style={{ color:P.text, fontSize:12, margin:"2px 0 2px 16px" }}>
                    + {act.bonusLabel} → +{act.bonusStars} star{act.bonusStars !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            ))}
            <div className="divider" />
            <p style={{ color:P.text, fontWeight:600, fontSize:14 }}>Goals</p>
            <p style={{ color:P.soft, fontSize:12, margin:"2px 0 2px 16px" }}>
              Daily cap: {targets.dailyCap} · Weekly: {targets.weeklyBronze} · Monthly: {targets.monthlyTarget} · Stretch: {targets.monthlyStretch}
            </p>
            <div className="divider" />
            <p style={{ color:P.text, fontWeight:600, fontSize:14 }}>Constellations</p>
            <p style={{ color:P.soft, fontSize:12, margin:"2px 0 2px 16px" }}>
              Bronze: {targets.weeklyBronze}+ · Silver: {targets.weeklySilver}+ · Gold: {targets.weeklyGold}+ stars per week
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
.activity-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:8px;}
.activity-pick{display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 12px;background:${P.glass};border:1.5px solid ${P.dim};border-radius:16px;cursor:pointer;transition:all 0.2s;font-family:'Inter',sans-serif;}
.activity-pick:hover{border-color:var(--accent);}
.activity-pick.selected{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent);box-shadow:0 0 16px color-mix(in srgb,var(--accent) 12%,transparent);}
.activity-pick-star{font-size:20px;transition:color 0.2s;}
.activity-pick-label{font-size:13px;font-weight:500;color:${P.text};}

/* ── AI Assessment ── */
.assess-label{display:block;color:${P.text};font-size:14px;font-weight:500;margin-bottom:10px;}
.assess-options{display:flex;flex-direction:column;gap:6px;}
.assess-btn{display:flex;flex-direction:column;gap:2px;padding:12px 16px;background:transparent;border:1.5px solid ${P.dim};border-radius:14px;cursor:pointer;transition:all 0.2s;text-align:left;font-family:'Inter',sans-serif;}
.assess-btn:hover{border-color:${P.nebula};background:rgba(156,140,255,0.04);}
.assess-btn.selected{border-color:${P.nebula};background:rgba(156,140,255,0.1);box-shadow:0 0 12px rgba(156,140,255,0.1);}
.assess-btn-label{font-size:14px;font-weight:600;color:${P.text};}
.assess-btn.selected .assess-btn-label{color:${P.nebula};}
.assess-btn-desc{font-size:12px;color:${P.muted};}
.assess-btn.selected .assess-btn-desc{color:${P.soft};}

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
