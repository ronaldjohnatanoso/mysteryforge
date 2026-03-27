#!/usr/bin/env node

/**
 * MysteryForge Schedule Queue
 * 
 * Plan and manage a content calendar for scheduled video generation.
 * Supports adding items to a queue, viewing scheduled content, and
 * running scheduled generations.
 * 
 * Usage:
 *   node schedule-queue.js --add --genre mystery --length 2 --date "2026-03-28 14:00"
 *   node schedule-queue.js --list
 *   node schedule-queue.js --due        # Show items due now or past
 *   node schedule-queue.js --run --all  # Run all due items
 *   node schedule-queue.js --remove 0   # Remove item by index
 *   node schedule-queue.js --clear      # Clear entire queue
 * 
 * Queue format (queue.json):
 *   [
 *     {
 *       "id": "uuid",
 *       "genre": "mystery",
 *       "length": 2,
 *       "topic": "internet-mystery",
 *       "voice": "af_sky",
 *       "scheduledAt": "2026-03-28T14:00:00.000Z",
 *       "addedAt": "2026-03-27T10:00:00.000Z",
 *       "status": "pending|processing|done|failed",
 *       "outputFolder": null
 *     }
 *   ]
 */

const fs = require('fs');
const path = require('path');
const { generateText } = require('./src/providers/index.js');

const QUEUE_FILE = path.join(__dirname, 'output', 'schedule-queue.json');

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    add: args.includes('--add'),
    list: args.includes('--list') || (!args.some(a => a.startsWith('--') && a !== '--list')),
    due: args.includes('--due'),
    run: args.includes('--run'),
    remove: args.includes('--remove') ? parseInt(args[args.indexOf('--remove') + 1]) : null,
    clear: args.includes('--clear'),
    genre: args.includes('--genre') ? args[args.indexOf('--genre') + 1] : null,
    length: args.includes('--length') ? parseInt(args[args.indexOf('--length') + 1]) : 2,
    topic: args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null,
    voice: args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'af_sky',
    date: args.includes('--date') ? args[args.indexOf('--date') + 1] : null,
    all: args.includes('--all'),
    genreArg: args.includes('--genre') ? args[args.indexOf('--genre') + 1] : null
  };
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  });
}

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

function isDue(item) {
  return item.status !== 'done' && item.status !== 'processing'
    && new Date(item.scheduledAt).getTime() <= Date.now();
}

function showQueue(queue, filter) {
  let items = queue;
  if (filter === 'due') items = queue.filter(isDue);
  if (filter === 'pending') items = queue.filter(i => i.status === 'pending');
  
  console.log(`\n📅 MysteryForge Schedule Queue (${items.length} items)\n`);
  
  if (items.length === 0) {
    console.log('   No scheduled content. Use --add to plan something.');
    return;
  }
  
  const GENRE_NAMES = {
    mystery: '🔍 Mystery',
    horror: '👻 Horror',
    revenge: '⚔️ Revenge',
    confession: '💀 Confession'
  };
  
  const STATUS_ICONS = {
    pending: '⏳',
    processing: '⚙️',
    done: '✅',
    failed: '❌'
  };
  
  items.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  
  items.forEach((item, idx) => {
    const genreName = GENRE_NAMES[item.genre] || item.genre;
    const status = STATUS_ICONS[item.status] || '?';
    const topic = item.topic ? ` (${item.topic})` : '';
    const len = item.length ? `${item.length}min` : '';
    const rel = formatRelative(item.scheduledAt);
    const abs = formatDate(item.scheduledAt);
    const voice = item.voice ? ` [${item.voice}]` : '';
    const due = isDue(item) ? ' ← DUE' : '';
    
    console.log(`  [${idx}] ${status} ${genreName}${topic} ${len}${voice}`);
    console.log(`       ${abs} (${rel})${due}`);
    if (item.outputFolder) console.log(`       📁 ${item.outputFolder}`);
    console.log('');
  });
  
  const pending = queue.filter(i => i.status === 'pending').length;
  const due = queue.filter(isDue).length;
  console.log(`   ${pending} pending | ${due} due now`);
}

async function runItem(item, idx, queue) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`⚙️  Running scheduled item [${idx}]: ${item.genre} (${item.length}min)`);
  
  queue[idx].status = 'processing';
  saveQueue(queue);
  
  try {
    const outputDir = path.join(__dirname, 'output');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const storyDir = path.join(outputDir, `${item.genre}_${timestamp}`);
    
    if (!fs.existsSync(storyDir)) fs.mkdirSync(storyDir, { recursive: true });
    
    // Step 1: Generate story
    console.log('\n📝 Step 1/4: Generating story...');
    const { generateText: gen } = require('./src/providers/index.js');
    
    const genrePrompts = {
      mystery: { name: 'Mystery', topics: ['internet-mystery', 'found-footage', 'disappearance'] },
      horror: { name: 'Horror', topics: ['monster', 'haunting', 'creature'] },
      revenge: { name: 'Revenge Story', topics: ['workplace-revenge', 'neighbor-revenge', 'ex-revenge'] },
      confession: { name: 'Confession', topics: ['secret-life', 'dark-secret', 'confession'] }
    };
    
    const gp = genrePrompts[item.genre] || genrePrompts.mystery;
    const topic = item.topic || gp.topics[Math.floor(Math.random() * gp.topics.length)];
    
    const storyPrompt = `Write a 2-minute ${gp.name} story about: ${topic}.`;
    const systemPrompt = 'You are a YouTube story writer. Output ONLY valid JSON with {title, segments:[{id,text,imagePrompt,isCharacterShot}]. Keep each segment 20-35 words.';
    
    const result = await gen(storyPrompt, systemPrompt, 4096);
    let story;
    try {
      const cleaned = result.replace(/```json\n?/, '').replace(/\n?```$/, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      story = JSON.parse(match ? match[0] : cleaned);
    } catch {
      throw new Error('Failed to parse story JSON');
    }
    
    story.scheduledAt = item.scheduledAt;
    story.topic = topic;
    story.genre = item.genre;
    story.voice = item.voice;
    story.length_minutes = item.length;
    
    fs.writeFileSync(path.join(storyDir, 'story.json'), JSON.stringify(story, null, 2));
    console.log(`   ✓ Story saved: ${story.title}`);
    
    // Step 2: Synthesize (log-only, actual synthesis skipped in scheduler)
    console.log('\n🎤 Step 2/4: Voice synthesis...');
    console.log('   (Run synthesize.js manually or via pipeline.js)');
    
    // Step 3: Fetch images (log-only)
    console.log('\n🖼️  Step 3/4: Image fetch...');
    console.log('   (Run fetch-images.js --latest to fetch images)');
    
    // Step 4: Assemble (log-only)
    console.log('\n🎬 Step 4/4: Video assembly...');
    console.log('   (Run assemble-video.js --latest to assemble video)');
    
    queue[idx].status = 'done';
    queue[idx].outputFolder = storyDir;
    queue[idx].completedAt = new Date().toISOString();
    saveQueue(queue);
    
    console.log(`\n✅ Scheduled item completed: ${storyDir}`);
    
  } catch (err) {
    queue[idx].status = 'failed';
    queue[idx].error = err.message;
    saveQueue(queue);
    console.error(`\n❌ Failed: ${err.message}`);
  }
}

async function main() {
  const args = parseArgs();
  const queue = loadQueue();
  
  if (args.clear) {
    console.log('🗑️  Clearing schedule queue...');
    saveQueue([]);
    console.log('   Queue cleared.');
    return;
  }
  
  if (args.remove !== null) {
    if (args.remove < 0 || args.remove >= queue.length) {
      console.error(`❌ Invalid index: ${args.remove}`);
      process.exit(1);
    }
    const removed = queue.splice(args.remove, 1)[0];
    saveQueue(queue);
    console.log(`✅ Removed: ${removed.genre} scheduled for ${formatDate(removed.scheduledAt)}`);
    return;
  }
  
  if (args.add) {
    if (!args.genreArg) {
      console.error('❌ --genre is required when adding to queue');
      process.exit(1);
    }
    
    const validGenres = ['mystery', 'horror', 'revenge', 'confession'];
    if (!validGenres.includes(args.genreArg)) {
      console.error(`❌ Invalid genre. Choose: ${validGenres.join(', ')}`);
      process.exit(1);
    }
    
    const scheduledAt = args.date
      ? new Date(args.date).toISOString()
      : new Date(Date.now() + 86400000).toISOString(); // Default: tomorrow
    
    const item = {
      id: generateId(),
      genre: args.genreArg,
      length: args.length,
      topic: args.topic,
      voice: args.voice,
      scheduledAt,
      addedAt: new Date().toISOString(),
      status: 'pending',
      outputFolder: null
    };
    
    queue.push(item);
    saveQueue(queue);
    
    console.log(`✅ Added to schedule queue:`);
    console.log(`   Genre: ${item.genre} (${item.length}min)`);
    if (item.topic) console.log(`   Topic: ${item.topic}`);
    console.log(`   Voice: ${item.voice}`);
    console.log(`   Scheduled: ${formatDate(item.scheduledAt)}`);
    return;
  }
  
  if (args.due) {
    showQueue(queue, 'due');
    return;
  }
  
  if (args.run) {
    const dueItems = queue
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => isDue(item));
    
    if (dueItems.length === 0) {
      console.log('\n📭 No items due. Check --list for upcoming content.');
      return;
    }
    
    console.log(`\n⚡ Running ${dueItems.length} due item(s)...\n`);
    
    for (const { idx } of dueItems) {
      await runItem(queue[idx], idx, queue);
    }
    return;
  }
  
  // Default: show list
  showQueue(queue, null);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
