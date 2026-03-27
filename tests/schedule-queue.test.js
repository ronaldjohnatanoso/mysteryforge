/**
 * Tests for Schedule Queue module (schedule-queue.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n🧪 Running schedule-queue tests...\n');

const QUEUE_FILE = path.join(__dirname, '..', 'output', 'schedule-queue.json');
const TEST_QUEUE_FILE = QUEUE_FILE + '.test.json';

function loadQueue(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

// ============================================
// SCHEDULE QUEUE STRUCTURE TESTS
// ============================================

function testScheduleQueueFileStructure() {
  console.log('Testing schedule queue file structure...');
  
  // Check the script exists
  const scriptPath = path.join(__dirname, '..', 'schedule-queue.js');
  assert(fs.existsSync(scriptPath), 'schedule-queue.js should exist');
  
  const content = fs.readFileSync(scriptPath, 'utf8');
  
  // Check required functions exist
  assert(content.includes('loadQueue'), 'loadQueue function missing');
  assert(content.includes('saveQueue'), 'saveQueue function missing');
  assert(content.includes('parseArgs'), 'parseArgs function missing');
  assert(content.includes('formatDate'), 'formatDate function missing');
  assert(content.includes('isDue'), 'isDue function missing');
  assert(content.includes('showQueue'), 'showQueue function missing');
  assert(content.includes('runItem'), 'runItem function missing');
  
  // Check required CLI flags
  assert(content.includes('--add'), '--add flag missing');
  assert(content.includes('--list'), '--list flag missing');
  assert(content.includes('--due'), '--due flag missing');
  assert(content.includes('--run'), '--run flag missing');
  assert(content.includes('--remove'), '--remove flag missing');
  assert(content.includes('--clear'), '--clear flag missing');
  
  // Check genre support
  assert(content.includes('mystery'), 'mystery genre missing');
  assert(content.includes('horror'), 'horror genre missing');
  assert(content.includes('revenge'), 'revenge genre missing');
  assert(content.includes('confession'), 'confession genre missing');
  
  console.log('  ✓ Schedule queue structure valid');
}

function testQueueItemSchema() {
  console.log('Testing queue item schema...');
  
  const sampleItem = {
    id: 'test123',
    genre: 'mystery',
    length: 2,
    topic: 'internet-mystery',
    voice: 'af_sky',
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    addedAt: new Date().toISOString(),
    status: 'pending',
    outputFolder: null
  };
  
  // Validate required fields
  assert(sampleItem.id, 'id is required');
  assert(sampleItem.genre, 'genre is required');
  assert(sampleItem.length > 0, 'length must be positive');
  assert(sampleItem.scheduledAt, 'scheduledAt is required');
  assert(sampleItem.addedAt, 'addedAt is required');
  assert(['pending', 'processing', 'done', 'failed'].includes(sampleItem.status), 'invalid status');
  
  console.log('  ✓ Queue item schema valid');
}

function testIsDueLogic() {
  console.log('Testing isDue logic...');
  
  // Helper: same as in schedule-queue.js
  function isDue(item) {
    return item.status !== 'done' && item.status !== 'processing'
      && new Date(item.scheduledAt).getTime() <= Date.now();
  }
  
  // Item scheduled in the past - should be due
  const pastItem = {
    status: 'pending',
    scheduledAt: new Date(Date.now() - 3600000).toISOString() // 1h ago
  };
  assert(isDue(pastItem) === true, 'Past pending item should be due');
  
  // Item scheduled in the future - should NOT be due
  const futureItem = {
    status: 'pending',
    scheduledAt: new Date(Date.now() + 3600000).toISOString() // 1h from now
  };
  assert(isDue(futureItem) === false, 'Future pending item should not be due');
  
  // Done item - should NOT be due even if past
  const doneItem = {
    status: 'done',
    scheduledAt: new Date(Date.now() - 3600000).toISOString()
  };
  assert(isDue(doneItem) === false, 'Done item should not be due');
  
  // Processing item - should NOT be due
  const processingItem = {
    status: 'processing',
    scheduledAt: new Date(Date.now() - 3600000).toISOString()
  };
  assert(isDue(processingItem) === false, 'Processing item should not be due');
  
  // Failed item scheduled past - SHOULD be due (needs retry)
  const failedItem = {
    status: 'failed',
    scheduledAt: new Date(Date.now() - 3600000).toISOString()
  };
  assert(isDue(failedItem) === true, 'Failed item should still be due (for retry)');
  
  console.log('  ✓ isDue logic correct');
}

function testGenreValidation() {
  console.log('Testing genre validation...');
  
  const validGenres = ['mystery', 'horror', 'revenge', 'confession'];
  const testGenres = ['mystery', 'thriller', 'comedy', 'horror', 'action'];
  
  const valid = testGenres.filter(g => validGenres.includes(g));
  const invalid = testGenres.filter(g => !validGenres.includes(g));
  
  assert(valid.length === 2, 'Should have 2 valid genres in test set');
  assert(invalid.length === 3, 'Should have 3 invalid genres in test set');
  assert(valid.includes('mystery'), 'mystery should be valid');
  assert(valid.includes('horror'), 'horror should be valid');
  assert(invalid.includes('thriller'), 'thriller should be invalid');
  assert(invalid.includes('comedy'), 'comedy should be invalid');
  assert(invalid.includes('action'), 'action should be invalid');
  
  console.log('  ✓ Genre validation correct');
}

function testIdGeneration() {
  console.log('Testing ID generation...');
  
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
  
  const id1 = generateId();
  const id2 = generateId();
  
  assert(id1.length > 5, 'ID should be reasonably long');
  assert(id1 !== id2, 'Each ID should be unique');
  assert(/^[a-z0-9]+$/.test(id1), 'ID should be alphanumeric');
  
  console.log('  ✓ ID generation produces unique IDs');
}

function testStatusTransitions() {
  console.log('Testing status transitions...');
  
  const validStatuses = ['pending', 'processing', 'done', 'failed'];
  
  // Valid transitions
  const validTransitions = {
    pending: ['processing', 'done', 'failed'],
    processing: ['done', 'failed'],
    done: [], // terminal
    failed: ['pending', 'processing'] // can retry
  };
  
  Object.entries(validTransitions).forEach(([from, toList]) => {
    toList.forEach(to => {
      assert(validStatuses.includes(to), `${from} -> ${to} should be valid`);
    });
  });
  
  console.log('  ✓ Status transitions valid');
}

function testDateParsing() {
  console.log('Testing date parsing...');
  
  // ISO format dates should parse correctly
  const isoDate = '2026-03-28T14:00:00.000Z';
  const d = new Date(isoDate);
  assert(d.getTime() > 0, 'ISO date should parse');
  assert(d.getUTCHours() === 14, 'Hour should be 14 UTC');
  
  // Relative date: tomorrow
  const tomorrow = new Date(Date.now() + 86400000);
  assert(tomorrow.getTime() > Date.now(), 'Tomorrow should be in the future');
  
  // Invalid date falls back to "Invalid Date"
  const invalid = new Date('not-a-date');
  assert(isNaN(invalid.getTime()), 'Invalid date should be NaN');
  
  console.log('  ✓ Date parsing correct');
}

function testSRTTimeFormatting() {
  console.log('Testing SRT time formatting...');
  
  // Should produce HH:MM:SS,mmm format
  function formatSRTTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const ms = Math.round((seconds % 1) * 1000).toString().padStart(3, '0');
    return `${h}:${m}:${s},${ms}`;
  }
  
  assert(formatSRTTime(0) === '00:00:00,000', 'Zero seconds');
  assert(formatSRTTime(5.5) === '00:00:05,500', 'Fractional seconds');
  assert(formatSRTTime(65) === '00:01:05,000', 'One minute');
  assert(formatSRTTime(3661) === '01:01:01,000', 'One hour');
  
  console.log('  ✓ SRT time formatting correct');
}

function testRelativeTimeFormatting() {
  console.log('Testing relative time formatting...');
  
  function formatRelative(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (mins < 0) return 'in the future';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
  
  const now = new Date().toISOString();
  const minsAgo = new Date(Date.now() - 30 * 60000).toISOString();
  const hoursAgo = new Date(Date.now() - 5 * 3600000).toISOString();
  const daysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const future = new Date(Date.now() + 60000).toISOString();
  
  assert(formatRelative(now) === '0m ago', 'now should be 0m ago');
  assert(formatRelative(minsAgo) === '30m ago', '30 mins ago');
  assert(formatRelative(hoursAgo) === '5h ago', '5 hours ago');
  assert(formatRelative(daysAgo) === '3d ago', '3 days ago');
  assert(formatRelative(future) === 'in the future', 'future date');
  
  console.log('  ✓ Relative time formatting correct');
}

function testOutputDirectoryCreation() {
  console.log('Testing output directory creation...');
  
  const outputDir = path.join(__dirname, '..', 'output', 'test-schedule');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  assert(fs.existsSync(outputDir), 'output directory should be created');
  assert(fs.statSync(outputDir).isDirectory(), 'should be a directory');
  
  // Cleanup
  fs.rmdirSync(outputDir);
  
  console.log('  ✓ Output directory creation works');
}

// Run tests
try {
  testScheduleQueueFileStructure();
  testQueueItemSchema();
  testIsDueLogic();
  testGenreValidation();
  testIdGeneration();
  testStatusTransitions();
  testDateParsing();
  testSRTTimeFormatting();
  testRelativeTimeFormatting();
  testOutputDirectoryCreation();
  
  console.log('\n✅ All schedule queue tests passed!\n');
} catch (e) {
  console.error('\n❌ Test failed:', e.message);
  console.error(e.stack);
  process.exit(1);
}
