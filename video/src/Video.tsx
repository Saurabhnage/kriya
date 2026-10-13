import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Background, LEAD } from "./ui";
import { Alternatives, Backstory, Close, Guard, Incident, Kriya, Mandate, Monad, Morning, Night, SecondJob, WhoFor, Wish, type Voice } from "./Story";
import voice from "./voice.json";

export const FPS = 30;
const TAIL = 0.75;
const XF = 14; // transition frames
const SCENES = { night: Night, backstory: Backstory, secondjob: SecondJob, alternatives: Alternatives, wish: Wish, kriya: Kriya, mandate: Mandate, incident: Incident, guard: Guard, morning: Morning, whofor: WhoFor, monad: Monad, close: Close } as const;
const V = voice as Voice[];
const extra: Record<string, number> = { night: 0.4, wish: 0.5, kriya: 0.5, incident: 1.2, close: 2.6 };
export const sceneFrames = (v: Voice) => Math.ceil((LEAD + v.duration + TAIL + (extra[v.id] ?? 0)) * FPS);
export const TOTAL = V.reduce((n, v) => n + sceneFrames(v), 0) - XF * (V.length - 1);

const Music: React.FC = () => {
  const f = useCurrentFrame();
  const vol = interpolate(f, [0, 45, TOTAL - 75, TOTAL], [0, 0.32, 0.32, 0], { extrapolateRight: "clamp" });
  return <Audio src={staticFile("music/pad.mp3")} volume={vol} />;
};

export const KriyaProduct: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Music />
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
