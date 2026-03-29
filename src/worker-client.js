/**
 * MysteryForge Worker Client
 * 
 * Unified client for Cloudflare Worker endpoints.
 * Replaces: Cerebras/Groq, Pexels, Google Translate TTS, local Whisper.
 */

const WORKER_URL = process.env.MYSTERYFORGE_WORKER_URL || 'https://mysteryforge-images.ronaldjohnatanoso.workers.dev';

/**
 * Retry wrapper for occasional cold starts
 */
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      const errText = await res.text();
      console.warn(`Attempt ${i + 1} failed: ${res.status} - ${errText.substring(0, 100)}`);
    } catch (err) {
      console.warn(`Attempt ${i + 1} error: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Failed after ${retries} retries`);
}

/**
 * Generate text (story generation)
 */
async function generateText(prompt, systemPrompt = null, maxTokens = 8000, model = '@cf/openai/gpt-oss-120b') {
  const res = await fetchWithRetry(`${WORKER_URL}/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      system: systemPrompt,
      model,
      max_tokens: maxTokens
    })
  });
  
  const data = await res.json();
  
  // Model bug: content is null, actual story is in reasoning_content under "Draft:"
  if (data.text === null && data.raw?.choices?.[0]?.message?.reasoning_content) {
    const reasoning = data.raw.choices[0].message.reasoning_content;
    
    // Pattern: Draft:\n\n"story content here"
    // Match everything between the quotes after Draft:
    const draftMatch = reasoning.match(/Draft:\s*\n+\s*"([^"]+)"/s);
    if (draftMatch) {
      return draftMatch[1].trim();
    }
    
    // Alternative: find quoted paragraph after "Draft:"
    const lines = reasoning.split('\n');
    let inDraft = false;
    let story = '';
    for (const line of lines) {
      if (line.includes('Draft:')) {
        inDraft = true;
        continue;
      }
      if (inDraft && line.startsWith('"') && !line.startsWith('""')) {
        // Extract content from quoted line
        story = line.replace(/^"|"$/g, '').trim();
        if (story.length > 50) break;
      }
    }
    if (story.length > 50) return story;
    
    // Last resort
    return reasoning;
  }
  
  return data.text;
}

/**
 * Generate image (Flux schnell)
 */
async function generateImage(prompt, outputPath, steps = 4) {
  const fs = require('fs');
  const path = require('path');
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const res = await fetchWithRetry(`${WORKER_URL}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, steps })
  });
  
  const buffer = Buffer.from(await res.arrayBuffer());
  
  // Check if it's an error JSON
  if (buffer.length < 1000 && buffer.toString().startsWith('{')) {
    const json = JSON.parse(buffer.toString());
    if (json.error) throw new Error(json.error);
  }
  
  fs.writeFileSync(outputPath, buffer);
  return { path: outputPath, size: buffer.length };
}

/**
 * Generate speech (Deepgram Aura)
 */
async function generateSpeech(text, outputPath, speaker = 'orion') {
  const fs = require('fs');
  const path = require('path');
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const res = await fetchWithRetry(`${WORKER_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speaker })
  });
  
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return { path: outputPath, size: buffer.length };
}

/**
 * Transcribe audio (Whisper large v3 turbo)
 * Returns word-level timestamps for subtitle generation
 */
async function transcribeAudio(audioPath) {
  const fs = require('fs');
  const FormData = require('form-data');
  
  const form = new FormData();
  form.append('audio', fs.createReadStream(audioPath), 'audio.mp3');
  
  const res = await fetchWithRetry(`${WORKER_URL}/transcribe`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders()
  });
  
  return await res.json();
}

/**
 * Convert transcription words to SRT subtitles
 */
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

/**
 * Available TTS voices
 */
const VOICES = {
  orion: 'Deep male - best for mystery narration',
  zeus: 'Strong male',
  orpheus: 'Warm male',
  athena: 'Clear female',
  luna: 'Soft female',
  stella: 'Bright female',
  hera: 'Authoritative female',
  angus: 'Scottish male',
  arcas: 'Neutral male',
  asteria: 'Energetic female',
  perseus: 'Confident male',
  helios: 'Smooth male'
};

module.exports = {
  WORKER_URL,
  generateText,
  generateImage,
  generateSpeech,
  transcribeAudio,
  wordsToSRT,
  VOICES,
  fetchWithRetry
};