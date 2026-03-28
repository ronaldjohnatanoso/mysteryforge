/**
 * SEO Optimizer Tests
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { SEOOptimizer } = require('../src/seo/optimizer');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   ${e.message}`);
    failed++;
  }
}

function assertContains(str, substr, msg) {
  if (!str.includes(substr)) {
    throw new Error(`${msg}: "${str}" does not contain "${substr}"`);
  }
}

function assertLength(str, max, msg) {
  if (str.length > max) {
    throw new Error(`${msg}: "${str.substring(0, 50)}..." exceeds ${max} chars (${str.length})`);
  }
}

// Sample story for testing
const sampleStory = {
  title: 'the_forgotten_basement',
  genre: 'mystery',
  story: 'I was exploring the old house when I found the basement. The basement had been sealed for fifty years. My grandfather warned me never to go down there. The dust was thick and undisturbed. In the corner sat a small wooden box. Inside the box was a collection of photographs. Each photograph showed a different person. They all had one thing in common — they were all smiling. But something was wrong with their eyes. I recognized one of the faces. It was my grandmother. She died in 1985. But in this photograph, she looked exactly as I remembered her. The date on the back of the photograph read: March 3rd, 2024.',
  segments: [
    { text: 'I was exploring the old house when I found the basement.', image_prompt: 'old house basement dark', isCharacterShot: false },
    { text: 'The basement had been sealed for fifty years.', image_prompt: 'sealed basement dust', isCharacterShot: false },
    { text: 'My grandfather warned me never to go down there.', image_prompt: 'old man warning gesture', isCharacterShot: true },
    { text: 'The dust was thick and undisturbed.', image_prompt: 'thick dust disturbed', isCharacterShot: false },
    { text: 'In the corner sat a small wooden box.', image_prompt: 'wooden box corner', isCharacterShot: false },
    { text: 'Inside the box was a collection of photographs.', image_prompt: 'old photographs collection', isCharacterShot: true },
    { text: 'Each photograph showed a different person.', image_prompt: 'different people photos', isCharacterShot: false },
    { text: 'They all had one thing in common — they were all smiling.', image_prompt: 'people smiling', isCharacterShot: false },
    { text: 'But something was wrong with their eyes.', image_prompt: 'disturbing eyes', isCharacterShot: true },
    { text: 'I recognized one of the faces. It was my grandmother.', image_prompt: 'elderly woman portrait', isCharacterShot: true }
  ]
};

console.log('\n🔍 SEO Optimizer Tests\n');

test('SEOOptimizer generates title', () => {
  const optimizer = new SEOOptimizer(sampleStory);
  const seo = optimizer.optimize();
  assert(seo.title.length > 0, 'Title should not be empty');
  assertLength(seo.title, 100, 'Title should be <= 100 chars');
});

test('SEOOptimizer generates description', () => {
  const optimizer = new SEOOptimizer(sampleStory);
  const seo = optimizer.optimize();
  assert(seo.description.length > 50, 'Description should be substantial');
  assertContains(seo.description, 'basement', 'Description should reference story content');
});

test('SEOOptimizer generates tags', () => {
  const optimizer = new SEOOptimizer(sampleStory);
  const seo = optimizer.optimize();
  assert(Array.isArray(seo.tags), 'Tags should be an array');
  assert(seo.tags.length > 3, 'Should have multiple tags');
  assert(seo.tags.includes('mystery'), 'Should include genre tag');
});

test('SEOOptimizer respects genre', () => {
  const horrorStory = { ...sampleStory, genre: 'horror' };
  const optimizer = new SEOOptimizer(horrorStory);
  const seo = optimizer.optimize();
  assertContains(seo.tags.join(' '), 'horror', 'Tags should include horror');
});

test('SEOOptimizer generates click-worthy title', () => {
  const optimizer = new SEOOptimizer(sampleStory);
  const title = optimizer.generateTitle();
  // Title should not just be the story text - should be optimized
  assert(title.length > 0, 'Title should exist');
  assertLength(title, 100, 'Title must be <= 100 chars');
});

test('SEOOptimizer handles empty story gracefully', () => {
  const emptyStory = { genre: 'mystery', story: '', segments: [] };
  const optimizer = new SEOOptimizer(emptyStory);
  const seo = optimizer.optimize();
  assert(seo.title.length > 0, 'Should still generate a title');
  assert(seo.description.length > 0, 'Should still generate a description');
});

test('SEOOptimizer generates valid description with CTA', () => {
  const optimizer = new SEOOptimizer(sampleStory);
  const seo = optimizer.optimize();
  const ctas = ['Subscribe', 'Like', 'Comment', 'Watch'];
  const hasCta = ctas.some(c => seo.description.includes(c));
  assert(hasCta, 'Description should include a call-to-action');
});

test('SEOOptimizer extracts entities', () => {
  const optimizer = new SEOOptimizer(sampleStory);
  const entities = optimizer.extractEntities();
  assert(entities.names.length > 0, 'Should extract names');
  assert(entities.places.length > 0, 'Should extract places');
});

test('SEOOptimizer genre-specific tags', () => {
  const genres = ['mystery', 'horror', 'revenge', 'confession'];
  
  for (const genre of genres) {
    const story = { ...sampleStory, genre };
    const optimizer = new SEOOptimizer(story);
    const seo = optimizer.optimize();
    assert(seo.tags.includes(genre), `${genre} tag should be present`);
  }
});

test('SEOOptimizer category mapping', () => {
  const optimizer = new SEOOptimizer(sampleStory);
  const seo = optimizer.optimize();
  assert(['22', '24'].includes(seo.category), 'Category should be valid YouTube category ID');
});

test('SEOOptimizer title templates vary', () => {
  const titles = new Set();
  for (let i = 0; i < 10; i++) {
    const optimizer = new SEOOptimizer(sampleStory);
    titles.add(optimizer.generateTitle());
  }
  // Some variety expected (not all same title)
  assert(titles.size > 1, 'Should generate varied titles');
});

console.log(`\n========================================`);
console.log(`📊 SEO Test Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

process.exit(failed > 0 ? 1 : 0);
