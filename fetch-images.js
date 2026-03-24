#!/usr/bin/env node

/**
 * MysteryForge Media Generator v3
 * 
 * Downloads:
 * - VIDEO CLIPS for non-character segments (Pexels videos)
 * - IMAGES for character segments (Pexels images, Cloudflare AI when available)
 * 
 * This makes videos more dynamic and monetization-friendly.
 */

const fs = require('fs');
const path = require('path');
const { generateImage } = require('./src/providers/index.js');
const { searchVideos, downloadVideo, searchImages, downloadImage } = require('./src/images/fetcher.js');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    latest: args.includes('--latest'),
    count: args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1], 10) : null,
    videosOnly: args.includes('--videos-only'),
    imagesOnly: args.includes('--images-only')
  };
}

function getLatestStoryFolder() {
  const outputDir = path.join(process.cwd(), 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && 
             fs.existsSync(path.join(p, 'story.json'));
    })
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return folders.length > 0 ? path.join(outputDir, folders[0].name) : null;
}

/**
 * Extract search keywords from image prompt
 */
function extractKeywords(imagePrompt) {
  return imagePrompt
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join(' ');
}

async function main() {
  const options = parseArgs();
  
  if (!options.latest) {
    console.error('❌ Use --latest to specify which story to process');
    console.error('   Usage: node fetch-images.js --latest [--videos-only] [--images-only]');
    process.exit(1);
  }

  const storyFolder = getLatestStoryFolder();
  if (!storyFolder) {
    console.error('❌ No story folders found');
    process.exit(1);
  }

  const story = JSON.parse(fs.readFileSync(path.join(storyFolder, 'story.json'), 'utf8'));
  const segments = story.segments || [];
  
  if (segments.length === 0) {
    console.error('❌ No segments in story.json');
    process.exit(1);
  }

  const outputDir = path.join(storyFolder, 'images');
  const charDir = path.join(storyFolder, 'character-shots');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(charDir, { recursive: true });

  const totalSegments = options.count || segments.length;
  const toProcess = Math.min(totalSegments, segments.length);

  const characterAnchor = story.characterAnchor || '';
  const characterCount = segments.filter(s => s.isCharacterShot).length;
  const nonCharacterCount = segments.filter(s => !s.isCharacterShot).length;

  console.log(`\n🎬 Fetching media for: ${story.title}`);
  console.log(`   Total segments: ${toProcess}`);
  console.log(`   Character shots (images): ${characterCount}`);
  console.log(`   Non-character shots (videos): ${nonCharacterCount}\n`);

  let videosDownloaded = 0;
  let imagesDownloaded = 0;
  let failed = 0;

  // Process all segments
  const tasks = [];

  for (let i = 0; i < toProcess; i++) {
    const segment = segments[i];
    const isChar = segment.isCharacterShot;
    const keywords = extractKeywords(segment.imagePrompt || segment.text);
    
    // Determine media type
    let mediaType;
    if (options.videosOnly) {
      mediaType = 'video';
    } else if (options.imagesOnly) {
      mediaType = 'image';
    } else {
      mediaType = isChar ? 'image' : 'video';
    }

    const task = (async () => {
      const typeLabel = mediaType === 'video' ? '🎬 VIDEO' : '🖼️ IMAGE';
      console.log(`[${i + 1}/${toProcess}] ${typeLabel}: "${segment.text?.substring(0, 35)}..."`);
      console.log(`   Keywords: "${keywords}"`);

      try {
        if (mediaType === 'video') {
          // Download video clip for non-character shots
          const outputPath = path.join(outputDir, `media_${String(i).padStart(3, '0')}.mp4`);
          
          // Skip if exists
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 50000) {
            console.log(`   ✓ Exists (video)`);
            return { success: true, type: 'video', index: i };
          }

          // Search and download
          const result = await searchVideos(keywords, 3);
          if (!result.videos?.length) {
            throw new Error('No videos found');
          }

          // Pick random video
          const video = result.videos[Math.floor(Math.random() * result.videos.length)];
          await downloadVideo(video.url, outputPath);
          
          console.log(`   ✓ Video: ${video.duration}s by ${video.photographer}`);
          return { success: true, type: 'video', index: i, duration: video.duration };

        } else {
          // Download/generate image for character shots
          const outputPath = path.join(outputDir, `media_${String(i).padStart(3, '0')}.jpg`);
          
          // Skip if exists
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
            console.log(`   ✓ Exists (image)`);
            // Also copy to character-shots
            if (isChar) {
              const charPath = path.join(charDir, `char_${String(i).padStart(3, '0')}.jpg`);
              fs.copyFileSync(outputPath, charPath);
            }
            return { success: true, type: 'image', index: i };
          }

          // Build prompt with character anchor if needed
          let prompt = segment.imagePrompt || `cinematic scene: ${segment.text?.substring(0, 80)}`;
          if (isChar && characterAnchor) {
            prompt = `${characterAnchor}, ${prompt}`;
          }

          // Try Cloudflare AI first (if quota available), then Pexels
          try {
            await generateImage(prompt, outputPath, { steps: 4 });
            console.log(`   ✓ AI image generated`);
          } catch (e) {
            // Fallback to Pexels image
            const imgResult = await searchImages(keywords + ' dark moody', 3);
            if (!imgResult.photos?.length) {
              throw new Error('No images found');
            }
            const photo = imgResult.photos[Math.floor(Math.random() * imgResult.photos.length)];
            await downloadImage(photo.src.large, outputPath);
            console.log(`   ✓ Pexels image by ${photo.photographer}`);
          }

          // Also save to character-shots
          if (isChar) {
            const charPath = path.join(charDir, `char_${String(i).padStart(3, '0')}.jpg`);
            fs.copyFileSync(outputPath, charPath);
          }

          return { success: true, type: 'image', index: i };
        }

      } catch (e) {
        console.log(`   ✗ Error: ${e.message}`);
        return { success: false, index: i, error: e.message };
      }
    })();

    tasks.push(task);
  }

  // Run all tasks in parallel
  const results = await Promise.all(tasks);

  // Summary
  const videos = results.filter(r => r.success && r.type === 'video').length;
  const images = results.filter(r => r.success && r.type === 'image').length;
  failed = results.filter(r => !r.success).length;

  console.log(`\n📊 Summary:`);
  console.log(`   Videos: ${videos}`);
  console.log(`   Images: ${images}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n✅ Done!\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });