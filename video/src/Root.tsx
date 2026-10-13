import React from "react";
import { Composition } from "remotion";
import { FPS, KriyaProduct, TOTAL } from "./Video";

export const Root: React.FC = () => (
  <Composition id="KriyaProduct" component={KriyaProduct} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
