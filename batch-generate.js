#!/usr/bin/env node

/**
 * MysteryForge Batch Generator
 * 
 * Generate multiple stories at once with quality scoring.
 * 
 * Usage:
 *   node batch-generate.js --count 5                    # 5 random stories
 *   node batch-generate.js --all-genres                 # 1 story per genre
 *   node batch-generate.js --genre revenge --count 3    # 3 revenge stories
 *   node batch-generate.js --length 3 --count 5         # 5 stories, 3min each
 */

const fs = require('fs');
const path = require('path');
const { generateText: generateTextWithFallback } = require('./src/providers/index.js');

const GENRES = {
  mystery: {
    name: 'Mystery',
    topics: [
      { type: 'internet-mystery', prompt: 'A deleted website with disturbing content', hook: 'There was a website that only existed for 47 minutes...' },
      { type: 'found-footage', prompt: 'A camcorder found in an abandoned location', hook: 'The tape was labeled "DO NOT WATCH" in red marker...' },
      { type: 'disappearance', prompt: 'Someone who vanished and left strange clues', hook: 'She left her phone, wallet, and keys on the kitchen table...' },
      { type: 'stalker', prompt: 'Someone watching from the shadows', hook: 'The photos were taken from inside my house...' }
    ],
    characterDefault: 'shadowy mysterious figure in dark cloak, face hidden, tall thin silhouette, ominous presence, gothic style'
  },
  revenge: {
    name: 'Revenge Story',
    topics: [
      { type: 'workplace-revenge', prompt: 'Employee gets back at terrible boss', hook: "My boss didn't know I'd seen the promotion letter with MY name on it..." },
      { type: 'neighbor-revenge', prompt: 'Dealing with nightmare neighbor', hook: 'My neighbor parked in my spot for the 47th time. This time, I was ready...' },
      { type: 'ex-revenge', prompt: 'Ex partner gets karma', hook: 'My ex thought keeping my dog was acceptable...' },
      { type: 'family-revenge', prompt: 'Family member who wronged you', hook: 'My sister stole my inheritance. She didn\'t know I had a plan...' }
    ],
    characterDefault: 'confident protagonist in business attire, determined expression, sharp features, professional look'
  },
  horror: {
    name: 'Horror',
    topics: [
      { type: 'monster', prompt: 'Something in the dark', hook: 'I heard it scratching at my door at 3am...' },
      { type: 'haunting', prompt: 'Ghostly encounters', hook: 'The previous owners died in this house. They never left...' },
      { type: 'creature', prompt: 'Encounter with unknown entity', hook: 'We found something in the woods. It found us first...' },
      { type: 'possession', prompt: 'Something took control', hook: "My daughter hasn't been the same since the accident..." }
    ],
    characterDefault: 'terrified victim, wide eyes, disheveled appearance, fear expression, horror movie style'
  },
  confession: {
    name: 'Confession',
    topics: [
      { type: 'secret-life', prompt: 'Living a double life', hook: 'Nobody knows who I really am. Not even my wife...' },
      { type: 'dark-secret', prompt: 'Something I can never tell anyone', hook: "I've kept this secret for 15 years. I need to tell someone..." },
      { type: 'crime', prompt: 'Anonymous crime confession', hook: 'They never found the body. They never will...' },
      { type: 'betrayal', prompt: 'Betraying someone close', hook: 'My best friend trusted me. I ruined his life...' }
    ],
    characterDefault: 'anonymous narrator, silhouette against light, mysterious posture, noir style'
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    count: args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : 5,
    genre: args.includes('--genre') ? args[args.indexOf('--genre') + 1] : null,
    length: args.includes('--length') ? parseInt(args[args.indexOf('--length') + 1]) : 2,
    allGenres: args.includes('--all-genres'),
    delay: args.includes('--delay') ? parseInt(args[args.indexOf('--delay') + 1]) : 2000
  };
}

/**
 * Quality scoring for a generated story
 * Returns a score 0-100 and breakdown
 */
function scoreStory(storyData, expectedHook) {
  const scores = {
    structure: 0,
    segmentLength: 0,
    characterShots: 0,
    hookMatch: 0,
    completeness: 0
  };
  
  // Structure score (20 points)
  if (storyData.title) scores.structure += 5;
  if (storyData.characterAnchor) scores.structure += 5;
  if (storyData.segments?.length > 0) scores.structure += 10;
  
  // Segment length score (30 points)
  // Target: 20-30 words per segment
  const segments = storyData.segments || [];
  const goodLengths = segments.filter(s => {
    const words = s.text?.split(/\s+/).length || 0;
    return words >= 15 && words <= 40;
  }).length;
  scores.segmentLength = Math.round((goodLengths / Math.max(segments.length, 1)) * 30);
  
  // Character shots score (20 points)
  // Target: 15-25% of segments
  const charRatio = segments.filter(s => s.isCharacterShot).length / Math.max(segments.length, 1);
  if (charRatio >= 0.1 && charRatio <= 0.3) {
    scores.characterShots = 20;
  } else if (charRatio > 0 && charRatio < 0.4) {
    scores.characterShots = 10;
  }
  
  // Hook match score (15 points)
  const firstSegment = segments[0]?.text || '';
  if (firstSegment.includes(expectedHook?.substring(0, 30) || '')) {
    scores.hookMatch = 15;
  } else if (firstSegment.length > 20) {
    scores.hookMatch = 5; // At least has content
  }
  
  // Completeness score (15 points)
  const totalWords = segments.reduce((sum, s) => sum + (s.text?.split(/\s+/).length || 0), 0);
  if (totalWords >= 200) scores.completeness += 5;
  if (totalWords >= 400) scores.completeness += 5;
  if (segments.length >= 10) scores.completeness += 5;
  
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  
  return {
    total: Math.min(total, 100),
    breakdown: scores,
    grade: total >= 80 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D'
  };
}

function buildPrompts(genre, topic, length) {
  const genreConfig = GENRES[genre] || GENRES.mystery;
  const wordCount = Math.floor(length * 150 * 1.1);
  const targetSegments = Math.ceil((length * 60) / 8);

  const systemPrompt = `You are a viral YouTube storyteller. You write stories that HOOK viewers and keep them watching.
Output ONLY valid JSON. No markdown. No explanation.

Required schema:
{
  "title": "short_snake_case_title",
  "characterAnchor": "visual description of main character",
  "segments": [{"id":1,"text":"20-30 word narration","imagePrompt":"scene description","isCharacterShot":false}]
}

Each segment MUST have 20-30 words. This is critical.

STORYTELLING RULES:
1. HOOK (first segment): Start with tension/conflict, not setup
2. BUILD TENSION: Each segment raises stakes, use specific details
3. TWIST (60-70% through): Something unexpected must happen
4. PAYOFF: Satisfying resolution

TECHNICAL:
- characterAnchor: detailed visual description
- isCharacterShot: true when character appears (~20% of segments)
- Each segment MUST be 20-30 words
- Total: ~${wordCount} words across ~${targetSegments} segments
- Start first segment with: "${topic.hook}"

${genre === 'revenge' ? '- Last segment MUST end with: "Revenge is a dish best served cold."' : ''}

TONE: Dark, mature, raw. Real emotions, real consequences.`;

  const userPrompt = `Write a ${genre} story about: ${topic.prompt}

First segment starts with: "${topic.hook}"
~${wordCount} words total in ~${targetSegments} segments.

Output the JSON now.`;

  return { systemPrompt, userPrompt, targetSegments, wordCount };
}

