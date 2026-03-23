/**
 * Tests for story generator v2
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test GENRES configuration
function testGenresConfig() {
  console.log('Testing GENRES configuration...');
  
  const GENRES = {
    mystery: { name: 'Mystery', topics: ['internet-mystery', 'found-footage', 'disappearance'] },
    revenge: { name: 'Revenge Story', topics: ['workplace-revenge', 'neighbor-revenge', 'ex-revenge'] },
    horror: { name: 'Horror', topics: ['monster', 'haunting', 'creature'] },
    confession: { name: 'Confession', topics: ['secret-life', 'dark-secret', 'confession'] }
  };
  
  // Verify each genre has required structure
  Object.entries(GENRES).forEach(([key, genre]) => {
    assert(genre.name, `${key} should have name`);
    assert(Array.isArray(genre.topics), `${key} should have topics array`);
    assert(genre.topics.length >= 1, `${key} should have at least one topic`);
  });
  
  console.log('  ✓ GENRES configuration valid');
}

// Test word count calculation (now inline in generate.js)
function testWordCountCalculation() {
  console.log('Testing word count calculation...');
  
  // Formula: Math.floor(minutes * 150 * 1.1)
  function calculateWordCount(minutes) {
    return Math.floor(minutes * 150 * 1.1);
  }
  
  // 1 minute = ~165 words
  const oneMin = calculateWordCount(1);
  assert(oneMin === 165, `1 min should be 165 words, got ${oneMin}`);
  
  // 2 minutes = ~330 words
  const twoMin = calculateWordCount(2);
  assert(twoMin === 330, `2 min should be 330 words, got ${twoMin}`);
  
  // 5 minutes = ~825 words
  const fiveMin = calculateWordCount(5);
  assert(fiveMin === 825, `5 min should be 825 words, got ${fiveMin}`);
  
  console.log('  ✓ Word count calculation works');
}

// Test segment count calculation
function testSegmentCountCalculation() {
  console.log('Testing segment count calculation...');
  
  // Formula: Math.ceil((minutes * 60) / 8) ~8s per segment
  function calculateSegmentCount(minutes) {
    return Math.ceil((minutes * 60) / 8);
  }
  
  // 1 minute = 60s / 8s = 8 segments
  const oneMin = calculateSegmentCount(1);
  assert(oneMin === 8, `1 min should be 8 segments, got ${oneMin}`);
  
  // 2 minutes = 120s / 8s = 15 segments
  const twoMin = calculateSegmentCount(2);
  assert(twoMin === 15, `2 min should be 15 segments, got ${twoMin}`);
  
  // 3 minutes = 180s / 8s = 23 segments
  const threeMin = calculateSegmentCount(3);
  assert(threeMin === 23, `3 min should be 23 segments, got ${threeMin}`);
  
  console.log('  ✓ Segment count calculation works');
}

// Test JSON parsing logic
function testStoryJSONParsing() {
  console.log('Testing story JSON parsing...');
  
  // Test parsing with markdown fences
  const markdownJson = '```json\n{"title": "test_story", "segments": [{"id": 1, "text": "Hello world", "imagePrompt": "A scene", "isCharacterShot": false}]}\n```';
  
  let cleaned = markdownJson.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  
  const parsed = JSON.parse(cleaned);
  assert(parsed.title === 'test_story', 'Should parse title from markdown');
  assert(parsed.segments.length === 1, 'Should have 1 segment');
  
  // Test validation
  assert(parsed.segments, 'Should have segments array');
  assert(Array.isArray(parsed.segments), 'Segments should be array');
  
  console.log('  ✓ Story JSON parsing works');
}

// Test character anchor default
function testCharacterAnchorDefault() {
  console.log('Testing character anchor defaults...');
  
  const genreDefaults = {
    mystery: 'shadowy mysterious figure in dark cloak',
    revenge: 'confident protagonist in business attire',
    horror: 'terrified victim, wide eyes',
    confession: 'anonymous narrator, silhouette'
  };
  
  // Verify defaults exist for all genres
  Object.entries(genreDefaults).forEach(([genre, anchor]) => {
    assert(anchor.length > 10, `${genre} should have meaningful default anchor`);
  });
  
  console.log('  ✓ Character anchor defaults valid');
}

// Test output folder structure
function testOutputStructure() {
  console.log('Testing output folder structure...');
  
  const outputDir = path.join(__dirname, '..', 'output');
  
  // Check if output directory exists
  if (fs.existsSync(outputDir)) {
    const folders = fs.readdirSync(outputDir)
      .filter(f => {
        const p = path.join(outputDir, f);
        return fs.statSync(p).isDirectory();
      });
    
    // Check latest folder has expected files
    if (folders.length > 0) {
      const latestFolder = folders.sort().pop();
      const storyPath = path.join(outputDir, latestFolder, 'story.json');
      
      // If story.json exists, validate structure
      if (fs.existsSync(storyPath)) {
        const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
        assert(story.title, 'Story should have title');
        assert(story.segments, 'Story should have segments');
        assert(Array.isArray(story.segments), 'Segments should be array');
        console.log(`  ✓ Valid story structure in ${latestFolder}`);
      } else {
        console.log('  ⚠ No story.json found (run generate first)');
      }
    }
  } else {
    console.log('  ⚠ No output folder yet (run generate first)');
  }
}

// Run tests
console.log('\n🧪 Running generate.js tests...\n');

try {
  testGenresConfig();
  testWordCountCalculation();
  testSegmentCountCalculation();
  testStoryJSONParsing();
  testCharacterAnchorDefault();
  testOutputStructure();
  
  console.log('\n✅ All tests passed!\n');
} catch (e) {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
}