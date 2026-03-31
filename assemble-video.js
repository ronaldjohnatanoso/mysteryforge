#!/usr/bin/env node

/**
 * MysteryForge Video Assembler v2
 * 
 * Features:
 * - Ken Burns variations for character shots (so same image looks different)
 * - Standard effects for non-character shots
 * - Subtitles with word-level timing
 * 
 * Usage:
 *   node assemble-video.js --latest
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');
const { generateSRT } = require('./src/video/subtitles');

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

/**
 * Build video filter with support for mixed video/image inputs.
 * Character shots get simple scale (no Ken Burns — zoompan breaks on some FFmpeg builds).
 * Character shot indices come from story.json segments[].isCharacterShot.
 */
function buildVideoFilter(mediaFiles, charShotIndices, duration) {
  const fileCount = mediaFiles.length;
  const durationPerSegment = duration / fileCount;
  const charSet = new Set(charShotIndices);
  
  const inputs = [];
  let filterComplex = '';
  
  for (let i = 0; i < fileCount; i++) {
    const file = mediaFiles[i];
    const isVideo = file.endsWith('.mp4');
    const isChar = !isVideo && charSet.has(i);
    
    if (isVideo) {
      // Video file (B-roll): trim, scale, fps — no Ken Burns (already moving)
      inputs.push(`-t ${durationPerSegment.toFixed(2)} -i "${file}"`);
      filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];`;
    } else if (isChar) {
      // Character shot image: simple scale, no Ken Burns (zoompan breaks on some FFmpeg builds)
      inputs.push(`-loop 1 -t ${durationPerSegment.toFixed(2)} -i "${file}"`);
      filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}];`;
    } else {
      // B-roll image fallback: simple scale, no Ken Burns
      inputs.push(`-loop 1 -t ${durationPerSegment.toFixed(2)} -i "${file}"`);
      filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}];`;
    }
  }
  
  // Concat all
  const inputsList = mediaFiles.map((_, i) => `[v${i}]`).join('');
  filterComplex += `${inputsList}concat=n=${fileCount}:v=1:a=0[outv]`;
  
  return { inputs: inputs.join(' '), filterComplex };
}

async function main() {
  const args = process.argv.slice(2);
  
  let storyFolder = null;
  if (args.includes('--latest') || args.length === 0) {
    storyFolder = getLatestStoryFolder();
    if (!storyFolder) {
      console.error('No story folders found');
      process.exit(1);
    }
  } else {
    storyFolder = args[0];
  }

  console.log(`\n🎬 Assembling video: ${path.basename(storyFolder)}`);

  const audioPath = path.join(storyFolder, 'narration.mp3');
  const narrationPath = path.join(storyFolder, 'narration.txt');
  const storyPath = path.join(storyFolder, 'story.json');
  const imagesDir = path.join(storyFolder, 'images');

  // Check prerequisites
  if (!fs.existsSync(audioPath)) {
    console.error('❌ No narration.mp3 found. Run: node synthesize.js');
    process.exit(1);
  }

  // Get media files (videos and images, sorted) — supports both media_* and img_* naming
  const mediaFiles = fs.readdirSync(imagesDir)
    .filter(f => (f.startsWith('media_') || f.startsWith('img_')) && (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.mp4')))
    .sort()
    .map(f => path.join(imagesDir, f));

  if (mediaFiles.length === 0) {
    console.error('❌ No media files found in images/');
    process.exit(1);
  }

  // Count videos vs images
  const videoCount = mediaFiles.filter(f => f.endsWith('.mp4')).length;
  const imageCount = mediaFiles.filter(f => !f.endsWith('.mp4')).length;

  // Load story.json for segment info + character shot indices
  let segments = [];
  if (fs.existsSync(storyPath)) {
    const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
    segments = story.segments || [];
  }

  // Character shot indices: only applies to images (not B-roll videos)
  // Match media files to segments by index
  const charShotIndices = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]?.isCharacterShot) charShotIndices.push(i);
  }

  const duration = getDuration(audioPath);
  const charShots = charShotIndices.length;

  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Media files: ${mediaFiles.length}`);
  console.log(`   Videos (B-roll): ${videoCount}, Images: ${imageCount}`);
  console.log(`   Character shots (Ken Burns): ${charShots}`);

  const outputPath = path.join(storyFolder, 'video.mp4');
  const tempOutput = path.join(storyFolder, 'video_temp.mp4');

  // Generate subtitles
  let subsPath = null;
  if (fs.existsSync(narrationPath)) {
    const srt = generateSRT(fs.readFileSync(narrationPath, 'utf8'), duration);
    subsPath = path.join(storyFolder, 'subtitles.srt');
    fs.writeFileSync(subsPath, srt);
  }

  console.log('\n   Building video...');

  // Build filter: Ken Burns only on character shots, standard scaling on B-roll
  const { inputs, filterComplex } = buildVideoFilter(mediaFiles, charShotIndices, duration);

  // Run ffmpeg
  const cmd = `${FFMPEG} -y ${inputs} -i "${audioPath}" \
    -filter_complex "${filterComplex}" \
    -map "[outv]" -map ${mediaFiles.length}:a \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    "${tempOutput}" 2>&1`;

  try {
    execSync(cmd, { timeout: 600000, stdio: 'pipe' });
  } catch (e) {
    console.error('❌ Video encoding failed');
    console.error(e.stdout?.toString()?.slice(-500) || e.message);
    process.exit(1);
  }

  // Add subtitles
  if (subsPath) {
    console.log('   Burning subtitles...');
    const escapedPath = subsPath.replace(/:/g, '\\:').replace(/\//g, '\\/');
    
    const subCmd = `${FFMPEG} -y -i "${tempOutput}" \
      -vf "subtitles='${escapedPath}':force_style='FontSize=24,FontColor=white,OutlineColour=black,Outline=2,MarginV=40'" \
      -c:v libx264 -preset fast -crf 23 -c:a copy "${outputPath}" 2>&1`;

    try {
      execSync(subCmd, { timeout: 300000, stdio: 'pipe' });
      fs.unlinkSync(tempOutput);
    } catch (e) {
      console.log('   ⚠️ Subtitles failed, using video without');
      fs.renameSync(tempOutput, outputPath);
    }
  } else {
    fs.renameSync(tempOutput, outputPath);
  }

  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ Video saved: ${outputPath}`);
  console.log(`   Size: ${sizeMB} MB\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });