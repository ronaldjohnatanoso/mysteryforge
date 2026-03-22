#!/usr/bin/env node

/**
 * MysteryForge - Automated Mystery Story Generator
 * 
 * Generates fictional mystery/crime stories for YouTube content.
 * 
 * Usage:
 *   node generate.js [options]
 * 
 * Options:
 *   --genre <genre>      Story genre (default: mystery)
 *   --length <minutes>   Target length in minutes (default: 10)
 *   --structure <type>   Story structure type (default: random)
 *   --output <dir>       Output directory (default: output/scripts)
 *   --provider <name>    LLM provider: cerebras, groq, openai (default: auto)
 *   --model <model>      Model: auto, fast, balanced, best, or specific ID
 *   --list               List available structures
 */

const fs = require('fs');
const path = require('path');
const { createProvider, autoSelectProvider } = require('./src/providers/llm-provider');

// Load config
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Load structures
const structuresPath = path.join(__dirname, 'prompts', 'structures.json');
const structures = JSON.parse(fs.readFileSync(structuresPath, 'utf8'));

// Load base prompt template
const basePromptPath = path.join(__dirname, 'prompts', 'base-story.md');
const basePrompt = fs.readFileSync(basePromptPath, 'utf8');

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    genre: config.genre || 'mystery',
    length: config.defaultLength || 10,
    structure: null,
    output: config.outputDir || 'output/scripts',
    list: false,
    provider: null,
    model: 'auto'
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--genre':
        options.genre = args[++i];
        break;
      case '--length':
        options.length = parseInt(args[++i], 10);
        break;
      case '--structure':
        options.structure = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--list':
        options.list = true;
        break;
      case '--provider':
        options.provider = args[++i];
        break;
      case '--model':
        options.model = args[++i];
        break;
    }
  }

  return options;
}

// Get random structure if not specified
function getStructure(structureName) {
  if (structureName && structures[structureName]) {
    return { name: structureName, ...structures[structureName] };
  }
  const names = Object.keys(structures);
  const randomName = names[Math.floor(Math.random() * names.length)];
  return { name: randomName, ...structures[randomName] };
}

// Generate the prompt
function generatePrompt(options, structure) {
  const wordCount = options.length * 150; // ~150 words per minute
  
  const structureInstructions = structure.beats
    .map((beat, i) => `${i + 1}. ${beat}`)
    .join('\n');

  let prompt = basePrompt
    .replace('{{LENGTH}}', options.length)
    .replace('{{WORD_COUNT}}', wordCount)
    .replace('{{GENRE}}', options.genre)
    .replace(/{{STRUCTURE}}/g, structure.name)
    .replace('{{STRUCTURE_INSTRUCTIONS}}', structureInstructions);

  return prompt;
}

// Save output
function saveOutput(content, prompt, options, structure, meta = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `story_${timestamp}.md`;
  const outputPath = path.join(__dirname, options.output);
  
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  const filePath = path.join(outputPath, filename);
  
  const fullContent = `# MysteryForge Generated Story

## Metadata
- Genre: ${options.genre}
- Structure: ${structure.name}
- Target Length: ${options.length} minutes
- Generated: ${new Date().toISOString()}
- Provider: ${meta.provider || 'unknown'}
- Model: ${meta.model || 'unknown'}

---

## Generated Story

${content || '[Story generation pending - see prompt below]'}

---

## Prompt Used

\`\`\`
${prompt}
\`\`\`
`;

  fs.writeFileSync(filePath, fullContent);
  return filePath;
}

// Main
async function main() {
  const options = parseArgs();

  if (options.list) {
    console.log('Available story structures:\n');
    Object.entries(structures).forEach(([name, data]) => {
      console.log(`  ${name}: ${data.description}`);
      console.log(`    Beats: ${data.beats.length}, Ending: ${data.endingType}`);
      console.log();
    });
    console.log('\nAvailable providers: cerebras, groq, openai');
    console.log('Model aliases: fast, balanced, best, auto');
    return;
  }

  // Auto-select provider if not specified
  const providerName = options.provider || autoSelectProvider();
  
  console.log('\n⚒️  MysteryForge - Generating story...\n');
  console.log(`  Genre: ${options.genre}`);
  console.log(`  Length: ${options.length} minutes`);
  console.log(`  Provider: ${providerName}`);
  
  const structure = getStructure(options.structure);
  console.log(`  Structure: ${structure.name}`);
  console.log('');

  const prompt = generatePrompt(options, structure);
  
  let story = null;
  let meta = {};

  try {
    const provider = createProvider(providerName);
    const modelInfo = provider.getModels();
    
    console.log(`  Model: ${provider.resolveModel(options.model)}`);
    console.log('\n  Generating...');
    
    const result = await provider.chat({
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a master mystery writer. Generate compelling fictional mystery stories for YouTube narration. Write in a suspenseful, engaging style suitable for voiceover.',
      model: options.model,
      maxTokens: 4096,
      temperature: 0.8
    });
    
    story = result.content;
    meta = {
      provider: providerName,
      model: result.model,
      tokens: result.usage
    };
    
    console.log(`  Tokens used: ${result.usage?.total_tokens || 'N/A'}`);
    
  } catch (e) {
    console.error(`\n❌ Generation failed: ${e.message}`);
    process.exit(1);
  }

  const outputPath = saveOutput(story, prompt, options, structure, meta);

  console.log(`\n✅ Output saved to: ${outputPath}`);
  
  if (story) {
    console.log('\n📖 Preview:\n');
    console.log(story.substring(0, 500) + '...\n');
  }
}

main();