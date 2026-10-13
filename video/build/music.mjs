// Synthesizes a royalty-free ambient pad (Am - F - C - G) with ffmpeg.
import { execFileSync } from "node:child_process";
const chords = [[110, 220, 261.63, 329.63], [87.31, 174.61, 220, 261.63], [130.81, 261.63, 329.63, 392], [98, 196, 246.94, 293.66]];
const seg = 8.5;
const parts = [];
chords.forEach((c, i) => {
  const voices = c.map((f, k) => {
    const a = k === 0 ? 0.16 : 0.1;
    return `${a}*sin(2*PI*${f}*t)+${a * 0.6}*sin(2*PI*${(f * 1.004).toFixed(3)}*t)+${a * 0.25}*sin(2*PI*${f * 2}*t)`;
  }).join("+");
  const file = `build/chord${i}.wav`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='(${voices})*(0.85+0.15*sin(2*PI*0.25*t))':s=44100:d=${seg}`, "-af", "afade=t=in:d=2.2,afade=t=out:st=" + (seg - 2.2) + ":d=2.2,lowpass=f=1800", file]);
  parts.push(file);
});
// crossfade the 4 chords into one 30s phrase, then loop and add space
const inputs = parts.flatMap((p) => ["-i", p]);
const xf = "[0][1]acrossfade=d=1.5[a];[a][2]acrossfade=d=1.5[b];[b][3]acrossfade=d=1.5[c]";
execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", xf, "-map", "[c]", "build/phrase.wav"]);
execFileSync("ffmpeg", ["-v", "error", "-y", "-stream_loop", "5", "-i", "build/phrase.wav", "-af", "aecho=0.8:0.7:120|260:0.35|0.22,volume=0.9,afade=t=in:d=3,atrim=0:150,afade=t=out:st=144:d=6,loudnorm=I=-24", "-ar", "44100", "public/music/pad.mp3"]);
console.log("ok");
