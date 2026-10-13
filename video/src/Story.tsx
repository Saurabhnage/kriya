import React from "react";
import { AbsoluteFill, interpolate, spring } from "remotion";
import { C, Chip, INTER, MONO, Shot, Subtitle, Tag, useIn, useT } from "./ui";

type Sub = { start: number; end: number; text: string };
export type Voice = { id: string; duration: number; subs: Sub[] };
type P = { v: Voice };

const R = {
  mandate: { x: 16, y: 69, w: 383, h: 252 },
  activity: { x: 1201, y: 69, w: 383, h: 852 },
  exec: { x: 1244, y: 510, w: 319, h: 63 },
  risk: { x: 1244, y: 707, w: 319, h: 48 },
  decision: { x: 411, y: 343, w: 778, h: 371 },
  proof: { x: 0, y: 24, w: 1600, h: 560 },
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const H1: React.FC<{ children: React.ReactNode; p: number; size?: number; color?: string; style?: React.CSSProperties }> = ({ children, p, size = 84, color = C.text, style }) => (
  <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: size, lineHeight: 1.1, letterSpacing: -1.5, color, opacity: p, transform: `translateY(${(1 - p) * 26}px)`, filter: `blur(${(1 - p) * 6}px)`, ...style }}>{children}</div>
);

const Tint: React.FC<{ color: string; at?: string }> = ({ color, at = "50% 40%" }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at ${at}, ${color}, transparent 70%)`, pointerEvents: "none" }} />
);

/** Starts at the n-th spoken line (frame), with a fallback in seconds. */
const useLine = (v: Voice) => {
  const { at } = useT();
  return (i: number, offset = 0) => at((v.subs[i]?.start ?? i * 2) + offset);
};

// ------------------------------------------------------------ shared bits
const Skyline: React.FC = () => {
  const { frame } = useT();
  const b = [[0, 210], [70, 300], [150, 180], [210, 380], [300, 250], [370, 330], [460, 200], [520, 420], [620, 280], [700, 350], [790, 190], [850, 310], [940, 240], [1010, 400], [1110, 270], [1180, 330], [1270, 210], [1340, 360], [1440, 260], [1510, 300], [1600, 220], [1680, 390], [1780, 250], [1850, 310]];
  return (
    <svg width="1920" height="440" style={{ position: "absolute", bottom: 0, left: 0, opacity: 0.85 }}>
      {b.map(([x, h], i) => (
        <g key={i}>
          <rect x={x} y={440 - h} width={66} height={h} fill="#0b1220" stroke="#16233a" />
          {Array.from({ length: Math.floor(h / 34) }).map((_, r) =>
            [0, 1, 2].map((c) => {
              const on = (i * 7 + r * 3 + c * 5 + Math.floor(frame / 45)) % 9 === 0;
              return <rect key={`${r}-${c}`} x={x + 9 + c * 19} y={440 - h + 12 + r * 34} width={10} height={14} fill={on ? "#fcd34d" : "#111b2c"} opacity={on ? 0.75 : 1} />;
            }),
          )}
        </g>
      ))}
    </svg>
  );
};

const Phone: React.FC<{ lit: number; buzz: number; children?: React.ReactNode }> = ({ lit, buzz, children }) => (
  <div style={{ width: 380, height: 760, borderRadius: 54, border: "3px solid #2a3846", background: "#05080b", padding: 16, boxShadow: `0 0 ${120 * lit}px rgba(110,160,255,${0.35 * lit}), 0 40px 100px rgba(0,0,0,.6)`, transform: `translateX(${buzz}px)` }}>
    <div style={{ width: "100%", height: "100%", borderRadius: 40, background: `linear-gradient(180deg, rgba(30,45,70,${lit}), rgba(10,15,22,${lit}))`, padding: "70px 18px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
  </div>
);

const Notif: React.FC<{ p: number; c: string; title: string; body: string }> = ({ p, c, title, body }) => (
  <div style={{ opacity: p, transform: `translateY(${(1 - p) * -24}px) scale(${0.95 + 0.05 * p})`, background: "rgba(22,32,44,.96)", border: `1px solid ${C.line}`, borderRadius: 20, padding: "16px 18px" }}>
    <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 1.5, color: c }}>{title}</div>
    <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 21, color: C.text, marginTop: 4, lineHeight: 1.3 }}>{body}</div>
  </div>
);

const Clock: React.FC<{ time: string; size?: number; color?: string }> = ({ time, size = 190, color = C.text }) => {
  const { frame } = useT();
  const [h, m] = time.split(":");
  return (
    <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: size, color, letterSpacing: -4, lineHeight: 1 }}>
      {h}
      <span style={{ opacity: Math.floor(frame / 15) % 2 ? 0.25 : 1 }}>:</span>
      {m}
    </div>
  );
};

const Moon: React.FC<{ size?: number; glow?: number }> = ({ size = 120, glow = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: `drop-shadow(0 0 ${28 * glow}px rgba(252,211,77,.55))` }}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="#fcd34d" />
  </svg>
);

// ------------------------------------------------------------ 1. night
export const Night: React.FC<P> = ({ v }) => {
  const { at, frame } = useT();
  const L = useLine(v);
  const clock = useIn(at(0));
  const who = useIn(L(1));
  const lit = useIn(L(2, 0.9), 12);
  const n1 = useIn(L(2, 1.1));
  const n2 = useIn(L(2, 1.7));
  const buzz = frame > L(2, 0.9) && frame < L(2, 1.6) ? Math.sin(frame * 3.1) * 7 : 0;
  return (
    <AbsoluteFill>
      <Tint color="rgba(50,80,170,.22)" at="30% 30%" />
      <Skyline />
      <div style={{ position: "absolute", left: 150, top: 150, opacity: clock }}>
        <Tag color={C.muted}>A STORY ABOUT USERS LIKE ARJUN</Tag>
        <div style={{ marginTop: 40 }}>
          <Clock time="2:47" />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 40, color: C.muted, marginTop: 8 }}>AM · BENGALURU</div>
        <H1 p={who} size={56} style={{ marginTop: 50 }}>
          Arjun is awake. <span style={{ color: C.muted }}>Again.</span>
        </H1>
      </div>
      <div style={{ position: "absolute", right: 210, top: 120 }}>
        <Phone lit={lit} buzz={buzz}>
          <div style={{ fontFamily: MONO, fontSize: 64, color: C.text, textAlign: "center", opacity: lit, marginBottom: 20 }}>2:47</div>
          <Notif p={n1} c={C.amber} title="RISK ALERT · 2:46 AM" body="Strategy B risk is rising. Check your position." />
          <Notif p={n2} c={C.red} title="POOL MONITOR · 2:47 AM" body="Exposure above your comfort level." />
        </Phone>
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 2. backstory
export const Backstory: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const L = useLine(v);
  const head = useIn(at(0));
  const chips = [useIn(L(1)), useIn(L(1, 0.7)), useIn(L(1, 1.4))];
  const draw = interpolate(frame, [L(1, 0.4), L(1, 0.4) + fps * 2.2], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ padding: "150px 150px", flexDirection: "row", gap: 90 }}>
      <div style={{ flex: 1, paddingTop: 40 }}>
        <Tag color={C.mint} style={{ opacity: head }}>TWO YEARS AGO</Tag>
        <H1 p={head} size={76} style={{ marginTop: 30 }}>
          Arjun moved some savings
          <br />
          into <span style={{ color: C.mint }}>DeFi.</span>
        </H1>
        <div style={{ display: "flex", gap: 16, marginTop: 50, flexWrap: "wrap" }}>
          {["Stablecoins", "Lending pools", "LP yield"].map((x, i) => (
            <div key={x} style={{ opacity: chips[i], transform: `translateY(${(1 - chips[i]) * 20}px)` }}>
              <Tag color={[C.mint, C.chainlink, C.purple][i]} style={{ fontSize: 22, padding: "12px 20px" }}>{x}</Tag>
            </div>
          ))}
        </div>
      </div>
      <div style={{ width: 760, height: 520, marginTop: 30, background: "rgba(15,22,29,.9)", border: `1px solid ${C.line}`, borderRadius: 26, padding: 40, boxSizing: "border-box", opacity: head }}>
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 2, color: C.muted }}>GROWTH OF SAVINGS · ILLUSTRATIVE</div>
        <svg width="680" height="360" style={{ marginTop: 20 }}>
          <line x1="0" y1="340" x2="680" y2="340" stroke={C.line} />
          <path d="M0 330 C 200 322, 420 312, 680 300" stroke={C.muted} strokeWidth="5" fill="none" strokeDasharray="1000" strokeDashoffset={1000 * (1 - draw)} />
          <path d="M0 330 C 160 300, 330 240, 480 170 S 640 70, 680 50" stroke={C.mint} strokeWidth="6" fill="none" strokeDasharray="1000" strokeDashoffset={1000 * (1 - draw)} style={{ filter: "drop-shadow(0 0 10px rgba(110,231,183,.6))" }} />
          <text x="540" y="290" fill={C.muted} fontFamily={MONO} fontSize="22" opacity={draw}>bank</text>
          <text x="520" y="40" fill={C.mint} fontFamily={MONO} fontSize="22" opacity={draw}>DeFi yield</text>
        </svg>
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 3. the second job
export const SecondJob: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const L = useLine(v);
  const head = useIn(at(0));
  const rows = [useIn(L(1)), useIn(L(2)), useIn(L(3))];
  const crash = useIn(L(4), 16);
  const lost = useIn(L(5));
  const fall = interpolate(frame, [L(4, 1.0), L(4, 1.0) + fps * 1.6], [0, 1], clamp);
  const items = [
    { t: "09:40", d: "Dashboards before stand-up", c: C.chainlink },
    { t: "13:15", d: "Risk updates at lunch", c: C.amber },
    { t: "23:58", d: "Signing transactions at midnight", c: C.purple },
  ];
  return (
    <AbsoluteFill style={{ padding: "130px 150px" }}>
      <Tint color={`rgba(248,113,113,${0.22 * crash})`} at="70% 50%" />
      <H1 p={head} size={80}>
        Better yield. <span style={{ color: C.amber }}>Plus a second job.</span>
      </H1>
      <div style={{ display: "flex", gap: 80, marginTop: 70 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, width: 760 }}>
          {items.map((x, i) => (
            <div key={x.t} style={{ opacity: rows[i] * (1 - 0.55 * crash), transform: `translateX(${(1 - rows[i]) * -40}px)`, display: "flex", alignItems: "center", gap: 28, background: "rgba(15,22,29,.92)", border: `1px solid ${C.line}`, borderLeft: `5px solid ${x.c}`, borderRadius: 18, padding: "24px 30px" }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 36, color: x.c }}>{x.t}</span>
              <span style={{ fontFamily: INTER, fontWeight: 600, fontSize: 34, color: C.text }}>{x.d}</span>
            </div>
          ))}
        </div>
        <div style={{ width: 760, opacity: crash, transform: `scale(${0.95 + 0.05 * crash})` }}>
          <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: 2, color: C.red }}>THE ONE NIGHT HE DIDN'T CHECK</div>
          <svg width="740" height="300" style={{ marginTop: 18 }}>
            <line x1="0" y1="290" x2="740" y2="290" stroke={C.line} />
            <path d={`M0 90 L 160 80 L 300 95 L 380 85 L ${380 + 360 * fall} ${85 + 170 * fall}`} stroke={C.red} strokeWidth="6" fill="none" style={{ filter: "drop-shadow(0 0 12px rgba(248,113,113,.6))" }} />
            <text x="250" y="60" fill={C.muted} fontFamily={MONO} fontSize="20">pool risk ↑ overnight</text>
          </svg>
          <H1 p={lost} size={60} color={C.red} style={{ marginTop: 10 }}>By morning, part of it was gone.</H1>
        </div>
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 4. alternatives
const KeyIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.7 12.3 21 2M16 7l3 3M18.5 4.5l2 2" />
  </svg>
);

export const Alternatives: React.FC<P> = ({ v }) => {
  const { at } = useT();
  const L = useLine(v);
  const cards = [useIn(at(0.2)), useIn(at(1.0))];
  const req = useIn(L(0, 2.6));
  const q = useIn(L(1, 0.4));
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 140 }}>
      <Tint color={`rgba(248,113,113,${0.18 * q})`} at="50% 70%" />
      <div style={{ display: "flex", gap: 70 }}>
        {["Trading bot", "AI agent"].map((name, i) => (
          <div key={name} style={{ width: 520, opacity: cards[i], transform: `translateY(${(1 - cards[i]) * 40}px)`, background: "rgba(15,22,29,.94)", border: `2px solid ${req > 0.5 ? C.red : C.line}`, borderRadius: 26, padding: "34px 38px", boxShadow: req > 0.5 ? "0 0 60px rgba(248,113,113,.25)" : "none" }}>
            <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 52, color: C.text }}>{name}</div>
            <div style={{ fontFamily: INTER, fontSize: 28, color: C.muted, marginTop: 6 }}>{i ? "“I'll manage it for you.”" : "“Set it and forget it.”"}</div>
            <div style={{ marginTop: 30, opacity: req, display: "flex", alignItems: "center", gap: 16, background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.4)", borderRadius: 14, padding: "16px 20px" }}>
              <KeyIcon color={C.red} />
              <div>
                <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: 2, color: C.red }}>REQUESTS</div>
                <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 30, color: C.text }}>Your keys · full control</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <H1 p={q} size={84} color={C.red} style={{ marginTop: 80, textAlign: "center" }}>
        Wrong at 3 AM? <span style={{ color: C.text }}>Who stops it?</span>
      </H1>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 5. the wish
export const Wish: React.FC<P> = ({ v }) => {
  const { frame } = useT();
  const L = useLine(v);
  const a = useIn(L(0));
  const b = useIn(L(1));
  const c = useIn(L(2, 0.4));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 120 }}>
      <Tint color="rgba(80,100,200,.2)" at="50% 30%" />
      <div style={{ transform: `translateY(${Math.sin(frame / 40) * 6}px)`, marginBottom: 40 }}>
        <Moon size={130} glow={0.6 + 0.4 * c} />
      </div>
      <H1 p={a} size={78} style={{ textAlign: "center" }}>Tell your money what you want.</H1>
      <H1 p={b} size={78} color={C.amber} style={{ textAlign: "center", marginTop: 14 }}>And the limits it must never cross.</H1>
      <H1 p={c} size={64} color={C.muted} style={{ textAlign: "center", marginTop: 44 }}>Then sleep.</H1>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 6. KRIYA
export const Kriya: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const L = useLine(v);
  const badge = useIn(at(0.8));
  const l1 = useIn(L(1));
  const strike = spring({ frame: frame - L(1, 1.2), fps, config: { damping: 20 } });
  const l2 = useIn(L(1, 2.2));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 34, transform: `translateY(${-120 - 40 * l1}px) scale(${1 - 0.2 * l1})` }}>
        {"KRIYA".split("").map((ch, i) => {
          const p = spring({ frame: frame - at(0) - i * 4, fps, config: { damping: 13 } });
          return <span key={i} style={{ fontFamily: INTER, fontWeight: 800, fontSize: 210, color: C.text, opacity: p, transform: `translateY(${(1 - p) * 60}px)`, textShadow: "0 0 60px rgba(110,231,183,.4)" }}>{ch}</span>;
        })}
      </div>
      <div style={{ position: "absolute", top: 500, display: "flex", gap: 18, alignItems: "center", opacity: badge }}>
        <span style={{ fontFamily: INTER, fontSize: 34, color: C.muted, fontWeight: 500 }}>Autonomous Capital Protocol</span>
        <Tag color={C.monad}>● LIVE ON MONAD TESTNET</Tag>
      </div>
      <div style={{ position: "absolute", top: 610, textAlign: "center" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <H1 p={l1} size={64} color={C.muted}>Programming transactions</H1>
          <div style={{ position: "absolute", left: 0, top: "52%", height: 6, borderRadius: 4, background: C.red, width: `${strike * 100}%`, opacity: l1 }} />
        </div>
        <H1 p={l2} size={78} style={{ marginTop: 12, background: `linear-gradient(90deg, ${C.mint}, #9be8ff)`, WebkitBackgroundClip: "text", color: "transparent" }}>
          Programming objectives.
        </H1>
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 7. mandate
const LockIcon = () => (
  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={C.mint} strokeWidth="2" strokeLinecap="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export const Mandate: React.FC<P> = ({ v }) => {
  const { at } = useT();
  const L = useLine(v);
  const shot = useIn(at(0));
  const chips = [
    { c: C.mint, l: "OBJECTIVE", v: "Maximise yield", p: useIn(L(0)) },
    { c: C.amber, l: "MAX RISK", v: "never above 40", p: useIn(L(1)) },
    { c: C.purple, l: "MAX EXPOSURE", v: "40% in one place", p: useIn(L(2)) },
    { c: C.chainlink, l: "MIN RESERVE", v: "25% always", p: useIn(L(3)) },
  ];
  const lock = useIn(L(4));
  return (
    <AbsoluteFill style={{ padding: "120px 120px", flexDirection: "row", gap: 80, alignItems: "center" }}>
      <div style={{ opacity: shot, transform: `translateX(${(1 - shot) * -80}px)` }}>
        <Tag color={C.mint} style={{ marginBottom: 22 }}>ARJUN'S MANDATE</Tag>
        <Shot src="shots/dash.jpg" width={820} height={560} tilt={6} cams={[{ at: 0, focus: { x: 0, y: 40, w: 840, h: 560 } }, { at: at(1.0), focus: R.mandate, ring: R.mandate }]} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
        {chips.map((c) => (
          <Chip key={c.l} color={c.c} label={c.l} value={c.v} p={c.p} />
        ))}
        <div style={{ opacity: lock, transform: `scale(${0.9 + 0.1 * lock})`, transformOrigin: "left", display: "flex", gap: 16, alignItems: "center", marginTop: 12 }}>
          <LockIcon />
          <span style={{ fontFamily: INTER, fontWeight: 700, fontSize: 32, color: C.text }}>
            A smart contract on <span style={{ color: C.monad }}>Monad</span>. Not a promise.
          </span>
        </div>
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 8. the incident
const STEPS = [
  { n: "OBSERVE", who: "Chainlink CRE", c: C.chainlink },
  { n: "VERIFY", who: "Chainlink CRE", c: C.chainlink },
  { n: "DETECT", who: "KRIYA", c: C.mint },
  { n: "DECIDE", who: "KRIYA agent", c: C.claude },
  { n: "CONSTRAIN", who: "Policy engine", c: C.mint },
  { n: "EXECUTE", who: "CRE → Monad", c: C.monad },
];

export const Incident: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const L = useLine(v);
  const top = useIn(at(0));
  const spike = interpolate(frame, [L(1, 0.3), L(1, 2.2)], [34, 48], clamp);
  const sleep = useIn(L(2));
  const phaseB = frame >= L(3, -0.3);
  const lit = [useIn(L(3)), useIn(L(3, 1.2)), useIn(L(3, 2.2)), useIn(L(4)), useIn(L(5)), useIn(L(5, 1.0))];
  const proof = useIn(L(6, 0.2));
  const showProof = frame >= L(6, 0.2);
  const timer = interpolate(frame, [L(6, 0.6), L(6, 0.6) + fps * 1.4], [0, 5], clamp);
  const over = spike > 40;
  const pulse = over ? 0.5 + 0.5 * Math.sin(frame / 4) : 0;
  return (
    <AbsoluteFill style={{ padding: "90px 120px" }}>
      <Tint color={`rgba(${over && !phaseB ? "248,113,113" : "50,80,170"},.2)`} at="50% 40%" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: top }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <Clock time="3:12" size={84} color={C.muted} />
          <span style={{ fontFamily: MONO, fontSize: 26, color: C.muted }}>AM</span>
        </div>
        <div style={{ opacity: sleep, display: "flex", alignItems: "center", gap: 16 }}>
          <Moon size={54} glow={0.6} />
          <Tag color={C.amber} style={{ fontSize: 22, padding: "10px 18px" }}>ARJUN · FAST ASLEEP</Tag>
        </div>
      </div>
      {!phaseB ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 90 }}>
          <Tag color={C.amber}>STRATEGY B · VERIFIED RISK</Tag>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 210, color: over ? C.red : C.text, textShadow: over ? `0 0 ${40 + 40 * pulse}px rgba(248,113,113,.6)` : "none", marginTop: 20 }}>{Math.round(spike)}</div>
          <div style={{ position: "relative", width: 1100, height: 30, borderRadius: 99, background: "#141d26", marginTop: 20 }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(spike / 60) * 100}%`, borderRadius: 99, background: over ? C.red : C.amber }} />
            <div style={{ position: "absolute", left: `${(40 / 60) * 100}%`, top: -18, bottom: -18, width: 4, background: C.text }} />
            <div style={{ position: "absolute", left: `${(40 / 60) * 100}%`, top: -58, transform: "translateX(-50%)", fontFamily: MONO, fontSize: 24, color: C.text }}>his limit · 40</div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 60 }}>
          {!showProof && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, marginTop: 20 }}>
            {STEPS.map((x, i) => (
              <div key={x.n} style={{ background: "rgba(15,22,29,.94)", border: `2px solid ${lit[i] > 0.5 ? x.c : C.line}`, borderRadius: 22, padding: "30px 32px", opacity: 0.3 + 0.7 * lit[i], transform: `scale(${0.97 + 0.03 * lit[i]})`, boxShadow: lit[i] > 0.5 ? `0 0 40px ${x.c}44` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontWeight: 700, fontSize: 30, color: lit[i] > 0.5 ? x.c : C.muted }}>
                  <span>{i + 1} · {x.n}</span>
                  <span style={{ color: C.mint, opacity: lit[i] }}>✓</span>
                </div>
                <div style={{ marginTop: 18 }}>
                  <Tag color={x.c} style={{ fontSize: 18 }}>{x.who}</Tag>
                </div>
              </div>
            ))}
          </div>
          )}
          {!showProof && (() => {
            const DESC = ["Risk feed read by Chainlink CRE", "Signed risk report written onchain: B 34 → 48", "Mandate breached: 48 is above his limit of 40", "New allocation: A 40% · C 35% · reserve 25%", "Policy re-check passed: portfolio risk 14 / 40", "Executing on Monad…"];
            const cur = lit.reduce((n, p, i) => (p > 0.5 ? i : n), -1);
            if (cur < 0) return null;
            const p = lit[cur];
            return (
              <div key={cur} style={{ marginTop: 70, textAlign: "center", opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
                <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: 3, color: STEPS[cur].c }}>{`STEP ${cur + 1} · ${STEPS[cur].n}`}</div>
                <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 56, color: C.text, marginTop: 14 }}>{DESC[cur]}</div>
              </div>
            );
          })()}
          {showProof && (
          <div style={{ opacity: proof, transform: `scale(${0.95 + 0.05 * proof})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            <Shot src="shots/proof.jpg" width={1500} height={525} cams={[{ at: 0, focus: R.proof }]} />
            <div style={{ display: "flex", gap: 24, alignItems: "baseline" }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 96, color: C.mint, textShadow: "0 0 40px rgba(110,231,183,.5)" }}>{timer.toFixed(1)} s</span>
              <span style={{ fontFamily: INTER, fontSize: 32, color: C.muted }}>real run on Monad testnet · 16 blocks</span>
            </div>
          </div>
          )}
        </div>
      )}
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 9. guardrail
const ShieldIcon = () => (
  <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke={C.monad} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 18px rgba(131,110,249,.6))" }}>
    <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </svg>
);

