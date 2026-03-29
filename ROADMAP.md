# MysteryForge Roadmap

## Phase 1: Script Generation ✅ (Complete)
- [x] Prompt templates for different story structures
- [x] CLI generator script
- [x] Config-driven generation
- [x] Multiple output formats
- [x] Multiple genres (mystery, horror, revenge, confession)
- [x] Topic variants per genre
- [x] Segment-based structure with image prompts

## Phase 2: Voice Synthesis ✅ (Complete)
- [x] ~~ElevenLabs API integration~~ → Kokoro TTS (82M params, neural voice)
- [x] High-quality neural voices
- [x] Multiple voice options
- [x] Speed/pitch control
- [x] Fallback to Google TTS
- [ ] ElevenLabs integration (optional, for premium voices)
- [ ] Multiple language support

```javascript
// Current: Kokoro TTS (neural, high quality)
// synthesize.js uses Kokoro model from HuggingFace

// Future: ElevenLabs for premium voices
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

## Phase 3: Visual Assembly ✅ (Complete)
- [x] Stock footage API (Pexels)
- [x] AI image generation (Gemini Imagen, Pollinations)
- [x] Scene timing based on script segments
- [x] Ken Burns effect for static images
- [x] Crossfade transitions
- [x] Auto-generate subtitles (SRT from narration)
- [x] Auto-generate thumbnail candidates
- [x] Video templates for different platforms

```javascript
// Current: fetch-images.js supports Pexels + Gemini + Pollinations
// assemble-video.js creates MP4 with Ken Burns effects
```

## Phase 4: Full Automation ✅ (Complete)
- [x] Cloudflare Worker backend (unified API for text, image, TTS)
- [x] Provider fallback system (Cloudflare → Groq/Cerebras → Pexels/Pollinations)
- [x] Batch generation (generate multiple stories at once)
- [x] Quality scoring (hook strength, engagement predictions)
- [x] YouTube upload script with googleapis (resumable uploads)
- [x] Schedule queue (plan content calendar)
- [x] SEO optimization (click-worthy titles, descriptions, tags)
- [ ] Analytics feedback loop

## Phase 5: Scaling
- [x] Flexible story prompts (any story, any genre — just describe it)
- [ ] Multi-channel support (different niches)
- [ ] A/B thumbnail testing
- [ ] Trending topic injection
- [x] SEO optimization (titles, descriptions, tags)
- [ ] Community engagement bot (reply to comments)

---

## Quick Wins (Do First)

1. ~~**Install Ollama** - Local LLM for free generation~~ → Using Groq/Cerebras (free tier)
2. ~~**Set up ElevenLabs** - Voice is the biggest quality jump~~ → Using Kokoro (free, high quality)
3. ~~**Create 10 scripts** - Test the pipeline manually~~ → Pipeline working
4. ~~**First video** - Manual assembly, learn the pain points~~ → Automated assembly working
5. ~~**Automate the pain** - Script the worst parts~~ → Full pipeline automated

## Architecture Vision

```
User Input (any story prompt, any genre)
        ↓
    Generator (LLM)
        ↓
    [Script + Image Prompts] → Voice Synthesizer → [Audio]
        ↓                              ↓
    Scene Parser                   Timeline
        ↓                              ↓
    Stock/Image API ←←←←←←←←←←←←← Visual Sync
        ↓
    FFmpeg Assembly
        ↓
    [Final Video]
        ↓
    YouTube Upload (TODO)
```

## Current Architecture

```
mysteryforge/
├── generate.js           # Story generation (Cerebras/Groq/OpenAI)
├── synthesize.js         # TTS (Kokoro - high quality)
├── fetch-images.js       # Images (Pexels + Gemini/Pollinations AI)
├── assemble-video.js     # Video assembly (FFmpeg)
├── src/
│   ├── providers/
│   │   └── llm-provider.js   # LLM adapter
│   ├── voice/
│   │   └── synthesizer.js    # TTS module
│   ├── images/
│   │   ├── fetcher.js        # Pexels fetcher
│   │   ├── ai-generator.js   # Pollinations AI
│   │   └── gemini-generator.js # Gemini Imagen
│   └── video/
│       └── assembler.js      # Video assembly
├── prompts/
│   ├── base-story.md         # Prompt template
│   └── structures.json       # Story structures
├── config.json               # Settings (genres, ambient, color grades)
└── tests/                    # Unit tests
```

## Monetization Integration

- [ ] Affiliate links in descriptions (auto-generated)
- [ ] Merch links in pinned comment
- [ ] Patreon hook in outro
- [ ] Sponsor segment injection

---

## Changelog

### v1.6.0 (2026-03-29)
- Added story quality validator (validate-story.js) with 5 scoring dimensions:
  - Hook strength (opening tension/conflict detection)
  - Pacing (segment length variance)
  - Structure (setup/payoff balance, character shot distribution)
  - Cliché detection (10 common tropes)
  - Completeness (required fields, word count)
- Fixed test-suite.js timestamp format check (was too broad, now correctly matches `YYYY-MM-DD_HH-MM`)
- Fixed pipeline.js bug: characterAnchor now saved to story.json in both prompt and genre/topic modes
- Added npm scripts: `npm run validate`, `npm run validate:json`
- Added 3 new validator tests, all 32 tests passing

### v1.5.0 (2026-03-28)
- Added full YouTube API integration with googleapis (resumable uploads)
- Installed googleapis and google-auth-library packages
- Added SEO optimization module (src/seo/optimizer.js) with click-worthy title templates
- Added genre-specific tag generation and CTA-optimized descriptions
- Added --use-seo flag to youtube-upload.js for SEO-optimized metadata
- Added comprehensive SEO optimizer tests (11 tests)
- Added npm scripts: `npm run test:seo`, `npm run optimize`, `npm run upload:seo`
- Updated README with SEO documentation
- Marked Phase 4 as complete, SEO optimization done
- All 29 tests passing

### v1.4.0 (2026-03-24)
- Added platform-templates.js for multi-platform video exports (YouTube, TikTok, Instagram, Twitter)
- Added youtube-upload.js with OAuth-based upload support
- Integrated thumbnail generation into pipeline.js
- Added comprehensive tests for platform templates and YouTube upload
- Updated README with platform templates and YouTube upload documentation
- Marked Phase 3 as complete in roadmap

### v1.3.0 (2026-03-24)
- Added batch generation (batch-generate.js) for multiple stories at once
- Added quality scoring system (A-D grade) for generated stories
- Enhanced story prompts with detailed templates and quality control rules
- Added new topic variants: stalker, possession, family-revenge, betrayal, crime
- Updated primary LLM to llama-3.3-70b-versatile (better quality)
- Added video clip support in fetch-images.js and assemble-video.js
- Reordered provider fallback: Groq → Cerebras → Cloudflare
- Fixed test suite for incomplete generation states
- Updated documentation with batch generation examples

### v1.2.0 (2026-03-23)
- Added Cloudflare Worker backend integration (text, image, TTS, transcription)
- Added unified pipeline.js for all-in-one generation
- Added provider fallback system (Cloudflare → Groq/Cerebras → Pexels/Pollinations)
- Added worker-client.js for Cloudflare Worker API calls
- Added character anchor system for consistent character rendering
- Added Ken Burns effect variations for character shots
- Updated tests for new provider architecture
- Added providers.json for centralized provider configuration

### v1.1.0 (2026-03-23)
- Added unit tests for generate.js and llm-provider.js
- Updated README with current features
- Added Gemini Imagen integration for AI images
- Added segment-based story structure with image prompts
- Added 4 genres: mystery, horror, revenge, confession
- Improved video assembly with crossfade transitions

### v1.0.0
- Initial release with story generation
- Kokoro TTS integration
- Pexels image fetching
- FFmpeg video assembly

---

Built by Hephaestus ⚒️