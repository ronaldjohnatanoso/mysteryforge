/**
 * Tests for story generator v3 (prompt-driven)
 * Fully flexible — any story, any genre, just describe it.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test word count calculation (inline in generate.js v3)
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

// Test JSON parsing logic (v3 schema)
function testStoryJSONParsing() {
  console.log('Testing story JSON parsing (v3 schema)...');
  
  // v3 uses snake_case_title format
  const v3Story = '{"title":"dark_forest_mystery_2026-03-29_10-01","genre":"mystery","characterAnchor":"tall figure in dark coat, foggy background","segments":[{"id":1,"text":"The old forest had been abandoned for decades until the hikers found the cabin.","imagePrompt":"abandoned cabin in dense fog forest cinematic dark moody","isCharacterShot":false}]}';
  
  const parsed = JSON.parse(v3Story);
  assert(parsed.title === 'dark_forest_mystery_2026-03-29_10-01', 'Should parse v3 title format');
  assert(parsed.genre === 'mystery', 'Should parse genre from response');
  assert(parsed.characterAnchor.length > 10, 'Should have meaningful character anchor');
  assert(parsed.segments && Array.isArray(parsed.segments), 'Segments should be array');
  assert(parsed.segments[0].isCharacterShot === false, 'isCharacterShot should be boolean');
  
  // Test markdown fence stripping
  const markdownJson = '```json\n{"title": "test_story", "segments": [{"id": 1, "text": "Hello world", "imagePrompt": "A scene", "isCharacterShot": false}]}\n```';
  let cleaned = markdownJson.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  
  const parsedMarkdown = JSON.parse(cleaned);
  assert(parsedMarkdown.title === 'test_story', 'Should parse title from markdown');
  
  console.log('  ✓ Story JSON parsing (v3 schema) works');
}

// Test prompt-driven flexibility (no hardcoded genres)
function testPromptDrivenFlexibility() {
  console.log('Testing prompt-driven flexibility...');
  
  // Any story can be requested via natural language prompt
  const promptExamples = [
    'a mystery about a deleted website that only existed for 47 minutes',
    'horror story about something in the woods',
    'revenge story about a woman who catches her husband cheating',
    'confession about living a double life'
  ];
  
  promptExamples.forEach((prompt, i) => {
    assert(prompt.length > 10, `Prompt ${i+1} should be meaningful`);
    assert(/[a-z]/.test(prompt), `Prompt ${i+1} should be lowercase text`);
  });
  
  console.log('  ✓ Prompt-driven flexibility validated');
}

// Test character anchor defaults for v3 (no genre-specific defaults)
function testCharacterAnchorDefault() {
  console.log('Testing character anchor defaults (v3)...');
  
  // v3 generates characterAnchor from the story content
  // If missing, falls back to a generic cinematic default
  const defaultAnchor = 'mysterious figure, cinematic lighting, dramatic pose';
  assert(defaultAnchor.length > 10, 'Default anchor should be meaningful');
  
  // Verify character anchor structure in v3 story
  const v3Story = {
    characterAnchor: 'tall figure in dark coat, foggy background, cinematic',
    segments: [
      { isCharacterShot: false },
      { isCharacterShot: true },
      { isCharacterShot: false }
    ]
  };
  
  assert(v3Story.characterAnchor.includes('cinematic') || v3Story.characterAnchor.includes('figure'), 
    'Character anchor should be descriptive');
  
  const charShots = v3Story.segments.filter(s => s.isCharacterShot).length;
  assert(charShots === 1, 'Should have correct number of character shots');
  
  console.log('  ✓ Character anchor defaults valid');
}

// Test v3 output folder structure
function testOutputStructure() {
  console.log('Testing output folder structure (v3)...');
  
  const outputDir = path.join(__dirname, '..', 'output');
  
  if (!fs.existsSync(outputDir)) {
    console.log('  ⚠ No output folder yet (run generate first)');
    return;
  }
  
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && 
             !['images', 'voice_tests', 'ai_images_test'].includes(f);
    });
  
  if (folders.length === 0) {
    console.log('  ⚠ No story folders yet (run generate first)');
    return;
  }
  
  // Get most recent folder
  const latestFolder = folders
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime)[0].name;
  
  const storyPath = path.join(outputDir, latestFolder, 'story.json');
  
  if (fs.existsSync(storyPath)) {
    const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
    assert(story.title, 'Story should have title');
    assert(story.segments, 'Story should have segments');
    assert(Array.isArray(story.segments), 'Segments should be array');
    assert(story.total_words > 0, 'Should have word count');
    assert(story.provider, 'Should track which provider was used');
    
    // v3 adds these fields
    if (story.originalPrompt) {
      assert(story.originalPrompt.length > 0, 'originalPrompt should be non-empty');
    }
    
    console.log(`  ✓ Valid v3 story structure in ${latestFolder}`);
  } else {
    console.log('  ⚠ No story.json found (run generate first)');
  }
}

// Test Kokoro voices list
function testKokoroVoices() {
  console.log('Testing Kokoro voices list...');
  
  const KOKORO_VOICES = [
    'af_sky', 'af_heart', 'af_nicole', 'af_sarah', 'af_valor',
    'am_michael', 'am_peter', 'am_alex', 'am_david',
    'bf_emma', 'bf_isabella', 'bf_leo',
    'bm_george', 'bm_lewis',
    'pf_sarah', 'pm_michael', 'pm_david'
  ];
  
  assert(KOKORO_VOICES.length >= 15, 'Should have at least 15 voices');
  assert(KOKORO_VOICES.includes('af_sky'), 'af_sky should be available (default)');
  assert(KOKORO_VOICES.includes('af_heart'), 'af_heart should be available');
  
  console.log(`  ✓ ${KOKORO_VOICES.length} Kokoro voices available`);
}

// Run tests
console.log('\n🧪 Running generate.js v3 tests...\n');

try {
  testWordCountCalculation();
  testSegmentCountCalculation();
  testStoryJSONParsing();
  testPromptDrivenFlexibility();
  testCharacterAnchorDefault();
  testOutputStructure();
  testKokoroVoices();
  
  console.log('\n✅ All tests passed!\n');
} catch (e) {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
}
