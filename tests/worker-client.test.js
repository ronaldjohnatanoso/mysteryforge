/**
 * Tests for worker-client.js
 * Tests the Cloudflare Worker client functions.
 */

const assert = require('assert');
const path = require('path');

const {
  WORKER_URL,
  wordsToSRT,
  VOICES,
  fetchWithRetry
} = require('../src/worker-client.js');

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

async function run() {
  console.log(`\n🔧 Worker Client Tests\n`);

  // WORKER_URL
  check(typeof WORKER_URL === 'string', 'WORKER_URL is a string');
  check(WORKER_URL.startsWith('https://'), 'WORKER_URL is an HTTPS URL');

  // VOICES constant
  check(typeof VOICES === 'object', 'VOICES is an object');
  check(Object.keys(VOICES).length > 5, 'VOICES has multiple voices');
  check('orion' in VOICES, 'VOICES includes orion (Deep male)');
  check('athena' in VOICES, 'VOICES includes athena (Clear female)');
  check('luna' in VOICES, 'VOICES includes luna (Soft female)');
  check(typeof VOICES.orion === 'string', 'Voice descriptions are strings');

  // wordsToSRT
  const words = [
    { word: 'Hello', start: 0.0, end: 0.5 },
    { word: 'world', start: 0.5, end: 1.0 },
    { word: 'this', start: 1.0, end: 1.3 },
    { word: 'is', start: 1.3, end: 1.5 },
    { word: 'a', start: 1.5, end: 1.6 },
    { word: 'test', start: 1.6, end: 2.0 },
    { word: 'subtitle', start: 2.0, end: 2.5 },
    { word: 'line', start: 2.5, end: 3.0 },
    { word: 'with', start: 3.0, end: 3.2 },
    { word: 'more', start: 3.2, end: 3.5 },
    { word: 'words', start: 3.5, end: 4.0 },
    { word: 'here', start: 4.0, end: 4.5 }
  ];

  const srt = wordsToSRT(words, 8);
  check(srt.includes('1\n'), 'SRT starts with subtitle index 1');
  check(srt.includes(' --> '), 'SRT contains timestamp arrow');
  check(srt.includes('Hello world'), 'SRT contains first chunk text');
  check(srt.includes('2\n'), 'SRT has subtitle index 2');
  check(srt.includes('with more words here'), 'SRT contains second chunk text');

  // wordsToSRT with custom chunk size
  const srt4 = wordsToSRT(words, 4);
  const subtitleCount = (srt4.match(/^\d+$/gm) || []).length;
  check(subtitleCount === 3, `SRT with chunkSize=4 should have 3 subtitles, got ${subtitleCount}`);

  // wordsToSRT with empty array
  const srtEmpty = wordsToSRT([], 8);
  check(srtEmpty === '', 'Empty words array returns empty string');

  // wordsToSRT with single word
  const srtSingle = wordsToSRT([{ word: 'Test', start: 0, end: 1 }], 8);
  check(srtSingle.includes('Test'), 'Single word SRT contains the word');

  // formatSRTTime is indirectly tested via wordsToSRT (timestamps in output)
  // Verify timestamp format HH:MM:SS,mmm
  const timestampMatch = srt.match(/\d{2}:\d{2}:\d{2},\d{3}/);
  check(timestampMatch !== null, 'SRT contains valid timestamp format HH:MM:SS,mmm');

  // VOICES descriptions mention voice characteristics
  check(VOICES.orion.includes('mystery') || VOICES.orion.includes('male'), 'orion description mentions characteristics');
  check(VOICES.athena.includes('female'), 'athena description mentions female');

  console.log(`\n${'='.repeat(40)}`);
  console.log(`🔧 Worker Client Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
