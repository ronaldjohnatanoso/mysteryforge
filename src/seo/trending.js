/**
 * MysteryForge Trending Topics Module
 * 
 * Fetches trending topics/keywords and integrates them into story prompts.
 * Caches results to avoid hammering free APIs.
 * 
 * Usage:
 *   const { getTrendingTopics } = require('./src/seo/trending');
 *   const topics = await getTrendingTopics('mystery');
 * 
 *   const { injectTrendingIntoPrompt } = require('./src/seo/trending');
 *   const prompt = injectTrendingIntoPrompt('mystery revenge story', topics);
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../../.trending_cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Genre-to-search-term mapping for trending discovery
const GENRE_SEARCH_TERMS = {
  mystery: ['true crime', 'unsolved mystery', 'creepy story', 'missing person', 'cold case'],
  horror: ['horror story', 'creepypasta', 'scary true story', 'paranormal', 'haunting'],
  revenge: ['revenge story', 'karma', 'justice served', 'petty revenge', 'instant karma'],
  confession: ['confession', 'dark secret', 'true confession', 'buried secrets', 'anonymous story']
};

/**
 * Read trending cache
 */
function readCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      const cache = JSON.parse(raw);
      return cache;
    }
  } catch (e) { /* ignore */ }
  return { topics: [], fetchedAt: null };
}

/**
 * Write trending cache
 */
function writeCache(data) {
  try {
    const cache = {
      topics: data.topics || [],
      fetchedAt: new Date().toISOString(),
      genres: data.genres || {}
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.warn('⚠️  Could not write trending cache:', e.message);
  }
}

/**
 * Check if cache is still fresh
 */
function isCacheFresh() {
  const cache = readCache();
  if (!cache.fetchedAt) return false;
  const age = Date.now() - new Date(cache.fetchedAt).getTime();
  return age < CACHE_TTL_MS;
}

/**
 * Fetch trending topics from free Google Trends data endpoint.
 * Uses the SerpAPI free tier or falls back to curated lists.
 */
async function fetchGoogleTrends(searchTerm) {
  // SerpAPI free endpoint (no key needed for basic Google Trends)
  // Fallback: use a curated list of trending crime/mystery terms
  // since Google doesn't have a free public Trends API.
  // We simulate with high-engagement search terms.
  
  const { execSync } = require('child_process');
  
  // Try using curl to fetch Google Trends RSS (unofficial but works)
  // This gives us trending searches in a category
  try {
    const url = `https://trends.google.com/trends/trendingsearches/realtime/rss?category=${encodeURIComponent(searchTerm)}&geo=US`;
    const res = execSync(`curl -s -L "${url}" --max-time 10`, { encoding: 'utf8', stdio: 'pipe' });
    
    // Parse XML for title entries
    const titles = [];
    const matches = res.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g);
    for (const match of matches) {
      const title = match[1].replace(/<[^>]+>/g, '').trim();
      if (title && !title.includes('Searches related to') && title.length > 3) {
        titles.push(title);
      }
    }
    
    if (titles.length > 0) {
      return titles.slice(0, 8);
    }
  } catch (e) {
    // Google Trends RSS failed, continue to fallback
  }
  
  return null;
}

/**
 * Get trending topics for a genre.
 * Returns cached results if fresh, otherwise fetches fresh data.
 */
async function getTrendingTopics(genre = 'mystery', forceRefresh = false) {
  if (!forceRefresh && isCacheFresh()) {
    const cache = readCache();
    const genreTopics = cache.genres?.[genre];
    if (genreTopics && genreTopics.length > 0) {
      console.log(`   📊 Trending (cached): ${genreTopics.slice(0, 3).join(', ')}`);
      return genreTopics;
    }
  }
  
  console.log(`   📊 Fetching trending topics for "${genre}"...`);
  
  const searchTerms = GENRE_SEARCH_TERMS[genre] || GENRE_SEARCH_TERMS.mystery;
  let allTopics = [];
  
  for (const term of searchTerms.slice(0, 2)) {
    const topics = await fetchGoogleTrends(term);
    if (topics && topics.length > 0) {
      allTopics.push(...topics);
    }
  }
  
  // Fallback curated topics if API fails (always available)
  const fallbackTopics = getFallbackTopics(genre);
  
  if (allTopics.length === 0) {
    console.log(`   📊 Using curated topics: ${fallbackTopics.slice(0, 3).join(', ')}`);
    allTopics = fallbackTopics;
  } else {
    // Deduplicate and limit
    allTopics = [...new Set(allTopics)].slice(0, 10);
    console.log(`   📊 Trending: ${allTopics.slice(0, 3).join(', ')}`);
  }
  
  // Update cache
  const cache = readCache();
  cache.genres = cache.genres || {};
  cache.genres[genre] = allTopics;
  cache.topics = allTopics;
  cache.fetchedAt = new Date().toISOString();
  writeCache(cache);
  
  return allTopics;
}

/**
 * Curated fallback topics — high-engagement mystery/horror/revenge themes
 * These are used when Google Trends is unavailable.
 */
function getFallbackTopics(genre) {
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  
  const topics = {
    mystery: [
      `disappearance in ${month}`,
      'cold case breakthrough',
      'true crime investigation',
      'missing person found',
      'cryptic online mystery',
      'vanished without a trace',
      'underground secret discovered',
      '48-hour mystery solved',
      'the case they couldn\'t close',
      'internet mystery solved'
    ],
    horror: [
      'things in the walls',
      'the sound next door',
      'night visitor survived',
      'couldn\'t explain what i saw',
      'the mirror lied',
      'basement wasn\'t empty',
      'neighbor returned wrong',
      'the call came from inside',
      'something in the woods',
      'when the lights went out'
    ],
    revenge: [
      'the payback plan',
      'what goes around comes around',
      'served cold',
      'finally got even',
      'the long game payoff',
      'when karma hit back',
      'crossed the wrong person',
      'the scheme that worked',
      'petty but perfect',
      'worth the wait'
    ],
    confession: [
      'i\'ve never told anyone this',
      'the secret i buried',
      'darkest confession',
      'what i did in the dark',
      'guilt that won\'t leave',
      'the truth finally surfaced',
      'carrying this for years',
      'anonymous confession',
      'couldn\'t take it anymore',
      'the moment it all came out'
    ]
  };
  
  return topics[genre] || topics.mystery;
}

/**
 * Inject trending topics into a story prompt.
 * Returns enhanced prompt with trending hooks/keywords.
 */
function injectTrendingIntoPrompt(prompt, genre, trendingTopics = []) {
  if (!trendingTopics || trendingTopics.length === 0) {
    return prompt;
  }
  
  // Pick 1-2 random trending topics to inject
  const picks = trendingTopics.slice(0, 3);
  const injected = picks.map(t => `topic: "${t}"`).join(', ');
  
  // Inject as a hint in the prompt
  const enhancedPrompt = `${prompt}

Trending hooks to optionally incorporate (pick one if it fits):
${injected}`;
  
  return enhancedPrompt;
}

/**
 * Tag a story with the trending topics used/related.
 */
function tagStoryWithTrending(storyData, trendingTopics) {
  if (!trendingTopics || trendingTopics.length === 0) return storyData;
  
  // Simple keyword overlap: which trending topics appear in the story
  const storyText = (storyData.story || '').toLowerCase();
  const matched = trendingTopics.filter(t => 
    storyText.includes(t.toLowerCase().split(' ')[0])
  );
  
  return {
    ...storyData,
    trendingTopics: matched.length > 0 ? matched : trendingTopics.slice(0, 2),
    generatedWithTrending: true
  };
}

/**
 * CLI entry point
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    genre: args.includes('--genre') ? args[args.indexOf('--genre') + 1] : 'mystery',
    refresh: args.includes('--refresh'),
    inject: args.includes('--inject'),
    list: args.includes('--list')
  };
}

async function main() {
  const opts = parseArgs();
  
  console.log(`\n📊 MysteryForge Trending Topics\n`);
  
  if (opts.list) {
    const cache = readCache();
    if (!cache.genres) {
      console.log('No cached topics. Run with --genre to fetch.');
    } else {
      console.log(`Cached at: ${cache.fetchedAt}\n`);
      for (const [genre, topics] of Object.entries(cache.genres)) {
        console.log(`  ${genre}: ${topics.slice(0, 5).join(', ')}`);
      }
    }
    process.exit(0);
  }
  
  const topics = await getTrendingTopics(opts.genre, opts.refresh);
  
  console.log(`\n🔥 Top trending for "${opts.genre}":`);
  topics.slice(0, 5).forEach((t, i) => {
    console.log(`   ${i + 1}. ${t}`);
  });
  
  if (opts.inject) {
    const examplePrompt = `a ${opts.genre} story about betrayal`;
    const enhanced = injectTrendingIntoPrompt(examplePrompt, opts.genre, topics);
    console.log(`\n📝 Enhanced prompt:\n   ${enhanced}`);
  }
  
  console.log(`\n💡 Use trending topics in generation:`);
  console.log(`   node pipeline.js --genre ${opts.genre} --trending`);
  console.log(`   node src/seo/trending.js --genre ${opts.genre} --inject\n`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = {
  getTrendingTopics,
  injectTrendingIntoPrompt,
  tagStoryWithTrending,
  getFallbackTopics,
  isCacheFresh
};
