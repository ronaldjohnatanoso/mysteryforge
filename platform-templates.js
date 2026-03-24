#!/usr/bin/env node

/**
 * MysteryForge Platform Templates
 * 
 * Creates platform-optimized video variants:
 * - YouTube: 16:9 (1920x1080)
 * - TikTok: 9:16 (1080x1920)
 * - Instagram Reels: 9:16 (1080x1920)
 * - Instagram Feed: 1:1 (1080x1080)
 * - Twitter/X: 16:9 (1200x675)
 * 
 * Usage:
 *   node platform-templates.js --latest              # All platforms
 *   node platform-templates.js --latest --youtube    # YouTube only
 *   node platform-templates.js --latest --tiktok     # TikTok only
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || path.join(process.env.HOME, '.local/bin/ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH || path.join(process.env.HOME, '.local/bin/ffprobe');

const PLATFORMS = {
  youtube: {
    name: 'YouTube',
    width: 1920,
    height: 1080,
    aspect: '16:9',
    maxDuration: null,
    description: 'Standard horizontal format'
  },
  tiktok: {
    name: 'TikTok',
    width: 1080,
    height: 1920,
    aspect: '9:16',
    maxDuration: 180, // 3 minutes
    description: 'Vertical short-form'
  },
  instagram_reels: {
    name: 'Instagram Reels',
    width: 1080,
    height: 1920,
    aspect: '9:16',
    maxDuration: 90, // 90 seconds
    description: 'Vertical for Reels'
  },
  instagram_feed: {
    name: 'Instagram Feed',
    width: 1080,
    height: 1080,
    aspect: '1:1',
    maxDuration: 60, // 60 seconds
    description: 'Square format'
  },
  twitter: {
    name: 'Twitter/X',
    width: 1200,
    height: 675,
    aspect: '16:9',
    maxDuration: 140, // 2:20
    description: 'Optimized for feed'
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const platforms = [];
  if (args.includes('--youtube')) platforms.push('youtube');
  if (args.includes('--tiktok')) platforms.push('tiktok');
  if (args.includes('--reels')) platforms.push('instagram_reels');
  if (args.includes('--instagram')) platforms.push('instagram_feed');
  if (args.includes('--twitter')) platforms.push('twitter');
  
  return {
    latest: args.includes('--latest'),
    all: args.includes('--all') || platforms.length === 0,
    platforms,
    storyFolder: args.find(a => !a.startsWith('--'))
  };
}

function getLatestStoryFolder() {
  const outputDir = path.join(process.cwd(), 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && 
             fs.existsSync(path.join(p, 'video.mp4'));
    })
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return folders.length > 0 ? path.join(outputDir, folders[0].name) : null;
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

/**
 * Create platform-optimized video
 */
function createPlatformVariant(inputPath, outputPath, platform, story) {
  const config = PLATFORMS[platform];
  const duration = getVideoDuration(inputPath);
  
  // Check duration limits
  let trimDuration = duration;
  if (config.maxDuration && duration > config.maxDuration) {
    trimDuration = config.maxDuration;
    console.log(`   ⚠️  Trimming to ${config.maxDuration}s for ${config.name}`);
  }

  // Build filter based on aspect ratio
  let filter;
  
  if (platform === 'youtube' || platform === 'twitter') {
    // Standard horizontal - just scale
    filter = `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:black`;
  } else if (platform === 'tiktok' || platform === 'instagram_reels') {
    // Vertical - need to crop and potentially add content
    // For vertical: center crop and add blurred background
    filter = `
      [0:v]split[main][bg];
      [bg]scale=${config.width}:${config.height}:force_original_aspect_ratio=increase,boxblur=20[blurred];
      [main]scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease[scaled];
      [blurred][scaled]overlay=(W-w)/2:(H-h)/2
    `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
  } else if (platform === 'instagram_feed') {
    // Square - center with blurred background
    filter = `
      [0:v]split[main][bg];
      [bg]scale=${config.width}:${config.height}:force_original_aspect_ratio=increase,boxblur=20[blurred];
      [main]scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease[scaled];
      [blurred][scaled]overlay=(W-w)/2:(H-h)/2
    `.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
  }

  // Build command
  const cmd = `${FFMPEG} -y -i "${inputPath}" -t ${trimDuration} \
    -vf "${filter}" \
    -c:v libx264 -preset fast -crf 23 \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    "${outputPath}" 2>&1`;

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
    return true;
  } catch (e) {
    console.error(`   ❌ Failed: ${e.message}`);
    return false;
  }
}

/**
 * Generate platform-specific thumbnail
 */
function createPlatformThumbnail(storyFolder, platform) {
  const config = PLATFORMS[platform];
  const videoPath = path.join(storyFolder, 'video.mp4');
  const thumbsDir = path.join(storyFolder, 'platform_thumbs');
  fs.mkdirSync(thumbsDir, { recursive: true });
  
  const thumbPath = path.join(thumbsDir, `thumb_${platform}.jpg`);
  
  // Get duration and pick frame at 25%
  const duration = getVideoDuration(videoPath);
  const timestamp = duration * 0.25;
  
  const filter = `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:black`;
  
  try {
    execSync(
      `${FFMPEG} -y -ss ${timestamp} -i "${videoPath}" -frames:v 1 -vf "${filter}" "${thumbPath}"`,
      { stdio: 'pipe' }
    );
    return thumbPath;
  } catch (e) {
    return null;
  }
}

async function main() {
  const opts = parseArgs();
  
  // Find story folder
  let storyFolder = opts.storyFolder;
  if (opts.latest || !storyFolder) {
    storyFolder = getLatestStoryFolder();
    if (!storyFolder) {
      console.error('❌ No video-ready stories found');
      process.exit(1);
    }
  } else {
    storyFolder = path.join(process.cwd(), 'output', storyFolder);
  }

  const videoPath = path.join(storyFolder, 'video.mp4');
  const storyPath = path.join(storyFolder, 'story.json');
  
  if (!fs.existsSync(videoPath)) {
    console.error('❌ No video.mp4 found');
    process.exit(1);
  }

  // Load story
  let story = {};
  if (fs.existsSync(storyPath)) {
    story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  }

  // Determine platforms
  const platforms = opts.all ? Object.keys(PLATFORMS) : opts.platforms;
  
  if (platforms.length === 0) {
    console.error('❌ No platforms specified. Use --youtube, --tiktok, --reels, --instagram, --twitter, or --all');
    process.exit(1);
  }

  const duration = getVideoDuration(videoPath);
  
  console.log(`\n🎬 Creating platform variants: ${story.title || path.basename(storyFolder)}`);
  console.log(`   Source: ${(duration / 60).toFixed(1)}min video`);
  console.log(`   Platforms: ${platforms.map(p => PLATFORMS[p].name).join(', ')}\n`);

  // Create output directory
  const platformsDir = path.join(storyFolder, 'platforms');
  fs.mkdirSync(platformsDir, { recursive: true });

  const results = [];

  for (const platform of platforms) {
    const config = PLATFORMS[platform];
    const outputPath = path.join(platformsDir, `${platform}.mp4`);
    
    console.log(`📱 ${config.name} (${config.aspect})`);
    console.log(`   ${config.width}x${config.height} - ${config.description}`);
    
    const success = createPlatformVariant(videoPath, outputPath, platform, story);
    
    if (success) {
      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`   ✓ Created: ${outputPath}`);
      console.log(`   Size: ${sizeMB} MB`);
      
      // Also create thumbnail
      const thumbPath = createPlatformThumbnail(storyFolder, platform);
      if (thumbPath) {
        console.log(`   Thumbnail: ${thumbPath}`);
      }
      
      results.push({ platform: config.name, path: outputPath, sizeMB });
    }
    
    console.log('');
  }

  // Summary
  console.log('='.repeat(50));
  console.log(`✅ Created ${results.length} platform variants`);
  console.log(`   Output: ${platformsDir}/\n`);

  // Print upload suggestions
  console.log('📤 Upload to:');
  results.forEach(r => {
    const uploadUrls = {
      'YouTube': 'https://studio.youtube.com',
      'TikTok': 'https://www.tiktok.com/creator-center',
      'Instagram Reels': 'https://www.instagram.com (mobile app)',
      'Instagram Feed': 'https://www.instagram.com (mobile app)',
      'Twitter/X': 'https://twitter.com/compose/tweet'
    };
    console.log(`   ${r.platform}: ${uploadUrls[r.platform] || 'Manual upload'}`);
  });
  console.log('');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });