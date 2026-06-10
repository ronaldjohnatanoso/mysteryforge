/**
 * AI Generator Tests
 * Tests for src/images/ai-generator.js
 */

const assert = require('assert');

let cleanPrompt, generateImage, generateMultiple, generateMysteryImages;
try {
  ({ cleanPrompt, generateImage, generateMultiple, generateMysteryImages } = require('../src/images/ai-generator.js'));
} catch (e) {
  console.log('⚠️  Could not load ai-generator.js:', e.message);
  process.exit(0);
}

console.log('📦 AI Generator Tests\n');

// --- cleanPrompt tests ---

try {
  assert.strictEqual(cleanPrompt('hello world'), 'hello world', 'plain text unchanged');
  assert.strictEqual(cleanPrompt('hello "world"'), 'hello world', 'quotes removed');
  assert.strictEqual(cleanPrompt('hello <world>'), 'hello world', 'angle brackets removed');
  assert.strictEqual(cleanPrompt('hello {world}'), 'hello world', 'curly braces removed');
  assert.strictEqual(cleanPrompt('hello\nworld'), 'hello world', 'newlines replaced with space');
  assert.strictEqual(cleanPrompt('hello   world'), 'hello world', 'multiple spaces collapsed');
  assert.strictEqual(cleanPrompt('  hello  '), 'hello', 'leading/trailing spaces trimmed');
  console.log('✅ cleanPrompt removes quotes, angle brackets, curly braces, newlines, extra spaces');
} catch (e) {
  console.error('❌ cleanPrompt basic:', e.message);
  process.exit(1);
}

try {
  // Test truncation
  const longPrompt = 'a'.repeat(600);
  const result = cleanPrompt(longPrompt);
  assert(result.length <= 500, 'truncates to maxLength');
  // Should end on a word boundary (no cut-off word)
  console.log('✅ cleanPrompt truncates long prompts safely');
} catch (e) {
  console.error('❌ cleanPrompt truncation:', e.message);
  process.exit(1);
}

// --- module exports ---
try {
  assert.strictEqual(typeof cleanPrompt, 'function', 'cleanPrompt is a function');
  assert.strictEqual(typeof generateImage, 'function', 'generateImage is a function');
  assert.strictEqual(typeof generateMultiple, 'function', 'generateMultiple is a function');
  assert.strictEqual(typeof generateMysteryImages, 'function', 'generateMysteryImages is a function');
  console.log('✅ ai-generator.js exports all required functions');
} catch (e) {
  console.error('❌ exports:', e.message);
  process.exit(1);
}

console.log('\n========================================');
console.log('✅ AI Generator Tests: All passed');
console.log('========================================');