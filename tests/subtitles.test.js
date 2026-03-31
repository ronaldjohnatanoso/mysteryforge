/**
 * Tests for src/video/subtitles.js
 */

const { generateSRT, generateSRTFromWords, formatSRTTime, SRT_CHUNK_SIZE } = require('../src/video/subtitles');

let passed = 0, failed = 0;

function check(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

console.log('\n💬 Subtitles Module Tests\n');

// ==========================================
// formatSRTTime
// ==========================================
console.log('formatSRTTime:');
check(formatSRTTime(0) === '00:00:00,000', '0 seconds → 00:00:00,000');
check(formatSRTTime(1) === '00:00:01,000', '1 second → 00:00:01,000');
check(formatSRTTime(61) === '00:01:01,000', '61 seconds → 00:01:01,000');
check(formatSRTTime(3661) === '01:01:01,000', '3661 seconds → 01:01:01,000');
check(formatSRTTime(0.5) === '00:00:00,500', '0.5 seconds → 00:00:00,500');
check(formatSRTTime(59.999) === '00:00:59,999', '59.999 → 00:00:59,999');
check(formatSRTTime(0.001) === '00:00:00,001', '0.001 → 00:00:00,001');
// Padding
check(formatSRTTime(10).startsWith('00:00:10,'), '10s padded with leading zeros');
check(formatSRTTime(3600).startsWith('01:00:00,'), '3600s = 1 hour');

// ==========================================
// SRT_CHUNK_SIZE
// ==========================================
console.log('\nSRT_CHUNK_SIZE:');
check(SRT_CHUNK_SIZE === 8, `chunk size should be 8, got ${SRT_CHUNK_SIZE}`);

// ==========================================
// generateSRT basic
// ==========================================
console.log('\ngenerateSRT basic:');

const basic = generateSRT('Hello world.', 4);
check(basic.includes('00:00:00,000 -->'), 'starts with 00:00:00,000');
check(basic.includes('Hello world'), 'contains the text');
check(basic.includes(' --> '), 'contains arrow separator');
check(basic.includes('00:00:00,000 --> 00:00:04,000'), '4s duration covers whole text');

// ==========================================
// generateSRT time proportional
// ==========================================
console.log('\ngenerateSRT timing:');
const twoSentences = generateSRT('Hello world. Goodbye.', 8);
// "Hello world." is ~2 words, "Goodbye." is ~1 word
// Total 3 words over 8s → ~2.67 words/s
// "Hello world." (2 words) should get ~0.75s, "Goodbye." (1 word) ~0.375s
// But with sentence splitting: first sentence gets proportionally more
const lines = twoSentences.split('\n').filter(l => l.trim());
const timeLine = lines.find(l => l.includes('-->'));
check(timeLine.includes('-->'), 'has time range line');

// ==========================================
// generateSRT multiple sentences
// ==========================================
console.log('\ngenerateSRT multi-sentence:');
const multi = generateSRT('First sentence. Second sentence. Third sentence.', 9);
check(multi.includes('First sentence'), 'contains first sentence');
check(multi.includes('Second sentence'), 'contains second sentence');
check(multi.includes('Third sentence'), 'contains third sentence');
// Should have 3 subtitle indices (1, 2, 3)
check(multi.includes('\n1\n'), 'has index 1');
check(multi.includes('\n2\n'), 'has index 2');
check(multi.includes('\n3\n'), 'has index 3');

// ==========================================
// generateSRT empty input
// ==========================================
console.log('\ngenerateSRT edge cases:');
check(generateSRT('', 10) === '', 'empty string returns empty');
check(generateSRT(null, 10) === '', 'null returns empty');
check(generateSRT('No punctuation just text', 10).length > 0, 'no punctuation still produces output');

// ==========================================
// generateSRT duration zero
// ==========================================
check(generateSRT('Hello world.', 0) === '', 'zero duration returns empty');
check(generateSRT('Hello world.', -1) === '', 'negative duration returns empty');

// ==========================================
// generateSRT long text (chunking)
// ==========================================
console.log('\ngenerateSRT chunking:');
// SRT_CHUNK_SIZE = 8, so 20 words → at least 3 chunks
const longText = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
const longSRT = generateSRT(longText, 20);
// Should have multiple chunks (20 words / 8 per chunk = 3 chunks minimum)
const chunkCount = (longSRT.match(/\n\d+\n/g) || []).length;
check(chunkCount >= 3, `20 words → ${chunkCount} chunks (expected ≥3)`);

// ==========================================
// generateSRT ellipsis handling
// ==========================================
console.log('\ngenerateSRT ellipsis:');
// Ellipsis should be converted to period
const ellipsis = generateSRT('Hello... world.', 4);
check(ellipsis.length > 0, 'ellipsis text produces output');
check(!ellipsis.includes('...'), 'ellipsis replaced with period');

// ==========================================
// generateSRTFromWords
// ==========================================
console.log('\ngenerateSRTFromWords:');
const words = [
  { word: 'Hello', start: 0.0, end: 0.5 },
  { word: 'world', start: 0.5, end: 1.0 },
  { word: 'this', start: 1.0, end: 1.3 },
  { word: 'is', start: 1.3, end: 1.4 },
  { word: 'a', start: 1.4, end: 1.5 },
  { word: 'test', start: 1.5, end: 2.0 },
];
const srtFromWords = generateSRTFromWords(words);
// Default chunk size = 8, so 6 words → 1 chunk
check(srtFromWords.includes('Hello world this is a test'), 'all words joined');
check(srtFromWords.includes('00:00:00,000 --> 00:00:02,000'), 'spans full duration');

// Smaller chunk size
const smallerChunks = generateSRTFromWords(words, 3);
// 6 words / 3 per chunk = 2 chunks
const smallerChunkCount = (smallerChunks.match(/\n\d+\n/g) || []).length;
check(smallerChunkCount === 2, `6 words @ chunk=3 → ${smallerChunkCount} chunks (expected 2)`);

// Empty input
check(generateSRTFromWords([]) === '', 'empty words array returns empty');
check(generateSRTFromWords(null) === '', 'null words returns empty');

// ==========================================
// Summary
// ==========================================
console.log(`\n${'='.repeat(40)}`);
console.log(`💬 Subtitles Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
