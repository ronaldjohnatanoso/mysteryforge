#!/usr/bin/env node

/**
 * MysteryForge TTS - Kokoro (High Quality) or Google (Fallback)
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function synthesizeKokoro(text, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Write text to temp file
  const tempText = `/tmp/kokoro_text_${Date.now()}.txt`;
  fs.writeFileSync(tempText, text);
  
  const script = `
from kokoro import KPipeline
import soundfile as sf
import numpy as np
import sys

text = open('${tempText}').read()
pipeline = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')

segments = list(pipeline(text, voice='af_heart', speed=1))
all_audio = np.concatenate([s[2] for s in segments])
sf.write('${outputPath.replace('.mp3', '.wav')}', all_audio, 24000)
print(f'Duration: {len(all_audio)/24000:.1f}s')
`;

  const scriptPath = `/tmp/kokoro_script_${Date.now()}.py`;
  fs.writeFileSync(scriptPath, script);
  
  return new Promise((resolve, reject) => {
    exec(`python3 ${scriptPath} 2>/dev/null`, { timeout: 600000 }, (err, stdout, stderr) => {
      fs.unlinkSync(tempText);
      fs.unlinkSync(scriptPath);
      
      if (err) {
        reject(new Error(`Kokoro failed: ${stderr || err.message}`));
        return;
      }
      
      // Convert WAV to MP3
      const wavPath = outputPath.replace('.mp3', '.wav');
      exec(`~/.local/bin/ffmpeg -y -i "${wavPath}" -codec:a libmp3lame -qscale:a 2 "${outputPath}" 2>/dev/null`, (err2) => {
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
        if (err2) reject(new Error('MP3 conversion failed'));
        else resolve({ path: outputPath, size: fs.statSync(outputPath).size, engine: 'kokoro' });
      });
    });
  });
}

// Google TTS fallback
const https = require('https');
function chunkText(text, max = 180) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';
  for (const s of sentences) {
    if (current.length + s.length + 1 <= max) current += (current ? ' ' : '') + s;
    else { if (current) chunks.push(current); current = s; }
  }
  if (current) chunks.push(current);
  return chunks;
}

function downloadChunk(text, lang) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, res2 => {
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function synthesizeGoogle(text, outputPath, lang = 'en') {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const chunks = chunkText(text);
  console.log(`  Google TTS: ${chunks.length} chunks`);
  
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    buffers.push(await downloadChunk(chunks[i], lang));
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200));
  }
  
  fs.writeFileSync(outputPath, Buffer.concat(buffers));
  return { path: outputPath, size: fs.statSync(outputPath).size, engine: 'google' };
}

async function synthesize(text, outputPath, options = {}) {
  const engine = options.engine || 'kokoro';
  
  try {
    if (engine === 'kokoro') {
      console.log('  Using Kokoro TTS (high quality)...');
      return await synthesizeKokoro(text, outputPath);
    }
  } catch (e) {
    console.log(`  Kokoro failed: ${e.message}`);
    console.log('  Falling back to Google TTS...');
  }
  
  return synthesizeGoogle(text, outputPath, options.lang);
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  let input = args.find(a => a.endsWith('.txt') || a.endsWith('.md'));
  
  if (!input) {
    const outputDir = path.join(process.cwd(), 'output');
    const folders = fs.readdirSync(outputDir)
      .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
      .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (folders.length === 0) {
      console.error('No story folders found.');
      process.exit(1);
    }
    input = path.join(outputDir, folders[0].name, 'narration.txt');
  }

  console.log(`\n🎙️ Synthesizing: ${input}`);
  
  const text = fs.readFileSync(input, 'utf8');
  const output = input.replace(/\.(txt|md)$/, '.mp3');
  
  const result = await synthesize(text, output, { engine: args.includes('--google') ? 'google' : 'kokoro' });
  console.log(`\n✅ Audio saved: ${result.path} (${result.engine})\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

module.exports = { synthesize };