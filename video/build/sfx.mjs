// Synthesized sound design (royalty-free): clock tick, low impact hit, riser.
import { execFileSync } from "node:child_process";
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
// tick: a 6 ms filtered click with a tiny body
ff("-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*exp(-t*900)+0.4*sin(2*PI*2400*t)*exp(-t*500)':s=44100:d=0.08", "-af", "highpass=f=1500,volume=0.8", "public/sfx/tick.wav");
// hit: sub drop 70→32 Hz + soft noise thump + short tail
ff("-f", "lavfi", "-i", "aevalsrc='0.9*sin(2*PI*(70*t-19*t*t))*exp(-t*2.2)+0.35*(random(0)*2-1)*exp(-t*18)':s=44100:d=2.2",
   "-af", "lowpass=f=900,aecho=0.8:0.6:90|170:0.25|0.12,afade=t=out:st=1.6:d=0.6,loudnorm=I=-14:TP=-1", "public/sfx/hit.wav");
// riser: noise swept up through a resonant band, swelling, cut at the end
ff("-f", "lavfi", "-i", "aevalsrc='(random(0)*2-1)*pow(t/2.6,2)+0.25*sin(2*PI*(110*t+60*t*t))*pow(t/2.6,2)':s=44100:d=2.6",
   "-af", "highpass=f=200,lowpass=f=6000,afade=t=in:d=1.2,loudnorm=I=-20:TP=-2", "public/sfx/riser.wav");
console.log("ok");
