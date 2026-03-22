# MysteryForge Handover

---

## Project Overview

**Name:** MysteryForge  
**Purpose:** Automated YouTube content factory for fictional mystery/crime stories  
**Repo:** https://github.com/ronaldjohnatanoso/mysteryforge  
**Public URL:** https://openclaw-4.tail40c51a.ts.net/

---

## Architecture

```
mysteryforge/
├── generate.js           # Story generation (Cerebras/Groq/OpenAI)
├── synthesize.js         # TTS (Kokoro - high quality, Google - fallback)
├── fetch-images.js       # Stock images (Pexels API)
├── assemble-video.js     # Video assembly (FFmpeg)
├── src/
│   ├── providers/
│   │   └── llm-provider.js   # LLM adapter (drop-in replacement)
│   ├── voice/
│   │   └── synthesizer.js    # TTS module
│   ├── images/
│   │   └── fetcher.js        # Image fetcher
│   └── video/
│       └── assembler.js      # Video assembly
├── prompts/
│   ├── base-story.md         # Prompt template
│   └── structures.json       # Story structures
├── output/                   # Generated content (gitignored)
└── config.json               # Settings
```

---

## Pipeline

```bash
# 1. Generate story (creates folder with title)
node generate.js --genre mystery --length 3

# 2. Synthesize audio (Kokoro TTS - high quality)
node synthesize.js

# 3. Fetch images
source /home/ronald/credentials/.env
node fetch-images.js "dark manor" --count 3

# 4. Assemble video
export FFMPEG_PATH="$HOME/.local/bin/ffmpeg"
node assemble-video.js --latest
```

**Output:** `output/<story_title>/video.mp4`

---

## TTS Engines

| Engine | Quality | CPU | Notes |
|--------|---------|-----|-------|
| **Kokoro** | ⭐⭐⭐⭐⭐ | ✅ Works | 82M params, neural voice |
| **Google Translate** | ⭐⭐ | ✅ Works | Fallback, robotic |

Default: Kokoro (high quality)

---

## API Keys

**Location:** `/home/ronald/credentials/.env`

| Service | Key | Purpose |
|---------|-----|---------|
| Groq | `gsk_N8...` | Story generation |
| Cerebras | `csk-wn...` | Story generation (faster) |
| Pexels | `Xn3Ss...` | Stock images |

**Tracking:** `/home/ronald/credentials/api-keys.csv`

---

## Automated Tasks

| Job | Schedule | What |
|-----|----------|------|
| MysteryForge Dev Check | 10 AM + 10 PM Manila | Review roadmap, make improvements, commit, push, Slack notification |

---

## Current Status

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Story generation | ✅ Working | Cerebras/Groq/OpenAI |
| 2. Voice/TTS | ✅ Working | Kokoro (neural, high quality) |
| 3. Images | ✅ Working | Pexels API |
| 4. Video assembly | ✅ Working | FFmpeg |
| 5. YouTube upload | ❌ Not started | - |

---

## Known Issues

| Issue | Status | Solution |
|-------|--------|----------|
| Subtitles inaccurate | Skipped | Local Whisper crashes; use OpenAI API later |
| Funnel "not for production" | Open | Set up Caddy + domain for proper hosting |

---

## Next Steps

1. **Proper hosting** — Caddy + your domain instead of Tailscale Funnel
2. **YouTube upload** — Phase 4, YouTube Data API

---

## Server Info

| What | Value |
|------|-------|
| Server | Oracle Cloud ARM64 (4 CPU) |
| Public IP | `213.35.103.15` |
| Tailscale IP | `100.85.3.77` |
| FFmpeg | `~/.local/bin/ffmpeg` |
| Python packages | `~/.local/lib/python3.12/site-packages/` |
| Kokoro model | `~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M/` |

---

## Files Not in Git

- `output/` — Generated content (served via Funnel)
- `.env` files — API keys
- `credentials/` — Stored separately

---

## Contact

- **Developer:** Hephaestus (you're talking to me)
- **Owner:** Ronald (ronaldjohnatanoso@gmail.com)
- **GitHub:** https://github.com/ronaldjohnatanoso/mysteryforge