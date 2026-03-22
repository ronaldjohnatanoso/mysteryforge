#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { assembleVideo } = require('./src/video/assembler');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { audio: null, images: [], imagesDir: null, output: 'output/videos/video.mp4', latest: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--audio': options.audio = args[++i]; break;
      case '--images': options.images = args[++i].split(',').map(p => p.trim()); break;
      case '--images-dir': options.imagesDir = args[++i]; break;
      case '--output': options.output = args[++i]; break;
      case '--latest': options.latest = true; break;
    }
  }
  return options;
}

function getLatestAudio() {
  const dir = 'output/scripts';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3'));
  if (files.length === 0) return null;
  files.sort().reverse();
  return path.join(dir, files[0]);
}

function getLatestImages() {
  const dir = 'output/images';
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.jpg') || f.endsWith('.png')).map(f => path.join(dir, f));
}

async function main() {
  const options = parseArgs();

  if (options.latest) {
    options.audio = getLatestAudio();
    options.images = getLatestImages();
    if (!options.audio) { console.error('No audio found.'); process.exit(1); }
    options.output = options.audio.replace('.mp3', '.mp4');
  }

  if (options.imagesDir) {
    options.images = fs.readdirSync(options.imagesDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
      .map(f => path.join(options.imagesDir, f));
  }

  if (!options.audio || options.images.length === 0) {
    console.log('Usage: node assemble-video.js --latest');
    process.exit(1);
  }

  try {
    await assembleVideo({ audio: options.audio, images: options.images, output: options.output });
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();