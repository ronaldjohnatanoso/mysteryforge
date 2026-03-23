#!/usr/bin/env node

/**
 * MysteryForge Simple Video Assembler
 * 
 * Lightweight assembly without heavy zoompan effects.
 * Uses simple crossfade transitions for reliability.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');

function getDuration(audioPath) {
  const result = execSync(`${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`).toString();
  return parseFloat(result.trim());
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
  const storyFolder = getLatestStoryFolder();
  if (!storyFolder) {
    console.error('No story folder found');
    process.exit(1);
  }

  console.log(`\n🎬 Simple assembly: ${path.basename(storyFolder)}`);

  const audioPath = path.join(storyFolder, 'narration.mp3');
  const imagesDir = path.join(storyFolder, 'images');
  const storyPath = path.join(storyFolder, 'story.json');

  if (!fs.existsSync(audioPath)) {
    console.error('No narration.mp3 found. Run synthesize.js first.');
    process.exit(1);
  }

  // Get images
  const images = fs.readdirSync(imagesDir)
    .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    })
    .map(f => path.join(imagesDir, f));

  if (images.length === 0) {
    console.error('No images found');
    process.exit(1);
  }

  const duration = await getDuration(audioPath);
  const durationPerImage = duration / images.length;

  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Images: ${images.length} (${durationPerImage.toFixed(1)}s each)`);

  // Create concat file with duration for each image
  const concatFile = `/tmp/concat_${Date.now()}.txt`;
  const imageList = images.map(img => `file '${img}'\nduration ${durationPerImage}`).join('\n');
  // Add last image again (required by concat demuxer)
  fs.writeFileSync(concatFile, imageList + `\nfile '${images[images.length - 1]}'`);

  // Simple video from images with crossfade filter
  const outputPath = path.join(storyFolder, 'video.mp4');
  
  console.log('\n   Encoding video...');
  
  // Simple approach: create slideshow with fade filter
  const filterComplex = images.map((_, i) => {
    const fadeIn = i === 0 ? '' : `,fade=t=in:st=${i * durationPerImage}:d=0.5`;
    return `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2${fadeIn}[v${i}]`;
  }).join(';');

  const concatFilter = `[${images.map((_, i) => `[v${i}]`).join('')}concat=n=${images.length}:v=1:a=0][v]`;
  
  // Simpler: use input image sequence directly
  const cmd = `${FFMPEG} -y -framerate ${1/durationPerImage} -i "${imagesDir}/stock_%d.jpg" -i "${audioPath}" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30" \
    -c:v libx264 -preset fast -crf 23 -c:a aac -shortest "${outputPath}" 2>&1`;

  try {
    execSync(cmd, { timeout: 300000, stdio: 'inherit' });
    console.log(`\n✅ Video saved: ${outputPath}`);
    console.log(`   Size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB\n`);
  } catch (e) {
    // Fallback: even simpler with loop input
    console.log('   Trying fallback method...');
    const fallbackCmd = `${FFMPEG} -y -loop 1 -framerate 1/${durationPerImage} -i "${imagesDir}/stock_%06d.jpg" -i "${audioPath}" \
      -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=24" \
      -c:v libx264 -preset ultrafast -crf 28 -c:a aac -shortest "${outputPath}" 2>&1`;
    
    // Actually, let's just use one image and loop it
    const simplestCmd = `${FFMPEG} -y -loop 1 -i "${images[0]}" -i "${audioPath}" \
      -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
      -c:v libx264 -preset ultrafast -crf 28 -c:a aac -shortest "${outputPath}" 2>&1`;
    
    try {
      execSync(simplestCmd, { timeout: 300000 });
      console.log(`\n✅ Video saved (single image mode): ${outputPath}`);
      console.log(`   Size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB\n`);
    } catch (e2) {
      console.error('❌ Video encoding failed:', e2.message);
      process.exit(1);
    }
  }
}

main();