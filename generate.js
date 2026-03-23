#!/usr/bin/env node

/**
 * MysteryForge Story Generator v2
 * 
 * Generates structured stories with:
 * - characterAnchor: detailed character description for consistency
 * - segments with imagePrompt and isCharacterShot flags
 * 
 * Output: story.json with full structured data
 */

const fs = require('fs');
const path = require('path');
const { generateText: generateTextWithFallback } = require('./src/providers/index.js');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    genre: args.includes('--genre') ? args[args.indexOf('--genre') + 1] : 'mystery',
    length: args.includes('--length') ? parseInt(args[args.indexOf('--length') + 1]) : 2,
    topic: args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null,
    listGenres: args.includes('--list-genres')
  };
}

const GENRES = {
  mystery: {
    name: 'Mystery',
    topics: [
      { type: 'internet-mystery', prompt: 'A deleted website with disturbing content', hook: 'There was a website that only existed for 47 minutes...' },
      { type: 'found-footage', prompt: 'A camcorder found in an abandoned location', hook: 'The tape was labeled "DO NOT WATCH"...' },
      { type: 'disappearance', prompt: 'Someone who vanished and left strange clues', hook: 'She left her phone, wallet, and keys on the kitchen table...' }
    ],
    characterDefault: 'shadowy mysterious figure in dark cloak, face hidden, tall thin silhouette, ominous presence, gothic style'
  },
  revenge: {
    name: 'Revenge Story',
    topics: [
      { type: 'workplace-revenge', prompt: 'Employee gets back at terrible boss or coworker', hook: 'My boss thought he could steal my promotion...' },
      { type: 'neighbor-revenge', prompt: 'Dealing with nightmare neighbor', hook: 'My neighbor parked in my spot every single day...' },
      { type: 'ex-revenge', prompt: 'Ex partner gets karma', hook: 'My ex thought keeping my dog was acceptable...' }
    ],
    characterDefault: 'confident protagonist in business attire, determined expression, sharp features, professional look'
  },
  horror: {
    name: 'Horror',
    topics: [
      { type: 'monster', prompt: 'Something in the dark', hook: 'I heard it scratching at my door at 3am...' },
      { type: 'haunting', prompt: 'Ghostly encounters', hook: 'The previous owners died in this house...' },
      { type: 'creature', prompt: 'Encounter with unknown entity', hook: 'We found something in the woods...' }
    ],
    characterDefault: 'terrified victim, wide eyes, disheveled appearance, fear expression, horror movie style'
  },
  confession: {
    name: 'Confession',
    topics: [
      { type: 'secret-life', prompt: 'Living a double life', hook: 'Nobody knows who I really am...' },
      { type: 'dark-secret', prompt: 'Something I can never tell anyone', hook: "I've kept this secret for 15 years..." },
      { type: 'confession', prompt: 'Anonymous admission', hook: 'I need to tell someone what I did...' }
    ],
    characterDefault: 'anonymous narrator, silhouette against light, mysterious posture, noir style'
  }
};

async function main() {
  const opts = parseArgs();
  
  if (opts.listGenres) {
    console.log('\n📚 Available genres:');
    Object.entries(GENRES).forEach(([key, g]) => {
      console.log(`   ${key} - ${g.name}`);
      console.log(`     Topics: ${g.topics.map(t => t.type).join(', ')}`);
    });
    console.log('');
    process.exit(0);
  }

  const genreConfig = GENRES[opts.genre] || GENRES.mystery;
  const topic = opts.topic 
    ? genreConfig.topics.find(t => t.type === opts.topic) || genreConfig.topics[0]
    : genreConfig.topics[Math.floor(Math.random() * genreConfig.topics.length)];

  const wordCount = Math.floor(opts.length * 150 * 1.1);
  const targetSegments = Math.ceil((opts.length * 60) / 8); // ~8s per segment

  console.log(`\n📝 Generating ${opts.genre} story (${opts.length}min, ~${targetSegments} segments)...`);

  // System prompt for structured JSON output
  const systemPrompt = `You are a mystery story writer. Output ONLY valid JSON.
No markdown. No explanation. No text before or after the JSON.

Required schema:
{
  "title": "short_snake_case_title",
  "characterAnchor": "visual description of main character (clothing, body, face, style)",
  "segments": [{"id":1,"text":"20-30 word narration","imagePrompt":"scene description","isCharacterShot":false}]
}

Rules:
- characterAnchor: detailed visual description for consistent character rendering
- isCharacterShot: true when character appears (aim for 20% of segments)
- Each segment text: 20-30 words
- Total: ~${wordCount} words across ~${targetSegments} segments
- Start first segment with: "${topic.hook}"
${opts.genre === 'revenge' ? '- End last segment narration with: "Revenge is a dish best served cold."' : ''}`;

  const userPrompt = `Write a ${opts.genre} story about: ${topic.prompt}

First segment starts with: "${topic.hook}"
~${wordCount} words total in ~${targetSegments} segments.
${opts.genre === 'revenge' ? 'Last segment ends with: "Revenge is a dish best served cold."' : ''}

Output the JSON now.`;

  // Generate story
  let result;
  try {
    result = await generateTextWithFallback(userPrompt, systemPrompt, 4096);
  } catch (e) {
    console.error('❌ Story generation failed:', e.message);
    process.exit(1);
  }
  
  const response = result.text;
  const providerUsed = result.provider;

  // Parse JSON from response
  let storyData;
  try {
    let cleaned = response.trim();
    // Remove markdown fences if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    }
    // Find JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];
    
    storyData = JSON.parse(cleaned);
  } catch (e) {
    console.error('❌ Failed to parse story JSON:', e.message);
    console.error('Response preview:', response?.substring(0, 300));
    process.exit(1);
  }

  // Validate structure
  if (!storyData.segments || !Array.isArray(storyData.segments)) {
    console.error('❌ Invalid story structure: missing segments array');
    process.exit(1);
  }

  // Ensure character anchor exists
  if (!storyData.characterAnchor) {
    storyData.characterAnchor = genreConfig.characterDefault;
    console.log('   ⚠️  No characterAnchor, using default');
  }

  // Ensure title exists and add timestamp
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
  // Format: 2026-03-23_16-09
  if (!storyData.title) {
    storyData.title = `story_${timestamp}`;
  } else {
    storyData.title = `${storyData.title}_${timestamp}`;
  }

  // Add IDs if missing
  storyData.segments.forEach((seg, i) => {
    if (!seg.id) seg.id = i + 1;
    if (seg.isCharacterShot === undefined) seg.isCharacterShot = false;
  });

  // Calculate stats
  const totalWords = storyData.segments.reduce((sum, s) => sum + (s.text?.split(/\s+/).length || 0), 0);
  const characterShots = storyData.segments.filter(s => s.isCharacterShot).length;

  // Create output folder
  const folder = path.join(__dirname, 'output', storyData.title);
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(folder, 'images'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'character-shots'), { recursive: true });

  // Add metadata
  storyData.genre = opts.genre;
  storyData.topic = topic.type;
  storyData.length_minutes = opts.length;
  storyData.total_words = totalWords;
  storyData.segment_count = storyData.segments.length;
  storyData.character_shot_count = characterShots;
  storyData.generated = new Date().toISOString();
  storyData.provider = providerUsed;

  // Save files
  fs.writeFileSync(path.join(folder, 'story.json'), JSON.stringify(storyData, null, 2));
  
  // Save narration text
  const narration = storyData.segments.map(s => s.text).join(' ');
  fs.writeFileSync(path.join(folder, 'narration.txt'), narration);

  // Save segments.json for compatibility
  fs.writeFileSync(path.join(folder, 'segments.json'), JSON.stringify(storyData.segments, null, 2));

  // Output summary
  console.log(`\n✅ Story generated: ${storyData.title}`);
  console.log(`   📁 ${folder}/`);
  console.log(`   📝 ${totalWords} words, ${storyData.segments.length} segments`);
  console.log(`   👤 Character shots: ${characterShots} (${Math.round(characterShots/storyData.segments.length*100)}%)`);
  console.log(`   🎭 Character anchor: "${storyData.characterAnchor.substring(0, 60)}..."\n`);

  // Preview first segment
  console.log(`   Segment 1: "${storyData.segments[0].text.substring(0, 50)}..."`);
  console.log(`   Image prompt: "${storyData.segments[0].imagePrompt?.substring(0, 50)}..."`);
  console.log(`   Character shot: ${storyData.segments[0].isCharacterShot}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });