#!/usr/bin/env node

/**
 * MysteryForge Voice - Text to Speech
 * 
 * Converts generated scripts to audio using Edge-TTS (free).
 * 
 * Usage:
 *   node synthesize.js <input.md> [options]
 * 
 * Options:
 *   --voice <name>    Voice alias (default: storyteller)
 *   --mood <mood>     Mood: neutral, suspense, dramatic (default: suspense)
 *   --output <path>   Output MP3 file (default: same name as input)
 *   --list            List available voices
 */

const fs = require('fs');
const path = require('path');
const { synthesize, synthesizeWithPacing, listVoices } = require('./src/voice/synthesizer');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    voice: 'storyteller',
    mood: 'suspense',
    output: null,
    list: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i].endsWith('.md') && !options.input) {
      options.input = args[i];
    } else {
      switch (args[i]) {
        case '--voice':
          options.voice = args[++i];
          break;
        case '--mood':
          options.mood = args[++i];
          break;
        case '--output':
          options.output = args[++i];
          break;
        case '--list':
          options.list = true;
          break;
      }
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  if (options.list) {
    console.log('\n🎙️  Available Voices:\n');
    const voices = listVoices();
    voices.forEach(v => {
      console.log(`  ${v.alias.padEnd(15)} - ${v.description}`);
    });
    console.log('\nMoods: neutral, suspense, dramatic, energetic, calm\n');
    return;
  }

  if (!options.input) {
    console.log('Usage: node synthesize.js <input.md> [--voice <name>] [--mood <mood>] [--output <path>]');
    console.log('       node synthesize.js --list');
    process.exit(1);
  }

  if (!fs.existsSync(options.input)) {
    console.error(`❌ File not found: ${options.input}`);
    process.exit(1);
  }

  // Read input
  const text = fs.readFileSync(options.input, 'utf8');

  // Determine output path
  const outputPath = options.output || options.input.replace(/\.md$/, '.mp3');

  console.log('\n🎙️  MysteryForge Voice - Synthesizing...\n');
  console.log(`  Input: ${options.input}`);
  console.log(`  Voice: ${options.voice}`);
  console.log(`  Mood: ${options.mood}`);
  console.log(`  Output: ${outputPath}`);
  console.log('');

  try {
    const result = await synthesizeWithPacing(text, outputPath, {
      voice: options.voice,
      mood: options.mood
    });

    const sizeKB = Math.round(result.size / 1024);
    console.log(`\n✅ Audio saved to: ${result.path}`);
    console.log(`   Size: ${sizeKB} KB`);
    console.log(`   Voice: ${result.voice}\n`);

  } catch (e) {
    console.error(`\n❌ Synthesis failed: ${e.message}\n`);
    process.exit(1);
  }
}

main();