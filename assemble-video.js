#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');

function getDuration(audioPath) {
  return new Promise((resolve, reject) => {
    exec(`${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`, (err, stdout) => {
      if (err) reject(err);
      else resolve(parseFloat(stdout.trim()));
    });
  });
}

function createImageVideo(imagePath, duration, outputPath) {
  return new Promise((resolve, reject) => {
    const fps = 30;
    const frames = Math.round(duration * fps);
    const filter = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(1+0.001*on,1.15)':d=${frames}:s=1920x1080:fps=${fps}`;
    
    exec(`${FFMPEG} -y -loop 1 -i "${imagePath}" -vf "${filter}" -t ${duration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outputPath}"`, { timeout: 300000 }, (err) => {
      if (err) {
        exec(`${FFMPEG} -y -loop 1 -i "${imagePath}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -t ${duration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${outputPath}"`, { timeout: 300000 }, (err2) => {
          if (err2) reject(err2);
          else resolve(outputPath);
        });
      } else resolve(outputPath);
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
      cmd = `${FFMPEG} -y -i "${videoPath}" -i "${audioPath}" -vf "subtitles='${subsPath}':force_style='FontSize=24,FontColor=white,OutlineColour=black,Outline=2'" -c:v libx264 -preset fast -crf 23 -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
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
    const start = time;
    const end = time + avgDuration;
    srtLines.push(`${i + 1}`);
    srtLines.push(`${formatTime(start)} --> ${formatTime(end)}`);
    srtLines.push(line.trim());
    srtLines.push('');
    time = end;
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

async function main() {
  const args = process.argv.slice(2);
  
  let storyFolder = null;
  if (args.includes('--latest') || args.length === 0) {
    const outputDir = path.join(process.cwd(), 'output');
    const folders = fs.readdirSync(outputDir)
      .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
      .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (folders.length === 0) {
      console.error('No story folders found');
      process.exit(1);
    }
    storyFolder = path.join(outputDir, folders[0].name);
  } else {
    storyFolder = args[0];
  }

  console.log(`\n🎬 Assembling video from: ${storyFolder}`);

  const audioFile = fs.readdirSync(storyFolder).find(f => f.endsWith('.mp3'));
  if (!audioFile) {
    console.error('No audio file found');
    process.exit(1);
  }
  
  const audioPath = path.join(storyFolder, audioFile);
  const narrationPath = path.join(storyFolder, 'narration.txt');
  const imagesDir = path.join(storyFolder, 'images');
  
  let images = [];
  if (fs.existsSync(imagesDir)) {
    images = fs.readdirSync(imagesDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png')).map(f => path.join(imagesDir, f));
  }
  if (images.length === 0) {
    const fallbackDir = path.join(process.cwd(), 'output/images');
    if (fs.existsSync(fallbackDir)) {
      images = fs.readdirSync(fallbackDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png')).map(f => path.join(fallbackDir, f));
    }
  }
  
  if (images.length === 0) {
    console.error('No images found');
    process.exit(1);
  }

  const duration = await getDuration(audioPath);
  console.log(`  Duration: ${duration.toFixed(1)}s`);
  console.log(`  Images: ${images.length}`);
  
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
  
  for (let i = 0; i < images.length; i++) {
    console.log(`  [${i + 1}/${images.length}] Processing...`);
    const segPath = path.join(tempDir, `seg_${i}.mp4`);
    await createImageVideo(images[i], durationPerImage, segPath);
    segments.push(segPath);
  }
  
  console.log('  Concatenating...');
  const videoOnly = path.join(tempDir, 'video.mp4');
  await concatVideos(segments, videoOnly);
  
  console.log('  Adding audio + subtitles...');
  const outputPath = path.join(storyFolder, 'video.mp4');
  await addAudioAndSubs(videoOnly, audioPath, subsPath, outputPath);
  
  for (const s of segments) try { fs.unlinkSync(s); } catch (e) {}
  try { fs.unlinkSync(videoOnly); fs.rmdirSync(tempDir); } catch (e) {}
  
  console.log(`\n✅ Video saved: ${outputPath}`);
  console.log(`   Size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });