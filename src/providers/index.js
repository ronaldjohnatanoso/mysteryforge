/**
 * MysteryForge Provider Manager
 * 
 * Handles provider selection, fallbacks, and quota tracking.
 * All API calls go through this module.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load provider config
const providerConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../providers.json'), 'utf8')
);

// Environment variables
const WORKER_URL = process.env.MYSTERYFORGE_WORKER_URL || 'https://mysteryforge-images.ronaldjohnatanoso.workers.dev';
const GROQ_KEY = process.env.GROQ_API_KEY;
const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
const PEXELS_KEY = process.env.PEXELS_API_KEY;

// Quota tracking (in-memory, reset on restart)
const quotaUsage = {
  cloudflare: { neurons: 0, lastReset: new Date().toDateString() }
};

/**
 * Check if quota should reset (new day)
 */
function checkQuotaReset() {
  const today = new Date().toDateString();
  if (quotaUsage.cloudflare.lastReset !== today) {
    quotaUsage.cloudflare.neurons = 0;
    quotaUsage.cloudflare.lastReset = today;
  }
}

/**
 * Generate text with automatic fallback
 * Returns { text, provider }
 */
async function generateText(prompt, systemPrompt = null, maxTokens = 4096) {
  const providers = ['cloudflare', 'groq', 'cerebras'];
  
  for (const provider of providers) {
    try {      
      if (provider === 'cloudflare') {
        const result = await textCloudflare(prompt, systemPrompt, maxTokens);
        quotaUsage.cloudflare.neurons += 100;
        return { text: result, provider: 'cloudflare' };
      } else if (provider === 'groq' && GROQ_KEY) {
        const result = await textGroq(prompt, systemPrompt, maxTokens);
        return { text: result, provider: 'groq' };
      } else if (provider === 'cerebras' && CEREBRAS_KEY) {
        const result = await textCerebras(prompt, systemPrompt, maxTokens);
        return { text: result, provider: 'cerebras' };
      }
    } catch (e) {
      console.log(`   ${provider} failed: ${e.message.substring(0, 50)}`);
      if (e.message.includes('quota') || e.message.includes('10,000 neurons')) {
        quotaUsage.cloudflare.neurons = 10000;
      }
    }
  }
  
  throw new Error('All text providers failed');
}

/**
 * Generate image with automatic fallback
 */
async function generateImage(prompt, outputPath, options = {}) {
  const providers = ['cloudflare', 'pexels', 'pollinations'];
  
  for (const provider of providers) {
    try {
      console.log(`   Trying ${provider}...`);
      
      if (provider === 'cloudflare') {
        const result = await imageCloudflare(prompt, outputPath, options);
        quotaUsage.cloudflare.neurons += 50; // Estimate
        return result;
      } else if (provider === 'pexels' && PEXELS_KEY) {
        return await imagePexels(prompt, outputPath);
      } else if (provider === 'pollinations') {
        return await imagePollinations(prompt, outputPath, options);
      }
    } catch (e) {
      console.log(`   ${provider} failed: ${e.message.substring(0, 50)}`);
    }
  }
  
  throw new Error('All image providers failed');
}

/**
 * Generate speech - Kokoro only (af_sky, 0.7)
 */
async function generateSpeech(text, outputPath, speaker = 'af_sky') {
  const result = await ttsKokoro(text, outputPath, speaker, 0.7);
  return { ...result, provider: 'kokoro' };
}

// ===== Kokoro TTS (Local, High Quality) =====

async function ttsKokoro(text, outputPath, voice = 'af_sky', speed = 0.7) {
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Write text to temp file
  const tempText = `/tmp/kokoro_text_${Date.now()}.txt`;
  fs.writeFileSync(tempText, text);
  
  const wavPath = outputPath.replace('.mp3', '.wav');
  
  const script = `
from kokoro import KPipeline
import soundfile as sf
import numpy as np

text = open('${tempText}').read()
pipeline = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
segments = list(pipeline(text, voice='${voice}', speed=${speed}))
all_audio = np.concatenate([s[2] for s in segments])
sf.write('${wavPath}', all_audio, 24000)
print(f'Duration: {len(all_audio)/24000:.1f}s')
`;
  
  const scriptPath = `/tmp/kokoro_script_${Date.now()}.py`;
  fs.writeFileSync(scriptPath, script);
  
  try {
    execSync(`python3 ${scriptPath}`, { timeout: 300000, stdio: 'pipe' });
    
    // Convert WAV to MP3
    const ffmpeg = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
    execSync(`${ffmpeg} -y -i "${wavPath}" -codec:a libmp3lame -qscale:a 2 "${outputPath}"`, { stdio: 'pipe' });
    
    // Cleanup
    fs.unlinkSync(tempText);
    fs.unlinkSync(scriptPath);
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    
    return { path: outputPath, size: fs.statSync(outputPath).size, voice, speed };
  } catch (e) {
    // Cleanup on error
    if (fs.existsSync(tempText)) fs.unlinkSync(tempText);
    if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
    throw new Error(`Kokoro failed: ${e.message}`);
  }
}

// ===== Google Translate TTS (Fallback) =====

async function ttsGoogle(text, outputPath, voice = 'us') {
  const fs = require('fs');
  const path = require('path');
  
  const langMap = { 'us': 'en', 'uk': 'en-gb', 'au': 'en-au', 'default': 'en' };
  const lang = langMap[voice] || 'en';
  
  // Chunk text (Google TTS has ~200 char limit)
  const chunks = [];
  const sentences = text.replace(/\n/g, ' ').split(/(?<=[.!?])\s+/);
  let current = '';
  
  for (const sentence of sentences) {
    if (current.length + sentence.length < 180) {
      current += (current ? ' ' : '') + sentence;
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  
  // Download each chunk
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunks[i])}&tl=${lang}&client=tw-ob`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google TTS error: ${res.status}`);
    
    buffers.push(Buffer.from(await res.arrayBuffer()));
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200));
  }
  
  const combined = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, combined);
  
  return { 
    path: outputPath, 
    size: combined.length,
    chunks: chunks.length 
  };
}

// ===== Edge TTS (Microsoft, High Quality) =====

async function ttsEdge(text, outputPath, voice = 'en-US-AriaNeural') {
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Use edge-tts CLI (via edge-playwright or edge-tts pip package)
  // Fallback to using the node module
  const tempFile = `/tmp/edge_tts_${Date.now()}.mp3`;
  
  try {
    // Try using edge-tts pip package first
    const pythonScript = `
import asyncio
from edge_tts import Communicate

async def main():
    communicate = Communicate('${text.replace(/'/g, "\\'")}', '${voice}')
    await communicate.save('${tempFile}')
    print('Done')

asyncio.run(main())
`;
    
    const scriptPath = `/tmp/edge_tts_script_${Date.now()}.py`;
    fs.writeFileSync(scriptPath, pythonScript);
    
    execSync(`python3 ${scriptPath}`, { timeout: 120000, stdio: 'pipe' });
    fs.unlinkSync(scriptPath);
    
    if (fs.existsSync(tempFile)) {
      fs.copyFileSync(tempFile, outputPath);
      fs.unlinkSync(tempFile);
      return { path: outputPath, size: fs.statSync(outputPath).size, voice };
    }
    
    throw new Error('Edge TTS failed to create file');
  } catch (e) {
    // Final fallback: use edge-tts node module
    try {
      const { ttsSave } = require('../../node_modules/edge-tts/out/index.js');
      await ttsSave(text, outputPath, { voice, rate: '-10%' });
      return { path: outputPath, size: fs.statSync(outputPath).size, voice };
    } catch (e2) {
      throw new Error(`Edge TTS failed: ${e2.message}`);
    }
  }
}

// ===== Cloudflare Worker Implementations =====

async function textCloudflare(prompt, system, maxTokens) {
  const res = await fetch(`${WORKER_URL}/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      system,
      max_tokens: maxTokens,
      model: '@cf/openai/gpt-oss-120b'
    })
  });
  
  const data = await res.json();
  
  if (data.error) throw new Error(data.error);
  
  // Handle model bug: story in reasoning_content
  if (data.text === null && data.raw?.choices?.[0]?.message?.reasoning_content) {
    const reasoning = data.raw.choices[0].message.reasoning_content;
    const draftMatch = reasoning.match(/Draft:\s*\n+\s*"([^"]+)"/s);
    if (draftMatch) return draftMatch[1].trim();
    return reasoning;
  }
  
  return data.text;
}

async function imageCloudflare(prompt, outputPath, options = {}) {
  const res = await fetch(`${WORKER_URL}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      steps: options.steps || 4
    })
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 5000 && buffer.toString().includes('error')) {
    throw new Error(buffer.toString());
  }
  
  fs.writeFileSync(outputPath, buffer);
  return { path: outputPath, size: buffer.length, provider: 'cloudflare' };
}

async function ttsCloudflare(text, outputPath, speaker) {
  const res = await fetch(`${WORKER_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speaker })
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return { path: outputPath, size: buffer.length, provider: 'cloudflare' };
}

// ===== Groq Implementation =====

async function textGroq(prompt, system, maxTokens) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: maxTokens
    })
  });
  
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  
  return data.choices[0].message.content;
}

// ===== Cerebras Implementation =====

async function textCerebras(prompt, system, maxTokens) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CEREBRAS_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b',
      messages,
      max_tokens: maxTokens
    })
  });
  
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  
  return data.choices[0].message.content;
}

// ===== Pexels Implementation =====

async function imagePexels(prompt, outputPath) {
  // Extract more specific keywords from the full prompt
  // Include genre/style words for better results
  const keywords = prompt
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 6)  // More keywords
    .join(' ');
  
  // Add mood/atmosphere words if not present
  const moodWords = ['dark', 'moody', 'dramatic', 'cinematic', 'mysterious'];
  const hasMood = moodWords.some(w => keywords.includes(w));
  const searchQuery = hasMood ? keywords : `${keywords} dark moody`;
  
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`;
  
  const res = await fetch(url, {
    headers: { 'Authorization': PEXELS_KEY }
  });
  
  const data = await res.json();
  if (!data.photos?.length) throw new Error('No Pexels photos found');
  
  // Pick random photo
  const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
  
  // Download
  const imgRes = await fetch(photo.src.large);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  
  return { 
    path: outputPath, 
    size: buffer.length, 
    provider: 'pexels',
    photographer: photo.photographer,
    searchQuery
  };
}

// ===== Pollinations Implementation =====

async function imagePollinations(prompt, outputPath, options = {}) {
  const encoded = encodeURIComponent(prompt.substring(0, 500));
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${options.width || 1920}&height=${options.height || 1080}&nologo=true`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations error: ${res.status}`);
  
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 5000) throw new Error('Image too small, likely error');
  
  fs.writeFileSync(outputPath, buffer);
  return { path: outputPath, size: buffer.length, provider: 'pollinations' };
}

// ===== Quota Status =====

function getQuotaStatus() {
  checkQuotaReset();
  const used = quotaUsage.cloudflare.neurons;
  const total = providerConfig.quota.cloudflare.daily_neurons;
  return {
    provider: 'cloudflare',
    used,
    total,
    remaining: total - used,
    percentUsed: Math.round((used / total) * 100),
    resetTime: providerConfig.quota.cloudflare.reset_time
  };
}

module.exports = {
  generateText,
  generateImage,
  generateSpeech,
  getQuotaStatus,
  providerConfig
};