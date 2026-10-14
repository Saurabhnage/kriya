import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Background, LEAD } from "./ui";
import { Alternatives, Backstory, Close, Guard, Impact, Incident, Kriya, Mandate, Monad, Morning, Night, SecondJob, WhoFor, Wish, type Voice } from "./Story";
import voice from "./voice.json";

export const FPS = 30;
const TAIL = 0.5;
const XF = 14; // transition frames
const SCENES = { night: Night, backstory: Backstory, secondjob: SecondJob, alternatives: Alternatives, wish: Wish, kriya: Kriya, mandate: Mandate, incident: Incident, impact: Impact, guard: Guard, morning: Morning, whofor: WhoFor, monad: Monad, close: Close } as const;
const V = voice as Voice[];
const extra: Record<string, number> = { night: 0.3, wish: 0.7, kriya: 0.4, incident: 0.9, impact: 0.6, close: 1.6 };
export const sceneFrames = (v: Voice) => Math.ceil((LEAD + v.duration + TAIL + (extra[v.id] ?? 0)) * FPS);
export const TOTAL = V.reduce((n, v) => n + sceneFrames(v), 0) - XF * (V.length - 1);

const Music: React.FC = () => {
  const f = useCurrentFrame();
  const vol = interpolate(f, [0, 45, TOTAL - 75, TOTAL], [0, 0.32, 0.32, 0], { extrapolateRight: "clamp" });
  return <Audio src={staticFile("music/pad.mp3")} volume={vol} />;
};

const startOf = (id: string) => {
  let f = 0;
  for (const v of V) {
    if (v.id === id) return f;
    f += sceneFrames(v) - XF;
  }
  return 0;
};

const Fx: React.FC<{ src: string; at: number; volume?: number }> = ({ src, at, volume = 1 }) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={100} layout="none">
    <Audio src={staticFile(`sfx/${src}.wav`)} volume={volume} />
  </Sequence>
);

export const KriyaProduct: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Music />
    <Fx src="riser" at={startOf("kriya") + LEAD * FPS - 2.6 * FPS} volume={0.55} />
    <Fx src="hit" at={startOf("kriya") + LEAD * FPS} volume={0.75} />
    <TransitionSeries>
      {V.flatMap((v, i) => {
        const Scene = SCENES[v.id as keyof typeof SCENES];
        const nodes = [
          <TransitionSeries.Sequence key={v.id} durationInFrames={sceneFrames(v)}>
            <Scene v={v} />
            <Sequence from={Math.round(LEAD * FPS)}>
              <Audio src={staticFile(`vo/${v.id}.wav`)} volume={1} />
            </Sequence>
          </TransitionSeries.Sequence>,
        ];
        if (i < V.length - 1)
          nodes.push(
            <TransitionSeries.Transition
              key={`${v.id}-t`}
              presentation={i % 4 === 2 ? slide({ direction: "from-right" }) : fade()}
              timing={linearTiming({ durationInFrames: XF })}
            />,
          );
        return nodes;
      })}
    </TransitionSeries>
  </AbsoluteFill>
);
