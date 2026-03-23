/**
 * AI Image Generator - Pollinations.ai
 * 
 * Free AI image generation, no API key needed.
 * Rate limit: 1 request per IP at a time (~90s between requests recommended).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const POLLINATIONS_URL = 'image.pollinations.ai';

// Rate limit tracking
let lastRequestTime = 0;
const MIN_INTERVAL = 90000; // 90 seconds between requests

/**
 * Clean and truncate prompt for URL safety
 */
function cleanPrompt(prompt, maxLength = 500) {
  // Remove problematic characters
  let cleaned = prompt
    .replace(/['"]/g, '')  // Remove quotes
    .replace(/[<>]/g, '')  // Remove angle brackets
    .replace(/[{}]/g, '')  // Remove curly braces
    .replace(/\n/g, ' ')   // Replace newlines with space
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .trim();
  
  // Truncate if too long
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength).replace(/\s+\S*$/, '');
  }
  
  return cleaned;
}

/**
 * Wait for rate limit
 */
async function waitForRateLimit() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_INTERVAL) {
    const wait = MIN_INTERVAL - elapsed;
    console.log(`   ⏳ Rate limit: waiting ${Math.round(wait/1000)}s...`);
    await new Promise(r => setTimeout(r, wait));
  }
}

/**
 * Generate an AI image from a text prompt
 */
async function generateImage(prompt, outputPath, options = {}) {
  const width = options.width || 1920;
  const height = options.height || 1080;
  const seed = options.seed || Math.floor(Math.random() * 1000000);
  const maxRetries = options.maxRetries || 3;
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Clean the prompt
  const cleanText = cleanPrompt(prompt);
  const encodedPrompt = encodeURIComponent(cleanText);
  const urlPath = `/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
  
  // Wait for rate limit
  await waitForRateLimit();
  
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(30000 * Math.pow(2, attempt), 180000);
      console.log(`   Retry ${attempt}/${maxRetries} after ${Math.round(backoff/1000)}s...`);
      await new Promise(r => setTimeout(r, backoff));
    }
    
    try {
      const result = await makeRequest(urlPath, outputPath);
      lastRequestTime = Date.now();
      return result;
    } catch (e) {
      lastError = e;
      
      // Don't retry on 404 or invalid prompt errors
      if (e.message.includes('404') || e.message.includes('invalid')) {
        break;
      }
      
      // Rate limit - wait longer
      if (e.message.includes('429')) {
        console.log(`   Rate limited (429), waiting 2 minutes...`);
        await new Promise(r => setTimeout(r, 120000));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Make the HTTP request
 */
function makeRequest(urlPath, outputPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: POLLINATIONS_URL,
      path: urlPath,
      method: 'GET',
      headers: {
        'User-Agent': 'MysteryForge/1.0',
        'Accept': 'image/*'
      }
    };
    
    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        
        https.get(redirectUrl, (res2) => {
          handleResponse(res2, outputPath, resolve, reject);
        }).on('error', reject);
        return;
      }
      
      // Handle errors
      if (res.statusCode === 429) {
        reject(new Error('Rate limited (429)'));
        return;
      }
      
      if (res.statusCode === 404) {
        reject(new Error('Not found (404) - prompt may be invalid'));
        return;
      }
      
      if (res.statusCode >= 400) {
        reject(new Error(`HTTP error ${res.statusCode}`));
        return;
      }
      
      handleResponse(res, outputPath, resolve, reject);
    });
    
    req.on('error', reject);
    req.setTimeout(180000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Handle HTTP response
 */
function handleResponse(res, outputPath, resolve, reject) {
  const chunks = [];
  
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    
    // Check if it's an error JSON
    if (buffer.length < 5000 && buffer.toString().startsWith('{')) {
      try {
        const json = JSON.parse(buffer.toString());
        if (json.error) {
          reject(new Error(`API error: ${json.message || json.error}`));
          return;
        }
      } catch (e) {
        // Not JSON, continue
      }
    }
    
    // Check for valid image (at least 10KB)
    if (buffer.length < 10000) {
      reject(new Error(`Image too small (${buffer.length} bytes), may be error`));
      return;
    }
    
    fs.writeFileSync(outputPath, buffer);
    resolve({ path: outputPath, size: buffer.length });
  });
  
  res.on('error', reject);
}

/**
 * Generate multiple images with proper rate limiting
 */
async function generateMultiple(prompts, outputDir, options = {}) {
  const results = [];
  
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const outputPath = path.join(outputDir, `ai_image_${i + 1}.jpg`);
    
    console.log(`  [${i + 1}/${prompts.length}] Generating: ${prompt.substring(0, 40)}...`);
    
    try {
      const result = await generateImage(prompt, outputPath, options);
      results.push(result);
      console.log(`    ✓ Saved (${Math.round(result.size/1024)}KB)`);
    } catch (e) {
      console.log(`    ✗ Error: ${e.message}`);
      results.push({ error: e.message });
    }
  }
  
  return results;
}

/**
 * Generate mystery-themed images (fallback)
 */
async function generateMysteryImages(outputDir, count = 3) {
  const prompts = [
    'dark haunted mansion at night fog horror atmosphere cinematic 4k',
    'mysterious forest twisted trees moonlight creepy cinematic',
    'abandoned house interior dust shadows ominous 4k',
    'dark alley flickering street light noir style cinematic',
    'creepy old cemetery night fog rolling in horror',
    'shadowy figure dark doorway silhouette mysterious 4k'
  ];
  
  const selected = prompts.slice(0, count);
  return generateMultiple(selected, outputDir);
}

module.exports = {
  generateImage,
  generateMultiple,
  generateMysteryImages,
  cleanPrompt
};