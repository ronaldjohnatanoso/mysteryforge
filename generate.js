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
 *   --list               List available structures
 *   --provider <name>    LLM provider: groq, ollama, openai (default: groq)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// Load config
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Load structures
const structuresPath = path.join(__dirname, 'prompts', 'structures.json');
const structures = JSON.parse(fs.readFileSync(structuresPath, 'utf8'));

// Load base prompt template
const basePromptPath = path.join(__dirname, 'prompts', 'base-story.md');
const basePrompt = fs.readFileSync(basePromptPath, 'utf8');

// Credentials path - use env var or default
const credentialsPath = process.env.CREDENTIALS_PATH || null;

// Load credentials from environment or file
function loadCredentials() {
  // First, check process.env (highest priority)
  const envCreds = {};
  if (process.env.GROQ_API_KEY) envCreds.GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (process.env.OPENAI_API_KEY) envCreds.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  // Then try to load from credentials file if specified
  if (credentialsPath) {
    try {
      const envContent = fs.readFileSync(credentialsPath, 'utf8');
      const lines = envContent.split('\n');
      for (const line of lines) {
        if (line.startsWith('#') || !line.includes('=')) continue;
        const [key, value] = line.split('=');
        // env vars take precedence over file
        if (!envCreds[key.trim()]) {
          envCreds[key.trim()] = value.trim();
        }
      }
    } catch (e) {
      // Credentials file not found, continue with env vars only
    }
  }
  
  return envCreds;
}

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    genre: config.genre || 'mystery',
    length: config.defaultLength || 10,
    structure: null,
    output: config.outputDir || 'output/scripts',
    list: false,
    provider: 'groq'
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

// Generate story using Groq API (OpenAI-compatible)
async function generateWithGroq(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a master mystery writer. Generate compelling fictional mystery stories for YouTube narration. Write in a suspenseful, engaging style suitable for voiceover.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4096,
      temperature: 0.8
    });

    const reqOptions = {
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Groq API error: ${json.error.message}`));
          } else if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error('Unexpected Groq response format'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Groq response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// Generate story using Ollama
function generateWithOllama(prompt) {
  try {
    const result = execSync('which ollama', { encoding: 'utf8' }).trim();
    if (result) {
      console.log('Using Ollama for generation...');
      const storyPrompt = `Generate a mystery story following this format:\n\n${prompt}`;
      const output = execSync(`ollama run llama3.2 "${storyPrompt.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10
      });
      return output;
    }
  } catch (e) {
    // Ollama not available
  }
  return null;
}

// Generate story using OpenAI API
async function generateWithOpenAI(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a master mystery writer. Generate compelling fictional mystery stories for YouTube narration.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4096
    });

    const reqOptions = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`OpenAI API error: ${json.error.message}`));
          } else if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error('Unexpected OpenAI response format'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse OpenAI response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// Save output
function saveOutput(content, prompt, options, structure) {
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
    return;
  }

  console.log('\n⚒️  MysteryForge - Generating story...\n');
  console.log(`  Genre: ${options.genre}`);
  console.log(`  Length: ${options.length} minutes`);
  console.log(`  Provider: ${options.provider}`);
  
  const structure = getStructure(options.structure);
  console.log(`  Structure: ${structure.name}`);
  console.log('');

  const prompt = generatePrompt(options, structure);
  let story = null;

  // Load credentials
  const creds = loadCredentials();

  // Generate based on provider
  try {
    if (options.provider === 'groq') {
      if (!creds.GROQ_API_KEY) {
        console.log('⚠️  GROQ_API_KEY not found in credentials.');
        console.log('Set it in /home/ronald/credentials/.env');
        process.exit(1);
      }
      console.log('Using Groq API (llama-3.3-70b-versatile)...');
      story = await generateWithGroq(prompt, creds.GROQ_API_KEY);
    } else if (options.provider === 'ollama') {
      story = generateWithOllama(prompt);
    } else if (options.provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY || creds.OPENAI_API_KEY;
      if (!apiKey) {
        console.log('⚠️  OPENAI_API_KEY not found.');
        process.exit(1);
      }
      console.log('Using OpenAI API (gpt-4o-mini)...');
      story = await generateWithOpenAI(prompt, apiKey);
    }
  } catch (e) {
    console.error(`\n❌ Generation failed: ${e.message}`);
    process.exit(1);
  }

  const outputPath = saveOutput(story, prompt, options, structure);

  console.log(`\n✅ Output saved to: ${outputPath}`);
  
  if (story) {
    console.log('\n📖 Preview:\n');
    console.log(story.substring(0, 500) + '...\n');
  }
}

main();