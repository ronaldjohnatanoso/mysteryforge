#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createProvider, autoSelectProvider } = require('./src/providers/llm-provider');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const structures = JSON.parse(fs.readFileSync(path.join(__dirname, 'prompts', 'structures.json'), 'utf8'));
const basePrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'base-story.md'), 'utf8');

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
    .replace('{{GENRE}}', opts.genre)
    .replace(/{{STRUCTURE}}/g, structure.name)
    .replace('{{STRUCTURE_INSTRUCTIONS}}', structure.beats.map((b, i) => `${i+1}. ${b}`).join('\n'));
}

function extractTitle(text) {
  // Try to find title after "STORY TITLE:" marker
  let m = text.match(/\*\*STORY TITLE\*\*:\s*(.+)/i);
  if (m) return m[1].replace(/[^a-zA-Z0-9\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '_').substring(0, 40);
  
  // Try bold with quotes like **"Title"**
  m = text.match(/\*\*"(.+?)"\*\*/);
  if (m) return m[1].replace(/[^a-zA-Z0-9\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '_').substring(0, 40);
  
  // Try bold that looks like a title (starts with capital, has multiple words)
  const boldMatches = text.match(/\*\*([A-Z][^*]{5,50}?)\*\*/g);
  if (boldMatches) {
    for (const match of boldMatches) {
      const title = match.replace(/\*\*/g, '').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
      if (title.split(' ').length > 2 && !title.toUpperCase().includes('HOOK') && !title.toUpperCase().includes('PART') && !title.toUpperCase().includes('THUMBNAIL')) {
        return title.toLowerCase().replace(/\s+/g, '_').substring(0, 40);
      }
    }
  }
  
  return `story_${Date.now()}`;
}

function extractStory(text) {
  const m = text.match(/## Generated Story\n\n([\s\S]+?)(?=\n---)/);
  return m ? m[1].trim() : text;
}

function cleanNarration(text) {
  return text.replace(/^##\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').trim();
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
    system: 'You are a mystery writer. Generate suspenseful stories for YouTube narration.',
    model: 'auto',
    maxTokens: 4096
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