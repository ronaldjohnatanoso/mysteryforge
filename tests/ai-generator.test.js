/**
 * Tests for ai-generator.js (Pollinations.ai image generator)
 * Tests cleanPrompt and other non-network-dependent logic.
 */

const assert = require('assert');
const path = require('path');

const { cleanPrompt } = require('../src/images/ai-generator.js');

let passed = 0;
let failed = 0;

function check(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

function run() {
  console.log(`\n🎨 AI Generator Tests\n`);

  // cleanPrompt removes quotes
  check(cleanPrompt('A "dark" house').includes('dark'), 'cleanPrompt removes double quotes');
  check(!cleanPrompt('A "dark" house').includes('"'), 'cleanPrompt removes all double quotes');

  // cleanPrompt removes angle brackets
  check(!cleanPrompt('<script>alert(1)</script>').includes('<'), 'cleanPrompt removes angle brackets');
  check(!cleanPrompt('<script>alert(1)</script>').includes('>'), 'cleanPrompt removes closing angle brackets');

  // cleanPrompt removes curly braces
  check(!cleanPrompt('A {curly} house').includes('{'), 'cleanPrompt removes curly braces');
  check(!cleanPrompt('A {curly} house').includes('}'), 'cleanPrompt removes closing curly braces');

  // cleanPrompt replaces newlines with space
  check(!cleanPrompt('dark\nhouse').includes('\n'), 'cleanPrompt replaces newlines with space');

  // cleanPrompt collapses multiple spaces
  check(!cleanPrompt('dark house').includes('    '), 'cleanPrompt collapses multiple spaces');
  check(cleanPrompt('dark house') === 'dark house', 'cleanPrompt collapses to single space');

  // cleanPrompt trims
  check(cleanPrompt('  dark house  ') === 'dark house', 'cleanPrompt trims leading/trailing spaces');

  // cleanPrompt respects maxLength
  const longPrompt = 'a'.repeat(600);
  check(cleanPrompt(longPrompt, 500).length <= 500, 'cleanPrompt respects maxLength');
  check(!cleanPrompt(longPrompt, 500).endsWith(' '), 'cleanPrompt does not end with space after truncate');

  // cleanPrompt truncates mid-word gracefully
  const midWordLong = 'dark forest with mysterious fog and creepy atmosphere';
  const result = cleanPrompt(midWordLong, 30);
  check(result.length <= 30, 'Truncated result respects maxLength');
  check(!result.endsWith(' '), 'Truncated result does not end with space');

  // cleanPrompt handles empty string
  check(cleanPrompt('') === '', 'cleanPrompt handles empty string');

  // cleanPrompt handles special characters
  check(cleanPrompt('no quote\'s house').includes('houses') || !cleanPrompt('no quote\'s house').includes("'"), 'cleanPrompt removes single quotes');

  console.log(`\n${'='.repeat(40)}`);
  console.log(`🎨 AI Generator Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
