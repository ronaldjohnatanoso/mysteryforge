/**
 * Tests for Provider Manager module (src/providers/index.js)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('\n🧪 Running providers tests...\n');

// Test provider configuration loading
function testProviderConfig() {
  console.log('Testing provider configuration...');
  
  const configPath = path.join(__dirname, '..', 'providers.json');
  assert(fs.existsSync(configPath), 'providers.json should exist');
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Check structure
  assert(config.providers, 'Should have providers object');
  assert(config.quota, 'Should have quota object');
  assert(config.defaults, 'Should have defaults object');
  
  // Check required providers
  const requiredProviders = ['text', 'image', 'tts'];
  requiredProviders.forEach(p => {
    assert(config.providers[p], `Should have ${p} provider config`);
    assert(config.providers[p].primary, `${p} should have primary`);
    assert(Array.isArray(config.providers[p].fallback), `${p} should have fallback array`);
  });
  
  console.log('  ✓ Provider configuration valid');
}

// Test quota configuration
function testQuotaConfig() {
  console.log('Testing quota configuration...');
  
  const configPath = path.join(__dirname, '..', 'providers.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  assert(config.quota.cloudflare, 'Should have cloudflare quota');
  assert(config.quota.cloudflare.daily_neurons > 0, 'Should have daily_neurons limit');
  assert(config.quota.cloudflare.reset_time, 'Should have reset_time');
  
  console.log('  ✓ Quota configuration valid');
}

// Test defaults
function testDefaults() {
  console.log('Testing defaults...');
  
  const configPath = path.join(__dirname, '..', 'providers.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  assert(config.defaults.genre, 'Should have default genre');
  assert(config.defaults.length_minutes > 0, 'Should have default length');
  assert(config.defaults.voice, 'Should have default voice');
  assert(config.defaults.seconds_per_segment > 0, 'Should have default seconds per segment');
  
  console.log('  ✓ Defaults valid');
}

// Test module exports (without making API calls)
function testModuleExports() {
  console.log('Testing module exports...');
  
  // We can't test actual API calls without credentials
  // But we can verify the module structure
  const providerPath = path.join(__dirname, '..', 'src', 'providers', 'index.js');
  assert(fs.existsSync(providerPath), 'src/providers/index.js should exist');
  
  // Check that the file has the expected exports
  const content = fs.readFileSync(providerPath, 'utf8');
  assert(content.includes('module.exports'), 'Should export functions');
  assert(content.includes('generateText'), 'Should export generateText');
  assert(content.includes('generateImage'), 'Should export generateImage');
  assert(content.includes('generateSpeech'), 'Should export generateSpeech');
  assert(content.includes('getQuotaStatus'), 'Should export getQuotaStatus');
  
  console.log('  ✓ Module exports present');
}

// Test TTS voices
function testTTSVoices() {
  console.log('Testing TTS voice configuration...');
  
  const configPath = path.join(__dirname, '..', 'providers.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const ttsConfig = config.providers.tts;
  assert(ttsConfig.options.kokoro, 'Should have kokoro config');
  assert(ttsConfig.options.kokoro.voice, 'Should have default kokoro voice');
  assert(ttsConfig.options.cloudflare, 'Should have cloudflare TTS config');
  
  console.log('  ✓ TTS voices configured');
}

// Test image providers
function testImageProviders() {
  console.log('Testing image provider configuration...');
  
  const configPath = path.join(__dirname, '..', 'providers.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const imageConfig = config.providers.image;
  assert(imageConfig.primary === 'cloudflare', 'Cloudflare should be primary image provider');
  assert(imageConfig.fallback.includes('pexels'), 'Pexels should be fallback');
  assert(imageConfig.fallback.includes('pollinations'), 'Pollinations should be fallback');
  
  console.log('  ✓ Image providers configured');
}

// Run tests
try {
  testProviderConfig();
  testQuotaConfig();
  testDefaults();
  testModuleExports();
  testTTSVoices();
  testImageProviders();
  
  console.log('\n✅ All provider tests passed!\n');
} catch (e) {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
}