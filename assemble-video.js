#!/usr/bin/env node

/**
 * MysteryForge Video Assembler
 * 
 * Combines audio + images into MP4 with cinematic motion effects.
 * Ken Burns style: zoom, pan, vignette, color grading.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');

// Motion effects for cinematic look
const MOTION_EFFECTS = [
  // Slow zoom in
  {
    name: 'zoom-in',
    filter: (duration) => {
      const frames = Math.round(duration * 30);
      return `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.001,1.3)':d=${frames}:s=1920x1080:fps=30`;
    }
  },
  // Slow zoom out
  {
    name: 'zoom-out',
    filter: (duration) => {
      const frames = Math.round(duration * 30);
      return `scale=2560:1440:force_original_aspect_ratio=decrease,pad=2560:1440:(ow-iw)/2:(oh-ih)/2,crop=1920:1080:320:180,zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.001))':d=${frames}:s=1920x1080:fps=30`;
    }
  },
  // Pan left to right
  {
    name: 'pan-right',
    filter: (duration) => {
      const frames = Math.round(duration * 30);
      return `scale=2560:1080:force_original_aspect_ratio=decrease,pad=2560:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z=1.2:x='min((iw-iw*zoom)*(on/${frames}),iw-iw*zoom)':y='(ih-ih*zoom)/2':d=${frames}:s=1920x1080:fps=30`;
    }
  },
  // Pan right to left
  {
    name: 'pan-left',
    filter: (duration) => {
      const frames = Math.round(duration * 30);
      return `scale=2560:1080:force_original_aspect_ratio=decrease,pad=2560:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z=1.2:x='max(0,(iw-iw*zoom)*(1-on/${frames}))':y='(ih-ih*zoom)/2':d=${frames}:s=1920x1080:fps=30`;
    }
  },
  // Zoom + pan (diagonal)
  {
    name: 'zoom-pan',
    filter: (duration) => {
      const frames = Math.round(duration * 30);
      return `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0008,1.25)':x='iw/2-(iw/zoom/2)+(on*2)':y='ih/2-(ih/zoom/2)+(on*1.5)':d=${frames}:s=1920x1080:fps=30`;
    }
  }
];

// Color grading presets
const COLOR_GRADES = {
  'thriller': 'colorbalance=rs=0.1:gs=-0.05:bs=0.15:rm=-0.1:gm=0.05:bm=0.1', // Teal/orange
  'horror': 'colorbalance=rs=0.2:gs=-0.1:bs=-0.15:rm=0.1:gm=-0.05:bm=-0.1', // Red/desaturated
  'mystery': 'colorbalance=rs=0:gs=0:bs=0.1:rm=0.05:gm=0:bm=0.1,eq=contrast=1.1:brightness=-0.02', // Cool blue
  'noir': 'format=gray,colorbalance=rs=0:gs=0:bs=0:rm=0:gm=0:bm=0,eq=contrast=1.2:brightness=-0.05', // B&W high contrast
  'none': null
};

function getDuration(audioPath) {
  return new Promise((resolve, reject) => {
    exec(`${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`, (err, stdout) => {
      if (err) reject(err);
      else resolve(parseFloat(stdout.trim()));
    });
  });
}

function createImageVideo(imagePath, duration, outputPath, effectType = null, colorGrade = 'mystery') {
  return new Promise((resolve, reject) => {
    // Pick random effect if not specified
    const effect = effectType 
      ? MOTION_EFFECTS.find(e => e.name === effectType) 
      : MOTION_EFFECTS[Math.floor(Math.random() * MOTION_EFFECTS.length)];
    
    const baseFilter = effect.filter(duration);
    
    // Add color grading
    const colorFilter = COLOR_GRADES[colorGrade] || COLOR_GRADES['mystery'];
    const fullFilter = colorFilter ? `${baseFilter},${colorFilter}` : baseFilter;
    
    // Add vignette
    const vignetteFilter = `${fullFilter},vignette=a=0.4`;
    
    const cmd = `${FFMPEG} -y -loop 1 -i "${imagePath}" -vf "${vignetteFilter}" -t ${duration} -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p "${outputPath}"`;
    
    exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) {
        // Fallback to simple zoom
        const frames = Math.round(duration * 30);
        const simpleFilter = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.001,1.2)':d=${frames}:s=1920x1080:fps=30`;
        const fallbackCmd = `${FFMPEG} -y -loop 1 -i "${imagePath}" -vf "${simpleFilter}" -t ${duration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outputPath}"`;
        
        exec(fallbackCmd, { timeout: 300000 }, (err2) => {
          if (err2) reject(new Error(`FFmpeg failed: ${err2.message}`));
          else resolve({ path: outputPath, effect: 'fallback' });
        });
      } else {
        resolve({ path: outputPath, effect: effect.name });
      }
    });
  });
}

function concatVideos(videoPaths, outputPath) {
  return new Promise((resolve, reject) => {
    const concatFile = `/tmp/concat_${Date.now()}.txt`;
    fs.writeFileSync(concatFile, videoPaths.map(p => `file '${path.resolve(p)}'`).join('\n'));
    exec(`${FFMPEG} -y -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}"`, { timeout: 300000 }, (err) => {
      fs.unlinkSync(concatFile);
      if (err) reject(err);
      else resolve(outputPath);
    });
  });
}

function addAudioAndSubs(videoPath, audioPath, subsPath, outputPath) {
  return new Promise((resolve, reject) => {
    let cmd;
    if (subsPath && fs.existsSync(subsPath)) {
      cmd = `${FFMPEG} -y -i "${videoPath}" -i "${audioPath}" -vf "subtitles='${subsPath}':force_style='FontSize=24,FontColor=white,OutlineColour=black,Outline=2'" -c:v libx264 -preset medium -crf 22 -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
    } else {
      cmd = `${FFMPEG} -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
    }
    exec(cmd, { timeout: 300000 }, (err) => {
      if (err) reject(err);
      else resolve(outputPath);
    });
  });
}

function textToSRT(text, duration) {
  const lines = text.split(/\n\n+/).filter(l => l.trim());
  const srtLines = [];
  let time = 0;
  const avgDuration = duration / lines.length;
  
  lines.forEach((line, i) => {
    srtLines.push(`${i + 1}`);
    srtLines.push(`${formatTime(time)} --> ${formatTime(time + avgDuration)}`);
    srtLines.push(line.trim());
    srtLines.push('');
    time += avgDuration;
  });
  
  return srtLines.join('\n');
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
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

  console.log(`\n🎬 Assembling video from: ${storyFolder}`);

  const audioFile = fs.readdirSync(storyFolder).find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
  if (!audioFile) {
    console.error('No audio file found');
    process.exit(1);
  }
  
  const audioPath = path.join(storyFolder, audioFile);
  const narrationPath = path.join(storyFolder, 'narration.txt');
  const imagesDir = path.join(storyFolder, 'images');
  
  let images = [];
  if (fs.existsSync(imagesDir)) {
    images = fs.readdirSync(imagesDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
      .map(f => path.join(imagesDir, f));
  }
  
  if (images.length === 0) {
    console.error('No images found');
    process.exit(1);
  }

  const duration = await getDuration(audioPath);
  console.log(`  Duration: ${duration.toFixed(1)}s`);
  console.log(`  Images: ${images.length}`);
  console.log(`  Effects: Ken Burns (randomized per image)`);
  console.log(`  Color grade: mystery (teal/blue tones)`);
  
  let subsPath = null;
  if (fs.existsSync(narrationPath)) {
    const narration = fs.readFileSync(narrationPath, 'utf8');
    const srt = textToSRT(narration, duration);
    subsPath = path.join(storyFolder, 'subtitles.srt');
    fs.writeFileSync(subsPath, srt);
    console.log('  Subtitles: generated');
  }
  
  const tempDir = `/tmp/mysteryforge_${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });
  
  const durationPerImage = duration / images.length;
  const segments = [];
  const usedEffects = [];
  
  for (let i = 0; i < images.length; i++) {
    console.log(`  [${i + 1}/${images.length}] Processing...`);
    const segPath = path.join(tempDir, `seg_${i}.mp4`);
    
    const result = await createImageVideo(images[i], durationPerImage, segPath);
    usedEffects.push(result.effect);
    segments.push(segPath);
  }
  
  console.log(`  Effects used: ${usedEffects.join(', ')}`);
  console.log('  Concatenating...');
  
  const videoOnly = path.join(tempDir, 'video.mp4');
  await concatVideos(segments, videoOnly);
  
  console.log('  Adding audio...');
  const outputPath = path.join(storyFolder, 'video.mp4');
  await addAudioAndSubs(videoOnly, audioPath, subsPath, outputPath);
  
  for (const s of segments) try { fs.unlinkSync(s); } catch (e) {}
  try { fs.unlinkSync(videoOnly); fs.rmdirSync(tempDir); } catch (e) {}
  
  console.log(`\n✅ Video saved: ${outputPath}`);
  console.log(`   Size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });