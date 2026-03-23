#!/usr/bin/env node

/**
 * MysteryForge Image Generator v2
 * 
 * Generates images with character consistency:
 * - Character shots: prepend characterAnchor to imagePrompt
 * - Non-character shots: use imagePrompt directly
 * - Parallel batches for speed
 * - Saves character shots to both images/ and character-shots/
 */

const fs = require('fs');
const path = require('path');
const { generateImage: generateImageWithFallback } = require('./src/providers/index.js');

const BATCH_SIZE = 5; // Parallel batch size

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    latest: args.includes('--latest'),
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

/**
 * Process images in parallel batches
 */
async function processBatch(tasks, batchSize) {
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    
    if (i + batchSize < tasks.length) {
      console.log(`   Processed ${Math.min(i + batchSize, tasks.length)}/${tasks.length}...`);
    }
  }
  return results;
}

async function main() {
  const options = parseArgs();
  
  if (!options.latest) {
    console.error('❌ Use --latest to specify which story to process');
    console.error('   Usage: node fetch-images.js --latest [--count N]');
    process.exit(1);
  }

  const storyFolder = getLatestStoryFolder();
  if (!storyFolder) {
    console.error('❌ No story folders found');
    process.exit(1);
  }

  const storyPath = path.join(storyFolder, 'story.json');
  if (!fs.existsSync(storyPath)) {
    console.error('❌ No story.json found');
    process.exit(1);
  }

  const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  const segments = story.segments || [];
  
  if (segments.length === 0) {
    console.error('❌ No segments in story.json');
    process.exit(1);
  }

  const outputDir = path.join(storyFolder, 'images');
  const charDir = path.join(storyFolder, 'character-shots');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(charDir, { recursive: true });

  const totalImages = options.count || segments.length;
  const toProcess = Math.min(totalImages, segments.length);

  const characterAnchor = story.characterAnchor || '';
  const characterShots = segments.filter(s => s.isCharacterShot).length;

  console.log(`\n🎨 Generating images for: ${story.title}`);
  console.log(`   Segments: ${toProcess}`);
  console.log(`   Character anchor: "${characterAnchor.substring(0, 50)}..."`);
  console.log(`   Character shots: ${characterShots}`);
  console.log(`   Batch size: ${BATCH_SIZE} (parallel)\n`);

  // Build image generation tasks
  const tasks = [];
  let charIndex = 0;

  for (let i = 0; i < toProcess; i++) {
    const segment = segments[i];
    const isChar = segment.isCharacterShot;
    const outputPath = path.join(outputDir, `image-${String(i).padStart(3, '0')}.jpg`);
    
    // Skip if exists and valid
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 10000) {
        console.log(`[${i + 1}/${toProcess}] ✓ Exists: image-${String(i).padStart(3, '0')}.jpg`);
        continue;
      }
    }

    // Build prompt: prepend character anchor for character shots
    let prompt;
    if (isChar && characterAnchor) {
      prompt = `${characterAnchor}, ${segment.imagePrompt || 'dramatic scene'}`;
    } else {
      prompt = segment.imagePrompt || `cinematic scene: ${segment.text?.substring(0, 80)}`;
    }

    // Ensure cinematic style suffix
    if (!prompt.includes('cinematic')) {
      prompt += ', cinematic lighting, photorealistic, 4k';
    }

    const finalPrompt = prompt;
    const segIndex = i;

    tasks.push((async () => {
      const type = isChar ? '👤 CHAR' : '🎬 SCENE';
      console.log(`[${segIndex + 1}/${toProcess}] ${type}: "${segment.text?.substring(0, 35)}..."`);
      
      try {
        await generateImageWithFallback(finalPrompt, outputPath, 4);
        
        // Also save to character-shots folder
        if (isChar) {
          const charPath = path.join(charDir, `char-${String(charIndex).padStart(3, '0')}.jpg`);
          fs.copyFileSync(outputPath, charPath);
          charIndex++;
        }
        
        console.log(`   ✓ Saved`);
        return { success: true, index: segIndex, isChar };
      } catch (e) {
        console.log(`   ✗ Error: ${e.message.substring(0, 50)}`);
        return { success: false, index: segIndex, error: e.message };
      }
    })());
  }

  // Process all tasks (they're already started as promises)
  const results = await Promise.all(tasks);
  
  // Stats
  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const charSaved = results.filter(r => r.success && r.isChar).length;

  const totalImagesFinal = fs.readdirSync(outputDir).filter(f => f.endsWith('.jpg')).length;
  const totalChars = fs.readdirSync(charDir).filter(f => f.endsWith('.jpg')).length;

  console.log(`\n📊 Summary:`);
  console.log(`   Generated: ${success}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total images: ${totalImagesFinal}`);
  console.log(`   Character shots saved: ${totalChars}`);
  console.log(`\n✅ Done!\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });