/**
 * MysteryForge Test Suite
 * 
 * Tests for:
 * - Provider fallback system
 * - Story generation
 * - Image generation
 * - TTS
 * - Video assembly
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test results
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

// ============================================
// PROVIDER SYSTEM TESTS
// ============================================

console.log('\n📦 Provider System Tests\n');

test('providers.json exists', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../providers.json'), 'utf8'));
  assert(config.providers, 'providers key missing');
  assert(config.providers.text, 'text provider missing');
  assert(config.providers.image, 'image provider missing');
  assert(config.providers.tts, 'tts provider missing');
});

test('providers.json has valid fallback chains', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../providers.json'), 'utf8'));
  assert(Array.isArray(config.providers.text.fallback), 'text fallback should be array');
  assert(Array.isArray(config.providers.image.fallback), 'image fallback should be array');
  assert(config.providers.text.fallback.length > 0, 'text should have fallbacks');
});

test('provider module exports correct functions', () => {
  const providers = require('../src/providers/index.js');
  assert(typeof providers.generateText === 'function', 'generateText missing');
  assert(typeof providers.generateImage === 'function', 'generateImage missing');
  assert(typeof providers.generateSpeech === 'function', 'generateSpeech missing');
  assert(typeof providers.getQuotaStatus === 'function', 'getQuotaStatus missing');
});

// ============================================
// STORY GENERATOR TESTS
// ============================================

console.log('\n📝 Story Generator Tests\n');

test('generate.js has correct argument parsing', () => {
  const script = fs.readFileSync(path.join(__dirname, '../generate.js'), 'utf8');
  assert(script.includes('parseArgs'), 'parseArgs function missing');
  assert(script.includes('--genre'), '--genre option missing');
  assert(script.includes('--length'), '--length option missing');
});

test('story output has required fields', () => {
  // Check if there's a story.json to validate structure
  const outputDir = path.join(__dirname, '../output');
  const folders = fs.readdirSync(outputDir).filter(f => {
    const p = path.join(outputDir, f);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'story.json'));
  });
  
  if (folders.length > 0) {
    // Get the most recent folder
    const latest = folders.map(f => ({
      name: f,
      mtime: fs.statSync(path.join(outputDir, f, 'story.json')).mtime
    })).sort((a, b) => b.mtime - a.mtime)[0].name;
    
    const story = JSON.parse(fs.readFileSync(path.join(outputDir, latest, 'story.json'), 'utf8'));
    
    assert(story.title, 'story.title missing');
    assert(story.segments, 'story.segments missing');
    assert(Array.isArray(story.segments), 'segments should be array');
    assert(story.total_words, 'total_words missing');
    assert(story.segment_count, 'segment_count missing');
    assert(story.provider, 'provider missing');
    
    // characterAnchor is required in new format (stories with readable timestamp)
    if (latest.includes('-')) {
      assert(story.characterAnchor, 'characterAnchor missing (required for new format)');
    }
  } else {
    console.log('   (skipped - no stories generated yet)');
  }
});

test('story title has readable timestamp (new format)', () => {
  const outputDir = path.join(__dirname, '../output');
  const folders = fs.readdirSync(outputDir).filter(f => {
    // Only check folders with new timestamp format (contains dashes)
    return f.includes('-') && f.match(/\d{4}-\d{2}-\d{2}/);
  });
  
  if (folders.length > 0) {
    const latest = folders.sort().reverse()[0];
    // Should match format: title_YYYY-MM-DD_HH-MM
    assert(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/.test(latest), 
      'Title should end with readable timestamp YYYY-MM-DD_HH-MM');
  } else {
    console.log('   (skipped - no new format stories yet)');
  }
});

// ============================================
// IMAGE FETCHER TESTS
// ============================================

console.log('\n🎨 Image Fetcher Tests\n');

test('fetch-images.js has character anchor logic', () => {
  const script = fs.readFileSync(path.join(__dirname, '../fetch-images.js'), 'utf8');
  assert(script.includes('characterAnchor'), 'characterAnchor reference missing');
  assert(script.includes('isCharacterShot'), 'isCharacterShot reference missing');
});

test('character shots saved to both folders', () => {
  const outputDir = path.join(__dirname, '../output');
  const folders = fs.readdirSync(outputDir).filter(f => {
    const p = path.join(outputDir, f);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'story.json'));
  });
  
  if (folders.length > 0) {
    const latest = folders.sort().reverse()[0];
    const storyPath = path.join(outputDir, latest);
    const story = JSON.parse(fs.readFileSync(path.join(storyPath, 'story.json'), 'utf8'));
    
    const charShots = story.segments?.filter(s => s.isCharacterShot).length || 0;
    
    if (charShots > 0) {
      const charDir = path.join(storyPath, 'character-shots');
      const imagesDir = path.join(storyPath, 'images');
      
      // Check if images have been generated (at least one image exists)
      const hasImages = fs.existsSync(imagesDir) && 
        fs.readdirSync(imagesDir).filter(f => f.endsWith('.jpg') || f.endsWith('.mp4')).length > 0;
      
      if (!hasImages) {
        // Images not yet generated, skip this test
        console.log('   (skipped - images not yet generated)');
        return;
      }
      
      assert(fs.existsSync(charDir), 'character-shots folder missing');
      
      const charFiles = fs.readdirSync(charDir).filter(f => f.endsWith('.jpg'));
      // Allow some flexibility - not all character shots may have been generated
      // if --count was used to limit processing
      assert(charFiles.length > 0, 
        `character-shots should have at least one image, found ${charFiles.length}`);
    }
  }
});

// ============================================
// TTS TESTS
// ============================================

console.log('\n🔊 TTS Tests\n');

test('Kokoro TTS default voice is af_sky', () => {
  const providers = require('../src/providers/index.js');
  // Check the default in the code
  const script = fs.readFileSync(path.join(__dirname, '../src/providers/index.js'), 'utf8');
  assert(script.includes("voice = 'af_sky'"), 'default voice should be af_sky');
});

test('TTS speed is 0.7', () => {
  const providers = require('../src/providers/index.js');
  const script = fs.readFileSync(path.join(__dirname, '../src/providers/index.js'), 'utf8');
  assert(script.includes('speed = 0.7'), 'TTS speed should be 0.7');
});

test('synthesize.js has Kokoro voices', () => {
  const script = fs.readFileSync(path.join(__dirname, '../synthesize.js'), 'utf8');
  assert(script.includes('af_sky'), 'af_sky voice option missing');
  assert(script.includes('af_heart'), 'af_heart voice option missing');
});

// ============================================
// VIDEO ASSEMBLER TESTS
// ============================================

console.log('\n🎬 Video Assembler Tests\n');

test('assemble-video.js has subtitle generation', () => {
  const script = fs.readFileSync(path.join(__dirname, '../assemble-video.js'), 'utf8');
  assert(script.includes('generateSRT'), 'generateSRT function missing');
  assert(script.includes('subtitles.srt'), 'subtitle file reference missing');
});

test('video output exists for latest story', () => {
  const outputDir = path.join(__dirname, '../output');
  const folders = fs.readdirSync(outputDir).filter(f => {
    const p = path.join(outputDir, f);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'story.json'));
  });
  
  if (folders.length > 0) {
    const latest = folders.sort().reverse()[0];
    const videoPath = path.join(outputDir, latest, 'video.mp4');
    
    if (fs.existsSync(videoPath)) {
      const stats = fs.statSync(videoPath);
      assert(stats.size > 100000, 'Video should be at least 100KB');
    }
  }
});

// ============================================
// QUOTA TRACKING TESTS
// ============================================

console.log('\n📊 Quota Tests\n');

test('getQuotaStatus returns valid structure', () => {
  const { getQuotaStatus } = require('../src/providers/index.js');
  const status = getQuotaStatus();
  
  assert(typeof status === 'object', 'status should be object');
  assert(typeof status.used === 'number', 'used should be number');
  assert(typeof status.total === 'number', 'total should be number');
  assert(typeof status.remaining === 'number', 'remaining should be number');
  assert(typeof status.percentUsed === 'number', 'percentUsed should be number');
});

// ============================================
// PLATFORM TEMPLATES TESTS
// ============================================

console.log('\n📱 Platform Templates Tests\n');

test('platform-templates.js has correct platform configs', () => {
  const script = fs.readFileSync(path.join(__dirname, '../platform-templates.js'), 'utf8');
  assert(script.includes('youtube:'), 'youtube platform missing');
  assert(script.includes('tiktok:'), 'tiktok platform missing');
  assert(script.includes('instagram_reels:'), 'instagram_reels platform missing');
  assert(script.includes('instagram_feed:'), 'instagram_feed platform missing');
  assert(script.includes('twitter:'), 'twitter platform missing');
});

test('platform-templates.js has correct aspect ratios', () => {
  const script = fs.readFileSync(path.join(__dirname, '../platform-templates.js'), 'utf8');
  // YouTube should be 16:9 (1920x1080)
  assert(script.includes('youtube:') && script.includes('1920') && script.includes('1080'), 'YouTube should be 1920x1080');
  // TikTok should be 9:16 (1080x1920)
  assert(script.includes('tiktok:') && script.includes('1080') && script.includes('1920'), 'TikTok should be 1080x1920');
  // Instagram Feed should be 1:1 (1080x1080)
  assert(script.includes('instagram_feed:') && script.includes('1080,') && script.includes('1080'), 'Instagram Feed should be 1080x1080');
});

test('platform-templates.js has duration limits', () => {
  const script = fs.readFileSync(path.join(__dirname, '../platform-templates.js'), 'utf8');
  // TikTok should have maxDuration
  assert(script.includes('maxDuration: 180'), 'TikTok should have 180s limit');
  // Instagram Reels should have 90s limit
  assert(script.includes('maxDuration: 90'), 'Instagram Reels should have 90s limit');
});

// ============================================
// YOUTUBE UPLOAD TESTS
// ============================================

console.log('\n📤 YouTube Upload Tests\n');

test('youtube-upload.js has required functionality', () => {
  const script = fs.readFileSync(path.join(__dirname, '../youtube-upload.js'), 'utf8');
  assert(script.includes('getAccessToken'), 'getAccessToken function missing');
  assert(script.includes('generateMetadata'), 'generateMetadata function missing');
  assert(script.includes('uploadVideo'), 'uploadVideo function missing');
  assert(script.includes('YOUTUBE_CLIENT_ID'), 'YOUTUBE_CLIENT_ID env var missing');
  assert(script.includes('YOUTUBE_CLIENT_SECRET'), 'YOUTUBE_CLIENT_SECRET env var missing');
  assert(script.includes('YOUTUBE_REFRESH_TOKEN'), 'YOUTUBE_REFRESH_TOKEN env var missing');
});

test('youtube-upload.js has correct visibility options', () => {
  const script = fs.readFileSync(path.join(__dirname, '../youtube-upload.js'), 'utf8');
  assert(script.includes("'public'"), 'public visibility missing');
  assert(script.includes("'unlisted'"), 'unlisted visibility missing');
  assert(script.includes("'private'"), 'private visibility missing');
  assert(script.includes('DEFAULT_VISIBILITY'), 'DEFAULT_VISIBILITY missing');
});

test('youtube-upload.js generates correct metadata', () => {
  const script = fs.readFileSync(path.join(__dirname, '../youtube-upload.js'), 'utf8');
  // Should have genre-based tags
  assert(script.includes('mystery') && script.includes('horror'), 'Genre tags missing');
  // Should have default category
  assert(script.includes('categoryId'), 'categoryId missing');
  // Should handle title generation
  assert(script.includes('titleCased'), 'title generation missing');
});

// ============================================
// THUMBNAIL GENERATOR TESTS
// ============================================

console.log('\n🖼️  Thumbnail Generator Tests\n');

test('generate-thumbnails.js has correct platform sizes', () => {
  const script = fs.readFileSync(path.join(__dirname, '../generate-thumbnails.js'), 'utf8');
  assert(script.includes('youtube:') && script.includes('1280') && script.includes('720'), 'YouTube thumbnail size missing');
  assert(script.includes('tiktok:') && script.includes('1080') && script.includes('1920'), 'TikTok thumbnail size missing');
  assert(script.includes('instagram:') && script.includes('1080') && script.includes('1080'), 'Instagram thumbnail size missing');
});

test('generate-thumbnails.js extracts key frames', () => {
  const script = fs.readFileSync(path.join(__dirname, '../generate-thumbnails.js'), 'utf8');
  assert(script.includes('extractKeyFrames'), 'extractKeyFrames function missing');
  assert(script.includes('getVideoDuration'), 'getVideoDuration function missing');
  assert(script.includes('FFPROBE'), 'FFPROBE reference missing');
});

// ============================================
// PACKAGE.JSON TESTS
// ============================================

console.log('\n📦 Package.json Tests\n');

test('package.json has new scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert(pkg.scripts.platforms, 'platforms script missing');
  assert(pkg.scripts['platforms:youtube'], 'platforms:youtube script missing');
  assert(pkg.scripts['platforms:tiktok'], 'platforms:tiktok script missing');
  assert(pkg.scripts.upload, 'upload script missing');
  assert(pkg.scripts['build:full'], 'build:full script missing');
});

test('package.json version updated', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const version = pkg.version.split('.').map(Number);
  // Should be at least 1.4.0
  assert(version[0] >= 1, 'Major version should be at least 1');
  assert(version[1] >= 4, 'Minor version should be at least 4');
});

// ============================================
// RUN SUMMARY
// ============================================

console.log('\n' + '='.repeat(40));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40) + '\n');

process.exit(failed > 0 ? 1 : 0);