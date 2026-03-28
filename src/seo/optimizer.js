/**
 * SEO Optimizer for MysteryForge
 * 
 * Generates YouTube-optimized titles, descriptions, and tags
 * based on story content and genre.
 */

const fs = require('fs');
const path = require('path');

// Trending/engaging title templates per genre
const TITLE_TEMPLATES = {
  mystery: [
    'I Found What They Buried Underground...',
    'The Unsettling Truth About {place}',
    'They Never Found What {name} Hid...',
    'The {location} Incident No One Talks About',
    'What I Found in {place} Changed Everything',
    'The {time} Rule Nobody Should Break',
    'I Shouldn\'t Have Looked Into {topic}',
    'The {object} That Haunted {name}',
    'I Was the Only One Who Noticed',
    'The {profession} Everyone Warned Me About'
  ],
  horror: [
    'It Was Living in the Walls...',
    'The Sound From the Basement Changed Everything',
    'Something Was Wrong With {name}',
    'I Should Have Left When I Had the Chance',
    'The {time} Visitor Nobody Survived',
    'The {location} They Tried to Keep Secret',
    'What {name} Did in the Dark...',
    'I Heard It Breathing All Night',
    'The {object} That Started It All',
    'It Watched Through the Window'
  ],
  revenge: [
    'The Day I Got My Revenge on {name}',
    '{name} Thought They Got Away With It...',
    'How I Pranked {name} (Perfectly)',
    'When {name} Crossed the Wrong Person',
    'The Perfect Revenge on {name}',
    'I Destroyed {name}\'s Life in 30 Days',
    'What {name} Did to Me...',
    'Petty Revenge on {name} (Worth It)',
    'The Day {name} Finally Got Karma',
    'How {name} Woke Up to Their Worst Nightmare'
  ],
  confession: [
    'I Did Something I Can\'t Forget...',
    'My Darkest Secret Finally Revealed',
    'I\'ve Never Told Anyone What Happened',
    'The Truth About What I Did',
    'I Have to Confess Something',
    'I {action} and Here\'s Why',
    'The Secret I\'ve Kept for {time}',
    'I {action} — Anonymous Confession',
    'What {name} Never Knew About Me',
    'I\'m Ready to Tell My Story'
  ]
};

// Click-worthy title words by category
const CLICK_WORDS = [
  'found', 'buried', 'secret', 'nightmare', 'haunted', 'revealed',
  'underground', 'disappeared', 'truth', 'killed', 'survived',
  'warned', 'crossed', 'lived', 'died', 'trapped', 'watched'
];

// Description hooks that drive watch time
const DESCRIPTION_HOOKS = [
  'This story will keep you on edge until the very end.',
  'Wait until you hear what happens next.',
  'Based on true events (names changed for privacy).',
  'You won\'t believe how this story ends.',
  'Part {num} of my {genre} series.',
  'Subscribe for more chilling stories every week.',
  'True stories from Reddit\'s r/{subreddit}',
  'If you know someone who would appreciate this, share it.'
];

// Tag sets per genre
const GENRE_TAGS = {
  mystery: ['mystery', 'crime', 'true crime', 'suspense', 'thriller', 'detective', 'investigation', 'unsolved', 'creepy', 'scary stories'],
  horror: ['horror', 'scary', 'creepy', 'paranormal', 'haunting', 'ghost stories', 'creepypasta', 'scary stories', 'monster', 'terrifying'],
  revenge: ['revenge', 'justice', 'karma', 'storytime', 'reddit stories', 'petty revenge', 'instant karma', 'comeuppance', 'gotcha', 'justice served'],
  confession: ['confession', 'true confession', 'anonymous', 'secret', 'dark secret', 'storytime', 'revealed', 'truth', 'buried secrets', 'guilty']
};

// Duration-based title modifiers
const DURATION_MODIFIERS = {
  short: ['Quick', 'Fast', 'Short'],
  medium: [''],
  long: ['Extended', 'Full', 'Complete', 'Ultimate']
};

class SEOOptimizer {
  constructor(story) {
    this.story = story;
    this.genre = story.genre || 'mystery';
    this.segments = story.segments || [];
    this.text = story.story || '';
  }

  /**
   * Extract named entities and keywords from story text
   */
  extractEntities() {
    const text = this.text;
    
    // Extract potential names (capitalized words not at start of sentences)
    const potentialNames = text.match(/(?:^|[.!?]\s+)([A-Z][a-z]+)/g) || [];
    const names = [...new Set(potentialNames.map(n => n.replace(/^[.!?]\s+/, '')).filter(n => n.length > 2))];
    
    // Extract places/locations
    const placeWords = ['house', 'apartment', 'office', 'school', 'hospital', 'woods', 'forest', 'basement', 'attic', 'street', 'city', 'town', 'room', 'building'];
    const places = placeWords.filter(p => text.toLowerCase().includes(p));
    
    // Extract professions
    const professions = ['doctor', 'nurse', 'teacher', 'police', 'officer', 'lawyer', 'manager', 'boss', 'neighbor', 'stranger', 'friend', 'mother', 'father', 'sister', 'brother'];
    const profession = professions.find(p => text.toLowerCase().includes(p)) || 'stranger';
    
    // Extract objects
    const objects = ['phone', 'camera', 'letter', 'photo', 'diary', 'key', 'box', 'tape', 'video', 'computer', 'door', 'window', 'mirror'];
    const object = objects.find(o => text.toLowerCase().includes(o)) || 'item';
    
    // Extract time references
    const timeWords = text.match(/\d+\s*(days?|weeks?|months?|years?|hours?|minutes?)/gi) || [];
    
    return {
      names: names.slice(0, 3),
      places,
      profession,
      object,
      time: timeWords[0] || 'years'
    };
  }

  /**
   * Generate an SEO-optimized YouTube title
   */
  generateTitle() {
    // First segment text often has the hook
    const firstSegment = this.segments[0]?.text || this.text.substring(0, 200);
    const entities = this.extractEntities();
    
    // Choose title template based on genre
    const templates = TITLE_TEMPLATES[this.genre] || TITLE_TEMPLATES.mystery;
    let template = templates[Math.floor(Math.random() * templates.length)];
    
    // Fill in template variables
    template = template
      .replace('{name}', entities.names[0] || entities.profession)
      .replace('{place}', entities.places[0] || 'there')
      .replace('{location}', entities.places[0] || 'the house')
      .replace('{object}', entities.object)
      .replace('{topic}', this.extractTopic())
      .replace('{time}', entities.time)
      .replace('{profession}', entities.profession)
      .replace('{action}', this.extractAction());
    
    // Ensure title is within YouTube's 100-char limit
    if (template.length > 95) {
      template = template.substring(0, 92) + '...';
    }
    
    return template;
  }

  /**
   * Extract a short topic from the story
   */
  extractTopic() {
    const words = this.text.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 4);
    
    // Find topic-like words
    const topicWords = ['website', 'phone', 'camera', 'message', 'letter', 'video', 'tape', 'photo', 'secret', 'truth', ' disappearance', 'vanishing', 'accident', 'incident'];
    for (const tw of topicWords) {
      if (words.includes(tw)) return tw;
    }
    return words[0] || 'something';
  }

  /**
   * Extract action verb for confession titles
   */
  extractAction() {
    const actions = ['lied', 'hid', 'watched', 'followed', 'destroyed', 'stole', 'cheated', 'manipulated', 'lied', 'ran'];
    const lower = this.text.toLowerCase();
    for (const a of actions) {
      if (lower.includes(a)) return a;
    }
    return actions[0];
  }

  /**
   * Generate an engaging description with hooks
   */
  generateDescription() {
    const entities = this.extractEntities();
    
    // Opening hook from first segment
    const firstSegment = this.segments[0]?.text || '';
    const hook = firstSegment.substring(0, 200).trim() + (firstSegment.length > 200 ? '...' : '');
    
    // Choose random description hooks
    const hook1 = DESCRIPTION_HOOKS[Math.floor(Math.random() * DESCRIPTION_HOOKS.length)]
      .replace('{num}', '1')
      .replace('{genre}', this.genre)
      .replace('{subreddit}', this.genre === 'confession' ? 'confessions' : this.genre === 'revenge' ? 'revenge' : 'letsnotmeet');
    
    const hook2 = DESCRIPTION_HOOKS[Math.floor(Math.random() * DESCRIPTION_HOOKS.length)]
      .replace('{num}', '2')
      .replace('{genre}', this.genre)
      .replace('{subreddit}', this.genre === 'confession' ? 'confessions' : this.genre === 'revenge' ? 'revenge' : 'letsnotmeet');
    
    // Call to action
    const cta = [
      '👍 Like this story? More chilling tales every week!',
      '🔔 Subscribe for new stories every week!',
      '💬 Comment your theories below!',
      '📂 Watch the full playlist for more stories!'
    ][Math.floor(Math.random() * 4)];
    
    const attribution = 'Story adapted from anonymous sources. All identities fictionalized.\n\n#' + this.genre + ' #storytime #creepy #scary';
    
    const description = `${hook}

${hook1}

${hook2}

${cta}

${attribution}

---

📺 More ${this.genre} stories:
https://youtube.com/playlist?list=mysteryforge`;

    return description;
  }

  /**
   * Generate relevant tags for the video
   */
  generateTags() {
    const entities = this.extractEntities();
    const genreTags = GENRE_TAGS[this.genre] || GENRE_TAGS.mystery;
    
    // Build tags from: genre tags + extracted entities + click words + custom
    const customTags = [
      this.genre,
      'storytime',
      'narrative',
      'scary stories',
      'reddit stories',
      'creepy',
      'short story',
      'true story',
      'telling a story',
      'chilling stories',
      'mystery short',
      'suspense',
      'dark story'
    ];
    
    // Add entity-based tags
    const entityTags = [];
    if (entities.names[0]) entityTags.push(entities.names[0].toLowerCase());
    if (entities.places[0]) entityTags.push(entities.places[0].toLowerCase());
    if (entities.profession) entityTags.push(entities.profession.toLowerCase());
    
    // Combine and deduplicate, limit to 500 chars worth
    const allTags = [...new Set([...genreTags, ...customTags, ...entityTags])];
    
    // YouTube allows 500 characters for tags
    let tags = [];
    let totalLen = 0;
    for (const tag of allTags) {
      if (totalLen + tag.length + 1 > 480) break;
      tags.push(tag);
      totalLen += tag.length + 1;
    }
    
    return tags;
  }

  /**
   * Generate complete SEO metadata
   */
  optimize() {
    return {
      title: this.generateTitle(),
      description: this.generateDescription(),
      tags: this.generateTags(),
      category: this.getCategory(),
      genre: this.genre
    };
  }

  /**
   * Get YouTube category ID
   */
  getCategory() {
    const categories = {
      mystery: '24',   // Entertainment
      horror: '24',    // Entertainment  
      revenge: '22',  // People & Blogs
      confession: '22' // People & Blogs
    };
    return categories[this.genre] || '22';
  }
}

/**
 * CLI entry point
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    latest: args.includes('--latest'),
    storyFolder: args.find(a => !a.startsWith('--'))
  };
}

function getLatestStoryFolder() {
  const outputDir = path.join(process.cwd(), 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'story.json'));
    })
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return folders.length > 0 ? folders[0].name : null;
}

async function main() {
  const opts = parseArgs();
  
  let storyFolder = opts.storyFolder;
  if (opts.latest || !storyFolder) {
    storyFolder = getLatestStoryFolder();
    if (!storyFolder) {
      console.error('❌ No story.json found in output/');
      process.exit(1);
    }
  }
  
  const storyPath = path.join(process.cwd(), 'output', storyFolder, 'story.json');
  if (!fs.existsSync(storyPath)) {
    console.error(`❌ No story.json found at ${storyPath}`);
    process.exit(1);
  }
  
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  const optimizer = new SEOOptimizer(story);
  const seo = optimizer.optimize();
  
  console.log('\n🔍 SEO Optimization Results');
  console.log(`   Genre: ${seo.genre}`);
  console.log(`\n📝 Title (${seo.title.length}/100 chars):`);
  console.log(`   ${seo.title}`);
  console.log(`\n📄 Description (${seo.description.length} chars):`);
  console.log(`   ${seo.description.substring(0, 200)}...`);
  console.log(`\n🏷️  Tags (${seo.tags.length} tags, ~${seo.tags.join(', ').length} chars):`);
  console.log(`   ${seo.tags.slice(0, 10).join(', ')}...`);
  console.log(`\n📁 Save path: output/${storyFolder}/seo.json`);
  
  // Save SEO metadata
  const seoPath = path.join(process.cwd(), 'output', storyFolder, 'seo.json');
  fs.writeFileSync(seoPath, JSON.stringify(seo, null, 2));
  console.log(`\n✅ Saved to ${seoPath}\n`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = { SEOOptimizer };
