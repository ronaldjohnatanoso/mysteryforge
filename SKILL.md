# MysteryForge Project Skill

You are building **MysteryForge** — an automated YouTube content factory for fictional mystery stories.

## Project Location
`/home/ronald/projects/mysteryforge`

## Pipeline Order
```bash
# 1. Generate story
node generate.js --genre mystery --length 3

# 2. Synthesize voice (Kokoro TTS)
node synthesize.js

# 3. Fetch images (choose one)
source ~/credentials/.env && node fetch-images.js --latest           # Pexels stock (default)
source ~/credentials/.env && node fetch-images.js --latest --gemini  # AI images (500/day free)

# 4. Assemble video
node assemble-video.js --latest
```

## npm Scripts
```bash
npm run generate    # Generate story
npm run synthesize  # Synthesize voice
npm run images      # Fetch Pexels images
npm run images:ai   # Fetch AI images (Gemini)
npm run assemble    # Assemble video
npm run build       # Full pipeline
npm test            # Run tests
```

## Story Genres
| Genre | Topics |
|-------|--------|
| mystery | internet-mystery, found-footage, disappearance |
| horror | monster, haunting, creature |
| revenge | workplace, neighbor, family, ex, petty, nuclear |
| confession | secret-life, dark-secret, confession |

## File Structure Per Story
```
output/
└── <story_title>/
    ├── story.json        # Structured data with segments
    ├── narration.txt     # Clean text for TTS
    ├── narration.mp3     # Synthesized audio
    ├── images/           # Story images
    │   ├── img_000.jpg
    │   └── ...
    ├── subtitles.srt     # Generated subtitles
    └── video.mp4         # Final video
```

## API Keys Location
`/home/ronald/credentials/.env`
- CEREBRAS_API_KEY
- GROQ_API_KEY
- PEXELS_API_KEY
- GEMINI_API_KEY (for AI images)

## Current Voice Settings
- **Engine:** Kokoro (82M params neural TTS)
- **Default voice:** `af_sky`
- **Speed:** 0.7

## Video Settings
- **Resolution:** 1920x1080 (Full HD)
- **Motion:** Ken Burns effects (zoom, pan)
- **Transitions:** Crossfade (0.5s)
- **Subtitles:** White text, black outline, 24pt

## Config Structure
`config.json` defines:
- Genres with topics and hooks
- Ambient sounds per genre
- Color grades per genre
- Default settings

## Public URL
`https://openclaw-4.tail40c51a.ts.net/`

## GitHub
https://github.com/ronaldjohnatanoso/mysteryforge

## Common Mistakes to Avoid
1. ❌ Naming folders with timestamps → ✅ Use story title
2. ❌ TTS reading metadata/headers → ✅ Clean narration only
3. ❌ Hardcoding API keys → ✅ Use environment variables
4. ❌ Static images → ✅ Ken Burns motion effects
5. ❌ Generic AI voice → ✅ Natural pauses with punctuation
6. ❌ Subtitles split by paragraph → ✅ Split by sentence (max 10 words)
7. ❌ Repeated motion effects → ✅ Vary zoom/pan per image

## Automated Tasks
- **Schedule:** 10 AM + 10 PM Manila
- **What:** Review roadmap, make improvements, commit, push, notify Slack

---

Update this file when adding new conventions or fixing recurring issues.