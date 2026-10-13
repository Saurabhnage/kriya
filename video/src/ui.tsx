import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: INTER } = loadInter("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] });

export const C = {
  bg: "#070b0f",
  panel: "#0f161d",
  line: "#22303c",
  text: "#e8eef3",
  muted: "#8b98a5",
  mint: "#6ee7b7",
  purple: "#c084fc",
  monad: "#836ef9",
  chainlink: "#5a7cf0",
  claude: "#e08a63",
  red: "#f87171",
  amber: "#fbbf24",
};

export const LEAD = 0.35; // seconds of silence before each scene's voice line

/** Seconds → frame, relative to the scene start, accounting for the voice lead-in. */
export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps, t: frame / fps - LEAD, at: (s: number) => Math.round((s + LEAD) * fps) };
};

/** 0 → 1 spring that starts at `startFrame`. */
export const useIn = (startFrame: number, damping = 18) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - startFrame, fps, config: { damping, mass: 0.7 } });
};

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = (p: number, a: number) => Math.sin(frame / p) * a;
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1100, height: 1100, borderRadius: "50%", left: -300 + drift(90, 60), top: -420 + drift(120, 40), background: "radial-gradient(circle, rgba(110,231,183,.16), transparent 62%)" }} />
      <div style={{ position: "absolute", width: 1200, height: 1200, borderRadius: "50%", right: -420 + drift(110, 50), bottom: -560 + drift(80, 50), background: "radial-gradient(circle, rgba(131,110,249,.18), transparent 62%)" }} />
      <AbsoluteFill
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          backgroundPosition: `${(frame * 0.4) % 64}px ${(frame * 0.25) % 64}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 78%)",
        }}
      />
    </AbsoluteFill>
  );
};

export const Subtitle: React.FC<{ subs: { start: number; end: number; text: string }[] }> = ({ subs }) => {
  const { t } = useT();
  const cur = subs.find((s, i) => t >= s.start - 0.05 && t < (subs[i + 1]?.start ?? s.end + 0.6));
  if (!cur) return null;
  const k = Math.min(1, (t - cur.start + 0.05) / 0.18);
  return (
    <div style={{ position: "absolute", bottom: 54, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ opacity: k, transform: `translateY(${(1 - k) * 8}px)`, maxWidth: 1400, textAlign: "center", fontFamily: INTER, fontWeight: 500, fontSize: 34, lineHeight: 1.35, color: "#f4f7f9", background: "rgba(5,8,11,.72)", border: "1px solid rgba(255,255,255,.08)", padding: "12px 28px", borderRadius: 14, backdropFilter: "blur(6px)" }}>
        {cur.text}
      </div>
    </div>
  );
};

export const Chip: React.FC<{ color: string; label: string; value?: string; p: number; style?: React.CSSProperties }> = ({ color, label, value, p, style }) => (
  <div
    style={{
      opacity: p,
      transform: `translateX(${(1 - p) * 40}px) scale(${0.96 + 0.04 * p})`,
      display: "flex",
      alignItems: "center",
      gap: 18,
      background: "rgba(15,22,29,.92)",
      border: `1px solid ${C.line}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 16,
      padding: "20px 26px",
      boxShadow: "0 18px 50px rgba(0,0,0,.35)",
      ...style,
    }}
  >
    <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 2, color: C.muted, minWidth: 0 }}>{label}</div>
    {value && <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 34, color: C.text, marginLeft: "auto" }}>{value}</div>}
  </div>
);

export const Tag: React.FC<{ color: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ color, children, style }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontFamily: MONO, fontWeight: 700, fontSize: 18, letterSpacing: 2, color, background: `${color}1f`, border: `1px solid ${color}55`, padding: "8px 14px", borderRadius: 999, ...style }}>
    {children}
  </span>
);

type Rect = { x: number; y: number; w: number; h: number };
export type Cam = { at: number; focus: Rect; ring?: Rect | null };

/**
 * A product screenshot (captured at 1600x1000 CSS px, 2x DPR) in a framed window,
 * with a camera that eases between focus rectangles and an optional highlight ring.
 */
export const Shot: React.FC<{ src: string; cams: Cam[]; width: number; height: number; tilt?: number }> = ({ src, cams, width, height, tilt = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let i = 0;
  while (i + 1 < cams.length && frame >= cams[i + 1].at) i++;
  const target = cams[i];
  const prev = cams[i - 1] ?? target;
  const k = i === 0 ? 1 : spring({ frame: frame - target.at, fps, config: { damping: 22, mass: 0.9 } });
  const lerp = (a: number, b: number) => a + (b - a) * k;
  const f = { x: lerp(prev.focus.x, target.focus.x), y: lerp(prev.focus.y, target.focus.y), w: lerp(prev.focus.w, target.focus.w), h: lerp(prev.focus.h, target.focus.h) };
  const scale = Math.min(width / f.w, height / f.h);
  const tx = width / 2 - (f.x + f.w / 2) * scale;
  const ty = height / 2 - (f.y + f.h / 2) * scale;
  const ring = cams[i].ring;
  const ringP = ring ? spring({ frame: frame - cams[i].at - 8, fps, config: { damping: 14 } }) : 0;
  return (
    <div style={{ width, height, borderRadius: 22, overflow: "hidden", border: `1px solid ${C.line}`, boxShadow: "0 40px 120px rgba(0,0,0,.55), 0 0 0 1px rgba(110,231,183,.08)", position: "relative", transform: `perspective(2200px) rotateY(${tilt}deg)`, background: "#0a0e12" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1600, height: 1000, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <Img src={staticFile(src)} style={{ width: 1600, height: 1000, display: "block" }} />
        {ring && (
          <div style={{ position: "absolute", left: ring.x - 6, top: ring.y - 6, width: ring.w + 12, height: ring.h + 12, borderRadius: 12, border: `${2.5 / Math.max(scale, 0.5)}px solid ${C.mint}`, boxShadow: `0 0 ${24 / scale}px rgba(110,231,183,.55)`, opacity: ringP, transform: `scale(${1.04 - 0.04 * ringP})` }} />
        )}
      </div>
    </div>
  );
};

export const fadeOut = (frame: number, total: number, len = 10) => interpolate(frame, [total - len, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
