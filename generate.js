#!/usr/bin/env node

/**
 * MysteryForge Story Generator
 * 
 * Generates structured stories with segment-specific image prompts.
 * Each segment = ~8-10 seconds of narration with a relevant image.
 */

const fs = require('fs');
const path = require('path');
const { createProvider, autoSelectProvider } = require('./src/providers/llm-provider');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Target duration per segment (seconds) - affects image change frequency
const SECONDS_PER_SEGMENT = 8;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { 
    genre: config.defaultGenre || 'mystery', 
    length: config.defaultLength || 5, 
    provider: null,
    topic: null
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--genre') options.genre = args[++i];
    else if (args[i] === '--length') options.length = parseInt(args[++i]);
    else if (args[i] === '--provider') options.provider = args[++i];
    else if (args[i] === '--topic') options.topic = args[++i];
    else if (args[i] === '--list-genres') {
      console.log('\n📚 Genres: ' + Object.keys(config.genres).join(', ') + '\n');
      process.exit(0);
    }
  }
  return options;
}

/**
 * Calculate word count based on target duration and speaking pace
 */
function calculateWordCount(minutes) {
  // Average speaking pace: ~150 words per minute
  // Add 10% buffer for pauses/emphasis
  return Math.floor(minutes * 150 * 1.1);
}

/**
 * Calculate number of segments based on duration
 */
function calculateSegmentCount(minutes) {
  const totalSeconds = minutes * 60;
  return Math.ceil(totalSeconds / SECONDS_PER_SEGMENT);
}

/**
 * Build the prompt based on genre
 */
function buildPrompts(opts, genreConfig, selectedTopic) {
  const wordCount = calculateWordCount(opts.length);
  const segmentCount = calculateSegmentCount(opts.length);
  
  // Genre-specific rules
  let genreRules = '';
  if (opts.genre === 'revenge') {
    genreRules = `
REVENGE STORY RULES:
- Clear villain who deserves punishment
- Strategic, methodical revenge planning
- Satisfying payoff at the end
- Last segment MUST end with: "Revenge is a dish best served cold."`;
  } else if (opts.genre === 'horror') {
    genreRules = `
HORROR STORY RULES:
- Build dread progressively
- Sensory details: sounds, smells, feelings
- Uncanny or wrong imagery
- Ambiguous or chilling ending`;
  } else if (opts.genre === 'confession') {
    genreRules = `
CONFESSION STORY RULES:
- Intimate, confessional tone
- Moral ambiguity
- Emotional vulnerability
- Twist or revelation`;
  }

  const systemPrompt = `You are a professional YouTube storyteller. You write viral stories in JSON format.

OUTPUT FORMAT: Return ONLY valid JSON, no markdown, no code blocks, no extra text.

Structure:
{
  "title": "short_title_snake_case",
  "segments": [
    {
      "text": "Narration text for this segment (20-30 words)",
      "image_prompt": "Specific visual description for this exact moment, designed for AI image generation"
    }
  ]
}

IMAGE PROMPT RULES:
- Be SPECIFIC to the scene: characters, actions, locations, mood
- Include visual details: lighting, camera angle, atmosphere
- Style suffix: ", cinematic lighting, dramatic, photorealistic, 4k"
- Each prompt must be DIFFERENT and match its segment
- NO text, NO words, NO letters in images
- Avoid generic prompts like "dark scene" or "mysterious figure"

STORY RULES:
- First person narrative ("I", "my", "me")
- Specific details: names, dates, amounts, locations
- Natural paragraph breaks distributed across segments
- Engaging hook, rising tension, satisfying conclusion
- Each segment: 20-30 words (aim for ~25 words average)
- Total ~${wordCount} words
- Expect around ${segmentCount} segments (give or take a few)

${genreRules}`;

  const userPrompt = `Write a ${opts.length}-minute ${opts.genre} story about: ${selectedTopic.prompt}

Target: ~${wordCount} words across approximately ${segmentCount} segments (20-30 words per segment)

Start the first segment with: "${selectedTopic.hook}"

Return ONLY the JSON object, nothing else.`;

  return { systemPrompt, userPrompt, segmentCount };
}

/**
 * Parse and validate the LLM response
 */
function parseStoryResponse(content, expectedSegments) {
  // Try to extract JSON from various formats
  let json;
  
  // Remove markdown code blocks if present
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  }
  
  // Try to find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    // Try to fix common JSON issues
    cleaned = cleaned
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/'/g, '"')
      .replace(/\n/g, '\\n');
    
    try {
      json = JSON.parse(cleaned);
    } catch (e2) {
      throw new Error(`Failed to parse story JSON: ${e.message}\n\nContent preview: ${content.substring(0, 500)}`);
    }
  }
  
  // Validate structure
  if (!json.segments || !Array.isArray(json.segments)) {
    throw new Error('Story must have a "segments" array');
  }
  
  if (json.segments.length < expectedSegments * 0.5) {
    console.warn(`⚠️  Warning: Got ${json.segments.length} segments, expected ~${expectedSegments}`);
  }
  
  // Validate each segment
  for (let i = 0; i < json.segments.length; i++) {
    const seg = json.segments[i];
    if (!seg.text) {
      throw new Error(`Segment ${i} missing "text" field`);
    }
    if (!seg.image_prompt) {
      // Generate a fallback prompt
      seg.image_prompt = `cinematic scene, dramatic lighting, photorealistic, 4k`;
    }
  }
  
  return json;
}

async function main() {
  const opts = parseArgs();
  const providerName = opts.provider || autoSelectProvider();
  const genreConfig = config.genres[opts.genre];

  if (!genreConfig) {
    console.error(`❌ Unknown genre: ${opts.genre}. Available: ${Object.keys(config.genres).join(', ')}`);
    process.exit(1);
  }

  const selectedTopic = opts.topic 
    ? genreConfig.topics.find(t => t.type === opts.topic) || genreConfig.topics[0]
    : genreConfig.topics[Math.floor(Math.random() * genreConfig.topics.length)];

  const { systemPrompt, userPrompt, segmentCount } = buildPrompts(opts, genreConfig, selectedTopic);
  const wordCount = calculateWordCount(opts.length);

  console.log(`\n⚒️ Generating ${opts.genre} story (${opts.length}min)...`);
  console.log(`   Topic: ${selectedTopic.type}`);
  console.log(`   Target: ${wordCount} words, ${segmentCount} segments\n`);

  const provider = createProvider(providerName);

  const result = await provider.chat({
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
    model: 'auto',
    maxTokens: 8192,
    temperature: 0.85
  });

  const storyData = parseStoryResponse(result.content, segmentCount);
  
  // Calculate totals
  const totalWords = storyData.segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const title = storyData.title || `story_${Date.now()}`;

  // Create output folder
  const folder = path.join(__dirname, 'output', title);
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(folder, 'images'), { recursive: true });

  // Combine all segment text for narration
  const fullStory = storyData.segments.map(s => s.text).join(' ');

  // Save structured data
  const outputData = {
    title,
    genre: opts.genre,
    topic: selectedTopic.type,
    length_minutes: opts.length,
    total_words: totalWords,
    segment_count: storyData.segments.length,
    seconds_per_segment: SECONDS_PER_SEGMENT,
    story: fullStory,
    segments: storyData.segments,
    ambient: genreConfig.ambient,
    colorGrade: genreConfig.colorGrade,
    generated: new Date().toISOString(),
    provider: providerName,
    model: result.model
  };

  fs.writeFileSync(path.join(folder, 'story.json'), JSON.stringify(outputData, null, 2));
  fs.writeFileSync(path.join(folder, 'narration.txt'), fullStory);

  console.log(`✅ Saved: ${folder}/`);
  console.log(`   Title: ${title}`);
  console.log(`   Words: ${totalWords}`);
  console.log(`   Segments: ${storyData.segments.length} (${SECONDS_PER_SEGMENT}s each)`);
  console.log(`   Genre: ${opts.genre}`);
  console.log(`   Provider: ${providerName} (${result.model})\n`);

  // Preview first and last segment
  console.log(`📝 First segment: "${storyData.segments[0].text.substring(0, 80)}..."`);
  console.log(`🖼️  First image: "${storyData.segments[0].image_prompt.substring(0, 60)}..."\n`);
}

// Export functions for testing
module.exports = {
  calculateWordCount,
  calculateSegmentCount,
  parseStoryResponse,
  buildPrompts,
  SECONDS_PER_SEGMENT
};

// Run CLI only when executed directly
if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}