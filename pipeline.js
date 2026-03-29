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
  const opts = {
    genre: 'revenge',
    length: 2,
    topic: null,
    voice: 'af_sky',
    prompt: null
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prompt' || arg === '-p') {
      opts.prompt = args[++i];
    } else if (arg === '--genre') {
      opts.genre = args[++i];
    } else if (arg === '--length' || arg === '-l') {
      opts.length = parseInt(args[++i]) || 2;
    } else if (arg === '--topic') {
      opts.topic = args[++i];
    } else if (arg === '--voice' || arg === '-v') {
      opts.voice = args[++i] || 'af_sky';
    }
  }
  
  return opts;
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

/**
 * Extract visual search terms from an image prompt (not the narration text).
 * Image prompts are detailed scene descriptions — extract the most visually
 * searchable nouns/phrases: objects, settings, lighting, emotions visible.
 */
function extractVisualTerms(imagePrompt) {
  // Remove common AI image generation tags/styles to focus on scene content
  const cleaned = imagePrompt
    .toLowerCase()
    .replace(/photorealistic|4k|hd|cinematic|film grain|dramatic lighting|volumetric|rule of thirds|glowing|sharp focus|detailed face|medium shot|close-up|long shot|outdoor|indoor|style of|artwork|illustration|sentrifugal|panoramic/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Extract key visual terms: nouns, scene elements, emotions visible
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  
  // Prioritize: specific objects > scene setting > lighting > mood
  const visualTerms = [];
  const objects = ['phone', 'car', 'door', 'house', 'building', 'room', 'street', 'window', 'mirror', 'hand', 'face', 'eyes', 'shadow', 'knife', 'blood', 'letter', 'photo', 'computer', 'tv', 'table', 'bed', 'floor', 'wall', 'sky', 'tree', 'forest', 'road', 'parking', 'office', 'hospital', 'church'];
  const settings = ['kitchen', 'bathroom', 'bedroom', 'hallway', 'basement', 'attic', 'parking', 'garage', 'restaurant', 'hotel', 'airport', 'school', 'hospital', 'church', 'forest', 'beach', 'bridge', 'alley'];
  const lighting = ['dark', 'bright', 'dim', 'glowing', 'neon', 'candlelight', 'flashlight', 'moonlight', 'sunset', 'foggy', 'misty'];
  
  for (const word of words) {
    if (objects.includes(word) || settings.includes(word) || lighting.includes(word)) {
      visualTerms.push(word);
    }
  }
  
  // If nothing specific found, just use the first few meaningful words
  if (visualTerms.length === 0) {
    return words.slice(0, 4).join(' ');
  }
  
  return visualTerms.slice(0, 4).join(' ');
}


async function main() {
  const opts = parseArgs();
  const startTime = Date.now();
  
  const displayGenre = opts.prompt ? 'custom' : opts.genre;
  console.log(`\n🚀 MysteryForge Pipeline`);
  console.log(`   ${opts.prompt ? `Prompt: "${opts.prompt.substring(0, 60)}..."` : `Genre: ${opts.genre}`}`);
  console.log(`   Length: ${opts.length}min, Voice: ${opts.voice}\n`);
  
  // Load config (only needed for genre/topic mode)
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  const genreConfig = opts.prompt ? null : config.genres[opts.genre];
  // Only define topic if using genre/topic mode (not custom prompt)
  const topic = genreConfig && (opts.topic 
    ? genreConfig.topics.find(t => t.type === opts.topic) || genreConfig.topics[0]
    : genreConfig.topics[Math.floor(Math.random() * genreConfig.topics.length)]);
  
  const wordCount = Math.floor(opts.length * 150 * 1.1);
  
  // ===== STEP 1: Generate Story =====
  console.log('📝 Generating story...');
  
  // Use custom prompt if provided, otherwise use genre/topic system
  const storyPrompt = opts.prompt 
    ? opts.prompt
    : `${opts.length}-minute ${opts.genre} story about: ${topic.prompt}`;
  
  const systemPrompt = opts.prompt
    ? `You write viral YouTube stories. First person. Specific names, dates, amounts. Dark, raw tone. No moralizing. End with: "Revenge is a dish best served cold." Output only the story.`
    : `You write viral YouTube stories. First person narrative. Be specific with names, dates, places. End with: "Revenge is a dish best served cold." Just the story, no meta commentary.`;
  
  let storyText, cleaned, segmentTexts, segments, title, topicType;
  
  if (opts.prompt) {
    // Prompt mode: use generate.js-style JSON output
    const genSystem = `You are a JSON generator. Output ONLY valid JSON. No markdown fences. No explanation.

Schema:
{"title":"snake_case_title","genre":"genre","characterAnchor":"visual description","segments":[{"id":1,"text":"20-30 word paragraph narration","imagePrompt":"scene description","isCharacterShot":false}]}

RULES:
- Each segment text: 20-30 words. Full paragraph. No one-liners.
- isCharacterShot: true ~20% of segments (main character appears)
- Hook first segment with tension/conflict
- Use specific details: names, dates, amounts
- Dark, mature tone. End with: "Revenge is a dish best served cold."
- Total: ~${wordCount} words in ~${Math.ceil(wordCount / 25)} segments`;

    const genUser = `Write a YouTube story for: ${opts.prompt}

Output the JSON now. Only JSON. No commentary.`;

    storyText = await generateText(genUser, genSystem, 8000);
    
    // Parse JSON
    let jsonStr = storyText.trim();
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse story JSON');
    const storyData = JSON.parse(jsonMatch[0]);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    title = `${storyData.title}_${timestamp}`;
    topicType = 'custom';
    
    // Ensure characterAnchor
    if (!storyData.characterAnchor) {
      storyData.characterAnchor = 'person in dramatic lighting, cinematic style';
    }
    
    // Ensure isCharacterShot
    storyData.segments.forEach((seg, i) => {
      if (seg.isCharacterShot === undefined) seg.isCharacterShot = false;
      if (!seg.id) seg.id = i + 1;
    });
    
    // Add image_prompt (clean up the field name)
    storyData.segments = storyData.segments.map(seg => ({
      id: seg.id,
      text: seg.text,
      image_prompt: seg.imagePrompt || seg.image_prompt || 'dramatic scene, cinematic lighting',
      isCharacterShot: seg.isCharacterShot
    }));
    
    cleaned = storyData.segments.map(s => s.text).join(' ');
    segments = storyData.segments;
  } else {
    // Genre/topic mode: freeform text generation
    const genUser = `Write a ${opts.length}-minute ${opts.genre} story about: ${topic.prompt}

Start with: "${topic.hook}"

~${wordCount} words. First person. Dramatic and specific.
${opts.genre === 'revenge' ? 'End with: "Revenge is a dish best served cold."' : ''}`;

    storyText = await generateText(genUser, systemPrompt, 8000);
    
    // Clean and split
    cleaned = storyText.replace(/\[.*?\]/g, '').replace(/^"|"$/g, '').trim();
    segmentTexts = splitIntoSegments(cleaned);
    const isCharacter = (i, total) => Math.floor((i / total) * 5) % 5 === 0 && i > 0;
    segments = segmentTexts.map((text, i) => ({
      text,
      image_prompt: generateImagePrompt(text, opts.genre),
      isCharacterShot: isCharacter(i, segmentTexts.length)
    }));
    title = cleaned.split(/[.!?]/)[0].split(' ').slice(0, 6).join('_').toLowerCase().replace(/[^a-z0-9_]/g, '') || `story_${Date.now()}`;
    topicType = topic.type;
  }
  
  // Create output folder
  const folder = path.join(__dirname, 'output', title);
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(folder, 'images'), { recursive: true });
  
  // Save story
  const storyData = {
    title, 
    genre: opts.prompt ? (segments[0]?.isCharacterShot ? 'custom' : opts.genre) : opts.genre,
    topic: topicType,
    length_minutes: opts.length,
    total_words: cleaned.split(/\s+/).length, 
    segment_count: segments.length,
    seconds_per_segment: SECONDS_PER_SEGMENT, 
    story: cleaned, 
    segments,
    ambient: genreConfig?.ambient || 'dark cinematic',
    colorGrade: genreConfig?.colorGrade || 'high contrast desaturated',
    generated: new Date().toISOString(), 
    provider: 'cloudflare-worker',
    originalPrompt: opts.prompt || null
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
      // B-roll: use visual terms from image_prompt (not generic narration keywords)
      const videoPath = path.join(folder, 'images', `media_${String(i).padStart(3, '0')}.mp4`);
      const imagePath = path.join(folder, 'images', `media_${String(i).padStart(3, '0')}.jpg`);
      const visualTerms = extractVisualTerms(seg.image_prompt);
      
      // Try Pexels video with visual terms from image_prompt
      try {
        const result = await searchVideos(visualTerms, 3);
        if (result.videos?.length) {
          const video = result.videos[Math.floor(Math.random() * Math.min(3, result.videos.length))];
          await downloadVideo(video.url, videoPath);
          return { success: true, index: i, type: 'video', duration: video.duration };
        }
      } catch (e) { /* try fallback */ }
      
      // Fallback 1: Pexels image (still using visual terms from image_prompt)
      try {
        const imgResult = await searchImages(visualTerms, 5);
        if (imgResult.photos?.length) {
          const photo = imgResult.photos[Math.floor(Math.random() * Math.min(3, imgResult.photos.length))];
          await downloadImage(photo.src.large, imagePath);
          return { success: true, index: i, type: 'image' };
        }
      } catch (e) { /* try AI fallback */ }
      
      // Fallback 2: AI generate image from the image_prompt (matches the actual scene!)
      try {
        await generateImage(seg.image_prompt, imagePath, 4);
        return { success: true, index: i, type: 'image', isCharacter: false };
      } catch (e) {
        return { success: false, index: i, error: e.message, type: 'image' };
      }
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