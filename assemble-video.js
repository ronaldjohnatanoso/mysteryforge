#!/usr/bin/env node

/**
 * MysteryForge Video Assembler
 * 
 * Combines audio + images + subtitles into MP4.
 * Uses crossfade transitions and subtle zoom for visual interest.
 * 
 * Usage:
 *   node assemble-video.js --latest        # Assemble latest story
 *   node assemble-video.js "story_folder"  # Assemble specific story
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');

// Crossfade duration in seconds
const CROSSFADE_DURATION = 0.5;

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
 * Generate SRT subtitles from narration text
 */
function generateSRT(text, duration) {
  const sentences = text
    .replace(/\.\.\./g, '.')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);

  const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
  const wordsPerSecond = totalWords / duration;

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  let time = 0;
  let index = 1;
  const srtLines = [];

  sentences.forEach(sentence => {
    const wordCount = sentence.split(/\s+/).length;
    const sentenceDuration = wordCount / wordsPerSecond;
    
    // Split long sentences (more than 10 words)
    const words = sentence.split(/\s+/);
    const chunks = [];
    for (let j = 0; j < words.length; j += 10) {
      chunks.push(words.slice(j, j + 10).join(' '));
    }
    
    const chunkDuration = sentenceDuration / chunks.length;
    
    chunks.forEach((chunk) => {
      const start = time;
      const end = time + chunkDuration;
      
      srtLines.push(`${index}`);
      srtLines.push(`${formatTime(start)} --> ${formatTime(end)}`);
      srtLines.push(chunk.trim());
      srtLines.push('');
      
      index++;
      time += chunkDuration;
    });
  });

  return srtLines.join('\n');
}

/**
 * Build ffmpeg filter for crossfade transitions and Ken Burns effect
 */
function buildSlideshowFilter(images, duration, crossfade = CROSSFADE_DURATION) {
  const imageCount = images.length;
  const totalCrossfadeTime = crossfade * (imageCount - 1);
  const baseDuration = (duration + totalCrossfadeTime) / imageCount;
  
  // Build filter complex
  let filterComplex = '';
  const inputs = [];
  
  // Input all images with duration and zoom effect
  for (let i = 0; i < imageCount; i++) {
    // Ken Burns effect: slow zoom in
    const zoomEnd = 1.0 + (Math.random() * 0.05 + 0.02); // 2-7% zoom
    const panX = (Math.random() - 0.5) * 0.05; // Slight horizontal pan
    const panY = (Math.random() - 0.5) * 0.05; // Slight vertical pan
    
    // Scale to 1920x1080 with padding, apply slow zoom/pan
    filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,`;
    filterComplex += `zoompan=z='min(zoom+0.0005,${zoomEnd.toFixed(3)})':x='iw/2-(iw/zoom/2)+${(panX * 100).toFixed(1)}*on':y='ih/2-(ih/zoom/2)+${(panY * 100).toFixed(1)}*on':d=${Math.round(baseDuration * 30)}:s=1920x1080:fps=30,format=yuv420p[v${i}];`;
    inputs.push(`-loop 1 -t ${baseDuration.toFixed(2)} -i "${images[i]}"`);
  }
  
  // Crossfade transitions
  let lastOutput = 'v0';
  for (let i = 1; i < imageCount; i++) {
    const offset = baseDuration * i - crossfade * i;
    filterComplex += `[${lastOutput}][v${i}]xfade=transition=fade:duration=${crossfade}:offset=${offset.toFixed(2)}[v${i}out];`;
    lastOutput = `v${i}out`;
  }
  
  // Final output
  filterComplex += `[${lastOutput}]fps=30[outv]`;
  
  return { inputs: inputs.join(' '), filterComplex };
}

/**
 * Simple slideshow fallback (no crossfade, just cuts with zoom)
 */
function buildSimpleFilter(images, duration) {
  const imageCount = images.length;
  const durationPerImage = duration / imageCount;
  const framesPerImage = Math.round(durationPerImage * 30);
  
  const inputs = images.map(img => `-loop 1 -t ${durationPerImage.toFixed(2)} -i "${img}"`).join(' ');
  
  // Concat filter with Ken Burns effect on each
  let filterComplex = '';
  for (let i = 0; i < imageCount; i++) {
    const zoomDirection = i % 2 === 0 ? 1.05 : 1.03; // Alternate zoom levels
    filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,`;
    filterComplex += `zoompan=z='min(zoom+0.0003,${zoomDirection})':d=${framesPerImage}:s=1920x1080:fps=30,format=yuv420p[v${i}];`;
  }
  
  // Concat all
  const inputsList = images.map((_, i) => `[v${i}]`).join('');
  filterComplex += `${inputsList}concat=n=${imageCount}:v=1:a=0[outv]`;
  
  return { inputs, filterComplex };
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
  const imagesDir = path.join(storyFolder, 'images');

  // Check prerequisites
  if (!fs.existsSync(audioPath)) {
    console.error('❌ No narration.mp3 found. Run: node synthesize.js');
    process.exit(1);
  }

  // Get images (sorted)
  let images = fs.readdirSync(imagesDir)
    .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
    .sort()
    .map(f => path.join(imagesDir, f));

  if (images.length === 0) {
    console.error('❌ No images found in images/');
    process.exit(1);
  }

  const duration = getDuration(audioPath);
  const durationPerImage = duration / images.length;

  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Images: ${images.length} (${durationPerImage.toFixed(1)}s per image)`);
  console.log(`   Subtitles: ${fs.existsSync(narrationPath) ? 'yes' : 'no'}`);

  const outputPath = path.join(storyFolder, 'video.mp4');
  const tempOutput = path.join(storyFolder, 'video_temp.mp4');

  // Generate subtitles
  let subsPath = null;
  if (fs.existsSync(narrationPath)) {
    const narration = fs.readFileSync(narrationPath, 'utf8');
    const srt = generateSRT(narration, duration);
    subsPath = path.join(storyFolder, 'subtitles.srt');
    fs.writeFileSync(subsPath, srt);
    console.log(`   Generated ${srt.split('\n').filter(l => l.match(/^\d+$/)).length} subtitle entries`);
  }

  console.log('\n   Building video...');

  // Build slideshow - use simple filter if images > 30 (crossfade gets slow)
  const useSimple = images.length > 30;
  const { inputs, filterComplex } = useSimple 
    ? buildSimpleFilter(images, duration)
    : buildSlideshowFilter(images, duration);

  // Build and run ffmpeg command
  const baseCmd = `${FFMPEG} -y ${inputs} -i "${audioPath}" \
    -filter_complex "${filterComplex}" \
    -map "[outv]" -map ${images.length}:a \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    "${tempOutput}" 2>&1`;

  try {
    execSync(baseCmd, { timeout: 600000, stdio: 'pipe' });
  } catch (e) {
    console.error('❌ Video encoding failed');
    console.error(e.stdout?.toString() || e.message);
    process.exit(1);
  }

  // Add subtitles if we have them
  if (subsPath) {
    console.log('   Adding subtitles...');
    
    const escapedPath = subsPath.replace(/:/g, '\\:').replace(/\//g, '\\/');
    
    const subCmd = `${FFMPEG} -y -i "${tempOutput}" \
      -vf "subtitles='${escapedPath}':force_style='FontSize=24,FontColor=white,OutlineColour=black,Outline=2,MarginV=40,FontName=Arial'" \
      -c:v libx264 -preset fast -crf 23 -c:a copy "${outputPath}" 2>&1`;

    try {
      execSync(subCmd, { timeout: 300000, stdio: 'pipe' });
      fs.unlinkSync(tempOutput);
    } catch (e) {
      console.log('   ⚠️ Subtitle burn failed, using video without subs');
      fs.renameSync(tempOutput, outputPath);
    }
  } else {
    fs.renameSync(tempOutput, outputPath);
  }

  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ Video saved: ${outputPath}`);
  console.log(`   Size: ${sizeMB} MB`);
  console.log(`   Public URL: https://openclaw-4.tail40c51a.ts.net/${path.basename(storyFolder)}/video.mp4\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });