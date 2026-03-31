/**
 * Video Assembly Module
 * 
 * Combines audio + images into MP4 video using FFmpeg.
 * Supports Ken Burns effect (zoom/pan) for dynamic visuals.
 * 
 * Usage:
 *   const { assembleVideo } = require('./src/video/assembler');
 *   await assembleVideo({
 *     audio: 'output/scripts/story.mp3',
 *     images: ['output/images/img1.jpg', 'output/images/img2.jpg'],
 *     output: 'output/videos/story.mp4'
 *   });
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// FFmpeg binary paths
const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');

/**
 * Get audio duration in seconds
 */
async function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    const cmd = `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) return reject(error);
      const duration = parseFloat(stdout.trim());
      resolve(duration);
    });
  });
}

/**
 * Generate Ken Burns effect filter for an image
 * Creates smooth zoom and pan animation
 */
function generateKenBurnsFilter(duration, zoomStart = 1.0, zoomEnd = 1.2, panX = 0, panY = 0) {
  // Randomize direction if not specified
  const direction = Math.random();
  let xExpr, yExpr;
  
  if (direction < 0.25) {
    // Pan right
    xExpr = `(iw-iw*zoom)*t/${duration}`;
    yExpr = `(ih-ih*zoom)/2`;
  } else if (direction < 0.5) {
    // Pan left
    xExpr = `(iw-iw*zoom)*(1-t/${duration})`;
    yExpr = `(ih-ih*zoom)/2`;
  } else if (direction < 0.75) {
    // Pan down
    xExpr = `(iw-iw*zoom)/2`;
    yExpr = `(ih-ih*zoom)*t/${duration}`;
  } else {
    // Pan up
    xExpr = `(iw-iw*zoom)/2`;
    yExpr = `(ih-ih*zoom)*(1-t/${duration})`;
  }
  
  return `scale=1920:1080:force_original_aspect_ratio=decrease,zoompan=z='min(zoom+0.0015,${zoomEnd})':x='${xExpr}':y='${yExpr}':d=${Math.round(duration * 30)}:s=1920x1080:fps=30`;
}

/**
 * Process a media file (image or video) to 1920x1080 MP4 with given duration.
 * Images get Ken Burns effect for dynamic visuals; videos are trimmed/scaled only.
 */
async function processMedia(mediaPath, duration, outputPath, useKenBurns = false) {
  const isVideo = mediaPath.toLowerCase().endsWith('.mp4');
  
  return new Promise((resolve, reject) => {
    let cmd;
    if (isVideo) {
      // Video: scale and trim/pad to exact duration (already moving, no Ken Burns needed)
      cmd = `${FFMPEG} -y -i "${mediaPath}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -t ${duration} "${outputPath}"`;
    } else if (useKenBurns) {
      // Image with Ken Burns: smooth zoom/pan for character shots
      const kbFilter = generateKenBurnsFilter(duration);
      cmd = `${FFMPEG} -y -loop 1 -i "${mediaPath}" -filter_complex "${kbFilter}" -t ${duration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outputPath}"`;
    } else {
      // Image: loop the still frame for the duration (basic scaling)
      cmd = `${FFMPEG} -y -loop 1 -i "${mediaPath}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -t ${duration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outputPath}"`;
    }
    
    exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`FFmpeg failed: ${error.message}`));
      resolve(outputPath);
    });
  });
}

/**
 * Create a video from a single image with duration (backwards compat).
 * Applies Ken Burns effect for character shots, basic scale for B-roll.
 */
async function createImageVideo(imagePath, duration, outputPath, useKenBurns = false) {
  return processMedia(imagePath, duration, outputPath, useKenBurns);
}

/**
 * Concatenate multiple video segments
 */
async function concatVideos(videoPaths, outputPath) {
  return new Promise((resolve, reject) => {
    // Scale all inputs to 1920x1080 then concat (handles mixed resolutions)
    const inputs = videoPaths.map(p => `-i "${p}"`).join(' ');
    const filterParts = videoPaths.map((_, i) => `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[f${i}]`).join(';');
    const concatMap = videoPaths.map((_, i) => `[f${i}]`).join('');
    const cmd = `${FFMPEG} -y ${inputs} -filter_complex "${filterParts};${concatMap}concat=n=${videoPaths.length}:v=1:a=0[v]" -map "[v]" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outputPath}"`;
    
    exec(cmd, { timeout: 600000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`Concat failed: ${error.message}\n${stderr.slice(-500)}`));
      resolve(outputPath);
    });
  });
}

/**
 * Add audio to video
 */
async function addAudioToVideo(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = `${FFMPEG} -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
    
    exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`Audio merge failed: ${error.message}`));
      resolve(outputPath);
    });
  });
}

/**
 * Main function: Assemble video from audio and images.
 * 
 * @param {Object} options
 * @param {string} options.audio - Path to audio file
 * @param {string[]} options.images - Paths to image/video files
 * @param {string} options.output - Output MP4 path
 * @param {number[]} options.charShotIndices - Indices of character shot images (for Ken Burns)
 */
async function assembleVideo(options) {
  const { audio, images, output, charShotIndices = [] } = options;
  
  if (!fs.existsSync(audio)) {
    throw new Error(`Audio file not found: ${audio}`);
  }
  
  if (!images || images.length === 0) {
    throw new Error('No images provided');
  }
  
  // Ensure output directory exists
  const outputDir = path.dirname(output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const charSet = new Set(charShotIndices);
  
  console.log('🎬 Assembling video...\n');
  console.log(`  Audio: ${audio}`);
  console.log(`  Images: ${images.length}`);
  console.log(`  Character shots (Ken Burns): ${charSet.size}`);
  console.log(`  Output: ${output}\n`);
  
  // Get audio duration
  const audioDuration = await getAudioDuration(audio);
  console.log(`  Audio duration: ${audioDuration.toFixed(1)}s`);
  
  // Calculate duration per image
  const durationPerImage = audioDuration / images.length;
  console.log(`  Duration per image: ${durationPerImage.toFixed(1)}s\n`);
  
  // Create video segments from images
  const tempDir = `/tmp/mysteryforge_video_${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });
  
  const videoSegments = [];
  
  for (let i = 0; i < images.length; i++) {
    const imagePath = images[i];
    if (!fs.existsSync(imagePath)) {
      console.log(`  [${i + 1}/${images.length}] Skipping missing image: ${imagePath}`);
      continue;
    }
    
    const useKenBurns = charSet.has(i);
    console.log(`  [${i + 1}/${images.length}] Processing image...${useKenBurns ? ' (Ken Burns)' : ''}`);
    const segmentPath = path.join(tempDir, `segment_${i}.mp4`);
    
    await createImageVideo(imagePath, durationPerImage, segmentPath, useKenBurns);
    videoSegments.push(segmentPath);
  }
  
  // Concatenate video segments
  console.log('\n  Concatenating segments...');
  const videoOnly = path.join(tempDir, 'video_only.mp4');
  await concatVideos(videoSegments, videoOnly);
  
  // Add audio
  console.log('  Adding audio...');
  await addAudioToVideo(videoOnly, audio, output);
  
  // Cleanup temp files
  console.log('  Cleaning up...');
  for (const seg of videoSegments) {
    try { fs.unlinkSync(seg); } catch (e) {}
  }
  try { fs.unlinkSync(videoOnly); fs.rmdirSync(tempDir); } catch (e) {}
  
  const stats = fs.statSync(output);
  console.log(`\n✅ Video created: ${output}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB\n`);
  
  return {
    path: output,
    size: stats.size,
    duration: audioDuration
  };
}

/**
 * Quick assembly - uses single image for entire video
 */
async function quickAssemble(audio, image, output) {
  const audioDuration = await getAudioDuration(audio);
  
  const outputDir = path.dirname(output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('🎬 Quick assembling video...');
  
  const tempDir = `/tmp/mysteryforge_video_${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });
  
  const videoOnly = path.join(tempDir, 'video_only.mp4');
  await createImageVideo(image, audioDuration, videoOnly);
  await addAudioToVideo(videoOnly, audio, output);
  
  // Cleanup
  try { fs.unlinkSync(videoOnly); fs.rmdirSync(tempDir); } catch (e) {}
  
  return { path: output, size: fs.statSync(output).size };
}

module.exports = {
  assembleVideo,
  quickAssemble,
  getAudioDuration,
  generateKenBurnsFilter,
  processMedia,
  createImageVideo
};