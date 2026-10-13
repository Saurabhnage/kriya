# Generates the voiceover (Microsoft Edge neural TTS, Indian English) plus sentence timings for subtitles.
# usage: python tts.py [voice] ; default en-IN-NeerjaExpressiveNeural
import asyncio, json, sys, subprocess, edge_tts
voice = sys.argv[1] if len(sys.argv) > 1 else "en-IN-NeerjaExpressiveNeural"
items = json.load(open("narration.json", encoding="utf-8"))
async def main():
    out = []
    for it in items:
        path = f"public/vo/{it['id']}.mp3"
        subs = []
        com = edge_tts.Communicate(it["text"], voice, rate="-2%", boundary="SentenceBoundary")
        with open(path, "wb") as f:
            async for ch in com.stream():
                if ch["type"] == "audio": f.write(ch["data"])
                elif ch["type"] == "SentenceBoundary":
                    subs.append({"start": ch["offset"] / 1e7, "end": (ch["offset"] + ch["duration"]) / 1e7, "text": ch["text"]})
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())
        out.append({"id": it["id"], "duration": dur, "subs": subs})
        print(it["id"], round(dur, 2), len(subs))
    json.dump(out, open("src/voice.json", "w", encoding="utf-8"), indent=1)
asyncio.run(main())
