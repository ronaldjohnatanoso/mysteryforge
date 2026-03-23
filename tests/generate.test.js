/**
 * Tests for story generator
 */

const assert = require('assert');
const path = require('path');

// Mock environment for testing
process.env.GROQ_API_KEY = 'test_key_for_testing';

const generate = require('../generate.js');
const { calculateWordCount, calculateSegmentCount, parseStoryResponse } = generate;

// Test word count calculation
function testWordCountCalculation() {
  console.log('Testing word count calculation...');
  
  // 1 minute = ~165 words (150 * 1.1)
  const oneMin = calculateWordCount(1);
  assert(oneMin >= 150 && oneMin <= 170, `1 min should be ~165 words, got ${oneMin}`);
  
  // 5 minutes = ~825 words
  const fiveMin = calculateWordCount(5);
  assert(fiveMin >= 800 && fiveMin <= 850, `5 min should be ~825 words, got ${fiveMin}`);
  
  console.log('  ✓ Word count calculation works');
}

// Test segment count calculation
function testSegmentCountCalculation() {
  console.log('Testing segment count calculation...');
  
  // 1 minute = 60s / 8s per segment = 8 segments
  const oneMin = calculateSegmentCount(1);
  assert(oneMin === 8, `1 min should be 8 segments, got ${oneMin}`);
  
  // 3 minutes = 180s / 8s = 23 segments (rounded up)
  const threeMin = calculateSegmentCount(3);
  assert(threeMin === 23, `3 min should be 23 segments, got ${threeMin}`);
  
  console.log('  ✓ Segment count calculation works');
}

// Test story response parsing
function testStoryResponseParsing() {
  console.log('Testing story response parsing...');
  
  // Valid JSON
  const validJson = JSON.stringify({
    title: 'test_story',
    segments: [
      { text: 'First segment text here.', image_prompt: 'A dark scene' },
      { text: 'Second segment text here.', image_prompt: 'A bright scene' }
    ]
  });
  
  const parsed = parseStoryResponse(validJson, 2);
  assert(parsed.title === 'test_story', 'Title should be parsed');
  assert(parsed.segments.length === 2, 'Should have 2 segments');
  assert(parsed.segments[0].text.includes('First'), 'First segment text should match');
  
  // JSON with markdown code blocks
  const markdownJson = '```json\n' + validJson + '\n```';
  const parsedMarkdown = parseStoryResponse(markdownJson, 2);
  assert(parsedMarkdown.title === 'test_story', 'Should parse from markdown');
  
  // Missing image_prompt should get fallback
  const missingPrompt = JSON.stringify({
    title: 'test',
    segments: [{ text: 'Some text' }]
  });
  const parsedMissing = parseStoryResponse(missingPrompt, 1);
  assert(parsedMissing.segments[0].image_prompt.includes('cinematic'), 'Should have fallback prompt');
  
  console.log('  ✓ Story response parsing works');
}

// Run tests
console.log('\n🧪 Running generate.js tests...\n');

try {
  testWordCountCalculation();
  testSegmentCountCalculation();
  testStoryResponseParsing();
  
  console.log('\n✅ All tests passed!\n');
} catch (e) {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
}