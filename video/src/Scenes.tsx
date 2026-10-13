import React from "react";
import { AbsoluteFill, interpolate, spring, useVideoConfig } from "remotion";
import { C, Chip, INTER, MONO, Shot, Subtitle, Tag, useIn, useT } from "./ui";

type Sub = { start: number; end: number; text: string };
export type Voice = { id: string; duration: number; subs: Sub[] };
type P = { v: Voice };

const R = {
  mandate: { x: 16, y: 69, w: 383, h: 252 },
  loop: { x: 411, y: 69, w: 778, h: 263 },
  activity: { x: 1201, y: 69, w: 383, h: 852 },
  risk: { x: 1244, y: 707, w: 319, h: 48 },
  exec: { x: 1244, y: 510, w: 319, h: 63 },
  guard: { x: 1222, y: 416, w: 346, h: 82 },
  full: { x: 0, y: 0, w: 1600, h: 1000 },
  proof: { x: 0, y: 24, w: 1600, h: 560 },
};

const H1: React.FC<{ children: React.ReactNode; p: number; size?: number; color?: string; style?: React.CSSProperties }> = ({ children, p, size = 84, color = C.text, style }) => (
  <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: size, lineHeight: 1.08, letterSpacing: -2, color, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, filter: `blur(${(1 - p) * 6}px)`, ...style }}>{children}</div>
);

// ---------------------------------------------------------------- 1. hook
export const Hook: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const s = v.subs;
  const title = useIn(at(0));
  const chips = [s[1], s[2], s[3]].map((x) => x?.start ?? 99);
  const items = [
    { c: C.amber, l: "RISK ALERT", v: "Strategy B risk is rising — check it" },
    { c: C.chainlink, l: "WALLET", v: "3 transactions waiting for signature" },
    { c: C.purple, l: "03:12 AM", v: "Did anything break overnight?" },
  ];
  const mins = Math.floor(frame / fps);
  return (
    <AbsoluteFill style={{ padding: "150px 160px", flexDirection: "row", gap: 90 }}>
      <div style={{ flex: 1.1, paddingTop: 70 }}>
        <Tag color={C.mint} style={{ opacity: title }}>DEFI TODAY</Tag>
        <H1 p={title} size={88} style={{ marginTop: 34 }}>
          Your money is onchain.
          <br />
          <span style={{ color: C.muted }}>Your attention is</span> <span style={{ color: C.amber }}>stuck there too.</span>
        </H1>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 26, paddingTop: 40 }}>
        <div style={{ fontFamily: MONO, fontSize: 22, color: C.muted, opacity: useIn(at(1)), textAlign: "right" }}>
          03:{String(10 + (mins % 50)).padStart(2, "0")} AM · notifications
        </div>
        {items.map((it, i) => (
          <NotifCard key={i} p={useIn(at(chips[i]), 15)} {...it} />
        ))}
      </div>
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};

const NotifCard: React.FC<{ p: number; c: string; l: string; v: string }> = ({ p, c, l, v }) => (
  <div style={{ opacity: p, transform: `translateY(${(1 - p) * -30}px) scale(${0.94 + 0.06 * p})`, background: "rgba(18,26,34,.95)", border: `1px solid ${C.line}`, borderRadius: 22, padding: "24px 28px", display: "flex", gap: 22, alignItems: "center", boxShadow: "0 24px 60px rgba(0,0,0,.45)" }}>
    <div style={{ width: 54, height: 54, borderRadius: 14, background: `${c}26`, border: `1px solid ${c}66`, display: "grid", placeItems: "center" }}>
      <div style={{ width: 16, height: 16, borderRadius: 99, background: c, boxShadow: `0 0 18px ${c}` }} />
    </div>
    <div>
      <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: 2, color: c }}>{l}</div>
      <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 30, color: C.text, marginTop: 4 }}>{v}</div>
    </div>
  </div>
);

// ---------------------------------------------------------------- 2. problem
export const Problem: React.FC<P> = ({ v }) => {
  const { at, frame } = useT();
  const s = v.subs;
  const a = useIn(at(0));
  const danger = useIn(at(s[1]?.start ?? 3), 12);
  const keyX = interpolate(a, [0, 1], [-260, 0]);
  const shake = danger > 0.05 && danger < 0.98 ? Math.sin(frame * 2.4) * 6 * (1 - danger) : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `radial-gradient(circle at 50% 45%, rgba(248,113,113,${0.16 * danger}), transparent 60%)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 70, transform: `translateY(-60px) translateX(${shake}px)` }}>
        <div style={{ transform: `translateX(${keyX}px)`, opacity: a, textAlign: "center" }}>
          <KeyIcon />
          <div style={{ fontFamily: MONO, color: C.muted, fontSize: 22, marginTop: 12 }}>YOUR PRIVATE KEY</div>
        </div>
        <svg width="220" height="40" style={{ opacity: a }}>
          <line x1="0" y1="20" x2={200 * a} y2="20" stroke={danger > 0.5 ? C.red : C.muted} strokeWidth="4" strokeDasharray="12 10" />
          <polygon points="200,8 220,20 200,32" fill={danger > 0.5 ? C.red : C.muted} />
        </svg>
        <div style={{ opacity: a, width: 330, height: 260, borderRadius: 28, border: `2px solid ${danger > 0.5 ? C.red : C.line}`, background: "rgba(15,22,29,.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, boxShadow: danger > 0.5 ? `0 0 80px rgba(248,113,113,.35)` : "none" }}>
          <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 52, color: C.text }}>AI agent</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: danger > 0.5 ? C.red : C.muted }}>{danger > 0.5 ? "FULL WALLET ACCESS" : "autonomous"}</div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 210, textAlign: "center" }}>
        <H1 p={danger} size={64} color={C.red}>One bad output = funds gone.</H1>
      </div>
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};

const KeyIcon = () => (
  <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 22px rgba(251,191,36,.45))" }}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.7 12.3 21 2M16 7l3 3M18.5 4.5l2 2" />
  </svg>
);

// ---------------------------------------------------------------- 3. intro
export const Intro: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const s = v.subs;
  const letters = "KRIYA".split("");
  const badge = useIn(at(s[1]?.start ?? 1.5));
  const l1 = useIn(at(s[2]?.start ?? 5));
  const strike = spring({ frame: frame - at((s[2]?.start ?? 5) + 1.0), fps, config: { damping: 20 } });
  const l2 = useIn(at(s[3]?.start ?? 7.5));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 34, transform: `translateY(${-110 - 60 * l1}px) scale(${1 - 0.25 * l1})` }}>
        {letters.map((ch, i) => {
          const p = spring({ frame: frame - at(0) - i * 4, fps, config: { damping: 13 } });
          return (
            <span key={i} style={{ fontFamily: INTER, fontWeight: 800, fontSize: 210, color: C.text, opacity: p, transform: `translateY(${(1 - p) * 60}px)`, textShadow: "0 0 60px rgba(110,231,183,.35)" }}>{ch}</span>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 520 - 20 * l1, display: "flex", gap: 18, alignItems: "center", opacity: badge }}>
        <span style={{ fontFamily: INTER, fontSize: 34, color: C.muted, fontWeight: 500 }}>Autonomous Capital Protocol</span>
        <Tag color={C.monad}>● LIVE ON MONAD TESTNET</Tag>
      </div>
      <div style={{ position: "absolute", top: 625, textAlign: "center" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <H1 p={l1} size={72} color={C.muted}>Stop programming transactions.</H1>
          <div style={{ position: "absolute", left: 0, top: "52%", height: 6, borderRadius: 4, background: C.red, width: `${strike * 100}%`, opacity: l1 }} />
        </div>
        <H1 p={l2} size={80} style={{ marginTop: 16, background: `linear-gradient(90deg, ${C.mint}, #9be8ff)`, WebkitBackgroundClip: "text", color: "transparent" }}>
          Start programming financial objectives.
        </H1>
      </div>
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 4. mandate
export const Mandate: React.FC<P> = ({ v }) => {
  const { at } = useT();
  const s = v.subs;
  const shot = useIn(at(0));
  const st = (i: number, d: number) => at(s[i]?.start ?? d);
  const chips = [
    { c: C.mint, l: "OBJECTIVE", v: "Maximise risk-adjusted yield", at: st(0, 0) + 30 },
    { c: C.amber, l: "MAX RISK", v: "40 / 100", at: st(1, 6) },
    { c: C.purple, l: "MAX EXPOSURE", v: "40% per strategy", at: st(2, 8) },
    { c: C.chainlink, l: "MIN RESERVE", v: "25% in USDC", at: st(3, 10) },
  ];
  const lock = useIn(st(4, 12));
  return (
    <AbsoluteFill style={{ padding: "120px 120px", flexDirection: "row", gap: 80, alignItems: "center" }}>
      <div style={{ opacity: shot, transform: `translateX(${(1 - shot) * -80}px)` }}>
        <Shot src="shots/dash.jpg" width={820} height={560} tilt={6} cams={[{ at: 0, focus: { x: 0, y: 40, w: 840, h: 560 } }, { at: at(1.2), focus: R.mandate, ring: R.mandate }]} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, marginTop: -40 }}>
        <Tag color={C.mint} style={{ alignSelf: "flex-start", opacity: shot }}>YOUR MANDATE</Tag>
        {chips.map((c, i) => (
          <Chip key={i} color={c.c} label={c.l} value={c.v} p={useIn(c.at)} />
        ))}
        <div style={{ opacity: lock, transform: `scale(${0.9 + 0.1 * lock})`, transformOrigin: "left", display: "flex", gap: 16, alignItems: "center", marginTop: 12 }}>
          <LockIcon />
          <span style={{ fontFamily: INTER, fontWeight: 700, fontSize: 32, color: C.text }}>
            Enforced by a smart contract <span style={{ color: C.monad }}>on Monad</span>
          </span>
        </div>
      </div>
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};

const LockIcon = () => (
  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={C.mint} strokeWidth="2" strokeLinecap="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

// ---------------------------------------------------------------- 5. loop
const STEPS = [
  { n: "OBSERVE", d: "External risk feed", who: "Chainlink CRE", c: C.chainlink },
  { n: "VERIFY", d: "Signed report onchain", who: "Chainlink CRE", c: C.chainlink },
  { n: "DETECT", d: "Mandate at risk?", who: "KRIYA", c: C.mint },
  { n: "DECIDE", d: "New allocation", who: "Claude", c: C.claude },
  { n: "CONSTRAIN", d: "Policy re-check", who: "Policy engine", c: C.mint },
  { n: "EXECUTE", d: "Funds move", who: "CRE → Monad", c: C.monad },
];

export const Loop: React.FC<P> = ({ v }) => {
  const { at, frame } = useT();
  const s = v.subs;
  const st = (i: number, d: number) => at(s[i]?.start ?? d);
  const lit = [st(1, 2), st(1, 2) + 40, st(1, 2) + 80, st(2, 8), st(3, 11), st(4, 14)];
  const allOn = useIn(st(5, 17));
  const head = useIn(at(0));
  return (
    <AbsoluteFill style={{ padding: "110px 110px", alignItems: "center" }}>
      <Tag color={C.mint} style={{ opacity: head }}>THE AUTONOMOUS LOOP</Tag>
      <H1 p={head} size={64} style={{ marginTop: 22, textAlign: "center" }}>
        Then KRIYA takes over.
      </H1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 30, marginTop: 64, width: 1560 }}>
        {STEPS.map((x, i) => {
          const p = useIn(lit[i], 14);
          const pulse = allOn > 0.5 ? 0.5 + 0.5 * Math.sin((frame - i * 6) / 6) : 0;
          return (
            <div key={x.n} style={{ position: "relative", background: "rgba(15,22,29,.92)", borderRadius: 22, padding: "28px 32px", border: `2px solid ${p > 0.5 ? x.c : C.line}`, boxShadow: p > 0.5 ? `0 0 ${30 + 30 * pulse}px ${x.c}44` : "none", opacity: 0.35 + 0.65 * p, transform: `scale(${0.97 + 0.03 * p})` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: p > 0.5 ? x.c : C.muted }}>
                  {i + 1} · {x.n}
                </span>
                <span style={{ fontFamily: INTER, fontSize: 30, color: C.mint, opacity: p }}>✓</span>
              </div>
              <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 32, color: C.text, marginTop: 14 }}>{x.d}</div>
              <div style={{ marginTop: 16 }}>
                <Tag color={x.c} style={{ fontSize: 16 }}>{x.who}</Tag>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 44, opacity: allOn, transform: `translateY(${(1 - allOn) * 20}px)` }}>
        <Tag color={C.mint} style={{ fontSize: 22, padding: "12px 22px" }}>0 CLICKS · END TO END</Tag>
      </div>
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 6. proof
export const Proof: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const s = v.subs;
  const half = at(v.duration * 0.48);
  const showProof = frame >= half;
  const p = useIn(at(0));
  const p2 = useIn(half);
  const timer = interpolate(frame, [half + 10, half + 10 + fps * 1.2], [0, 5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 170 }}>
      {!showProof ? (
        <div style={{ opacity: p, display: "flex", gap: 60, alignItems: "center" }}>
          <Shot src="shots/dash.jpg" width={760} height={640} cams={[{ at: 0, focus: R.activity }, { at: at(0.6), focus: { x: 1210, y: 470, w: 380, h: 300 }, ring: R.risk }, { at: at(3.2), focus: { x: 1210, y: 440, w: 380, h: 330 }, ring: R.exec }]} />
          <div style={{ width: 620 }}>
            <Tag color={C.amber}>REAL RUN · MONAD TESTNET</Tag>
            <H1 p={p} size={96} style={{ marginTop: 26 }}>
              Risk <span style={{ color: C.muted }}>34</span> → <span style={{ color: C.red }}>48</span>
            </H1>
            <div style={{ fontFamily: INTER, fontSize: 34, color: C.muted, marginTop: 18 }}>Above the mandate's limit of 40.</div>
          </div>
        </div>
      ) : (
        <div style={{ opacity: p2, transform: `scale(${0.96 + 0.04 * p2})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
          <Shot src="shots/proof.jpg" width={1640} height={574} cams={[{ at: 0, focus: R.proof }]} />
          <div style={{ display: "flex", gap: 26, alignItems: "baseline" }}>
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 120, color: C.mint, textShadow: "0 0 40px rgba(110,231,183,.5)" }}>{timer.toFixed(1)} s</span>
            <span style={{ fontFamily: INTER, fontSize: 36, color: C.muted }}>from verified risk to rebalance · 16 blocks</span>
          </div>
        </div>
      )}
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 7. guardrail
export const Guard: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const s = v.subs;
  const st = (i: number, d: number) => at(s[i]?.start ?? d);
  const card = useIn(at(0));
  const hit = st(1, 3);
  const travel = interpolate(frame, [at(0.3), hit], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (x) => x * x });
  const bounce = spring({ frame: frame - hit, fps, config: { damping: 9 } });
  const hitOn = frame >= hit;
  const stamp = useIn(hit + 4, 10);
  const tx = useIn(st(2, 6));
  const a1 = useIn(st(3, 9));
  const a2 = useIn(st(4, 11));
  const cardX = hitOn ? 420 - 160 * bounce : -260 + 680 * travel;
  return (
    <AbsoluteFill style={{ padding: "120px 140px" }}>
      <div style={{ position: "relative", height: 470, marginTop: 30 }}>
        <div style={{ position: "absolute", left: cardX, top: 90, opacity: card, width: 520, background: "rgba(15,22,29,.95)", borderRadius: 24, border: `2px solid ${hitOn ? C.red : C.claude}`, padding: "28px 32px", boxShadow: hitOn ? "0 0 70px rgba(248,113,113,.35)" : "0 20px 60px rgba(0,0,0,.4)", transform: `rotate(${hitOn ? -4 * bounce : 0}deg)` }}>
          <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 2, color: C.claude }}>AI PROPOSAL</div>
          <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 52, color: C.text, marginTop: 10 }}>Strategy B · 60%</div>
          <div style={{ fontFamily: INTER, fontSize: 26, color: C.muted, marginTop: 6 }}>mandate cap: 40% per strategy</div>
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
        <div style={{ opacity: tx, fontFamily: MONO, fontSize: 24, color: C.muted, lineHeight: 1.6 }}>
          <span style={{ color: C.red }}>ExposureExceeded</span>(B, 6000, 4000)
          <br />
          real revert on Monad testnet · tx 0xe8c1…9466
        </div>
        <div style={{ textAlign: "right" }}>
          <H1 p={a1} size={68} color={C.claude}>AI proposes.</H1>
          <H1 p={a2} size={68} color={C.mint}>Contracts enforce.</H1>
        </div>
      </div>
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};

const ShieldIcon = () => (
  <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke={C.monad} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 18px rgba(131,110,249,.6))" }}>
    <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </svg>
);

// ---------------------------------------------------------------- 8. why monad
export const Monad: React.FC<P> = ({ v }) => {
  const { at, frame } = useT();
  const { fps } = useVideoConfig();
  const s = v.subs;
  const head = useIn(at(0));
  const stats = [
    { big: "400 ms", small: "block times", c: C.monad },
    { big: "Low cost", small: "so every allocation is checked onchain", c: C.mint },
    { big: "Full EVM", small: "same Solidity, same Chainlink CRE workflow", c: C.chainlink },
  ];
  return (
    <AbsoluteFill style={{ padding: "120px 140px", alignItems: "center" }}>
      <Tag color={C.monad} style={{ opacity: head }}>WHY MONAD</Tag>
      <H1 p={head} size={72} style={{ marginTop: 24, textAlign: "center" }}>
        Fast blocks. <span style={{ color: C.monad }}>Cheap enforcement.</span>
      </H1>
      <div style={{ position: "relative", marginTop: 56, height: 70, overflow: "hidden", width: 1640, maskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)" }}>
        {Array.from({ length: 22 }).map((_, i) => {
          const x = ((i * 80 - (frame * 80) / (0.4 * fps)) % 1760 + 1760) % 1760 - 80;
          return <div key={i} style={{ position: "absolute", left: x, top: 4, width: 62, height: 62, borderRadius: 12, border: `2px solid ${C.monad}`, background: "rgba(131,110,249,.12)", opacity: 0.85 }} />;
        })}
      </div>
      <div style={{ display: "flex", gap: 34, marginTop: 50 }}>
        {stats.map((x, i) => {
          const p = useIn(at(0.6) + i * 14);
          return (
            <div key={i} style={{ width: 500, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, background: "rgba(15,22,29,.92)", borderRadius: 24, border: `1px solid ${C.line}`, borderTop: `4px solid ${x.c}`, padding: "34px 34px" }}>
              <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 60, color: x.c }}>{x.big}</div>
              <div style={{ fontFamily: INTER, fontSize: 28, color: C.muted, marginTop: 8, lineHeight: 1.3 }}>{x.small}</div>
            </div>
          );
        })}
      </div>
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 9. close
export const Close: React.FC<P> = ({ v }) => {
  const { at, frame, fps } = useT();
  const s = v.subs;
  const logo = useIn(at(0), 14);
  const tag = useIn(at(s[1]?.start ?? 1.5));
  const links = useIn(at(s[2]?.start ?? 5));
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
      <Subtitle subs={s} />
    </AbsoluteFill>
  );
};
