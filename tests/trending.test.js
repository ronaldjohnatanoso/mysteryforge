/**
 * Trending Topics Module Tests
 */

const fs = require('fs');
const path = require('path');

const {
  getTrendingTopics,
  injectTrendingIntoPrompt,
  tagStoryWithTrending,
  getFallbackTopics,
  isCacheFresh
} = require('../src/seo/trending');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

async function run() {
  console.log(`\n🔥 Trending Topics Tests\n`);

  // getFallbackTopics
  const mysteryTopics = getFallbackTopics('mystery');
  assert(Array.isArray(mysteryTopics), 'getFallbackTopics returns an array');
  assert(mysteryTopics.length >= 5, 'getFallbackTopics has at least 5 topics');
  assert(typeof mysteryTopics[0] === 'string', 'Topics are strings');

  const horrorTopics = getFallbackTopics('horror');
  assert(horrorTopics.length > 0, 'Horror fallback topics exist');

  const revengeTopics = getFallbackTopics('revenge');
  assert(revengeTopics.length > 0, 'Revenge fallback topics exist');

  // injectTrendingIntoPrompt
  const basePrompt = 'a mystery story about betrayal';
  const enhanced = injectTrendingIntoPrompt(basePrompt, 'mystery', ['cold case', 'vanished']);
  assert(enhanced.includes('cold case'), 'Inject adds trending topic');
  assert(enhanced.includes(basePrompt), 'Inject preserves original prompt');

  const noTopics = injectTrendingIntoPrompt(basePrompt, 'mystery', []);
  assert(noTopics === basePrompt, 'No-op when no trending topics');

  // getTrendingTopics (uses cache or fallback)
  const topics = await getTrendingTopics('mystery');
  assert(Array.isArray(topics), 'getTrendingTopics returns array');
  assert(topics.length > 0, 'getTrendingTopics returns non-empty');
  assert(topics.length <= 10, 'getTrendingTopics limits to 10');

  // Freshness check
  const fresh = isCacheFresh();
  assert(typeof fresh === 'boolean', 'isCacheFresh returns boolean');

  // tagStoryWithTrending
  const story = {
    genre: 'mystery',
    story: 'A cold case that nobody wanted to solve',
    segments: []
  };
  const tagged = tagStoryWithTrending(story, ['cold case', 'vanished', 'mystery']);
  assert(Array.isArray(tagged.trendingTopics), 'Tagged story has trendingTopics array');
  assert(tagged.generatedWithTrending === true, 'Tagged story has generatedWithTrending flag');
  assert(tagged.trendingTopics.length > 0, 'Tagged story matched at least one topic');

  // Different genres get different fallbacks
  const confTopics = getFallbackTopics('confession');
  assert(confTopics.some(t => /confession|secret|buried/i.test(t)), 'Confession topics include confession-related terms');

  console.log(`\n${'='.repeat(40)}`);
  console.log(`🔥 Trending Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
