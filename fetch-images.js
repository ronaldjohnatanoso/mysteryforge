#!/usr/bin/env node

/**
 * MysteryForge Images - Fetch stock images from Pexels
 * 
 * Usage:
 *   node fetch-images.js <query> [options]
 *   node fetch-images.js "dark forest" --count 5 --output images/
 */

const fs = require('fs');
const path = require('path');
const { searchImages, downloadImage, getMysteryImages } = require('./src/images/fetcher');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    query: null,
    count: 5,
    output: 'output/images',
    type: null
  };

  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--') && !options.query) {
      options.query = args[i];
    } else {
      switch (args[i]) {
        case '--count':
          options.count = parseInt(args[++i], 10);
          break;
        case '--output':
          options.output = args[++i];
          break;
        case '--type':
          options.type = args[++i];
          break;
      }
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  if (!process.env.PEXELS_API_KEY) {
    console.log('\n❌ PEXELS_API_KEY not set.');
    console.log('\nGet a free API key at: https://www.pexels.com/api/');
    console.log('Then run: export PEXELS_API_KEY=your_key_here\n');
    process.exit(1);
  }

  console.log('\n🖼️  MysteryForge Images - Fetching...\n');

  try {
    let result;
    
    if (options.type) {
      console.log(`  Type: ${options.type}`);
      result = await getMysteryImages(options.type);
    } else if (options.query) {
      console.log(`  Query: ${options.query}`);
      result = await searchImages(options.query, options.count);
    } else {
      console.log('  Type: random mystery');
      result = await getMysteryImages('thumbnail');
    }

    console.log(`  Found: ${result.photos.length} images\n`);

    const outputDir = path.resolve(options.output);
    
    for (let i = 0; i < Math.min(result.photos.length, options.count); i++) {
      const photo = result.photos[i];
      const filename = `image_${photo.id}.jpg`;
      const outputPath = path.join(outputDir, filename);
      
      console.log(`  [${i + 1}/${options.count}] Downloading...`);
      console.log(`    Photographer: ${photo.photographer}`);
      
      await downloadImage(photo.url, outputPath);
      
      console.log(`    Saved: ${outputPath}\n`);
    }

    const metadataPath = path.join(outputDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(result.photos.slice(0, options.count), null, 2));
    
    console.log(`✅ Done! Images saved to: ${outputDir}\n`);

  } catch (e) {
    console.error(`\n❌ Error: ${e.message}\n`);
    process.exit(1);
  }
}

main();