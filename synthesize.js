#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const VOICES = { 'us': 'en', 'uk': 'en-gb', 'default': 'en' };

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

async function synthesize(text, outputPath, lang = 'en') {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const chunks = chunkText(text);
  console.log(`  Synthesizing ${chunks.length} chunks...`);
  
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) {
    buffers.push(await downloadChunk(chunks[i], lang));
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200));
  }
  
  fs.writeFileSync(outputPath, Buffer.concat(buffers));
  return { path: outputPath, size: fs.statSync(outputPath).size };
}

async function main() {
  const args = process.argv.slice(2);
  let input = args.find(a => a.endsWith('.txt') || a.endsWith('.md'));
  
  if (!input) {
    // Find latest story folder by modification time
    const outputDir = path.join(process.cwd(), 'output');
    const folders = fs.readdirSync(outputDir)
      .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
      .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (folders.length === 0) {
      console.error('No story folders found. Generate a story first.');
      process.exit(1);
    }
    const latest = path.join(outputDir, folders[0].name);
    input = path.join(latest, 'narration.txt');
    if (!fs.existsSync(input)) input = path.join(latest, 'story.md');
  }

  const voice = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'us';
  const lang = VOICES[voice] || 'en';
  
  console.log(`\n🎙️ Synthesizing: ${input}`);
  
  const text = fs.readFileSync(input, 'utf8');
  const output = input.replace(/\.(txt|md)$/, '.mp3');
  
  await synthesize(text, output, lang);
  console.log(`\n✅ Audio saved: ${output}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });