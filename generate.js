#!/usr/bin/env node

/**
 * MysteryForge Story Generator v3
 * 
 * Fully prompt-driven story generation.
 * No more hardcoded genres — just tell it what story you want.
 * 
 * Usage:
 *   node generate.js "a story about a detective hunting a cannibal in 1920s Chicago"
 *   node generate.js --prompt "..." [--length 2] [--voice af_sky]
 *   node generate.js --interactive
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { generateText: generateTextWithFallback } = require('./src/providers/index.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    prompt: null,
    length: 2,
    voice: 'af_sky',
    interactive: false,
    listVoices: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prompt' || arg === '-p') {
      opts.prompt = args[++i];
    } else if (arg === '--length' || arg === '-l') {
      opts.length = parseInt(args[++i]) || 2;
    } else if (arg === '--voice' || arg === '-v') {
      opts.voice = args[++i] || 'af_sky';
    } else if (arg === '--interactive' || arg === '-i') {
      opts.interactive = true;
    } else if (arg === '--list-voices') {
      opts.listVoices = true;
    } else if (!arg.startsWith('-')) {
      // Positional argument — treat as the story prompt
      opts.prompt = arg;
    }
  }

  return opts;
}

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

const KOKORO_VOICES = [
  // Female voices
  'af_sky', 'af_heart', 'af_nicole', 'af_sarah', 'af_valor',
  // Male voices
  'am_michael', 'am_peter', 'am_alex', 'am_david', 'bf_emma', 'bf_isabella',
  // Other
  'bf_leo', 'bm_george', 'bm_lewis', 'pf_sarah', 'pm_michael', 'pm_david'
];

async function main() {
  const opts = parseArgs();

  if (opts.listVoices) {
    console.log('\n🎤 Available Kokoro voices:');
    console.log('\nFemale:');
    KOKORO_VOICES.filter(v => v.startsWith('af') || v.startsWith('bf') || v.startsWith('pf')).forEach(v => console.log(`   ${v}`));
    console.log('\nMale:');
    KOKORO_VOICES.filter(v => v.startsWith('am') || v.startsWith('bm') || v.startsWith('pm')).forEach(v => console.log(`   ${v}`));
    console.log('\nDefault: af_sky\n');
    process.exit(0);
  }

  if (opts.interactive) {
    console.log('\n🎭 MysteryForge Interactive Story Generator');
    console.log('Tell me what story you want. Be as detailed or vague as you like.\n');
    
    const storyIdea = await askQuestion('📖 What kind of story do you want? (e.g. "a revenge story about a woman who catches her husband cheating")\n> ');
    
    if (!storyIdea.trim()) {
      console.log('❌ No story provided. Exiting.');
      process.exit(1);
    }
    
    opts.prompt = storyIdea.trim();
    
    const lengthAnswer = await askQuestion('\n⏱️  How long? (1 = ~2min, 2 = ~4min, 3 = ~6min) [default: 2]\n> ');
    if (lengthAnswer.trim()) {
      opts.length = parseInt(lengthAnswer.trim()) || 2;
    }
    
    const voiceAnswer = await askQuestion('\n🎤 Voice (or press enter for af_sky):\n> ');
    if (voiceAnswer.trim()) {
      opts.voice = voiceAnswer.trim();
    }
  }

  if (!opts.prompt) {
    console.error('\n❌ Usage: node generate.js "your story prompt" [--length 2] [--voice af_sky]');
    console.error('   Or:   node generate.js --interactive');
    console.error('   Or:   node generate.js --list-voices');
    console.error('\nExamples:');
    console.error('   node generate.js "a mystery about a deleted website that only existed for 47 minutes"');
    console.error('   node generate.js "ragebait story about workplace revenge"');
    console.error('   node generate.js "horror story about something in the woods"');
    console.error('   node generate.js "a confession about living a double life"');
    console.error('   node generate.js --prompt "whatever story you want" --length 3\n');
    process.exit(1);
  }

  const wordCount = Math.floor(opts.length * 150 * 1.1);
  const targetSegments = Math.ceil((opts.length * 60) / 8);

  console.log(`\n📝 Generating story...`);
  console.log(`   Prompt: "${opts.prompt}"`);
  console.log(`   Length: ${opts.length}min (~${targetSegments} segments)`);
  console.log(`   Voice: ${opts.voice}`);

  // System prompt — handles ANY story type, infers genre from prompt
  const systemPrompt = `You are a viral YouTube storyteller. You write stories that HOOK viewers and keep them watching.
You write ANY genre based on what the user requests: mystery, horror, thriller, romance, sci-fi, fantasy, comedy, drama, crime, revenge, confession, etc.
Output ONLY valid JSON. No markdown. No explanation.

Required schema:
{
  "title": "short_snake_case_title",
  "genre": "inferred genre from prompt",
  "characterAnchor": "visual description of main character for consistent rendering",
  "segments": [{"id":1,"text":"20-30 word narration","imagePrompt":"scene description","isCharacterShot":false}]
}

SEGMENT LENGTH EXAMPLE:
WRONG: "I felt betrayed." (3 words - TOO SHORT)
RIGHT: "I stared at the torn letter in the trash, my hands shaking with rage. Six months of overtime, and he gave MY promotion to his nephew." (23 words - CORRECT)

Each segment MUST have 20-30 words. This is critical.

STORYTELLING RULES:

1. HOOK (first segment):
   - Start with tension/conflict immediately
   - Make viewers NEED to know what happens
   - Drop them into the action, not setup

2. BUILD TENSION:
   - Each segment should raise stakes
   - Use specific details (names, dates, amounts, locations)
   - Create "oh no" moments
   - Plant details early that pay off later

3. TWIST (around 60-70% through):
   - Something unexpected must happen
   - Viewer should think "I didn't see that coming"

4. PACING:
   - Short sentences for tension
   - End segments on mini-cliffhangers when possible

5. PAYOFF (final segments):
   - Satisfying resolution
   - Justice served (or ironic punishment)
   - NO "to be continued" cop-outs

6. CHARACTER SHOTS:
   - isCharacterShot: true when the main character appears (~20% of segments)
   - characterAnchor: detailed visual description for AI image generation

7. QUALITY CONTROL:
   - NO repetitive phrases
   - NO lazy discoveries
   - Every segment must ADVANCE THE PLOT
   - Each segment 20-30 words, full paragraph narration
   - Total: ~${wordCount} words across ~${targetSegments} segments

TONE: Dark, mature, raw. Real emotions, real consequences, real human darkness. Write for adults.`;

  // User prompt — the free-form story request
  const userPrompt = `Write a story based on this request: "${opts.prompt}"

DETECT THE GENRE from the prompt (mystery, horror, thriller, revenge, confession, crime, etc.) and write accordingly.

~${wordCount} words total in ~${targetSegments} segments.
Each segment 20-30 words. Full paragraphs, not one-liners.

Output ONLY the JSON. No markdown fences.`;

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
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    }
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];
    
    storyData = JSON.parse(cleaned);
  } catch (e) {
    console.error('❌ Failed to parse story JSON:', e.message);
    console.error('Response preview:', response?.substring(0, 500));
    process.exit(1);
  }

  // Validate structure
  if (!storyData.segments || !Array.isArray(storyData.segments)) {
    console.error('❌ Invalid story structure: missing segments array');
    process.exit(1);
  }

  // Ensure character anchor exists
  if (!storyData.characterAnchor) {
    storyData.characterAnchor = 'mysterious figure, cinematic lighting, dramatic pose';
    console.log('   ⚠️  No characterAnchor in response, using default');
  }

  // Ensure title exists and add timestamp
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
  
  if (!storyData.title) {
    storyData.title = `story_${timestamp}`;
  } else {
    storyData.title = `${storyData.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${timestamp}`;
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
  storyData.originalPrompt = opts.prompt;
  storyData.topic = 'custom';
  storyData.length_minutes = opts.length;
  storyData.total_words = totalWords;
  storyData.segment_count = storyData.segments.length;
  storyData.character_shot_count = characterShots;
  storyData.generated = new Date().toISOString();
  storyData.provider = providerUsed;
  storyData.voice = opts.voice;

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
  console.log(`   🎭 Genre: ${storyData.genre || 'custom'}`);
  console.log(`   📝 ${totalWords} words, ${storyData.segments.length} segments`);
  console.log(`   👤 Character shots: ${characterShots} (${Math.round(characterShots/storyData.segments.length*100)}%)`);
  console.log(`   🎤 Voice: ${opts.voice}`);
  console.log(`   🔊 Provider: ${providerUsed}\n`);

  // Preview first segment
  if (storyData.segments[0]) {
    console.log(`   Segment 1: "${storyData.segments[0].text?.substring(0, 60)}..."`);
    console.log(`   Image: "${storyData.segments[0].imagePrompt?.substring(0, 50)}..."\n`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
