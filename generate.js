#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createProvider, autoSelectProvider } = require('./src/providers/llm-provider');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const structures = JSON.parse(fs.readFileSync(path.join(__dirname, 'prompts', 'structures.json'), 'utf8'));

// Hood-style prompt for street narration
const basePrompt = `You are a street storyteller telling a ${config.genre || 'mystery'} story to your homies.

Talk AUTHENTIC hood style:
- Use natural pauses: "..." for dramatic moments
- Slang: blick, opps, shawty, homie, fam, deadass, no cap, on god, fr, facts
- Phrases: "you feel me?", "know what I'm sayin?", "nah but check this out"
- Break grammar naturally like real speech
- Build tension like you was really there

Story length: {{LENGTH}} minutes ({{WORD_COUNT}} words)
Structure: {{STRUCTURE}}

{{STRUCTURE_INSTRUCTIONS}}

Start with a hook like: "Aight so check this out..." or "Nah fr you ain't gonna believe this..."

Just tell the story. No headers. Natural flow with pauses. Make it feel real.`;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { genre: 'mystery', length: 10, structure: null, provider: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--genre') options.genre = args[++i];
    else if (args[i] === '--length') options.length = parseInt(args[++i]);
    else if (args[i] === '--structure') options.structure = args[++i];
    else if (args[i] === '--provider') options.provider = args[++i];
  }
  return options;
}

function generatePrompt(opts, structure) {
  return basePrompt
    .replace('{{LENGTH}}', opts.length)
    .replace('{{WORD_COUNT}}', opts.length * 150)
    .replace(/{{STRUCTURE}}/g, structure.name)
    .replace('{{STRUCTURE_INSTRUCTIONS}}', structure.beats.map((b, i) => `${i+1}. ${b}`).join('\n'));
}

function extractTitle(text) {
  // Try first sentence or hook as title
  const firstLine = text.split('\n')[0];
  if (firstLine && firstLine.length > 10 && firstLine.length < 80) {
    // Extract key words from first line
    const words = firstLine.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).slice(0, 6);
    if (words.length >= 3) {
      return words.join('_').toLowerCase().substring(0, 50);
    }
  }
  
  // Try to find a name or place mentioned
  const names = text.match(/\b([A-Z][a-z]+)\b/g);
  if (names && names.length > 0) {
    const uniqueNames = [...new Set(names)].slice(0, 3);
    return uniqueNames.join('_').toLowerCase() + '_story';
  }
  
  // Fallback: use date
  return `mystery_${Date.now()}`;
}

function extractStory(text) {
  // Find the story content between "Generated Story" and "Prompt Used" or end
  let m = text.match(/## Generated Story\n\n([\s\S]+?)(?=\n---\n## Prompt Used|$)/);
  if (m) return m[1].trim();
  return text;
}

function cleanNarration(text) {
  // For hood style, just clean up extra whitespace but keep the natural speech patterns
  return text
    .replace(/^##\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const opts = parseArgs();
  const providerName = opts.provider || autoSelectProvider();
  const structureName = opts.structure || Object.keys(structures)[Math.floor(Math.random() * Object.keys(structures).length)];
  const structure = { name: structureName, ...structures[structureName] };

  console.log(`\n⚒️ Generating ${opts.genre} story (${opts.length}min) via ${providerName}...`);

  const provider = createProvider(providerName);
  const result = await provider.chat({
    messages: [{ role: 'user', content: generatePrompt(opts, structure) }],
    system: `You are a hood storyteller. Talk like you from the streets telling a crazy story to your homies at 2AM.

STYLE:
- Natural pauses with "..." 
- Slang: blick, opps, shawty, homie, fam, deadass, no cap, on god, fr, facts
- Phrases: "you feel me?", "know what I'm sayin?", "check this out"
- Break grammar like real speech
- Build tension, make it feel REAL

Just tell the story naturally. No headers or sections. Raw narration.`,
    model: 'auto',
    maxTokens: 4096,
    temperature: 0.9
  });

  const title = extractTitle(result.content);
  const story = extractStory(result.content);
  const narration = cleanNarration(story);

  const folder = path.join(__dirname, 'output', title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50));
  fs.mkdirSync(folder, { recursive: true });

  fs.writeFileSync(path.join(folder, 'story.md'), `# ${title.replace(/_/g, ' ')}\n\n${story}`);
  fs.writeFileSync(path.join(folder, 'narration.txt'), narration);

  console.log(`\n✅ Saved: ${folder}/`);
  console.log(`   Title: ${title.replace(/_/g, ' ')}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });