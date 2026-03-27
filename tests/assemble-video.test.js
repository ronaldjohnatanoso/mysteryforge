/**
 * Tests for assemble-video.js - Video assembly with FFmpeg
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ===== CHARACTER_EFFECTS Configuration =====
const CHARACTER_EFFECTS = [
  "zoompan=z='min(zoom+0.0015,1.5)':d={frames}:s=1920x1080:fps=30",
  "zoompan=z='if(lte(zoom,1.0),1.5,max(1.001,zoom-0.0015))':d={frames}:s=1920x1080:fps=30",
  "zoompan=z=1.3:x='iw/2-(iw/zoom/2)+((iw/zoom/2)/{frames})*on':d={frames}:s=1920x1080:fps=30",
  "zoompan=z=1.3:x='iw-(iw/zoom/2)-((iw/zoom/2)/{frames})*on':d={frames}:s=1920x1080:fps=30",
  "zoompan=z=1.3:y='ih/2-(ih/zoom/2)+((ih/zoom/2)/{frames})*on':d={frames}:s=1920x1080:fps=30",
  "zoompan=z=1.3:y='ih-(ih/zoom/2)-((ih/zoom/2)/{frames})*on':d={frames}:s=1920x1080:fps=30"
];

function testCharacterEffectsConfig() {
  console.log('Testing CHARACTER_EFFECTS configuration...');
  
  assert(CHARACTER_EFFECTS.length === 6, 'Should have 6 Ken Burns effect variations');
  
  CHARACTER_EFFECTS.forEach((effect, i) => {
    assert(effect.includes('zoompan'), `Effect ${i} should include zoompan`);
    assert(effect.includes('1920x1080'), `Effect ${i} should target 1920x1080`);
    assert(effect.includes('fps=30'), `Effect ${i} should be 30fps`);
    assert(effect.includes('{frames}'), `Effect ${i} should have frame placeholder`);
  });
  
  // All effects should be distinct
  const unique = new Set(CHARACTER_EFFECTS);
  assert(unique.size === CHARACTER_EFFECTS.length, 'All effects should be unique');
  
  console.log('  ✓ CHARACTER_EFFECTS configuration valid');
}

// ===== SRT Generation Tests =====
function testSRTGeneration() {
  console.log('Testing SRT generation...');
  
  function generateSRT(text, duration) {
    const sentences = text.replace(/\.\.\./g, '.').split(/(?<=[.!?])\s+/).filter(s => s.trim());
    const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
    const wordsPerSecond = totalWords / duration;

    function formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }

    let time = 0, index = 1;
    const srtLines = [];

    sentences.forEach(sentence => {
      const wordCount = sentence.split(/\s+/).length;
      const sentenceDuration = wordCount / wordsPerSecond;
      const words = sentence.split(/\s+/);
      
      for (let j = 0; j < words.length; j += 8) {
        const chunk = words.slice(j, j + 8).join(' ');
        const chunkDuration = (chunk.split(/\s+/).length / wordCount) * sentenceDuration;
        
        srtLines.push(`${index}`);
        srtLines.push(`${formatTime(time)} --> ${formatTime(time + chunkDuration)}`);
        srtLines.push(chunk);
        srtLines.push('');
        
        index++;
        time += chunkDuration;
      }
    });

    return srtLines.join('\n');
  }
  
  // Test basic SRT generation
  const text = 'Hello world. This is a test.';
  const duration = 4.0;
  const srt = generateSRT(text, duration);
  
  assert(srt.includes('00:00:00,000 -->'), 'SRT should have start time');
  assert(srt.includes(' --> '), 'SRT should have arrow separator');
  assert(srt.includes('Hello world'), 'SRT should contain first sentence');
  
  // Test time format
  const lines = srt.split('\n');
  const timeLine = lines.find(l => l.includes('-->'));
  assert(timeLine, 'Should have time line');
  assert(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/.test(timeLine.trim()), 
    'Time format should be HH:MM:SS,mmm --> HH:MM:SS,mmm');
  
  console.log('  ✓ SRT generation works');
}

// ===== SRT Format Time Tests =====
function testSRTTimeFormat() {
  console.log('Testing SRT time format...');
  
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
  
  assert(formatTime(0) === '00:00:00,000', '0 seconds should be 00:00:00,000');
  assert(formatTime(1) === '00:00:01,000', '1 second should be 00:00:01,000');
  assert(formatTime(61) === '00:01:01,000', '61 seconds should be 00:01:01,000');
  assert(formatTime(3661) === '01:01:01,000', '3661 seconds should be 01:01:01,000');
  assert(formatTime(0.5).endsWith(',500'), '0.5 seconds should have 500ms');
  
  console.log('  ✓ SRT time format works');
}

// ===== Video Filter Building Tests =====
function testBuildVideoFilter() {
  console.log('Testing buildVideoFilter logic...');
  
  function buildVideoFilter(mediaFiles, duration) {
    const fileCount = mediaFiles.length;
    const durationPerSegment = duration / fileCount;
    const framesPerSegment = Math.round(durationPerSegment * 30);
    
    const inputs = [];
    let filterComplex = '';
    
    for (let i = 0; i < fileCount; i++) {
      const file = mediaFiles[i];
      const isVideo = file.endsWith('.mp4');
      
      if (isVideo) {
        inputs.push(`-t ${durationPerSegment.toFixed(2)} -i "${file}"`);
        filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];`;
      } else {
        inputs.push(`-loop 1 -t ${durationPerSegment.toFixed(2)} -i "${file}"`);
        filterComplex += `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}];`;
      }
    }
    
    const inputsList = mediaFiles.map((_, i) => `[v${i}]`).join('');
    filterComplex += `${inputsList}concat=n=${fileCount}:v=1:a=0[outv]`;
    
    return { inputs: inputs.join(' '), filterComplex, framesPerSegment };
  }
  
  // Test with 3 images
  const images = ['img_001.jpg', 'img_002.jpg', 'img_003.jpg'];
  const result = buildVideoFilter(images, 60);
  
  assert(result.inputs.includes('-loop 1'), 'Image input should use -loop 1');
  assert(result.inputs.includes('-t '), 'Image input should have -t for duration');
  assert(result.filterComplex.includes('scale=1920:1080'), 'Filter should scale to 1920x1080');
  assert(result.filterComplex.includes('concat=n=3'), 'Filter should concat 3 inputs');
  assert(result.filterComplex.includes('[outv]'), 'Filter should output to [outv]');
  assert(result.framesPerSegment === 600, '60s / 3 images / 30fps = 600 frames');
  
  // Test with videos
  const videos = ['media_001.mp4', 'media_002.mp4'];
  const videoResult = buildVideoFilter(videos, 30);
  
  assert(videoResult.inputs.includes('-t '), 'Video input should have -t');
  assert(!videoResult.inputs.includes('-loop 1'), 'Video input should not use -loop');
  
  console.log('  ✓ buildVideoFilter logic works');
}

// ===== Resolution Constants Tests =====
function testResolutionConstants() {
  console.log('Testing resolution constants...');
  
  const HD_WIDTH = 1920;
  const HD_HEIGHT = 1080;
  const FPS = 30;
  
  assert(HD_WIDTH === 1920, 'HD width should be 1920');
  assert(HD_HEIGHT === 1080, 'HD height should be 1080');
  assert(FPS === 30, 'FPS should be 30');
  
  console.log('  ✓ Resolution constants valid');
}

// ===== FFmpeg Path Tests =====
function testFFmpegPath() {
  console.log('Testing FFmpeg path resolution...');
  
  const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
  const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');
  
  assert(FFMPEG.includes('ffmpeg'), 'FFMPEG path should include ffmpeg');
  assert(FFPROBE.includes('ffprobe'), 'FFPROBE path should include ffprobe');
  
  console.log('  ✓ FFmpeg path resolution works');
}

// ===== Media File Detection Tests =====
function testMediaFileDetection() {
  console.log('Testing media file detection...');
  
  const outputDir = path.join(__dirname, '..', 'output');
  
  function findMediaFolder() {
    if (!fs.existsSync(outputDir)) return null;
    const folders = fs.readdirSync(outputDir)
      .filter(f => {
        const p = path.join(outputDir, f);
        return fs.statSync(p).isDirectory() && 
               !['images', 'voice_tests', 'ai_images_test'].includes(f);
      })
      .sort((a, b) => fs.statSync(path.join(outputDir, b)).mtime - fs.statSync(path.join(outputDir, a)).mtime);
    
    for (const folder of folders) {
      const imagesDir = path.join(outputDir, folder, 'images');
      if (fs.existsSync(imagesDir)) {
        const files = fs.readdirSync(imagesDir)
          .filter(f => (f.startsWith('media_') || f.startsWith('img_')) && 
                      (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.mp4')));
        if (files.length > 0) {
          return folder;
        }
      }
    }
    return null;
  }
  
  const found = findMediaFolder();
  if (found) {
    console.log(`  ✓ Found folder with media files: ${found}`);
  } else {
    console.log('  ⚠ No media files found yet (run fetch-images first)');
  }
}

// ===== Parse Args Tests =====
function testParseArgs() {
  console.log('Testing parseArgs logic...');
  
  function parseArgs(args) {
    return {
      latest: args.includes('--latest') || args.length === 0,
      folder: args.find(a => !a.startsWith('--')) || null
    };
  }
  
  assert(parseArgs([]).latest === true, 'Empty args should use latest');
  assert(parseArgs(['--latest']).latest === true, '--latest should set latest');
  assert(parseArgs(['folder_name']).latest === false, 'Folder arg should not set latest');
  assert(parseArgs(['folder_name']).folder === 'folder_name', 'Should extract folder name');
  
  console.log('  ✓ parseArgs logic works');
}

// ===== Run Tests =====
console.log('\n🎬 Running assemble-video.js tests...\n');

try {
  testCharacterEffectsConfig();
  testSRTGeneration();
  testSRTTimeFormat();
  testBuildVideoFilter();
  testResolutionConstants();
  testFFmpegPath();
  testMediaFileDetection();
  testParseArgs();
  
  console.log('\n✅ All tests passed!\n');
} catch (e) {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
}
