#!/usr/bin/env node

/**
 * MysteryForge Full Pipeline
 * 
 * Runs all steps in parallel where possible:
 * - Story generation (sequential - needed first)
 * - Images + TTS (parallel after story)
 * - Video assembly (sequential - needs everything)
 */

const fs = require('fs');
const path = require('path');

// Load credentials env
try {
  const envFile = fs.readFileSync('/home/ronald/credentials/.env', 'utf8');
  envFile.split('\n').forEach(line => {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim();
  });
} catch (e) { /* credentials env not found */ }

const { generateText, generateImage, wordsToSRT } = require('./src/worker-client');
const { generateSpeech } = require('./src/providers/index.js'); // Kokoro local TTS (default)
const { searchVideos, downloadVideo, searchImages, downloadImage } = require('./src/images/fetcher.js');

const SECONDS_PER_SEGMENT = 8;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    genre: args.includes('--genre') ? args[args.indexOf('--genre') + 1] : 'revenge',
    length: args.includes('--length') ? parseInt(args[args.indexOf('--length') + 1]) : 2,
    topic: args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null,
    voice: args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'af_sky'  // Kokoro voices: af_sky, af_heart, am_michael, etc.
  };
}

function splitIntoSegments(story, targetWords = 25) {
  const sentences = story.replace(/([.!?])\s+/g, '$1\n').split('\n').filter(s => s.trim());
  const segments = [];
  let current = [], words = 0;
  
  for (const sentence of sentences) {
    const w = sentence.trim().split(/\s+/).length;
    if (words + w > targetWords * 1.5 && current.length > 0) {
      segments.push(current.join(' ').trim());
      current = [sentence.trim()];
      words = w;
    } else {
      current.push(sentence.trim());
      words += w;
    }
    if (words >= targetWords) {
      segments.push(current.join(' ').trim());
      current = [];
      words = 0;
    }
  }
  if (current.length) segments.push(current.join(' ').trim());
  return segments.filter(s => s.length > 10);
}

function generateImagePrompt(text, genre) {
  const keywords = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(', ');
  const styles = { revenge: 'corporate office', horror: 'dark ominous', mystery: 'noir shadows', confession: 'intimate portrait' };
  return `${keywords}, ${styles[genre] || styles.mystery}, cinematic lighting, photorealistic, 4k`;
}

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join(' ');
}

// Genre-safe B-roll fallback keywords (Pexels won't flag these)
const BROLL_FALLBACK = {
  mystery: 'dark forest fog',
  horror: 'old house night',
  revenge: 'corporate office building',
  confession: 'dimly lit room shadows',
  default: 'dramatic atmosphere dark'
};

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();
  
  console.log(`\n🚀 MysteryForge Pipeline`);
  console.log(`   Genre: ${opts.genre}, Length: ${opts.length}min\n`);
  
  // Load config
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  const genreConfig = config.genres[opts.genre];
  const topic = opts.topic 
    ? genreConfig.topics.find(t => t.type === opts.topic) || genreConfig.topics[0]
    : genreConfig.topics[Math.floor(Math.random() * genreConfig.topics.length)];
  
  const wordCount = Math.floor(opts.length * 150 * 1.1);
  
  // ===== STEP 1: Generate Story =====
  console.log('📝 Generating story...');
  const systemPrompt = `You write viral YouTube stories. First person narrative. Be specific with names, dates, places. End with: "Revenge is a dish best served cold." Just the story, no meta commentary.`;
  const userPrompt = `Write a ${opts.length}-minute ${opts.genre} story about: ${topic.prompt}

Start with: "${topic.hook}"

~${wordCount} words. First person. Dramatic and specific.
${opts.genre === 'revenge' ? 'End with: "Revenge is a dish best served cold."' : ''}`;

  const storyText = await generateText(userPrompt, systemPrompt, '@cf/openai/gpt-oss-120b');
  
  // Clean and split
  const cleaned = storyText.replace(/\[.*?\]/g, '').replace(/^"|"$/g, '').trim();
  const segmentTexts = splitIntoSegments(cleaned);
  // Mark character shots: ~20% of segments (every 5th, skipping first)
  const isCharacter = (i, total) => Math.floor((i / total) * 5) % 5 === 0 && i > 0;
  const segments = segmentTexts.map((text, i) => ({
    text,
    image_prompt: generateImagePrompt(text, opts.genre),
    isCharacterShot: isCharacter(i, segmentTexts.length)
  }));
  const title = cleaned.split(/[.!?]/)[0].split(' ').slice(0, 6).join('_').toLowerCase().replace(/[^a-z0-9_]/g, '') || `story_${Date.now()}`;
  
  // Create output folder
  const folder = path.join(__dirname, 'output', title);
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(folder, 'images'), { recursive: true });
  
  // Save story
  const storyData = {
    title, genre: opts.genre, topic: topic.type, length_minutes: opts.length,
    total_words: cleaned.split(/\s+/).length, segment_count: segments.length,
    seconds_per_segment: SECONDS_PER_SEGMENT, story: cleaned, segments,
    ambient: genreConfig.ambient, colorGrade: genreConfig.colorGrade,
    generated: new Date().toISOString(), provider: 'cloudflare-worker'
  };
  fs.writeFileSync(path.join(folder, 'story.json'), JSON.stringify(storyData, null, 2));
  fs.writeFileSync(path.join(folder, 'narration.txt'), cleaned);
  
  console.log(`   ✅ ${segments.length} segments, ${storyData.total_words} words`);
  console.log(`   📁 ${folder}\n`);
  
  // ===== STEP 2: Media (B-roll + character images) + TTS in parallel =====
  // ~20% of segments are character shots (AI-generated images)
  // ~80% are B-roll (Pexels video clips)
  console.log('🎬 Fetching B-roll + character media in parallel...');
  
  const mediaTasks = segments.map(async (seg, i) => {
    const char = seg.isCharacterShot;
    const keywords = extractKeywords(seg.text);
    
    if (char) {
      // Character shot: AI-generated image
      const outputPath = path.join(folder, 'images', `media_${String(i).padStart(3, '0')}.jpg`);
      try {
        await generateImage(seg.image_prompt, outputPath, 4);
        return { success: true, index: i, type: 'image', isCharacter: true };
      } catch (e) {
        return { success: false, index: i, error: e.message, type: 'image' };
      }
    } else {
      // B-roll: Pexels video clip + Pexels image fallback
      const videoPath = path.join(folder, 'images', `media_${String(i).padStart(3, '0')}.mp4`);
      const imagePath = path.join(folder, 'images', `media_${String(i).padStart(3, '0')}.jpg`);
      const safeKeyword = BROLL_FALLBACK[opts.genre] || BROLL_FALLBACK.default;
      try {
        const result = await searchVideos(keywords, 3);
        if (result.videos?.length) {
          const video = result.videos[Math.floor(Math.random() * result.videos.length)];
          await downloadVideo(video.url, videoPath);
          return { success: true, index: i, type: 'video', duration: video.duration };
        }
        // No videos found — try safe fallback keyword
        const fallbackResult = await searchVideos(safeKeyword, 3);
        if (fallbackResult.videos?.length) {
          const video = fallbackResult.videos[Math.floor(Math.random() * fallbackResult.videos.length)];
          await downloadVideo(video.url, videoPath);
          return { success: true, index: i, type: 'video', duration: video.duration };
        }
      } catch (e) {
        // Try safe fallback on error too
        try {
          const fallbackResult = await searchVideos(safeKeyword, 3);
          if (fallbackResult.videos?.length) {
            const video = fallbackResult.videos[Math.floor(Math.random() * fallbackResult.videos.length)];
            await downloadVideo(video.url, videoPath);
            return { success: true, index: i, type: 'video', duration: video.duration };
          }
        } catch (e2) { /* silence */ }
      }
      // Fallback: try Pexels image
      try {
        const imgResult = await searchImages(safeKeyword, 3);
        if (imgResult.photos?.length) {
          const photo = imgResult.photos[Math.floor(Math.random() * imgResult.photos.length)];
          await downloadImage(photo.src.large, imagePath);
          return { success: true, index: i, type: 'image' };
        }
      } catch (e2) {
        return { success: false, index: i, error: 'No video or image found', type: 'image' };
      }
      return { success: false, index: i, error: 'Search failed', type: 'image' };
    }
  });
  
  const ttsTask = generateSpeech(cleaned, path.join(folder, 'narration.mp3'), opts.voice)
    .then(r => ({ success: true, size: r.size }))
    .catch(e => ({ success: false, error: e.message }));
  
  // Run all in parallel
  const parallelStart = Date.now();
  const [mediaResults, ttsResult] = await Promise.all([
    Promise.all(mediaTasks),
    ttsTask
  ]);
  const parallelTime = ((Date.now() - parallelStart) / 1000).toFixed(1);
  
  const videosOk = mediaResults.filter(r => r.success && r.type === 'video').length;
  const imagesOk = mediaResults.filter(r => r.success && r.type === 'image').length;
  const mediaFail = mediaResults.filter(r => !r.success).length;
  
  console.log(`   ✅ Videos (B-roll): ${videosOk}`);
  console.log(`   ✅ Images (character): ${imagesOk}`);
  if (mediaFail) console.log(`   ❌ Failed: ${mediaFail}`);
  
  if (ttsResult.success) {
    console.log(`   ✅ Audio: ${(ttsResult.size / 1024).toFixed(0)}KB`);
  } else {
    console.log(`   ❌ Audio: ${ttsResult.error}`);
  }
  
  // ===== STEP 3: Generate Thumbnails =====
  if (ttsResult.success && imagesOk > 0) {
    console.log('\n🖼️  Generating thumbnails...');
    
    // Create thumbnails directory
    const thumbsDir = path.join(folder, 'thumbnails');
    fs.mkdirSync(thumbsDir, { recursive: true });
    
    // Pick 3 evenly distributed images for thumbnails
    const imageFiles = fs.readdirSync(path.join(folder, 'images'))
      .filter(f => (f.startsWith('media_') || f.startsWith('img_')) && (f.endsWith('.jpg') || f.endsWith('.png')))
      .sort();
    
    if (imageFiles.length > 0) {
      const step = Math.max(1, Math.floor(imageFiles.length / 3));
      for (let i = 0; i < 3 && i * step < imageFiles.length; i++) {
        const srcPath = path.join(folder, 'images', imageFiles[i * step]);
        const destPath = path.join(thumbsDir, `thumb_${String(i + 1).padStart(2, '0')}.jpg`);
        fs.copyFileSync(srcPath, destPath);
      }
      console.log(`   ✓ Created 3 thumbnail candidates`);
    }
  }
  
  // ===== Summary =====
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Total time: ${totalTime}s`);
  console.log(`📁 Output: ${folder}/`);
  
  if (ttsResult.success && imagesOk > 0) {
    console.log(`\n🎬 Ready for video assembly:`);
    console.log(`   node assemble-video.js --latest`);
    console.log(`   node platform-templates.js --latest --all`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });