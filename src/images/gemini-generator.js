/**
 * AI Image Generator - Gemini API
 * 
 * Free tier: Uses gemini-2.5-flash-image (image generation via generateContent)
 * Requires: GEMINI_API_KEY from https://aistudio.google.com/apikey
 * 
 * Note: Imagen models require paid tier, so we use gemini-2.5-flash-image instead.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GEMINI_API_HOST = 'generativelanguage.googleapis.com';

// Rate limiting
let lastRequestTime = 0;
const MIN_INTERVAL = 31000; // ~2 images per minute = 30s between requests

async function waitForRateLimit() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_INTERVAL) {
    const wait = MIN_INTERVAL - elapsed;
    console.log(`   ⏳ Rate limit: waiting ${Math.round(wait/1000)}s...`);
    await new Promise(r => setTimeout(r, wait));
  }
}

/**
 * Generate image using Gemini 2.5 Flash Image (free tier)
 * Uses generateContent method with image output
 */
async function generateImage(prompt, outputPath, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set. Get free key at https://aistudio.google.com/apikey');
  }
  
  const model = options.model || 'gemini-2.5-flash-image';
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Wait for rate limit
  await waitForRateLimit();
  
  // Gemini 2.5 Flash Image uses generateContent with image response
  const payload = {
    contents: [{
      parts: [{
        text: `Generate a photorealistic image: ${prompt}`
      }]
    }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      responseMimeType: 'image/png'
    }
  };
  
  const postData = JSON.stringify(payload);
  const urlPath = `/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: GEMINI_API_HOST,
      port: 443,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
            reject(new Error(`Gemini API error: ${json.error.message || JSON.stringify(json.error)}`));
            return;
          }
          
          // Extract image from response
          const candidates = json.candidates || [];
          if (candidates.length === 0) {
            reject(new Error('No response generated'));
            return;
          }
          
          const parts = candidates[0].content?.parts || [];
          let imageData = null;
          let mimeType = 'image/png';
          
          for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
              imageData = part.inlineData.data;
              mimeType = part.inlineData.mimeType;
              break;
            }
          }
          
          if (!imageData) {
            // Check if there's text feedback
            const textPart = parts.find(p => p.text);
            if (textPart) {
              reject(new Error(`No image generated. Response: ${textPart.text}`));
            } else {
              reject(new Error('No image in response'));
            }
            return;
          }
          
          // Decode and save
          const buffer = Buffer.from(imageData, 'base64');
          
          // Convert to jpg if needed
          const finalPath = outputPath.endsWith('.jpg') || outputPath.endsWith('.jpeg') 
            ? outputPath 
            : outputPath.replace(/\.[^.]+$/, '.png');
          
          fs.writeFileSync(finalPath, buffer);
          
          lastRequestTime = Date.now();
          resolve({ path: finalPath, size: buffer.length, mimeType });
          
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Generate multiple images with proper rate limiting
 */
async function generateMultiple(prompts, outputDir, options = {}) {
  const results = [];
  
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const outputPath = path.join(outputDir, `gemini_${String(i + 1).padStart(3, '0')}.png`);
    
    console.log(`  [${i + 1}/${prompts.length}] ${prompt.substring(0, 40)}...`);
    
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

module.exports = {
  generateImage,
  generateMultiple
};