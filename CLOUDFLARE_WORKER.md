# MysteryForge — Cloudflare Worker Handover

## Overview

A single Cloudflare Worker powers the pipeline:

| Component | Endpoint | Model | Notes |
|-----------|----------|-------|-------|
| Story generation | `/text` | `@cf/openai/gpt-oss-120b` | Structured JSON output |
| AI Images | `/image` | `@cf/black-forest-labs/flux-1-schnell` | Free, no rate limits |
| TTS | `/tts` | `@cf/deepgram/aura-1` | Multiple voices |
| Transcription | `/transcribe` | `@cf/openai/whisper-large-v3-turbo` | Word timestamps |

## Image Strategy (v2)

**Goal:** Character consistency without paid services.

| Visual Type | Source | Percentage |
|-------------|--------|------------|
| Character shots | Cloudflare Flux (with anchor) | ~20% |
| Scene/atmosphere | Cloudflare Flux or Pexels stock | ~80% |

### Character Anchor System

The LLM generates a `characterAnchor` - detailed visual description prepended to all character shot prompts:

```json
{
  "characterAnchor": "tall man in black suit, silver tie, slicked back hair, sharp jawline, cold blue eyes, noir lighting",
  "segments": [
    {
      "imagePrompt": "standing at end of foggy corridor",
      "isCharacterShot": true
    }
  ]
}
```

Final prompt = `characterAnchor, imagePrompt, cinematic lighting...`

### Ken Burns Variations

Character shots use varied zoom/pan effects so the same image looks different:
- Slow zoom in/out
- Pan left/right/up/down
- Rotates through effects per character shot

## Worker Info

| Field | Value |
|-------|-------|
| Base URL | `https://mysteryforge-images.ronaldjohnatanoso.workers.dev` |
| Auth | None — internal use only |
| Method | All endpoints are POST |
| Daily Quota | 10,000 neurons (shared across all endpoints) |

---

## Endpoints

### POST /text — Story Generation

**Request:**
```json
{
  "prompt": "Write a 2-minute mystery story...",
  "system": "You are a mystery story writer...",
  "model": "@cf/openai/gpt-oss-120b",
  "max_tokens": 4096
}
```

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| prompt | yes | — | The story prompt |
| system | no | none | System prompt |
| model | no | `@cf/openai/gpt-oss-120b` | Model to use |
| max_tokens | no | 4096 | Max output length |

**Response:**
```json
{
  "text": "The story text...",
  "raw": { "...full response..." }
}
```

---

### POST /image — AI Image Generation

Replaces: `fetch-images.js` (Pexels API calls)

**Request:**
```json
{
  "prompt": "dark mysterious manor at night, foggy",
  "steps": 4
}
```

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| prompt | yes | — | Scene description. Worker appends cinematic style automatically |
| steps | no | 4 | Higher = better quality but slower. Max 8 recommended |
| model | no | `@cf/black-forest-labs/flux-1-schnell` | Don't change unless testing |

**Response:** Raw JPEG binary (`Content-Type: image/jpeg`)

Save directly to disk:
```javascript
const res = await fetch(WORKER_URL + '/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: sceneDescription })
});
const buffer = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(`image-${i}.jpg`, buffer);
```

No rate limits. Fire as fast as needed.

---

### POST /tts — Text to Speech

Replaces: `synthesize.js` (Google Translate TTS)

**Request:**
```json
{
  "text": "The manor stood dark against the moonless sky...",
  "speaker": "orion"
}
```

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| text | yes | — | Story text to narrate |
| speaker | no | `orion` | See voices below |

**Available voices:**

| Voice | Style |
|-------|-------|
| `orion` | Deep male — best for mystery narration |
| `zeus` | Strong male |
| `orpheus` | Warm male |
| `athena` | Clear female |
| `luna` | Soft female |
| `stella` | Bright female |
| `hera` | Authoritative female |
| `angus` | Scottish male |
| `arcas` | Neutral male |
| `asteria` | Energetic female |
| `perseus` | Confident male |
| `helios` | Smooth male |

**Response:** Raw MP3 binary (`Content-Type: audio/mpeg`)

Save directly to disk:
```javascript
const res = await fetch(WORKER_URL + '/tts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: storySegment, speaker: 'orion' })
});
const buffer = Buffer.from(await res.arrayBuffer());
fs.writeFileSync('narration.mp3', buffer);
```

---

### POST /transcribe — Speech to Text (Subtitles)

Replaces: Local Whisper (was crashing)

Used AFTER TTS — feed the generated audio back in to get word-level timestamps for subtitle generation.

**Request:** Multipart form data with audio file

```javascript
const FormData = require('form-data');
const fs = require('fs');

const form = new FormData();
form.append('audio', fs.createReadStream('narration.mp3'), 'narration.mp3');

const res = await fetch(WORKER_URL + '/transcribe', {
  method: 'POST',
  body: form,
  headers: form.getHeaders()
});
const data = await res.json();
```

**Response:**
```json
{
  "text": "The manor stood dark against the moonless sky...",
  "words": [
    { "word": "The", "start": 0.0, "end": 0.24 },
    { "word": "manor", "start": 0.24, "end": 0.61 },
    { "word": "stood", "start": 0.61, "end": 0.89 }
  ]
}
```

Word-level timestamps are automatic — use them to generate SRT subtitle files for FFmpeg.

**SRT generation from response:**
```javascript
function wordsToSRT(words, chunkSize = 8) {
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize));
  }

  return chunks.map((chunk, i) => {
    const start = formatSRTTime(chunk[0].start);
    const end = formatSRTTime(chunk[chunk.length - 1].end);
    const text = chunk.map(w => w.word).join(' ');
    return `${i + 1}\n${start} --> ${end}\n${text}\n`;
  }).join('\n');
}

function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.round((seconds % 1) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}
```

---

## Node Files to Update

| File | Endpoint to call | Notes |
|------|------------------|-------|
| `generate.js` | `POST /text` | Replace Cerebras/Groq fetch with worker call |
| `synthesize.js` | `POST /tts` | Replace Google Translate with worker call |
| `fetch-images.js` | `POST /image` | Replace Pexels with worker call, loop per segment |
| `subtitles.js` (new) | `POST /transcribe` | New file — feed narration.mp3, write .srt output |

---

## Environment Variable

Add to `/home/ronald/credentials/.env`:
```
MYSTERYFORGE_WORKER_URL=https://mysteryforge-images.ronaldjohnatanoso.workers.dev
```

Use in Node:
```javascript
const WORKER_URL = process.env.MYSTERYFORGE_WORKER_URL;
```

---

## Models Reference

| Model ID | Used for |
|----------|----------|
| `@cf/openai/gpt-oss-120b` | Story generation (default) |
| `@cf/black-forest-labs/flux-1-schnell` | Image generation (default) |
| `@cf/deepgram/aura-1` | TTS narration (default) |
| `@cf/openai/whisper-large-v3-turbo` | Transcription / subtitles (default) |
| `@cf/meta/llama-3-8b-instruct` | Text gen fallback (faster, lower quality) |

---

## Error Handling

All endpoints return JSON errors on failure:
```json
{ "error": "description of what went wrong" }
```

Recommended retry logic for image generation (occasional cold starts):
```javascript
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      console.warn(`Attempt ${i + 1} failed: ${res.status}`);
    } catch (err) {
      console.warn(`Attempt ${i + 1} error: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Failed after ${retries} retries`);
}
```

---

## Status (tested 2026-03-23)

| Endpoint | Status |
|----------|--------|
| `/text` | ✅ 200 — story generated |
| `/image` | ✅ 200 — JPEG returned |
| `/tts` | ✅ 200 — MP3 returned |
| `/transcribe` | not yet tested |