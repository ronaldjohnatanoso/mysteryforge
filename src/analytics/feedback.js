/**
 * MysteryForge Analytics Feedback Module
 * 
 * Tracks YouTube video performance and feeds insights back into story generation.
 * Stores metrics locally, analyzes patterns, and suggests optimizations.
 * 
 * Usage:
 *   const { trackVideo, getInsights } = require('./src/analytics/feedback');
 *   await trackVideo('output/story_folder', { views: 10000, likes: 500 });
 *   const insights = await getInsights();
 * 
 *   // CLI
 *   node src/analytics/feedback.js --track "folder" --views 10000 --likes 500
 *   node src/analytics/feedback.js --insights
 */

const fs = require('fs');
const path = require('path');

// Allow override for testing
const DATA_DIR = process.env.MYSTERYFORGE_ANALYTICS_DIR || path.join(__dirname, '../../output');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics_history.json');
const INSIGHTS_FILE = path.join(DATA_DIR, 'analytics_insights.json');

// Performance tiers
const VIEWS_TIERS = {
  flop: { max: 1000, label: 'Flop' },
  low: { max: 5000, label: 'Low' },
  average: { max: 15000, label: 'Average' },
  good: { max: 50000, label: 'Good' },
  viral: { max: Infinity, label: 'Viral' }
};

function getViewsTier(views) {
  for (const [key, tier] of Object.entries(VIEWS_TIERS)) {
    if (views <= tier.max) return { tier: key, label: tier.label };
  }
  return { tier: 'viral', label: 'Viral' };
}

function readHistory() {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { videos: [], lastUpdated: null };
}

function writeHistory(data) {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
}

function readInsights() {
  try {
    if (fs.existsSync(INSIGHTS_FILE)) {
      return JSON.parse(fs.readFileSync(INSIGHTS_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return null;
}

function writeInsights(data) {
  fs.writeFileSync(INSIGHTS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Track a video's performance metrics.
 */
async function trackVideo(storyFolder, metrics = {}) {
  const history = readHistory();
  
  const storyPath = path.join(DATA_DIR, storyFolder, 'story.json');
  let storyData = null;
  if (fs.existsSync(storyPath)) {
    storyData = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  }
  
  const entry = {
    storyFolder,
    trackedAt: new Date().toISOString(),
    views: metrics.views || 0,
    likes: metrics.likes || 0,
    comments: metrics.comments || 0,
    watchTimeHours: metrics.watchTimeHours || 0,
    ctr: metrics.ctr || 0, // Click-through rate %
    avgViewDuration: metrics.avgViewDuration || 0, // seconds
    genre: storyData?.genre || 'unknown',
    topic: storyData?.topic || 'unknown',
    length: storyData?.length_minutes || 0,
    segmentCount: storyData?.segment_count || 0,
    totalWords: storyData?.total_words || 0,
    trendingTopics: storyData?.trendingTopics || [],
    title: storyData?.title || storyFolder
  };
  
  // Add engagement rate
  if (entry.views > 0) {
    entry.engagementRate = ((entry.likes + entry.comments) / entry.views * 100).toFixed(2);
  } else {
    entry.engagementRate = 0;
  }
  
  // Add tier
  const { tier, label } = getViewsTier(entry.views);
  entry.tier = tier;
  entry.tierLabel = label;
  
  // Update or add entry
  const existingIdx = history.videos.findIndex(v => v.storyFolder === storyFolder);
  if (existingIdx >= 0) {
    history.videos[existingIdx] = { ...history.videos[existingIdx], ...entry };
  } else {
    history.videos.push(entry);
  }
  
  history.lastUpdated = new Date().toISOString();
  writeHistory(history);
  
  // Re-compute insights after tracking
  await computeInsights();
  
  console.log(`\n📊 Tracked: ${storyFolder}`);
  console.log(`   Views: ${entry.views.toLocaleString()} (${entry.tierLabel})`);
  console.log(`   Engagement: ${entry.engagementRate}%`);
  console.log(`   Genre: ${entry.genre}`);
  
  return entry;
}

/**
 * Compute and store insights from tracked data.
 */
async function computeInsights() {
  const history = readHistory();
  const videos = history.videos.filter(v => v.views > 0);
  
  if (videos.length < 2) {
    console.log('   (Need 2+ tracked videos for insights)');
    return null;
  }
  
  // Genre performance
  const genreStats = {};
  for (const v of videos) {
    if (!genreStats[v.genre]) {
      genreStats[v.genre] = { totalViews: 0, count: 0, avgEngagement: 0 };
    }
    genreStats[v.genre].totalViews += v.views;
    genreStats[v.genre].count++;
    genreStats[v.genre].avgEngagement += parseFloat(v.engagementRate || 0);
  }
  
  const genrePerformance = [];
  for (const [genre, stats] of Object.entries(genreStats)) {
    genrePerformance.push({
      genre,
      avgViews: Math.round(stats.totalViews / stats.count),
      avgEngagement: (stats.avgEngagement / stats.count).toFixed(2),
      count: stats.count
    });
  }
  genrePerformance.sort((a, b) => b.avgViews - a.avgViews);
  
  // Optimal story length
  const lengthStats = {};
  for (const v of videos) {
    const len = v.length || 0;
    if (!lengthStats[len]) lengthStats[len] = { views: 0, count: 0 };
    lengthStats[len].views += v.views;
    lengthStats[len].count++;
  }
  
  const bestLength = Object.entries(lengthStats)
    .map(([len, s]) => ({ length: parseFloat(len), avgViews: s.views / s.count }))
    .filter(l => l.count >= 1)
    .sort((a, b) => b.avgViews - a.avgViews)[0];
  
  // Top performing topics
  const topicStats = {};
  for (const v of videos) {
    for (const topic of (v.trendingTopics || [])) {
      if (!topicStats[topic]) topicStats[topic] = { views: 0, count: 0 };
      topicStats[topic].views += v.views;
      topicStats[topic].count++;
    }
  }
  
  const topTopics = Object.entries(topicStats)
    .map(([topic, s]) => ({ topic, avgViews: Math.round(s.views / s.count), count: s.count }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 10);
  
  // Word count correlation
  const avgWordCount = videos.reduce((sum, v) => sum + (v.totalWords || 0), 0) / videos.length;
  
  // Segment count correlation
  const avgSegments = videos.reduce((sum, v) => sum + (v.segmentCount || 0), 0) / videos.length;
  
  const insights = {
    computedAt: new Date().toISOString(),
    totalTracked: videos.length,
    avgViewsAll: Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length),
    genrePerformance,
    bestStoryLength: bestLength ? bestLength.length : 3,
    bestLengthAvgViews: bestLength ? Math.round(bestLength.avgViews) : 0,
    topTopics,
    avgWordCount: Math.round(avgWordCount),
    avgSegments: Math.round(avgSegments),
    // Recommendations
    recommendations: buildRecommendations(genrePerformance, bestLength, topTopics)
  };
  
  writeInsights(insights);
  return insights;
}

/**
 * Build actionable recommendations based on insights.
 */
function buildRecommendations(genrePerf, bestLength, topTopics) {
  const recs = [];
  
  if (genrePerf.length > 0) {
    const best = genrePerf[0];
    const worst = genrePerf[genrePerf.length - 1];
    if (best.avgViews > (worst.avgViews * 1.5)) {
      recs.push({
        type: 'genre',
        priority: 'high',
        message: `Genre "${best.genre}" averages ${best.avgViews.toLocaleString()} views — ${Math.round((best.avgViews / worst.avgViews - 1) * 100)}% more than "${worst.genre}". Prioritize ${best.genre} stories.`
      });
    }
  }
  
  if (bestLength && bestLength.avgViews > 0) {
    recs.push({
      type: 'length',
      priority: 'medium',
      message: `${bestLength.length}-minute stories perform best (avg ${Math.round(bestLength.avgViews).toLocaleString()} views).`
    });
  }
  
  if (topTopics.length > 0) {
    const topTopic = topTopics[0];
    recs.push({
      type: 'topic',
      priority: 'medium',
      message: `Trending topic "${topTopic.topic}" gets ${topTopic.avgViews.toLocaleString()} avg views. Incorporate into future stories.`
    });
  }
  
  recs.push({
    type: 'general',
    priority: 'low',
    message: 'Track 5+ videos for more reliable insights. Watch time and CTR are better success indicators than raw views.'
  });
  
  return recs;
}

/**
 * Get stored insights.
 */
async function getInsights() {
  const insights = readInsights();
  if (!insights) {
    // Try computing from history
    return await computeInsights();
  }
  
  const age = Date.now() - new Date(insights.computedAt).getTime();
  if (age > 60 * 60 * 1000) {
    // Stale — recompute
    return await computeInsights();
  }
  
  return insights;
}

/**
 * Get generation tips based on analytics insights.
 * Used by pipeline.js to optimize story generation.
 */
async function getGenerationTips() {
  const insights = await getInsights();
  if (!insights || !insights.recommendations) {
    return null;
  }
  
  const tips = [];
  for (const rec of insights.recommendations) {
    if (rec.priority === 'high' || rec.priority === 'medium') {
      tips.push(rec.message);
    }
  }
  
  return tips;
}

/**
 * List all tracked videos with their performance.
 */
async function listTracked() {
  const history = readHistory();
  const videos = history.videos
    .filter(v => v.views > 0)
    .sort((a, b) => b.views - a.views);
  
  if (videos.length === 0) {
    console.log('\n📊 No tracked videos yet.');
    console.log('   Track a video: node src/analytics/feedback.js --track "folder" --views 10000\n');
    return;
  }
  
  console.log(`\n📊 Tracked Videos (${videos.length} total)\n`);
  console.log('   Views      Eng%   Genre      Length  Folder');
  console.log('   --------  ------  ---------  ------  ------------------');
  
  for (const v of videos) {
    const views = String(v.views).padStart(8);
    const eng = String(v.engagementRate + '%').padStart(6);
    const genre = v.genre.padEnd(9);
    const len = String(v.length + 'm').padStart(5);
    const folder = v.storyFolder.substring(0, 30);
    console.log(`   ${views}  ${eng}  ${genre}  ${len}  ${folder}`);
  }
  
  console.log(`\n   Last updated: ${history.lastUpdated || 'never'}`);
}

/**
 * Print insights to console.
 */
async function printInsights() {
  const insights = await getInsights();
  
  if (!insights || insights.totalTracked < 2) {
    console.log('\n📊 Not enough data for insights yet.');
    console.log('   Track 2+ videos to see recommendations.');
    console.log('   Usage: node src/analytics/feedback.js --track "folder" --views 10000\n');
    return;
  }
  
  console.log(`\n📊 Analytics Insights (${insights.totalTracked} videos tracked)`);
  console.log(`   Computed: ${insights.computedAt}\n`);
  
  console.log(`   Avg Views (all): ${insights.avgViewsAll.toLocaleString()}`);
  console.log(`   Best Length: ${insights.bestStoryLength}m (avg ${insights.bestLengthAvgViews.toLocaleString()} views)\n`);
  
  console.log('   Genre Performance:');
  for (const g of insights.genrePerformance) {
    console.log(`     ${g.genre.padEnd(10)} — avg ${g.avgViews.toLocaleString()} views, ${g.avgEngagement}% engagement (${g.count} videos)`);
  }
  
  if (insights.topTopics.length > 0) {
    console.log('\n   Top Trending Topics:');
    for (const t of insights.topTopics.slice(0, 5)) {
      console.log(`     "${t.topic}" — avg ${t.avgViews.toLocaleString()} views`);
    }
  }
  
  if (insights.recommendations?.length > 0) {
    console.log('\n   💡 Recommendations:');
    for (const r of insights.recommendations) {
      const icon = r.priority === 'high' ? '🔴' : r.priority === 'medium' ? '🟡' : '🟢';
      console.log(`     ${icon} ${r.message}`);
    }
  }
  
  console.log();
}

/**
 * CLI
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    track: args.includes('--track'),
    folder: args.includes('--folder') ? args[args.indexOf('--folder') + 1] : (args.includes('--track') ? args[args.indexOf('--track') + 1] : null),
    views: args.includes('--views') ? parseInt(args[args.indexOf('--views') + 1]) : null,
    likes: args.includes('--likes') ? parseInt(args[args.indexOf('--likes') + 1]) : null,
    comments: args.includes('--comments') ? parseInt(args[args.indexOf('--comments') + 1]) : null,
    ctr: args.includes('--ctr') ? parseFloat(args[args.indexOf('--ctr') + 1]) : null,
    insights: args.includes('--insights'),
    list: args.includes('--list'),
    all: args.includes('--all')
  };
}

async function main() {
  const opts = parseArgs();
  
  console.log(`\n📊 MysteryForge Analytics\n`);
  
  if (opts.insights) {
    await printInsights();
    return;
  }
  
  if (opts.list) {
    await listTracked();
    return;
  }
  
  if (opts.track && opts.folder) {
    const metrics = {};
    if (opts.views !== null) metrics.views = opts.views;
    if (opts.likes !== null) metrics.likes = opts.likes;
    if (opts.comments !== null) metrics.comments = opts.comments;
    if (opts.ctr !== null) metrics.ctr = opts.ctr;
    
    await trackVideo(opts.folder, metrics);
    
    // Also print current insights
    await printInsights();
    return;
  }
  
  // Default: show insights summary
  await printInsights();
  console.log('   Usage:');
  console.log('     node src/analytics/feedback.js --track "folder" --views 10000 --likes 500');
  console.log('     node src/analytics/feedback.js --insights');
  console.log('     node src/analytics/feedback.js --list\n');
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = {
  trackVideo,
  getInsights,
  getGenerationTips,
  listTracked: async () => listTracked(),
  printInsights: async () => printInsights(),
  readHistory,
  readInsights
};
