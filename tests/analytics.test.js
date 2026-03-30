/**
 * Analytics Feedback Module Tests
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Use isolated temp directory for tests
const TEST_DATA_DIR = '/tmp/mysteryforge_analytics_test';
process.env.MYSTERYFORGE_ANALYTICS_DIR = TEST_DATA_DIR;

const feedback = require('../src/analytics/feedback');

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

function cleanup() {
  try {
    const af = path.join(TEST_DATA_DIR, 'analytics_history.json');
    const iff = path.join(TEST_DATA_DIR, 'analytics_insights.json');
    if (fs.existsSync(af)) fs.unlinkSync(af);
    if (fs.existsSync(iff)) fs.unlinkSync(iff);
    if (fs.existsSync(TEST_DATA_DIR)) fs.rmdirSync(TEST_DATA_DIR);
  } catch (e) { /* ignore */ }
}

async function run() {
  console.log(`\n📊 Analytics Feedback Tests\n`);

  cleanup();
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  // Create mock story folders
  const makeMock = (name, genre, views, likes = 0, comments = 0, trendingTopics = []) => {
    const fp = path.join(TEST_DATA_DIR, name);
    fs.mkdirSync(fp, { recursive: true });
    fs.writeFileSync(path.join(fp, 'story.json'), JSON.stringify({
      title: name,
      genre,
      topic: 'test_topic',
      length_minutes: 3,
      segment_count: 10,
      total_words: 450,
      story: `A ${genre} story about something.`,
      trendingTopics
    }));
    return name;
  };

  const folder1 = makeMock('story_mystery_1', 'mystery', 15000, 750, 82, ['cold case']);
  const folder2 = makeMock('story_mystery_2', 'mystery', 8000, 300, 40, ['vanished']);
  const folder3 = makeMock('story_horror_1', 'horror', 5000, 200, 25, ['haunting']);

  // Track 3 videos
  await feedback.trackVideo(folder1, { views: 15000, likes: 750, comments: 82 });
  await feedback.trackVideo(folder2, { views: 8000, likes: 300, comments: 40 });
  await feedback.trackVideo(folder3, { views: 5000, likes: 200, comments: 25 });

  // Basic tracking
  const history = feedback.readHistory();
  assert(history.videos.length >= 3, 'History has 3 tracked videos');

  // Tier assignment
  const flopEntry = await feedback.trackVideo(makeMock('flop_story', 'mystery', 500, 10, 0), { views: 500 });
  assert(flopEntry.tier === 'flop', '500 views = Flop tier');

  // Engagement rate
  assert(parseFloat(flopEntry.engagementRate) >= 0, 'Engagement rate is numeric');

  // Insights
  const insights = await feedback.getInsights();
  assert(insights !== null, 'Insights computed after tracking');
  assert(typeof insights.totalTracked === 'number', 'Insights has totalTracked');
  assert(Array.isArray(insights.genrePerformance), 'Insights has genrePerformance');
  assert(Array.isArray(insights.recommendations), 'Insights has recommendations');

  // Genre performance sorted
  if (insights.genrePerformance.length > 1) {
    const sorted = insights.genrePerformance.every((g, i, arr) =>
      i === 0 || arr[i - 1].avgViews >= g.avgViews
    );
    assert(sorted, 'Genre performance sorted by avgViews descending');
  }

  // Recommendations structure
  for (const rec of insights.recommendations) {
    assert(['genre', 'length', 'topic', 'general'].includes(rec.type), 'Recommendation type valid');
    assert(['high', 'medium', 'low'].includes(rec.priority), 'Recommendation priority valid');
    assert(typeof rec.message === 'string' && rec.message.length > 0, 'Recommendation message non-empty');
  }

  // Generation tips
  const tips = await feedback.getGenerationTips();
  assert(Array.isArray(tips), 'getGenerationTips returns array');

  // List tracked (just ensure it doesn't crash)
  try {
    await feedback.listTracked();
    assert(true, 'listTracked runs without error');
  } catch (e) {
    assert(false, 'listTracked runs without error');
  }

  cleanup();
  console.log(`\n${'='.repeat(40)}`);
  console.log(`📊 Analytics Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