export const Guard: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const L = useLine(v);
  const card = useIn(at(0));
  const hit = L(0, Math.max(1.2, (v.subs[0]?.end ?? 4) - (v.subs[0]?.start ?? 0) - 1.4));
  const travel = interpolate(frame, [at(0.3), hit], [0, 1], { ...clamp, easing: (x) => x * x });
  const bounce = spring({ frame: frame - hit, fps, config: { damping: 9 } });
  const hitOn = frame >= hit;
  const stamp = useIn(hit + 4, 10);
  const a1 = useIn(L(1));
  const a2 = useIn(L(1, 0.9));
  const cardX = hitOn ? 420 - 160 * bounce : -260 + 680 * travel;
  return (
    <AbsoluteFill style={{ padding: "110px 140px" }}>
      <div style={{ position: "relative", height: 470, marginTop: 30 }}>
        <div style={{ position: "absolute", left: cardX, top: 90, opacity: card, width: 520, background: "rgba(15,22,29,.95)", borderRadius: 24, border: `2px solid ${hitOn ? C.red : C.claude}`, padding: "28px 32px", boxShadow: hitOn ? "0 0 70px rgba(248,113,113,.35)" : "0 20px 60px rgba(0,0,0,.4)", transform: `rotate(${hitOn ? -4 * bounce : 0}deg)` }}>
          <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 2, color: C.claude }}>AI PROPOSAL</div>
          <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 52, color: C.text, marginTop: 10 }}>Strategy B · 60%</div>
          <div style={{ fontFamily: INTER, fontSize: 26, color: C.muted, marginTop: 6 }}>Arjun's cap: 40% per strategy</div>
        </div>
        <div style={{ position: "absolute", left: 980, top: 0, width: 520, height: 430, borderRadius: 28, border: `2px solid ${C.monad}`, background: "linear-gradient(180deg, rgba(131,110,249,.16), rgba(15,22,29,.95))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, boxShadow: hitOn ? `0 0 90px rgba(131,110,249,${0.5 * (1 - bounce) + 0.2})` : "none" }}>
          <ShieldIcon />
          <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 44, color: C.text }}>KRIYA contracts</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: C.muted }}>mandate check · on Monad</div>
        </div>
        <div style={{ position: "absolute", left: 330, top: 345, opacity: stamp, transform: `rotate(-8deg) scale(${1.6 - 0.6 * stamp})` }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 64, color: C.red, border: `5px solid ${C.red}`, borderRadius: 14, padding: "6px 22px", letterSpacing: 6, background: "rgba(7,11,15,.85)" }}>REVERTED</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40 }}>
        <div style={{ opacity: stamp, fontFamily: MONO, fontSize: 24, color: C.muted, lineHeight: 1.6 }}>
          <span style={{ color: C.red }}>ExposureExceeded</span>(B, 6000, 4000)
          <br />
          real revert on Monad testnet · tx 0xe8c1…9466
        </div>
        <div style={{ textAlign: "right" }}>
          <H1 p={a1} size={68} color={C.claude}>AI proposes.</H1>
          <H1 p={a2} size={68} color={C.mint}>Contracts enforce.</H1>
        </div>
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 10. morning
const Chai: React.FC = () => {
  const { frame } = useT();
  return (
    <svg width="120" height="120" viewBox="0 0 48 48" fill="none">
      {[14, 22, 30].map((x, i) => (
        <path key={x} d={`M${x} ${14 - Math.sin((frame + i * 12) / 14) * 2} q 3 -4 0 -8 q -3 -4 0 -8`} stroke="rgba(255,255,255,.35)" strokeWidth="1.6" strokeLinecap="round" />
      ))}
      <path d="M8 20h28v10a10 10 0 0 1-10 10h-8A10 10 0 0 1 8 30z" fill="#c2773b" stroke="#f0b27a" strokeWidth="1.5" />
      <path d="M36 23h3a4 4 0 0 1 0 8h-3" stroke="#f0b27a" strokeWidth="2" />
    </svg>
  );
};

export const Morning: React.FC<P> = ({ v }) => {
  const { at } = useT();
  const L = useLine(v);
  const head = useIn(at(0));
  const tags = [useIn(L(1)), useIn(L(1, 0.9)), useIn(L(1, 1.8)), useIn(L(1, 2.8))];
  return (
    <AbsoluteFill style={{ padding: "110px 120px", flexDirection: "row", gap: 70, alignItems: "center" }}>
      <Tint color="rgba(251,146,60,.2)" at="15% 20%" />
      <div style={{ width: 640, opacity: head }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Chai />
          <Clock time="7:30" size={110} color="#fde4c8" />
          <span style={{ fontFamily: MONO, fontSize: 28, color: C.muted }}>AM</span>
        </div>
        <H1 p={head} size={64} style={{ marginTop: 26 }}>
          Arjun slept. <span style={{ color: C.mint }}>His mandate held.</span>
        </H1>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 40 }}>
          {[["What changed", C.amber], ["What KRIYA did", C.mint], ["And why", C.claude], ["All onchain", C.monad]].map(([t, c], i) => (
            <div key={t} style={{ opacity: tags[i], transform: `translateX(${(1 - tags[i]) * -30}px)` }}>
              <Tag color={c} style={{ fontSize: 24, padding: "12px 20px" }}>✓ {t}</Tag>
            </div>
          ))}
        </div>
      </div>
      <Shot src="shots/dash.jpg" width={980} height={760} cams={[{ at: 0, focus: { x: 400, y: 60, w: 1200, h: 930 } }, { at: L(0, 1.2), focus: { x: 1195, y: 400, w: 400, h: 400 }, ring: R.exec }, { at: L(1, 1.6), focus: { x: 400, y: 330, w: 800, h: 400 }, ring: R.decision }]} />
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 11. who it's for
export const WhoFor: React.FC<P> = ({ v }) => {
  const L = useLine(v);
  const cards = [
    { t: "People like Arjun", d: "Savings that work, without the night shift.", c: C.mint, p: useIn(L(0)) },
    { t: "DAO treasuries", d: "Rules that still hold at 3 AM.", c: C.monad, p: useIn(L(1)) },
    { t: "Teams & funds", d: "Mandates enforced by code, not trust.", c: C.chainlink, p: useIn(L(2)) },
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
      <H1 p={cards[0].p} size={72}>Built for everyone like Arjun.</H1>
      <div style={{ display: "flex", gap: 36, marginTop: 80 }}>
        {cards.map((x) => (
          <div key={x.t} style={{ width: 500, opacity: x.p, transform: `translateY(${(1 - x.p) * 40}px)`, background: "rgba(15,22,29,.94)", border: `1px solid ${C.line}`, borderTop: `5px solid ${x.c}`, borderRadius: 24, padding: "38px 36px" }}>
            <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 44, color: x.c }}>{x.t}</div>
            <div style={{ fontFamily: INTER, fontSize: 30, color: C.text, marginTop: 14, lineHeight: 1.35 }}>{x.d}</div>
          </div>
        ))}
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 12. why monad
export const Monad: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const head = useIn(at(0));
  const stats = [
    { big: "400 ms", small: "blocks: risk is answered in seconds", c: C.monad },
    { big: "Low cost", small: "every allocation checked onchain", c: C.mint },
    { big: "Full EVM", small: "Solidity + Chainlink CRE, unchanged", c: C.chainlink },
  ];
  const sp = [useIn(at(0.5)), useIn(at(0.9)), useIn(at(1.3))];
  return (
    <AbsoluteFill style={{ padding: "130px 140px", alignItems: "center" }}>
      <Tag color={C.monad} style={{ opacity: head }}>WHY MONAD</Tag>
      <H1 p={head} size={72} style={{ marginTop: 24, textAlign: "center" }}>
        Fast blocks. <span style={{ color: C.monad }}>Cheap enforcement.</span>
      </H1>
      <div style={{ position: "relative", marginTop: 56, height: 70, overflow: "hidden", width: 1640, maskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)" }}>
        {Array.from({ length: 22 }).map((_, i) => {
          const x = ((((i * 80 - (frame * 80) / (0.4 * fps)) % 1760) + 1760) % 1760) - 80;
          return <div key={i} style={{ position: "absolute", left: x, top: 4, width: 62, height: 62, borderRadius: 12, border: `2px solid ${C.monad}`, background: "rgba(131,110,249,.12)" }} />;
        })}
      </div>
      <div style={{ display: "flex", gap: 34, marginTop: 50 }}>
        {stats.map((x, i) => (
          <div key={x.big} style={{ width: 500, opacity: sp[i], transform: `translateY(${(1 - sp[i]) * 30}px)`, background: "rgba(15,22,29,.92)", borderRadius: 24, border: `1px solid ${C.line}`, borderTop: `4px solid ${x.c}`, padding: "34px 34px" }}>
            <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 60, color: x.c }}>{x.big}</div>
            <div style={{ fontFamily: INTER, fontSize: 28, color: C.muted, marginTop: 8, lineHeight: 1.3 }}>{x.small}</div>
          </div>
        ))}
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 13. close
export const Close: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const L = useLine(v);
  const logo = useIn(at(0), 14);
  const tag = useIn(L(1));
  const links = useIn(L(2));
  const glow = 0.5 + 0.5 * Math.sin(frame / (fps * 0.6));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 80 }}>
      <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 190, letterSpacing: 40, color: C.text, opacity: logo, transform: `scale(${0.9 + 0.1 * logo})`, textShadow: `0 0 ${50 + 40 * glow}px rgba(110,231,183,.45)`, marginRight: -40 }}>KRIYA</div>
      <H1 p={tag} size={60} style={{ marginTop: 20, textAlign: "center" }}>
        Your capital, on autopilot. <span style={{ color: C.mint }}>Within your rules.</span>
      </H1>
      <div style={{ display: "flex", gap: 22, marginTop: 56, opacity: links, transform: `translateY(${(1 - links) * 20}px)` }}>
        <Tag color={C.mint} style={{ fontSize: 26, padding: "14px 26px", letterSpacing: 1 }}>kriya-monad.vercel.app</Tag>
        <Tag color={C.muted} style={{ fontSize: 26, padding: "14px 26px", letterSpacing: 1 }}>github.com/Saurabhnage/kriya</Tag>
      </div>
      <div style={{ display: "flex", gap: 40, marginTop: 56, opacity: links, fontFamily: MONO, fontSize: 22, letterSpacing: 2 }}>
        <span style={{ color: C.monad }}>BUILT ON MONAD</span>
        <span style={{ color: C.line }}>|</span>
        <span style={{ color: C.chainlink }}>POWERED BY CHAINLINK CRE</span>
        <span style={{ color: C.line }}>|</span>
        <span style={{ color: C.claude }}>DECISIONS BY CLAUDE</span>
      </div>
      <Subtitle subs={v.subs} />
    </AbsoluteFill>
  );
};