async function generateSingleStory(genre, length, index, total) {
  const genreConfig = GENRES[genre] || GENRES.mystery;
  const topic = genreConfig.topics[Math.floor(Math.random() * genreConfig.topics.length)];
  const { systemPrompt, userPrompt, targetSegments } = buildPrompts(genre, topic, length);
  
  console.log(`\n[${index + 1}/${total}] 📝 Generating ${genre} story (${length}min)...`);
  console.log(`   Topic: ${topic.type}`);
  console.log(`   Target: ${targetSegments} segments`);
  
  const startTime = Date.now();
  
  let result;
  try {
    result = await generateTextWithFallback(userPrompt, systemPrompt, 4096);
  } catch (e) {
    console.log(`   ❌ Generation failed: ${e.message}`);
    return { success: false, error: e.message, genre, topic: topic.type };
  }
  
  // Parse JSON
  let storyData;
  try {
    let cleaned = result.text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];
    storyData = JSON.parse(cleaned);
  } catch (e) {
    console.log(`   ❌ JSON parse failed: ${e.message}`);
    return { success: false, error: 'JSON parse failed', genre, topic: topic.type };
  }
  
  // Validate and enhance
  if (!storyData.segments?.length) {
    console.log(`   ❌ No segments generated`);
    return { success: false, error: 'No segments', genre, topic: topic.type };
  }
  
  // Add metadata
  if (!storyData.characterAnchor) {
    storyData.characterAnchor = genreConfig.characterDefault;
  }
  
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
  storyData.title = `${storyData.title || 'story'}_${timestamp}`;
  
  storyData.segments.forEach((seg, i) => {
    if (!seg.id) seg.id = i + 1;
    if (seg.isCharacterShot === undefined) seg.isCharacterShot = false;
  });
  
  const totalWords = storyData.segments.reduce((sum, s) => sum + (s.text?.split(/\s+/).length || 0), 0);
  const characterShots = storyData.segments.filter(s => s.isCharacterShot).length;
  
  storyData.genre = genre;
  storyData.topic = topic.type;
  storyData.length_minutes = length;
  storyData.total_words = totalWords;
  storyData.segment_count = storyData.segments.length;
  storyData.character_shot_count = characterShots;
  storyData.generated = new Date().toISOString();
  storyData.provider = result.provider;
  
  // Quality score
  const score = scoreStory(storyData, topic.hook);
  storyData.qualityScore = score;
  
  // Save files
  const folder = path.join(__dirname, 'output', storyData.title);
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(folder, 'images'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'character-shots'), { recursive: true });
  
  fs.writeFileSync(path.join(folder, 'story.json'), JSON.stringify(storyData, null, 2));
  fs.writeFileSync(path.join(folder, 'narration.txt'), storyData.segments.map(s => s.text).join(' '));
  fs.writeFileSync(path.join(folder, 'segments.json'), JSON.stringify(storyData.segments, null, 2));
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`   ✅ Generated in ${elapsed}s`);
  console.log(`   📊 Score: ${score.total}/100 (${score.grade}) - ${storyData.segments.length} segments, ${totalWords} words`);
  console.log(`   📁 ${storyData.title}`);
  
  return {
    success: true,
    title: storyData.title,
    genre,
    topic: topic.type,
    segments: storyData.segments.length,
    words: totalWords,
    score: score.total,
    grade: score.grade,
    provider: result.provider,
    elapsed
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();
  
  console.log('\n🚀 MysteryForge Batch Generator');
  console.log('='.repeat(40));
  
  // Determine what to generate
  let jobs = [];
  
  if (opts.allGenres) {
    // One story per genre
    Object.keys(GENRES).forEach(genre => {
      jobs.push({ genre, length: opts.length });
    });
    console.log(`\n📋 Mode: All genres (${jobs.length} stories)`);
  } else if (opts.genre) {
    // Specific genre, multiple stories
    for (let i = 0; i < opts.count; i++) {
      jobs.push({ genre: opts.genre, length: opts.length });
    }
    console.log(`\n📋 Mode: ${opts.count}x ${opts.genre} stories`);
  } else {
    // Random mix
    const genres = Object.keys(GENRES);
    for (let i = 0; i < opts.count; i++) {
      jobs.push({ 
        genre: genres[Math.floor(Math.random() * genres.length)], 
        length: opts.length 
      });
    }
    console.log(`\n📋 Mode: ${opts.count} random stories`);
  }
  
  console.log(`   Length: ${opts.length}min each`);
  console.log(`   Delay between requests: ${opts.delay}ms\n`);
  
  // Run jobs
  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    const result = await generateSingleStory(jobs[i].genre, jobs[i].length, i, jobs.length);
    results.push(result);
    
    // Delay between requests to avoid rate limits
    if (i < jobs.length - 1 && opts.delay > 0) {
      await sleep(opts.delay);
    }
  }
  
  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const avgScore = successful.length > 0 
    ? Math.round(successful.reduce((sum, r) => sum + r.score, 0) / successful.length)
    : 0;
  const totalWords = successful.reduce((sum, r) => sum + r.words, 0);
  
  console.log('\n' + '='.repeat(40));
  console.log('📊 BATCH SUMMARY');
  console.log('='.repeat(40));
  console.log(`   Total stories: ${results.length}`);
  console.log(`   ✅ Successful: ${successful.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);
  console.log(`   📈 Avg quality score: ${avgScore}/100`);
  console.log(`   📝 Total words: ${totalWords.toLocaleString()}`);
  console.log(`   ⏱️  Total time: ${elapsed}s`);
  
  if (successful.length > 0) {
    console.log('\n   Generated stories:');
    successful.forEach(r => {
      console.log(`   - ${r.title} (${r.genre}, ${r.grade} grade, ${r.score}/100)`);
    });
  }
  
  // Save batch report
  const reportPath = path.join(__dirname, 'output', `batch_report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    generated: new Date().toISOString(),
    config: opts,
    results,
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      avgScore,
      totalWords,
      elapsedSeconds: parseFloat(elapsed)
    }
  }, null, 2));
  console.log(`\n   📄 Batch report: ${path.basename(reportPath)}\n`);
  
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });