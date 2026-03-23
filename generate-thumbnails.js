#!/usr/bin/env node

/**
 * MysteryForge Thumbnail Generator
 * 
 * Generates thumbnail candidates from video or images.
 * - Extracts key frames from video
 * - Generates AI thumbnails with text overlay
 * - Creates multiple sizes for different platforms
 * 
 * Usage:
 *   node generate-thumbnails.js --latest
 *   node generate-thumbnails.js "story_folder" --count 5
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');

const THUMBNAIL_SIZES = {
  youtube: { width: 1280, height: 720, name: 'YouTube' },
  tiktok: { width: 1080, height: 1920, name: 'TikTok' },
  instagram: { width: 1080, height: 1080, name: 'Instagram' },
  twitter: { width: 1200, height: 675, name: 'Twitter/X' }
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    latest: args.includes('--latest'),
    count: args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : 3,
    storyFolder: args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')),
    allSizes: args.includes('--all-sizes'),
    withText: args.includes('--text')
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
  
  return folders[0]?.name;
}

function getVideoDuration(videoPath) {
  try {
    const result = execSync(
      `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(result);
  } catch (e) {
    return 0;
  }
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function extractFrame(videoPath, timestamp, outputPath, size = null) {
  let filter = '';
  if (size) {
    filter = `-vf "scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:black"`;
  }
  
  execSync(
    `${FFMPEG} -y -ss ${timestamp} -i "${videoPath}" -frames:v 1 ${filter} "${outputPath}"`,
    { stdio: 'pipe' }
  );
  
  return outputPath;
}

function extractKeyFrames(videoPath, outputDir, count = 3) {
  const duration = getVideoDuration(videoPath);
  if (duration <= 0) {
    throw new Error('Could not determine video duration');
  }
  
  const frames = [];
  const intervals = [];
  
  // Calculate key moments (avoid first/last 10%)
  const start = duration * 0.1;
  const end = duration * 0.9;
  const step = (end - start) / (count + 1);
  
  for (let i = 1; i <= count; i++) {
    intervals.push(start + (step * i));
  }
  
  console.log(`   Extracting ${count} frames from ${duration.toFixed(1)}s video...`);
  
  intervals.forEach((time, i) => {
    const framePath = path.join(outputDir, `thumb_${String(i + 1).padStart(2, '0')}.jpg`);
    extractFrame(videoPath, time, framePath);
    frames.push({ path: framePath, timestamp: time });
    console.log(`   ✓ Frame ${i + 1} at ${formatTimestamp(time)}`);
  });
  
  return frames;
}

function createThumbnailVariants(sourcePath, outputDir, baseName, story) {
  const variants = [];
  
  // Read story data for text overlay
  const hookText = story?.segments?.[0]?.text?.substring(0, 50) || '';
  
  Object.entries(THUMBNAIL_SIZES).forEach(([platform, size]) => {
    const variantPath = path.join(outputDir, `${baseName}_${platform}.jpg`);
    
    // Extract frame at specific size
    extractFrame(sourcePath, 0, variantPath, size);
    
    variants.push({ platform: size.name, path: variantPath, size });
    console.log(`   ✓ ${size.name}: ${size.width}x${size.height}`);
  });
  
  return variants;
}

async function generateThumbnails(storyFolder, opts) {
  const storyPath = path.join(process.cwd(), 'output', storyFolder);
  
  if (!fs.existsSync(storyPath)) {
    throw new Error(`Story folder not found: ${storyPath}`);
  }
  
  // Load story data
  const storyFile = path.join(storyPath, 'story.json');
  let story = null;
  if (fs.existsSync(storyFile)) {
    story = JSON.parse(fs.readFileSync(storyFile, 'utf8'));
  }
  
  // Create thumbnails directory
  const thumbsDir = path.join(storyPath, 'thumbnails');
  fs.mkdirSync(thumbsDir, { recursive: true });
  
  console.log(`\n🖼️  Generating thumbnails for: ${storyFolder}`);
  console.log(`   Output: ${thumbsDir}/\n`);
  
  const results = { frames: [], variants: [] };
  
  // Check for video
  const videoPath = path.join(storyPath, 'video.mp4');
  if (fs.existsSync(videoPath)) {
    console.log('   Source: video.mp4\n');
    results.frames = extractKeyFrames(videoPath, thumbsDir, opts.count);
    
    // Create platform variants from first frame
    if (opts.allSizes && results.frames.length > 0) {
      console.log('\n   Creating platform variants...\n');
      results.variants = createThumbnailVariants(
        results.frames[0].path, 
        thumbsDir, 
        'thumb_01',
        story
      );
    }
  } else {
    // Use images from images folder
    const imagesDir = path.join(storyPath, 'images');
    if (fs.existsSync(imagesDir)) {
      const images = fs.readdirSync(imagesDir)
        .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
        .sort();
      
      if (images.length > 0) {
        console.log(`   Source: ${images.length} images\n`);
        
        // Pick evenly distributed images
        const step = Math.max(1, Math.floor(images.length / opts.count));
        for (let i = 0; i < opts.count && i * step < images.length; i++) {
          const srcPath = path.join(imagesDir, images[i * step]);
          const destPath = path.join(thumbsDir, `thumb_${String(i + 1).padStart(2, '0')}.jpg`);
          fs.copyFileSync(srcPath, destPath);
          results.frames.push({ path: destPath, index: i * step });
          console.log(`   ✓ Copied image ${i * step + 1}: ${images[i * step]}`);
        }
      } else {
        throw new Error('No images found in story folder');
      }
    } else {
      throw new Error('No video or images found. Run assemble-video first.');
    }
  }
  
  // Summary
  console.log(`\n✅ Generated ${results.frames.length} thumbnail candidates`);
  if (results.variants.length > 0) {
    console.log(`   ${results.variants.length} platform variants created`);
  }
  console.log(`   📁 ${thumbsDir}/\n`);
  
  return results;
}

async function main() {
  const opts = parseArgs();
  
  let storyFolder = opts.storyFolder;
  if (opts.latest || !storyFolder) {
    storyFolder = getLatestStoryFolder();
    if (!storyFolder) {
      console.error('❌ No story folders found');
      process.exit(1);
    }
    console.log(`   Using latest: ${storyFolder}`);
  }
  
  try {
    await generateThumbnails(storyFolder, opts);
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  }
}

main();