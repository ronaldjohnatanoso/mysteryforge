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
const { generateText, generateImage, generateSpeech, wordsToSRT } = require('./src/worker-client');

const SECONDS_PER_SEGMENT = 8;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    genre: args.includes('--genre') ? args[args.indexOf('--genre') + 1] : 'revenge',
    length: args.includes('--length') ? parseInt(args[args.indexOf('--length') + 1]) : 2,
    topic: args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null,
    voice: args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'orion'
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
  const segments = segmentTexts.map(text => ({ text, image_prompt: generateImagePrompt(text, opts.genre) }));
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
  
  // ===== STEP 2: Images + TTS in parallel =====
  console.log('🎨 Generating images + audio in parallel...');
  
  const imageTasks = segments.map((seg, i) => {
    const outputPath = path.join(folder, 'images', `img_${String(i).padStart(3, '0')}.jpg`);
    return generateImage(seg.image_prompt, outputPath, 4)
      .then(() => ({ success: true, index: i }))
      .catch(e => ({ success: false, index: i, error: e.message }));
  });
  
  const ttsTask = generateSpeech(cleaned, path.join(folder, 'narration.mp3'), opts.voice)
    .then(r => ({ success: true, size: r.size }))
    .catch(e => ({ success: false, error: e.message }));
  
  // Run all in parallel
  const parallelStart = Date.now();
  const [imageResults, ttsResult] = await Promise.all([
    Promise.all(imageTasks),
    ttsTask
  ]);
  const parallelTime = ((Date.now() - parallelStart) / 1000).toFixed(1);
  
  const imagesOk = imageResults.filter(r => r.success).length;
  const imagesFail = imageResults.filter(r => !r.success).length;
  
  console.log(`   ✅ Images: ${imagesOk}/${segments.length} in ${parallelTime}s`);
  if (imagesFail) console.log(`   ❌ Failed: ${imagesFail}`);
  
  if (ttsResult.success) {
    console.log(`   ✅ Audio: ${(ttsResult.size / 1024).toFixed(0)}KB`);
  } else {
    console.log(`   ❌ Audio: ${ttsResult.error}`);
  }
  
  // ===== Summary =====
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Total time: ${totalTime}s`);
  console.log(`📁 Output: ${folder}/`);
  
  if (ttsResult.success && imagesOk > 0) {
    console.log(`\n🎬 Ready for video assembly:`);
    console.log(`   node assemble-video.js --latest`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });