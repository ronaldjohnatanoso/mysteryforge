# MysteryForge Roadmap

## Phase 1: Script Generation ✅ (Complete)
- [x] Prompt templates for different story structures
- [x] CLI generator script
- [x] Config-driven generation
- [x] Multiple output formats

## Phase 2: Voice Synthesis (Next)
- [ ] ElevenLabs API integration
- [ ] Voice selection per mood/genre
- [ ] Auto-SSML for pacing and emphasis
- [ ] Multiple language support

```javascript
// Future: voice.js
const ElevenLabs = require('elevenlabs-node');

async function synthesizeVoice(script, voiceId) {
  const voice = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });
  const audio = await voice.textToSpeech({
    text: script,
    voice_id: voiceId,
    model_id: 'eleven_multilingual_v2'
  });
  return audio;
}
```

## Phase 3: Visual Assembly
- [ ] Stock footage API (Pexels, Pixabay)
- [ ] AI image generation (Stable Diffusion local or DALL-E API)
- [ ] Scene timing based on script
- [ ] Ken Burns effect for static images
- [ ] Auto-generate thumbnail candidates

```javascript
// Future: visuals.js
async function generateVisuals(script, scenes) {
  // Parse script into visual beats
  // Query stock APIs for matching footage
  // Generate AI images for key moments
  // Return FFmpeg assembly instructions
}
```

## Phase 4: Full Automation
- [ ] Batch generation (generate 10 scripts at once)
- [ ] Quality scoring (hook strength, engagement predictions)
- [ ] Schedule queue (plan content calendar)
- [ ] Auto-upload to YouTube (YouTube Data API)
- [ ] Analytics feedback loop

## Phase 5: Scaling
- [ ] Multi-channel support (different niches)
- [ ] A/B thumbnail testing
- [ ] Trending topic injection
- [ ] SEO optimization (titles, descriptions, tags)
- [ ] Community engagement bot (reply to comments)

---

## Quick Wins (Do First)

1. **Install Ollama** - Local LLM for free generation
2. **Set up ElevenLabs** - Voice is the biggest quality jump
3. **Create 10 scripts** - Test the pipeline manually
4. **First video** - Manual assembly, learn the pain points
5. **Automate the pain** - Script the worst parts

## Architecture Vision

```
User Input (genre, length)
        ↓
    Generator
        ↓
    [Script] → Voice Synthesizer → [Audio]
        ↓                              ↓
    Scene Parser                   Timeline
        ↓                              ↓
    Stock/Image API ←←←←←←←←←←←←← Visual Sync
        ↓
    FFmpeg Assembly
        ↓
    [Final Video]
        ↓
    YouTube Upload
```

## Monetization Integration

- Affiliate links in descriptions (auto-generated)
- Merch links in pinned comment
- Patreon hook in outro
- Sponsor segment injection

---

Built by Hephaestus ⚒️