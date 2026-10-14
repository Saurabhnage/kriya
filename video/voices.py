# Voiceover with real-sounding TTS providers. Keys are read from video/.env (never committed).
#
#   python voices.py sample                      # audition clips for every provider with a key → samples/
#   python voices.py full <provider> <voice>     # full narration → public/vo/*.wav + src/voice.json
#
# providers: elevenlabs | sarvam | gemini | edge
import asyncio, base64, json, os, subprocess, sys, urllib.request, urllib.error, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)


def load_env():
    if os.path.exists(".env"):
        for line in open(".env", encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
KEYS = {"elevenlabs": os.environ.get("ELEVENLABS_API_KEY"), "sarvam": os.environ.get("SARVAM_API_KEY"), "gemini": os.environ.get("GEMINI_API_KEY")}

STYLE = ("Narrate like a calm, warm Indian storyteller in Indian English, speaking naturally to one person, "
         "conversational, unhurried, with real emotion: quiet and tense for the night scenes, relieved and warm in the morning.")


def http(url, body=None, headers=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"), headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {url.split('?')[0]}: {e.read().decode(errors='replace')[:400]}") from None


def ff(*args):
    import time
    for attempt in range(3):  # Windows: a just-written file can be briefly locked (AV scan)
        try:
            return subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise
            time.sleep(1.5)


def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())


# ------------------------------------------------------------------ providers: text → audio file (any format ffmpeg reads)
def tts_elevenlabs(text, voice, out, prev="", nxt=""):
    model = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
    body = {"text": text, "model_id": model, "voice_settings": {"stability": 0.42, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": True, "speed": 0.96}}
    if model != "eleven_v3":
        body.update({"previous_text": prev, "next_text": nxt})
    audio, _ = http(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_192", body, {"xi-api-key": KEYS["elevenlabs"]})
    open(out, "wb").write(audio)


def tts_sarvam(text, voice, out, **_):
    raw, _ = http("https://api.sarvam.ai/text-to-speech", {"text": text, "language_code": "en-IN", "speaker": voice, "model": "bulbul:v3", "pace": float(os.environ.get("SARVAM_PACE", "0.95")), "temperature": 0.6, "speech_sample_rate": 44100}, {"api-subscription-key": KEYS["sarvam"]})
    open(out, "wb").write(base64.b64decode(json.loads(raw)["audios"][0]))


def tts_gemini(text, voice, out, **_):
    model = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
    body = {"model": model, "input": [{"type": "user_input", "content": [{"type": "text", "text": text, "annotations": [{"type": "speech_metadata", "style": STYLE}]}]}],
            "response_format": {"type": "audio", "mime_type": "audio/wav", "sample_rate": 24000}, "generation_config": {"speech_config": [{"voice": voice}]}}
    for attempt in range(4):  # free tier: 3 requests/minute, so wait out 429s
        try:
            raw, _ = http("https://generativelanguage.googleapis.com/v1beta/interactions", body, {"x-goog-api-key": KEYS["gemini"]})
            break
        except RuntimeError as e:
            if "429" not in str(e) or attempt == 3:
                raise
            import re, time
            m = re.search(r"retry in (?:(\d+)m)?(\d+)s", str(e))
            wait = (int(m.group(1) or 0) * 60 + int(m.group(2)) + 3) if m else 30
            print(f"gemini rate limit: waiting {wait}s", flush=True)
            time.sleep(wait)
    res = json.loads(raw)
    clips = [c["data"] for s in res.get("steps", []) if s.get("type") == "model_output" for c in s.get("content", []) if c.get("type") == "audio"]
    if not clips:
        raise RuntimeError(f"gemini: no audio in response: {raw[:300]!r}")
    open(out, "wb").write(base64.b64decode(clips[-1]))


def tts_edge(text, voice, out, **_):
    import edge_tts
    asyncio.run(edge_tts.Communicate(text, voice, rate="-3%").save(out))


PROVIDERS = {"elevenlabs": tts_elevenlabs, "sarvam": tts_sarvam, "gemini": tts_gemini, "edge": tts_edge}


def elevenlabs_candidates():
    """Indian-accent male narrators: the account's own voices first, then the top shared-library matches."""
    out = []
    raw, _ = http("https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": KEYS["elevenlabs"]})
    for v in json.loads(raw).get("voices", []):
        lab = {k: str(x).lower() for k, x in (v.get("labels") or {}).items()}
        if "indian" in lab.get("accent", "") and lab.get("gender", "male") == "male":
            out.append((v["voice_id"], v["name"]))
    q = urllib.parse.urlencode({"page_size": 12, "gender": "male", "accent": "indian", "language": "en", "sort": "usage_character_count_1y", "use_cases": "narrative_story"})
    raw, _ = http(f"https://api.elevenlabs.io/v1/shared-voices?{q}", headers={"xi-api-key": KEYS["elevenlabs"]})
    for v in json.loads(raw).get("voices", []):
        out.append((v["voice_id"], v["name"]))
    seen, uniq = set(), []
    for vid, name in out:
        if vid not in seen:
            seen.add(vid)
            uniq.append((vid, name))
    return uniq[:4]


SAMPLE = [
    "It's 2:47 in the morning, in Bengaluru. Arjun is awake again. Not because of work... because of his phone.",
    "This time, Arjun was fast asleep. And in about five seconds, on Monad... his money was out of B, and safe.",
]


def sample():
    os.makedirs("samples", exist_ok=True)
    plan = []
    if KEYS["elevenlabs"]:
        try:
            plan += [("elevenlabs", vid, name) for vid, name in elevenlabs_candidates()]
        except RuntimeError as e:
            print("elevenlabs voices:", e)
    if KEYS["sarvam"]:
        plan += [("sarvam", v, v) for v in ("aditya", "rahul", "kabir", "shubh")]
    if KEYS["gemini"]:
        plan += [("gemini", v, v) for v in ("Charon", "Iapetus", "Algieba", "Sadaltager")]
    if not plan:
        sys.exit("No keys found. Put them in video/.env (see .env.example).")
    for prov, vid, name in plan:
        safe = "".join(ch if ch.isalnum() else "_" for ch in name)[:24]
        parts = []
        try:
            for i, t in enumerate(SAMPLE):
                p = f"samples/.{prov}-{safe}-{i}"
                PROVIDERS[prov](t, vid, p, prev=SAMPLE[i - 1] if i else "", nxt=SAMPLE[i + 1] if i + 1 < len(SAMPLE) else "")
                parts.append(p)
            lst = f"samples/.{prov}-{safe}.txt"
            sil = "samples/.sil.wav"
            ff("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.8", sil)
            with open(lst, "w") as f:
                for p in parts:
                    w = p + ".wav"
                    ff("-i", p, "-ar", "44100", "-ac", "1", w)
                    f.write(f"file '{os.path.abspath(w)}'\nfile '{os.path.abspath(sil)}'\n")
            ff("-f", "concat", "-safe", "0", "-i", lst, "-af", "loudnorm=I=-16:TP=-1.5", "-c:a", "libmp3lame", "-q:a", "2", f"samples/{prov}-{safe}.mp3")
            print(f"ok   {prov:10s} {name:28s} id={vid}")
        except Exception as e:  # keep going: one failing voice shouldn't stop the audition
            print(f"FAIL {prov:10s} {name:28s} {e}")


# ------------------------------------------------------------------ full narration
TRIM = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse"
POLISH = "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=8:release=160:makeup=1.5"  # real voices need only light glue


def full(prov, voice):
    scenes = json.load(open(os.environ.get("NARRATION", "narration.json"), encoding="utf-8"))
    os.makedirs("build/lines", exist_ok=True)
    VO = os.environ.get("VO_DIR", "public/vo")
    os.makedirs(VO, exist_ok=True)
    SR = 48000
    flat = [ln["t"] for sc in scenes for ln in sc["lines"]]
    k, out = 0, []
    for sc in scenes:
        parts, subs, t = [], [], 0.0
        for i, ln in enumerate(sc["lines"]):
            raw, wav = f"build/lines/{sc['id']}-{i}.{prov}", f"build/lines/{sc['id']}-{i}.wav"
            PROVIDERS[prov](ln["t"], voice, raw, prev=flat[k - 1] if k else "", nxt=flat[k + 1] if k + 1 < len(flat) else "")
            k += 1
            ff("-i", raw, "-af", TRIM, "-ar", str(SR), "-ac", "1", wav)
            d = duration(wav)
            subs.append({"start": round(t, 3), "end": round(t + d, 3), "text": ln["t"]})
            pause = ln.get("pause", 0.35) * float(os.environ.get("PAUSE_SCALE", "1")) if i < len(sc["lines"]) - 1 else 0.05
            sil = f"build/lines/{sc['id']}-{i}-sil.wav"
            ff("-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono", "-t", f"{pause:.3f}", sil)
            parts += [wav, sil]
            t += d + pause
        lst = f"build/lines/{sc['id']}.txt"
        with open(lst, "w") as f:
            f.writelines(f"file '{os.path.abspath(p)}'\n" for p in parts)
        ff("-f", "concat", "-safe", "0", "-i", lst, "-af", POLISH, "-ar", str(SR), f"{VO}/{sc['id']}.wav")
        dur = duration(f"{VO}/{sc['id']}.wav")
        out.append({"id": sc["id"], "duration": dur, "subs": subs})
        print(f"{sc['id']:13s} {dur:6.2f}s")
    json.dump(out, open(os.environ.get("VOICE_JSON", "src/voice.json"), "w", encoding="utf-8"), indent=1)
    print("total", round(sum(s["duration"] for s in out), 1), "s")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "sample":
        sample()
    elif len(sys.argv) >= 4 and sys.argv[1] == "full":
        full(sys.argv[2], sys.argv[3])
    else:
        print(__doc__ or "usage: python voices.py sample | full <provider> <voice>")


# ------------------------------------------------------------------ scene takes (Gemini): one natural take per scene
SCENE_STYLE = {
    "night": "quiet, slightly tense, late at night, like telling a friend a true story",
    "backstory": "relaxed and conversational, a little nostalgic",
    "secondjob": "tired and knowing at first, then quieter and heavier at the end",
    "alternatives": "sceptical, a little worried",
    "wish": "soft, sincere, slowing down at the end",
    "kriya": "a gentle smile in the voice, confident",
    "mandate": "clear and steady, each limit spoken deliberately",
    "incident": "low and tense at the start, then steady and focused, ending with relief",
    "impact": "measured and serious, letting the contrast land, then warm on the last line",
    "guard": "firm and assured",
    "morning": "warm and relieved, morning energy",
    "whofor": "warm, inclusive, sincere",
    "monad": "confident and crisp",
    "close": "calm, confident, inspiring, unhurried",
}


NARRATION = os.environ.get("NARRATION", "narration.json")


def full_takes(voice):
    """One Gemini take per scene; sentence timings recovered from the pauses in the take."""
    global STYLE
    scenes = json.load(open(NARRATION, encoding="utf-8"))
    os.makedirs("build/lines", exist_ok=True)
    os.makedirs("public/vo", exist_ok=True)
    out = []
    base = STYLE
    for sc in scenes:
        lines = [ln["t"] for ln in sc["lines"]]
        STYLE = f"{base} For this part: {SCENE_STYLE.get(sc['id'], 'natural')}."
        raw, wav = f"build/lines/{sc['id']}.take", f"public/vo/{sc['id']}.wav"
        if not os.path.exists(raw):
            tts_gemini(" ".join(lines), voice, raw)
        ff("-i", raw, "-af", TRIM + "," + POLISH, "-ar", "48000", "-ac", "1", wav)
        dur = duration(wav)
        out.append({"id": sc["id"], "duration": dur, "subs": split_subs(wav, lines, dur)})
        print(f"{sc['id']:13s} {dur:6.2f}s")
    STYLE = base
    json.dump(out, open("src/voice.json", "w", encoding="utf-8"), indent=1)
    print("total", round(sum(s["duration"] for s in out), 1), "s")


def split_subs(wav, lines, dur):
    """Map sentence boundaries to the pauses nearest their expected (length-proportional) positions."""
    if len(lines) == 1:
        return [{"start": 0.0, "end": round(dur, 3), "text": lines[0]}]
    log = subprocess.run(["ffmpeg", "-i", wav, "-af", "silencedetect=noise=-38dB:d=0.16", "-f", "null", "-"], capture_output=True, text=True).stderr
    import re
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    gaps = [(s, e) for s, e in zip(starts, ends) if 0.2 < s < dur - 0.2]
    total = sum(len(t) for t in lines)
    bounds, acc, used = [], 0, set()
    for t in lines[:-1]:
        acc += len(t)
        want = dur * acc / total
        best = min((g for i, g in enumerate(gaps) if i not in used and (not bounds or g[0] > bounds[-1][1])), key=lambda g: abs((g[0] + g[1]) / 2 - want), default=None)
        if best is None:
            best = (want - 0.05, want + 0.05)
        else:
            used.add(gaps.index(best))
        bounds.append(best)
    subs, cur = [], 0.0
    for i, t in enumerate(lines):
        end = bounds[i][0] if i < len(bounds) else dur
        subs.append({"start": round(cur, 3), "end": round(end, 3), "text": t})
        cur = bounds[i][1] if i < len(bounds) else dur
    return subs


# Free tier allows 10 Gemini TTS requests a day, so uncached scenes are voiced in groups (one take each)
GROUPS = json.loads(os.environ["TAKE_GROUPS"]) if os.environ.get("TAKE_GROUPS") else [["wish", "kriya"], ["mandate"], ["incident", "impact"], ["guard", "morning"], ["whofor", "monad", "close"]]


def grouped_takes(voice):
    global STYLE
    scenes = {sc["id"]: [ln["t"] for ln in sc["lines"]] for sc in json.load(open(NARRATION, encoding="utf-8"))}
    base = STYLE
    for g in GROUPS:
        if all(os.path.exists(f"build/lines/{i}.take") for i in g):
            continue
        lines = [t for i in g for t in scenes[i]]
        STYLE = base + " " + " Then ".join(f"for the part beginning '{scenes[i][0][:40]}': {SCENE_STYLE[i]}" for i in g) + "."
        raw = f"build/lines/{'+'.join(g)}.group"
        if not os.path.exists(raw):
            tts_gemini(" ... ".join(" ".join(scenes[i]) for i in g), voice, raw)
        wav = raw + ".wav"
        ff("-i", raw, "-af", TRIM, "-ar", "48000", "-ac", "1", wav)
        dur = duration(wav)
        subs = split_subs(wav, lines, dur)
        k = 0
        for j, i in enumerate(g):
            n = len(scenes[i])
            start = 0.0 if j == 0 else (subs[k - 1]["end"] + subs[k]["start"]) / 2
            end = dur if j == len(g) - 1 else (subs[k + n - 1]["end"] + subs[k + n]["start"]) / 2
            ff("-i", wav, "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-f", "wav", f"build/lines/{i}.take")
            k += n
        print("voiced", "+".join(g))
    STYLE = base
    full_takes(voice)  # all scenes now cached: trims, polishes and writes voice.json


if __name__ == "__main__" and len(sys.argv) >= 3 and sys.argv[1] == "takes":
    grouped_takes(sys.argv[2])
