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
      { type: 'found-footage', prompt: 'A camcorder found in an abandoned location', hook: 'The tape was labeled "DO NOT WATCH" in red marker...' },
      { type: 'disappearance', prompt: 'Someone who vanished and left strange clues', hook: 'She left her phone, wallet, and keys on the kitchen table...' },
      { type: 'stalker', prompt: 'Someone watching from the shadows', hook: 'The photos were taken from inside my house...' }
    ],
    characterDefault: 'shadowy mysterious figure in dark cloak, face hidden, tall thin silhouette, ominous presence, gothic style'
  },
  revenge: {
    name: 'Revenge Story',
    topics: [
      { type: 'workplace-revenge', prompt: 'Employee gets back at terrible boss', hook: 'My boss didn\'t know I\'d seen the promotion letter with MY name on it...' },
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
      { type: 'possession', prompt: 'Something took control', hook: 'My daughter hasn\'t been the same since the accident...' }
    ],
    characterDefault: 'terrified victim, wide eyes, disheveled appearance, fear expression, horror movie style'
  },
  confession: {
    name: 'Confession',
    topics: [
      { type: 'secret-life', prompt: 'Living a double life', hook: 'Nobody knows who I really am. Not even my wife...' },
      { type: 'dark-secret', prompt: 'Something I can never tell anyone', hook: 'I\'ve kept this secret for 15 years. I need to tell someone...' },
      { type: 'crime', prompt: 'Anonymous crime confession', hook: 'They never found the body. They never will...' },
      { type: 'betrayal', prompt: 'Betraying someone close', hook: 'My best friend trusted me. I ruined his life...' }
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
  const systemPrompt = `You are a viral YouTube storyteller. You write stories that HOOK viewers and keep them watching.
Output ONLY valid JSON. No markdown. No explanation.

Required schema:
{
  "title": "short_snake_case_title",
  "characterAnchor": "visual description of main character",
  "segments": [{"id":1,"text":"20-30 word narration","imagePrompt":"scene description","isCharacterShot":false}]
}

SEGMENT LENGTH EXAMPLE:
WRONG: "I felt betrayed." (3 words - TOO SHORT)
RIGHT: "I stared at the torn letter in the trash, my hands shaking with rage. Six months of overtime, and he gave MY promotion to his nephew." (23 words - CORRECT)

Each segment MUST have 20-30 words. This is critical.

STORYTELLING RULES:

1. HOOK (first segment):
   - Start with tension/conflict, not setup
   - Make viewers NEED to know what happens
   - Example: "I found my boss's secret journal..." NOT "I worked at a company..."

2. BUILD TENSION:
   - Each segment should raise stakes
   - Use specific details (names, dates, amounts, locations)
   - Create "oh no" moments that make viewers worry
   - Plant details early that pay off later
   - Multiple threads/suspects/theories weaving together

3. TWIST (around 60-70% through):
   - Something unexpected must happen
   - A revelation, betrayal, or reversal
   - Viewer should think "I didn't see that coming"
   - Then hit them with ANOTHER twist near the end

4. PACING:
   - Short sentences for tension
   - Questions without answers
   - End segments on mini-cliffhangers when possible
   - Every 3-4 segments should have a "wait, WHAT?" moment

5. PAYOFF (final segments):
   - Satisfying resolution
   - Justice served (or ironic punishment)
   ${opts.genre === 'revenge' ? '- Last segment MUST end with: "Revenge is a dish best served cold."' : ''}
   - NO "to be continued" or "the nightmare continues" cop-outs

6. TECHNICAL:
   - characterAnchor: detailed visual description
   - isCharacterShot: true when character appears (~20% of segments)
   - Each segment MUST be 20-30 words (NOT 5-10 words)
   - DO NOT make one-sentence segments
   - Each segment should be a full paragraph of narration
   - Total: ~${wordCount} words across ~${targetSegments} segments
   - Start first segment with: "${topic.hook}"

7. QUALITY CONTROL:
   - NO repetitive phrases ("I felt", "I knew I had to", "I realized")
   - NO lazy discoveries (stumbling onto evidence by accident)
   - NO deus ex machina resolutions
   - Every segment must ADVANCE THE PLOT
   - If you're stuck, don't write filler — stop and reconsider the plot

BAD: "I felt scared. I didn't know what to do. I decided to investigate."
GOOD: "The timestamp on the photo read 3:47 AM — two hours after I'd deadbolted the front door. Someone had been inside while I slept."

BAD: "I went to work and my boss was mean to me. I decided to get revenge."
GOOD: "My boss didn't know I'd seen him steal that promotion letter addressed to ME. The one with MY name on it."

Write stories that make people say "and then what happened?!"

TONE: Dark, mature, raw. No moralizing. No "and they lived happily ever after." Real emotions, real consequences, real human darkness. Write for adults, not children. Use visceral details, uncomfortable truths, and psychological depth. When someone is betrayed, show the gut-punch — the sleepless nights, the rage, the paranoia. Make it feel REAL.`;

  const userPrompt = `Write a ${opts.genre} story about: ${topic.prompt}

STORY ARC REQUIRED:
- Hook (start with conflict)
- Rising action (things get worse)
- Twist (unexpected turn)
- Resolution (satisfying payoff)

First segment starts with: "${topic.hook}"
~${wordCount} words total in ~${targetSegments} segments.

${opts.genre === 'revenge' ? `
REVENGE STORY TEMPLATE:
- Segments 1-3: The wrong (what did they do to you?)
- Segments 4-6: The planning (how will you get back?)
- Segments 7-9: The twist (something unexpected happens)
- Segments 10-12: The execution (revenge happens)
- Final segment: End with "Revenge is a dish best served cold."
` : ''}

MYSTERY STORY TEMPLATE:
- Segments 1-4: The discovery (something deeply wrong, escalate tension)
- Segments 5-8: Investigation (clues, false leads, paranoia builds)
- Segments 9-12: Red herring peak (you think you know, but you're wrong)
- Segments 13-16: The twist (completely unexpected revelation)
- Segments 17-20: The unraveling (everything connects)
- Segments 21-24: The dark truth (what really happened, it's worse than you thought)
- Final segment: Haunting ending — leave viewer unsettled, one detail that changes everything

COMPLEXITY REQUIREMENTS:
- Multiple suspects/theories (at least 3)
- Red herrings that feel REAL, not cheap
- A second twist in the final act
- One detail planted early that pays off late
- No "it was all a dream" or "it was the butler"
- The answer should be surprising but inevitable in hindsight
- End on a question or reveal that makes viewers want to rewatch

HARD RULES:
- NO supernatural/scifi elements (no clones, ghosts, aliens, time travel)
- NO "to be continued" or "the horror was just beginning" endings
- Every discovery must come from ACTION (investigation, confrontation, searching)
- Plant at least 3 specific clues early that pay off later
- The final reveal must recontextualize earlier scenes
- Each segment must advance the plot — no "I felt scared" filler
- Use SPECIFIC details: names, dates, amounts, locations, times
- The villain must have a LOGICAL, BELIEVABLE motive

${opts.genre === 'horror' ? `
HORROR STORY TEMPLATE:
- Segments 1-3: The first sign (something is wrong)
- Segments 4-6: Escalation (it gets worse, you can't escape)
- Segments 7-9: The confrontation (face the horror)
- Segments 10-12: The aftermath (did you survive?)
- Final segment: Chilling twist or lingering dread
` : ''}

${opts.genre === 'confession' ? `
CONFESSION STORY TEMPLATE:
- Segments 1-3: The setup (what led to this)
- Segments 4-6: The secret (what you did/hide)
- Segments 7-9: The guilt (how it eats at you)
- Segments 10-12: The twist (something unexpected about the secret)
- Final segment: Why you're telling this now

TONE: Raw, unflinching. No redemption arc unless it's earned through pain. Show the ugly truth — jealousy, pettiness, cruelty. Don't sanitize. The best confessions make the viewer uncomfortable because they see themselves in it.
` : ''}

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