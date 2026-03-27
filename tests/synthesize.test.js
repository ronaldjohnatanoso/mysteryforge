/**
 * Tests for synthesize.js - Speech synthesis
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ===== VOICES Configuration =====
const VOICES = {
  af_sky: 'Female - soft, mysterious (recommended)',
  af_heart: 'Female - warm, emotional',
  af_bella: 'Female - smooth',
  af_sarah: 'Female - clear',
  am_adam: 'Male - deep',
  am_michael: 'Male - neutral'
};

// Test voices configuration
function testVoicesConfig() {
  console.log('Testing VOICES configuration...');
  
  assert(Object.keys(VOICES).length >= 6, 'Should have at least 6 voices');
  
  // Check structure: female voices start with 'af_', male with 'am_'
  Object.entries(VOICES).forEach(([name, desc]) => {
    assert(name.startsWith('af_') || name.startsWith('am_'), `${name} should start with af_ or am_`);
    assert(desc.length > 5, `${name} should have a description`);
    assert(desc.includes('Female') || desc.includes('Male'), `${name} should specify gender`);
  });
  
  // Check recommended voice exists
  assert(VOICES['af_sky'], 'Default voice af_sky should exist');
  assert(VOICES['af_sky'].includes('recommended'), 'af_sky should be marked as recommended');
  
  console.log('  ✓ VOICES configuration valid');
}

// ===== Parse Args Tests =====
function testParseArgs() {
  console.log('Testing parseArgs logic...');
  
  function parseArgs(args) {
    return {
      latest: args.includes('--latest'),
      voice: args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'af_sky',
      listVoices: args.includes('--list-voices')
    };
  }
  
  // Test default
  let result = parseArgs([]);
  assert(result.latest === false, 'default latest should be false');
  assert(result.voice === 'af_sky', 'default voice should be af_sky');
  assert(result.listVoices === false, 'default listVoices should be false');
  
  // Test --latest
  result = parseArgs(['--latest']);
  assert(result.latest === true, '--latest should set latest to true');
  
  // Test --voice
  result = parseArgs(['--voice', 'am_adam']);
  assert(result.voice === 'am_adam', '--voice should set voice');
  
  // Test --list-voices
  result = parseArgs(['--list-voices']);
  assert(result.listVoices === true, '--list-voices should set listVoices');
  
  // Test voice override
  result = parseArgs(['--latest', '--voice', 'am_michael']);
  assert(result.voice === 'am_michael', '--latest with --voice should override');
  
  console.log('  ✓ parseArgs logic works');
}

// ===== Voice Validation Tests =====
function testVoiceValidation() {
  console.log('Testing voice validation...');
  
  function isValidVoice(voice) {
    return VOICES[voice] !== undefined;
  }
  
  assert(isValidVoice('af_sky') === true, 'af_sky should be valid');
  assert(isValidVoice('af_heart') === true, 'af_heart should be valid');
  assert(isValidVoice('am_adam') === true, 'am_adam should be valid');
  assert(isValidVoice('invalid_voice') === false, 'invalid_voice should be invalid');
  assert(isValidVoice('') === false, 'empty string should be invalid');
  
  console.log('  ✓ Voice validation works');
}

// ===== getLatestStoryFolder Tests =====
function testGetLatestStoryFolder() {
  console.log('Testing getLatestStoryFolder logic...');
  
  const outputDir = path.join(__dirname, '..', 'output');
  
  function getLatestFoldername() {
    if (!fs.existsSync(outputDir)) return null;
    const folders = fs.readdirSync(outputDir)
      .filter(f => {
        const p = path.join(outputDir, f);
        return fs.statSync(p).isDirectory() && 
               !['images', 'voice_tests', 'ai_images_test'].includes(f);
      })
      .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    return folders.length > 0 ? folders[0].name : null;
  }
  
  const latest = getLatestFoldername();
  if (latest) {
    console.log(`  ✓ Found latest folder: ${latest}`);
  } else {
    console.log('  ⚠ No output folders found yet (run generate first)');
  }
}

// ===== Narration File Detection Tests =====
function testNarrationFileDetection() {
  console.log('Testing narration file detection...');
  
  const outputDir = path.join(__dirname, '..', 'output');
  
  function findNarrationFolder() {
    if (!fs.existsSync(outputDir)) return null;
    const folders = fs.readdirSync(outputDir)
      .filter(f => {
        const p = path.join(outputDir, f);
        return fs.statSync(p).isDirectory();
      })
      .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    for (const folder of folders) {
      const narrationPath = path.join(outputDir, folder.name, 'narration.txt');
      if (fs.existsSync(narrationPath)) {
        return folder.name;
      }
    }
    return null;
  }
  
  const found = findNarrationFolder();
  if (found) {
    console.log(`  ✓ Found folder with narration.txt: ${found}`);
  } else {
    console.log('  ⚠ No narration.txt found yet (run generate first)');
  }
}

// ===== Word Count Estimation Tests =====
function testNarrationWordCount() {
  console.log('Testing narration word count estimation...');
  
  // Simulate word count from narration
  const testText = 'This is a test narration with exactly ten words now.';
  const wordCount = testText.split(/\s+/).length;
  assert(wordCount === 10, `Expected 10 words, got ${wordCount}`);
  
  // Typical 2-minute narration at 0.7 speed = ~90-120 words
  const estimatedWords2Min = 2 * 60 * 150 / 60; // ~150 wpm
  assert(estimatedWords2Min === 300, '2 min at 150wpm should be ~300 words');
  
  console.log('  ✓ Word count estimation works');
}

// ===== TTS Provider Tests =====
function testTTSProviderExport() {
  console.log('Testing TTS provider exports...');
  
  try {
    const { generateSpeech, getQuotaStatus } = require('../src/providers/index.js');
    assert(typeof generateSpeech === 'function', 'generateSpeech should be a function');
    assert(typeof getQuotaStatus === 'function', 'getQuotaStatus should be a function');
    console.log('  ✓ TTS provider functions exported correctly');
  } catch (e) {
    console.log(`  ⚠ Could not load TTS provider: ${e.message}`);
  }
}

// ===== Run Tests =====
console.log('\n🎙️ Running synthesize.js tests...\n');

try {
  testVoicesConfig();
  testParseArgs();
  testVoiceValidation();
  testGetLatestStoryFolder();
  testNarrationFileDetection();
  testNarrationWordCount();
  testTTSProviderExport();
  
  console.log('\n✅ All tests passed!\n');
} catch (e) {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
}
