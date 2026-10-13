# Voiceover: Microsoft Edge neural TTS, Indian English (default en-IN-PrabhatNeural).
# Each sentence is synthesized on its own with its own pace/pitch, trimmed, then joined with natural pauses,
# and the scene track gets a light "recorded mic" chain (warmth, presence, gentle compression, a hint of room).
# Writes public/vo/<scene>.wav and src/voice.json (per-sentence timings → subtitles and animation beats).
# usage: python tts.py [voice]
import asyncio, json, os, subprocess, sys
import edge_tts

voice = sys.argv[1] if len(sys.argv) > 1 else "en-IN-PrabhatNeural"
scenes = json.load(open("narration.json", encoding="utf-8"))
os.makedirs("build/lines", exist_ok=True)
os.makedirs("public/vo", exist_ok=True)
SR = 24000
TRIM = "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse"
MIC = ",".join([
    "highpass=f=75",
    "equalizer=f=160:t=q:w=1.1:g=2.2",   # chest / warmth
    "equalizer=f=3200:t=q:w=1.4:g=1.6",  # presence
    "equalizer=f=7600:t=q:w=2:g=-2.5",   # tame synthetic sibilance
    "acompressor=threshold=-21dB:ratio=2.4:attack=6:release=140:makeup=2",
    "aecho=0.88:0.5:23|41:0.07|0.04",    # small room
])


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())


async def main():
    out = []
    for sc in scenes:
        parts, subs, t = [], [], 0.0
        for i, ln in enumerate(sc["lines"]):
            raw = f"build/lines/{sc['id']}-{i}.mp3"
            wav = f"build/lines/{sc['id']}-{i}.wav"
            await edge_tts.Communicate(ln["t"], voice, rate=ln.get("rate", "-3%"), pitch=ln.get("pitch", "+0Hz")).save(raw)
            ff("-i", raw, "-af", TRIM, "-ar", str(SR), "-ac", "1", wav)
            d = duration(wav)
            subs.append({"start": round(t, 3), "end": round(t + d, 3), "text": ln["t"]})
            parts.append(wav)
            pause = ln.get("pause", 0.35) if i < len(sc["lines"]) - 1 else 0.05
            sil = f"build/lines/{sc['id']}-{i}-sil.wav"
            ff("-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono", "-t", f"{pause:.3f}", sil)
            parts.append(sil)
            t += d + pause
        lst = f"build/lines/{sc['id']}.txt"
        with open(lst, "w") as f:
            f.writelines(f"file '{os.path.abspath(p)}'\n" for p in parts)
        ff("-f", "concat", "-safe", "0", "-i", lst, "-af", MIC, "-ar", "48000", f"public/vo/{sc['id']}.wav")
        dur = duration(f"public/vo/{sc['id']}.wav")
        out.append({"id": sc["id"], "duration": dur, "subs": subs})
        print(f"{sc['id']:13s} {dur:6.2f}s  {len(subs)} lines")
    json.dump(out, open("src/voice.json", "w", encoding="utf-8"), indent=1)
    print("total", round(sum(s["duration"] for s in out), 1), "s")


asyncio.run(main())
