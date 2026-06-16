/**
 * Tests for align-subs.js — TikTok-style subtitle alignment
 */

const { parseSRT, formatTime, generateTikTokSRT } = require('../align-subs.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:02,500
Hello

2
00:00:02,600 --> 00:00:04,000
World

3
00:00:05,000 --> 00:00:06,000
This is a test`;

function run() {
  console.log('\n📝 align-subs.js Tests\n');

  // parseSRT — basic parsing
  const subs = parseSRT(SAMPLE_SRT);
  assert(subs.length === 3, 'parseSRT parses 3 subtitle blocks');
  assert(subs[0].text === 'Hello', 'First subtitle text is "Hello"');
  assert(subs[1].text === 'World', 'Second subtitle text is "World"');
  assert(Math.abs(subs[0].start - 1.0) < 0.01, 'First start time is ~1.0s');
  assert(Math.abs(subs[0].end - 2.5) < 0.01, 'First end time is ~2.5s');
  assert(Math.abs(subs[1].start - 2.6) < 0.01, 'Second start time is ~2.6s');

  // parseSRT — multi-word block
  const multi = `1
00:00:01,000 --> 00:00:03,000
This is multiple words`;
  const multiSubs = parseSRT(multi);
  assert(multiSubs.length === 1, 'Multi-word block parsed as single subtitle');
  assert(multiSubs[0].text === 'This is multiple words', 'Multi-word text preserved');

  // parseSRT — skips malformed blocks
  const bad = `1
not a time --> 00:00:02,000
text`;
  const badSubs = parseSRT(bad);
  assert(badSubs.length === 0, 'Malformed blocks are skipped');

  // formatTime
  assert(formatTime(1.0) === '00:00:01,000', 'formatTime: 1.0s → 00:00:01,000');
  assert(formatTime(61.5) === '00:01:01,500', 'formatTime: 61.5s → 00:01:01,500');
  assert(formatTime(3661.123) === '01:01:01,123', 'formatTime: 3661.123s → 01:01:01,123');
  assert(formatTime(0.005) === '00:00:00,005', 'formatTime: 0.005s pads ms correctly');
  assert(formatTime(65.04) === '00:01:05,040', 'formatTime: 65.04s pads correctly');

  // generateTikTokSRT — groups words into phrases
  const tiktok = generateTikTokSRT(subs, 3);
  assert(typeof tiktok === 'string', 'generateTikTokSRT returns a string');
  assert(tiktok.includes('00:00:01,000 --> 00:00:02,500'), 'Output contains SRT time codes');
  assert(tiktok.includes('Hello World'), 'Groups adjacent subtitles into phrases');

  // generateTikTokSRT — fills small gaps
  const gapSubs = [
    { start: 1.0, end: 2.0, text: 'Hello' },
    { start: 2.5, end: 3.5, text: 'World' }  // 0.5s gap — should NOT be filled
  ];
  const gapOutput = generateTikTokSRT(gapSubs, 3);
  assert(gapOutput.includes('World'), 'Gap output still contains both subtitles');

  // generateTikTokSRT — fills 200ms gaps
  const tinyGapSubs = [
    { start: 1.0, end: 2.0, text: 'Hello' },
    { start: 2.15, end: 3.0, text: 'World' }  // 150ms gap — should be filled
  ];
  const tinyGapOutput = generateTikTokSRT(tinyGapSubs, 3);
  assert(tinyGapOutput.includes('Hello World'), 'Tiny gap (<200ms) subtitles are grouped');

  console.log(`\n${'='.repeat(40)}`);
  console.log(`📝 align-subs Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
