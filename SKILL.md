# MysteryForge Project Skill

You are building **MysteryForge** — an automated YouTube content factory for fictional mystery stories.

## Project Location
`/home/ronald/projects/mysteryforge`

## Pipeline Order
1. `node generate.js --genre mystery --length 3` → Creates story folder
2. `node synthesize.js --voice af_sky --speed 0.85` → Creates audio
3. `source ~/credentials/.env && node fetch-images.js "query" --count 3` → Downloads images
4. `node assemble-video.js --latest` → Creates final video

## Folder Naming Convention
**CRITICAL:** Story folders MUST be named after the story title, NOT timestamps.

| ❌ Wrong | ✅ Right |
|----------|----------|
| `story_1774197256603/` | `lexi_and_the_heights_setup/` |
| `output_12345/` | `the_midnight_visitor/` |

**How to name:**
1. Extract title from the story content
2. Convert to lowercase, snake_case
3. Max 50 characters
4. No special characters except underscores

## File Structure Per Story
```
output/
└── <story_title>/
    ├── story.md          # Full generated story
    ├── narration.txt     # Clean text for TTS
    ├── narration.mp3     # Synthesized audio
    ├── images/           # Story images
    │   ├── image_0.jpg
    │   ├── image_1.jpg
    │   └── image_2.jpg
    ├── subtitles.srt     # Generated subtitles
    └── video.mp4         # Final video
```

## Current Style
- **Narration:** Hood style (street slang, "blick", "opps", natural pauses with "...")
- **Voice:** `af_sky` at speed `0.85`
- **Motion:** Ken Burns effects (zoom, pan, randomized)
- **Color:** Mystery (teal/blue tones)

## API Keys Location
`/home/ronald/credentials/.env`
- CEREBRAS_API_KEY
- GROQ_API_KEY
- PEXELS_API_KEY

## Public URL
`https://openclaw-4.tail40c51a.ts.net/`

## Common Mistakes to Avoid
1. ❌ Naming folders with timestamps → ✅ Use story title
2. ❌ TTS reading metadata/headers → ✅ Clean narration only
3. ❌ Hardcoding API keys → ✅ Use environment variables
4. ❌ Static images → ✅ Ken Burns motion effects
5. ❌ Generic AI voice → ✅ Hood style with pauses
6. ❌ Subtitles split by paragraph → ✅ Split by sentence (max 8 words)
7. ❌ Repeated motion effects → ✅ Shuffle effects, no repeats

## Automated Tasks
- **Schedule:** 10 AM + 10 PM Manila
- **What:** Review roadmap, make improvements, commit, push, notify Slack

## GitHub
https://github.com/ronaldjohnatanoso/mysteryforge

---

Update this file when adding new conventions or fixing recurring issues.