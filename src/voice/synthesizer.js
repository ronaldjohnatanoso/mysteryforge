/**
 * Voice Synthesis Module - Google Translate TTS
 * 
 * Free, no API key needed, works everywhere.
 * Uses Google Translate's TTS endpoint directly.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';

const VOICES = {
  'us': 'en',
  'uk': 'en-gb',
  'au': 'en-au',
  'default': 'en'
};

function cleanText(text) {
  return text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\n{3,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\.{2,}/g, '.')
    .trim();
}

function chunkText(text, maxLength = 180) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 <= maxLength) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      
      if (sentence.length > maxLength) {
        const words = sentence.split(' ');
        currentChunk = '';
        for (const word of words) {
          if (currentChunk.length + word.length + 1 <= maxLength) {
            currentChunk += (currentChunk ? ' ' : '') + word;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = word;
          }
        }
      } else {
        currentChunk = sentence;
      }
    }
  }
  
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function downloadChunk(text, lang) {
  return new Promise((resolve, reject) => {
    const url = `${GOOGLE_TTS_URL}?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (res2) => {
          const chunks = [];
          res2.on('data', chunk => chunks.push(chunk));
          res2.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function synthesize(text, outputPath, options = {}) {
  const lang = VOICES[options.voice] || 'en';
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const cleanContent = cleanText(text);
  const chunks = chunkText(cleanContent);
  
  console.log(`  Synthesizing ${chunks.length} chunks...`);
  
  const audioBuffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const buffer = await downloadChunk(chunks[i], lang);
    audioBuffers.push(buffer);
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200));
  }
  
  const combinedBuffer = Buffer.concat(audioBuffers);
  fs.writeFileSync(outputPath, combinedBuffer);
  
  return {
    path: outputPath,
    size: fs.statSync(outputPath).size,
    voice: `Google TTS (${lang})`,
    chunks: chunks.length
  };
}

async function synthesizeWithPacing(text, outputPath, options = {}) {
  const pacedText = text.replace(/\n\n/g, '... ').replace(/\n/g, '. ');
  return synthesize(pacedText, outputPath, options);
}

function listVoices() {
  return [
    { alias: 'us', voiceId: 'en' },
    { alias: 'uk', voiceId: 'en-gb' },
    { alias: 'au', voiceId: 'en-au' }
  ];
}

module.exports = { synthesize, synthesizeWithPacing, listVoices, VOICES };