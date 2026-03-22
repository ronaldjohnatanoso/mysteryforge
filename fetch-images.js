#!/usr/bin/env node

/**
 * MysteryForge Images - Fetch stock or AI-generated images
 * 
 * Usage:
 *   node fetch-images.js <query> --count 3                    # Pexels stock
 *   node fetch-images.js --ai --count 3                       # Pollinations AI
 *   node fetch-images.js --ai "haunted mansion" --count 3     # Pollinations AI with prompt
 *   node fetch-images.js --latest                             # For latest story folder
 */

const fs = require('fs');
const path = require('path');
const { searchImages, downloadImage } = require('./src/images/fetcher');
const { generateImage, generateMysteryImages } = require('./src/images/ai-generator');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    query: null,
    count: 3,
    output: null,
    ai: false,
    latest: false
  };

  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--') && !options.query) {
      options.query = args[i];
    } else {
      switch (args[i]) {
        case '--count': options.count = parseInt(args[++i], 10); break;
        case '--output': options.output = args[++i]; break;
        case '--ai': options.ai = true; break;
        case '--latest': options.latest = true; break;
      }
    }
  }
  return options;
}

function getLatestStoryFolder() {
  const outputDir = path.join(process.cwd(), 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory() && f !== 'images' && f !== 'voice_tests' && f !== 'ai_images_test')
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return folders.length > 0 ? path.join(outputDir, folders[0].name) : null;
}

async function main() {
  const options = parseArgs();
  
  let outputDir = options.output;
  
  if (options.latest) {
    const storyFolder = getLatestStoryFolder();
    if (!storyFolder) {
      console.error('No story folders found.');
      process.exit(1);
    }
    outputDir = path.join(storyFolder, 'images');
    console.log(`\n📁 Output: ${outputDir}\n`);
  }
  
  if (!outputDir) {
    outputDir = 'output/images';
  }
  
  fs.mkdirSync(outputDir, { recursive: true });

  if (options.ai) {
    // AI-generated images via Pollinations
    console.log('\n🎨 Generating AI images (Pollinations)...\n');
    console.log('⚠️  Rate limit: ~90 seconds between images\n');
    
    if (options.query) {
      // Single prompt
      for (let i = 0; i < options.count; i++) {
        const outputPath = path.join(outputDir, `ai_image_${i + 1}.jpg`);
        console.log(`[${i + 1}/${options.count}] Generating...`);
        
        try {
          await generateImage(options.query, outputPath);
          console.log(`  Saved: ${outputPath}`);
        } catch (e) {
          console.log(`  Error: ${e.message}`);
        }
        
        if (i < options.count - 1) {
          console.log('  Waiting 90s...');
          await new Promise(r => setTimeout(r, 90000));
        }
      }
    } else {
      // Mystery-themed prompts
      await generateMysteryImages(outputDir, options.count);
    }
    
  } else {
    // Stock images via Pexels
    if (!process.env.PEXELS_API_KEY) {
      console.error('❌ PEXELS_API_KEY not set. Use --ai for free AI images, or set the API key.');
      process.exit(1);
    }
    
    const query = options.query || 'dark mystery';
    console.log(`\n🖼️ Fetching stock images (Pexels): "${query}"...\n`);
    
    try {
      const result = await searchImages(query, options.count);
      
      for (let i = 0; i < Math.min(result.photos.length, options.count); i++) {
        const photo = result.photos[i];
        const filename = `stock_${photo.id}.jpg`;
        const outputPath = path.join(outputDir, filename);
        
        console.log(`[${i + 1}/${options.count}] ${photo.photographer}`);
        await downloadImage(photo.url, outputPath);
        console.log(`  Saved: ${outputPath}`);
      }
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  }
  
  console.log('\n✅ Done!\n');
}

main();