/**
 * AI Image Generator - Pollinations.ai
 * 
 * Free AI image generation, no API key needed.
 * Rate limit: 1 request per IP at a time.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const POLLINATIONS_URL = 'image.pollinations.ai';

/**
 * Generate an AI image from a text prompt
 */
async function generateImage(prompt, outputPath, options = {}) {
  const width = options.width || 1920;
  const height = options.height || 1080;
  const seed = options.seed || Math.floor(Math.random() * 1000000);
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Build URL
  const encodedPrompt = encodeURIComponent(prompt);
  const urlPath = `/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: POLLINATIONS_URL,
      path: urlPath,
      method: 'GET',
      headers: {
        'User-Agent': 'MysteryForge/1.0'
      }
    };
    
    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        const redirectUrl = res.headers.location;
        const url = new URL(redirectUrl);
        
        https.get(redirectUrl, (res2) => {
          const chunks = [];
          res2.on('data', chunk => chunks.push(chunk));
          res2.on('end', () => {
            const buffer = Buffer.concat(chunks);
            
            // Check if it's an error JSON
            if (buffer.length < 1000 && buffer.toString().startsWith('{')) {
              const json = JSON.parse(buffer.toString());
              if (json.error) {
                reject(new Error(`Pollinations error: ${json.message || json.error}`));
                return;
              }
            }
            
            fs.writeFileSync(outputPath, buffer);
            resolve({ path: outputPath, size: buffer.length });
          });
        }).on('error', reject);
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        // Check if it's an error JSON
        if (buffer.length < 1000 && buffer.toString().startsWith('{')) {
          try {
            const json = JSON.parse(buffer.toString());
            if (json.error) {
              reject(new Error(`Pollinations error: ${json.message || json.error}`));
              return;
            }
          } catch (e) {}
        }
        
        fs.writeFileSync(outputPath, buffer);
        resolve({ path: outputPath, size: buffer.length });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Generate multiple images with rate limiting
 */
async function generateMultiple(prompts, outputDir, options = {}) {
  const results = [];
  
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const outputPath = path.join(outputDir, `ai_image_${i + 1}.jpg`);
    
    console.log(`  [${i + 1}/${prompts.length}] Generating: ${prompt.substring(0, 50)}...`);
    
    try {
      const result = await generateImage(prompt, outputPath, options);
      results.push(result);
      console.log(`    Saved: ${outputPath}`);
      
      // Rate limit: wait between requests
      if (i < prompts.length - 1) {
        console.log('    Waiting 90s for rate limit...');
        await new Promise(r => setTimeout(r, 90000));
      }
    } catch (e) {
      console.log(`    Error: ${e.message}`);
    }
  }
  
  return results;
}

/**
 * Generate mystery-themed images
 */
async function generateMysteryImages(outputDir, count = 3) {
  const prompts = [
    'dark haunted mansion at night, fog, horror atmosphere, cinematic',
    'mysterious forest with twisted trees, moonlight, creepy',
    'abandoned house interior, dust, shadows, ominous',
    'dark alley with flickering street light, noir style',
    'creepy old cemetery at night, fog rolling in',
    'shadowy figure in dark doorway, silhouette, mysterious'
  ];
  
  const selected = [];
  while (selected.length < count) {
    const idx = Math.floor(Math.random() * prompts.length);
    if (!selected.includes(prompts[idx])) {
      selected.push(prompts[idx]);
    }
  }
  
  return generateMultiple(selected, outputDir);
}

module.exports = {
  generateImage,
  generateMultiple,
  generateMysteryImages
};