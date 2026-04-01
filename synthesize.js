#!/usr/bin/env node

/**
 * MysteryForge Speech Synthesis
 * 
 * Uses Kokoro TTS (82M params, local neural voice).
 * High quality, multiple voices, runs on localhost:5002.
 * 
 * Fallback: Google Translate TTS via gtts package.
 */

const fs = require('fs');
const path = require('path');
const { generateSpeech, getQuotaStatus } = require('./src/providers/index.js');

// Kokoro voices (local neural TTS)
// Kokoro voices (local neural TTS)
const VOICES = {
  af_sky: 'Female - soft, mysterious (recommended)',
  af_heart: 'Female - warm, emotional',
  af_bella: 'Female - smooth',
  af_sarah: 'Female - clear',
  am_adam: 'Male - deep',
  am_michael: 'Male - neutral'
};

// Language → Kokoro lang_code mapping
const LANG_CODES = {
  'en': 'a', 'es': 'e', 'fr': 'f', 'de': 'g',
  'it': 'i', 'pt': 'p', 'ja': 'j', 'zh': 'z', 'hi': 'h'
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    latest: args.includes('--latest'),
    voice: args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'af_sky',
    listVoices: args.includes('--list-voices'),
    lang: args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en'
  };
}

function getLatestStoryFolder() {
  const outputDir = path.join(process.cwd(), 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && 
             !['images', 'voice_tests', 'ai_images_test'].includes(f);
    })
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return folders.length > 0 ? path.join(outputDir, folders[0].name) : null;
}

async function main() {
  const options = parseArgs();
  
  if (options.listVoices) {
    console.log('\n🎤 Available voices:\n');
    Object.entries(VOICES).forEach(([name, desc]) => {
      console.log(`  ${name.padEnd(10)} - ${desc}`);
    });
    console.log('\n');
    process.exit(0);
  }

  let storyFolder = null;
  if (options.latest) {
    storyFolder = getLatestStoryFolder();
    if (!storyFolder) {
      console.error('❌ No story folders found');
      process.exit(1);
    }
  } else {
    console.error('❌ Please use --latest');
    console.error('   Usage: node synthesize.js --latest [--voice orion]');
    process.exit(1);
  }

  const narrationPath = path.join(storyFolder, 'narration.txt');
  const outputPath = path.join(storyFolder, 'narration.mp3');

  if (!fs.existsSync(narrationPath)) {
    console.error('❌ No narration.txt found');
    process.exit(1);
  }

  const text = fs.readFileSync(narrationPath, 'utf8').trim();
  const voice = options.voice;

  if (!VOICES[voice]) {
    console.error(`❌ Unknown voice: ${voice}. Use --list-voices to see options.`);
    process.exit(1);
  }

  console.log(`\n🎙️ Synthesizing: ${narrationPath}`);
  console.log(`   Voice: ${voice} (${VOICES[voice]})`);
  console.log(`   Length: ${text.split(/\s+/).length} words\n`);

  try {
    const result = await generateSpeech(text, outputPath, voice, 0.7, options.lang);
    console.log(`\n✅ Audio saved: ${outputPath}`);
    console.log(`   Size: ${(result.size / 1024).toFixed(1)} KB\n`);
  } catch (e) {
    console.error('❌ Synthesis failed:', e.message);
    process.exit(1);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });