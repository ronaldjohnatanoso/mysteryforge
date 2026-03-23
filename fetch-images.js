#!/usr/bin/env node

/**
 * MysteryForge Images - Fetch images for story segments
 * 
 * Supports:
 *   - AI generation via Pollinations (free, rate limited)
 *   - Stock photos via Pexels (reliable, less specific)
 * 
 * Usage:
 *   node fetch-images.js --latest              # Use Pexels (default, reliable)
 *   node fetch-images.js --latest --ai         # Use AI generation (free, slow)
 *   node fetch-images.js --latest --ai --fast  # Skip rate limit waits (may fail)
 */

const fs = require('fs');
const path = require('path');
const { generateImage: pollinationsGenerate } = require('./src/images/ai-generator');
const { generateImage: geminiGenerate } = require('./src/images/gemini-generator');
const { searchImages, downloadImage } = require('./src/images/fetcher');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    latest: args.includes('--latest'),
    ai: args.includes('--ai'),
    gemini: args.includes('--gemini'),
    pexels: args.includes('--pexels'),
    fast: args.includes('--fast'),
    count: args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1], 10) : null
  };
}

function getLatestStoryFolder() {
  const outputDir = path.join(process.cwd(), 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && 
             !['images', 'voice_tests', 'ai_images_test'].includes(f) &&
             fs.existsSync(path.join(p, 'story.json'));
    })
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return folders.length > 0 ? path.join(outputDir, folders[0].name) : null;
}

function loadStoryData(storyFolder) {
  const storyPath = path.join(storyFolder, 'story.json');
  if (!fs.existsSync(storyPath)) return null;
  return JSON.parse(fs.readFileSync(storyPath, 'utf8'));
}

/**
 * Extract search keywords from image prompt
 */
function extractKeywords(imagePrompt) {
  // Remove common filler words and technical terms
  const stopWords = ['photorealistic', 'cinematic', 'lighting', 'dramatic', 'high quality', '4k', 'atmosphere', 'dark', 'moody', 'soft', 'warm', 'cold', 'bright'];
  
  let keywords = imagePrompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  // Take first 3-4 meaningful words
  return keywords.slice(0, 4).join(' ');
}

/**
 * Get Pexels search query based on story genre and segment content
 */
function getPexelsQuery(segment, genre, index) {
  // Genre-specific base queries
  const genreBases = {
    revenge: ['office', 'business', 'corporate', 'workplace', 'meeting'],
    horror: ['dark', 'scary', 'abandoned', 'forest', 'night'],
    mystery: ['mystery', 'detective', 'clue', 'investigation', 'shadow'],
    confession: ['person', 'portrait', 'emotional', 'face', 'thinking']
  };
  
  // Extract keywords from the image prompt
  const promptKeywords = extractKeywords(segment.image_prompt || '');
  
  // Try prompt keywords first, fallback to genre-based
  if (promptKeywords.length > 10) {
    return promptKeywords;
  }
  
  // Use genre-based rotation with some variety
  const bases = genreBases[genre] || genreBases.mystery;
  return bases[index % bases.length];
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const options = parseArgs();
  
  if (!options.latest) {
    console.error('❌ Please use --latest to specify which story to process');
    console.error('');
    console.error('Usage:');
    console.error('  node fetch-images.js --latest              # Pexels stock photos (default)');
    console.error('  node fetch-images.js --latest --gemini     # Gemini AI images (500/day free)');
    console.error('  node fetch-images.js --latest --ai         # Pollinations AI (fallback)');
    console.error('');
    console.error('Options:');
    console.error('  --count N   Generate only N images');
    console.error('  --fast      Skip rate limit waits');
    process.exit(1);
  }

  const storyFolder = getLatestStoryFolder();
  if (!storyFolder) {
    console.error('❌ No story folders found in output/');
    process.exit(1);
  }

  const storyData = loadStoryData(storyFolder);
  if (!storyData) {
    console.error('❌ No story.json found in', storyFolder);
    process.exit(1);
  }

  const outputDir = path.join(storyFolder, 'images');
  fs.mkdirSync(outputDir, { recursive: true });

  // Get segments
  const segments = storyData.segments || [];
  if (segments.length === 0) {
    console.error('❌ No segments found in story.json');
    process.exit(1);
  }

  const totalImages = options.count || segments.length;
  const imagesToGenerate = Math.min(totalImages, segments.length);

  console.log(`\n🖼️ Fetching images for: ${storyData.title}`);
  
  // Determine mode
  let mode = 'pexels'; // default
  if (options.gemini || (options.ai && process.env.GEMINI_API_KEY)) {
    mode = 'gemini';
  } else if (options.ai) {
    mode = 'pollinations';
  } else if (options.pexels) {
    mode = 'pexels';
  }
  
  console.log(`   Mode: ${mode === 'gemini' ? 'AI (Gemini Imagen)' : mode === 'pollinations' ? 'AI (Pollinations)' : 'Stock (Pexels)'}`);
  console.log(`   Segments: ${segments.length}`);
  console.log(`   Images needed: ${imagesToGenerate}\n`);

  let successCount = 0;
  let skipCount = 0;

  if (mode === 'gemini') {
    // AI Generation via Gemini Imagen (500/day free, 2/min)
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not set. Get free key at https://aistudio.google.com/apikey');
      process.exit(1);
    }
    console.log('⚡ Using Gemini Imagen (500 images/day free, ~30s per image)\n');
    
    for (let i = 0; i < imagesToGenerate; i++) {
      const segment = segments[i];
      const outputPath = path.join(outputDir, `img_${String(i).padStart(3, '0')}.jpg`);
      
      // Skip if valid image exists
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 10000) {
          console.log(`[${i + 1}/${imagesToGenerate}] ✓ Exists`);
          skipCount++;
          successCount++;
          continue;
        }
      }

      const basePrompt = segment.image_prompt || `cinematic scene from story, ${storyData.genre}`;
      
      console.log(`[${i + 1}/${imagesToGenerate}] "${segment.text.substring(0, 40)}..."`);

      try {
        await geminiGenerate(basePrompt, outputPath);
        console.log(`   ✓ Saved`);
        successCount++;
      } catch (e) {
        console.log(`   ✗ Error: ${e.message}`);
      }

      // Gemini rate limit: 2 images/min = 30s between
      if (i < imagesToGenerate - 1 && !options.fast) {
        await sleep(31000);
      }
    }
    
  } else if (mode === 'pollinations') {
    // AI Generation via Pollinations (free but unreliable)
    console.log('⚠️  Pollinations is free but heavily rate-limited and often returns errors.');
    console.log('   Recommend: set GEMINI_API_KEY and use --gemini instead.\n');
    
    for (let i = 0; i < imagesToGenerate; i++) {
      const segment = segments[i];
      const outputPath = path.join(outputDir, `img_${String(i).padStart(3, '0')}.jpg`);
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 10000) {
          console.log(`[${i + 1}/${imagesToGenerate}] ✓ Exists`);
          skipCount++;
          successCount++;
          continue;
        }
      }

      const basePrompt = segment.image_prompt || `cinematic scene from story, ${storyData.genre}`;
      
      console.log(`[${i + 1}/${imagesToGenerate}] "${segment.text.substring(0, 40)}..."`);

      try {
        await pollinationsGenerate(basePrompt, outputPath, { 
          maxRetries: options.fast ? 1 : 3 
        });
        console.log(`   ✓ Saved`);
        successCount++;
      } catch (e) {
        console.log(`   ✗ Error: ${e.message}`);
      }

      if (i < imagesToGenerate - 1 && !options.fast) {
        console.log(`   ⏳ Waiting 90s for rate limit...`);
        await sleep(90000);
      }
    }
      }
    }
    
  } else {
    // Stock photos via Pexels (fast, reliable)
    if (!process.env.PEXELS_API_KEY) {
      console.error('❌ PEXELS_API_KEY not set.');
      console.error('   Options:');
      console.error('   - Get Pexels key: https://www.pexels.com/api/');
      console.error('   - Use Gemini AI: set GEMINI_API_KEY and run with --gemini');
      process.exit(1);
    }

    console.log('📥 Fetching stock photos from Pexels...\n');

    for (let i = 0; i < imagesToGenerate; i++) {
      const segment = segments[i];
      const outputPath = path.join(outputDir, `img_${String(i).padStart(3, '0')}.jpg`);
      
      // Skip if valid image exists
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 10000) {
          console.log(`[${i + 1}/${imagesToGenerate}] ✓ Exists`);
          skipCount++;
          successCount++;
          continue;
        }
      }

      // Get search query for this segment
      const query = getPexelsQuery(segment, storyData.genre, i);
      
      console.log(`[${i + 1}/${imagesToGenerate}] Searching: "${query}"`);

      try {
        const result = await searchImages(query, 3);
        
        if (result.photos && result.photos.length > 0) {
          // Pick a random photo from results for variety
          const photoIndex = Math.floor(Math.random() * Math.min(result.photos.length, 3));
          const photo = result.photos[photoIndex];
          
          await downloadImage(photo.url, outputPath);
          console.log(`   ✓ Downloaded (${photo.photographer})`);
          successCount++;
        } else {
          console.log(`   ✗ No photos found`);
        }
      } catch (e) {
        console.log(`   ✗ Error: ${e.message}`);
      }

      // Small delay between Pexels requests (they allow more)
      if (i < imagesToGenerate - 1) {
        await sleep(500);
      }
    }
  }

  const finalCount = fs.readdirSync(outputDir).filter(f => f.endsWith('.jpg')).length;
  
  console.log(`\n📊 Summary:`);
  console.log(`   Fetched: ${successCount - skipCount}`);
  console.log(`   Skipped: ${skipCount}`);
  console.log(`   Total images: ${finalCount}`);
  console.log(`\n✅ Done!\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });