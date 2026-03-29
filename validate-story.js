#!/usr/bin/env node

/**
 * MysteryForge Story Quality Validator
 * 
 * Checks generated stories for common issues before running the pipeline.
 * Scores stories on: hook strength, pacing, structure, clichés, and completeness.
 * 
 * Usage:
 *   node validate-story.js --latest
 *   node validate-story.js "folder_name"
 *   node validate-story.js --latest --json  (machine-readable output)
 */

const fs = require('fs');
const path = require('path');

// CLI
const args = process.argv.slice(2);
const showJson = args.includes('--json');
const targetFolder = args.find(a => !a.startsWith('--')) || null;
const useLatest = args.includes('--latest') || !targetFolder;

function getLatestFolder() {
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) return null;
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'story.json'));
    })
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f, 'story.json')).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  return folders.length > 0 ? folders[0].name : null;
}

// ===== Quality Checks =====

function checkHookStrength(segments) {
  const first = segments[0]?.text || '';
  const hooks = [
    /i found/i, /they never tell you/i, /it started when/i,
    /the (first|last) time i saw/i, /i shouldn'?t have/i,
    /what they found/i, /the (worst|best) part/i, /it was 3am/i,
    /nobody believed me/i, /i was (alone|scared|terrified)/i,
    /the call changed everything/i, /i woke up to/i,
    /the (police|doctor|neighbor) (called|told|said)/i,
    /the (letter|video|photo|message)/i
  ];
  const score = hooks.some(h => h.test(first)) ? 100 : (first.length > 20 ? 60 : 20);
  const issue = score < 50 ? 'Weak opening — no tension or hook' : null;
  return { score, issue };
}

function checkPacing(segments) {
  if (!segments || segments.length < 3) {
    return { score: 30, issue: 'Too few segments for proper pacing' };
  }
  const wordCounts = segments.map(s => s.text.split(/\s+/).length);
  const avg = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const variance = wordCounts.reduce((a, w) => a + Math.abs(w - avg), 0) / wordCounts.length;
  // Good: variance is ~30-50% of average
  const normalizedVariance = avg > 0 ? variance / avg : 1;
  const score = Math.max(20, Math.min(100, 100 - Math.abs(normalizedVariance - 0.4) * 100));
  const issue = normalizedVariance < 0.15 ? 'Pacing is too flat — all segments similar length' :
                normalizedVariance > 0.8 ? 'Pacing is too erratic — segment lengths vary wildly' : null;
  return { score, issue };
}

function checkStructure(segments) {
  if (!segments || segments.length < 3) {
    return { score: 20, issue: 'Insufficient segments for story structure' };
  }
  let score = 50;
  let issues = [];
  
  // Check: ends with reveal/punchline/statement
  const last = segments[segments.length - 1]?.text || '';
  const endings = [
    /(was|is) the (killer|answer|truth|secret|reason)/i,
    /they (killed|did|were|had)/i,
    /i (found|got|took|knew|realized|saw)/i,
    /(revenge|karm[ae])/i,
    /the (end|truth|answer)/i,
    /".*"/  // quoted statement
  ];
  const hasGoodEnding = endings.some(e => e.test(last));
  if (hasGoodEnding) score += 25;
  else issues.push('Ending lacks reveal or punchline');
  
  // Check: has character shot placement
  const charShots = segments.filter(s => s.isCharacterShot).length;
  const charShotRatio = charShots / segments.length;
  if (charShotRatio >= 0.15 && charShotRatio <= 0.35) score += 15;
  else if (charShotRatio === 0) issues.push('No character shots — visuals will be bland');
  else if (charShotRatio > 0.4) issues.push('Too many character shots — may feel repetitive');
  
  // Check: first segment is not a character shot (hook should be setting, not character)
  if (segments[0]?.isCharacterShot) {
    issues.push('First segment is a character shot — hook should be the scene, not the character');
  }
  
  // Check: setup vs payoff balance (first half vs second half word count)
  const midpoint = Math.floor(segments.length / 2);
  const firstHalf = segments.slice(0, midpoint).reduce((a, s) => a + s.text.split(/\s+/).length, 0);
  const secondHalf = segments.slice(midpoint).reduce((a, s) => a + s.text.split(/\s+/).length, 0);
  if (secondHalf > firstHalf * 0.8) score += 10; // Resolution shouldn't be shorter than setup
  else issues.push('Resolution (second half) is much shorter than setup');
  
  return {
    score: Math.min(100, score),
    issue: issues.length > 0 ? issues[0] : null,
    issues
  };
}

function checkCliches(segments) {
  const allText = (segments || []).map(s => s.text).join(' ');
  const cliches = [
    { pattern: /it was a (dark and stormy|sunny|cold|rainy)/i, label: 'weather opening cliché' },
    { pattern: /little did (she|he|i|they) know/i, label: '"little did they know" cliché' },
    { pattern: /(suddenly|all of a sudden)/i, label: '"suddenly" overused' },
    { pattern: /i could feel (my)? heart (racing|pounding|beating)/i, label: 'heartbeat cliché' },
    { pattern: /the silence was (deafening|unbearable|creepy)/i, label: 'silence cliché' },
    { pattern: /everything (changed|went wrong|i knew)/i, label: 'vague turning point' },
    { pattern: /(ran|walked|sat) as (fast|quickly|slowly) as (i|they) could/i, label: 'vague action cliché' },
    { pattern: /i (had a)? (bad|good|strange|weird) feeling/i, label: 'feeling cliché' },
    { pattern: /they (never|always|used to) (do|say|be)/i, label: 'past habit cliché' },
  ];
  
  const found = cliches.filter(c => c.pattern.test(allText));
  const score = Math.max(20, 100 - found.length * 15);
  const issue = found.length >= 3 ? `Contains ${found.length} clichés: ${found.map(f => f.label).join(', ')}` :
                found.length > 0 ? `Contains cliché: ${found[0].label}` : null;
  return { score, issue, found: found.map(f => f.label) };
}

function checkCompleteness(story) {
  let score = 100;
  let issues = [];
  
  if (!story.title) { score -= 20; issues.push('Missing title'); }
  if (!story.genre) { score -= 10; issues.push('Missing genre'); }
  if (!story.characterAnchor) { score -= 15; issues.push('Missing characterAnchor'); }
  if (!story.segments || story.segments.length < 3) { score -= 30; issues.push('Too few segments'); }
  if (!story.total_words || story.total_words < 100) { score -= 20; issues.push('Story too short'); }
  
  const segs = story.segments || [];
  const missingImages = segs.filter(s => !s.image_prompt && !s.imagePrompt).length;
  if (missingImages > 0) { score -= missingImages * 3; issues.push(`${missingImages} segments missing image prompts`); }
  
  return {
    score: Math.max(0, score),
    issue: issues.length > 0 ? issues[0] : null,
    issues
  };
}

function computeOverallScore(hook, pacing, structure, cliches, completeness) {
  const weights = { hook: 0.20, pacing: 0.15, structure: 0.30, cliches: 0.15, completeness: 0.20 };
  return Math.round(
    hook.score * weights.hook +
    pacing.score * weights.pacing +
    structure.score * weights.structure +
    cliches.score * weights.cliches +
    completeness.score * weights.completeness
  );
}

function gradeFromScore(score) {
  if (score >= 85) return { letter: 'A', label: 'Excellent', color: '✅' };
  if (score >= 70) return { letter: 'B', label: 'Good', color: '👍' };
  if (score >= 55) return { letter: 'C', label: 'Fair', color: '⚠️' };
  if (score >= 40) return { letter: 'D', label: 'Poor', color: '❌' };
  return { letter: 'F', label: 'Fail', color: '🚫' };
}

// ===== Main =====

async function main() {
  const outputDir = path.join(__dirname, 'output');
  
  // Resolve folder
  let folder = targetFolder;
  if (useLatest || !folder) {
    folder = getLatestFolder();
    if (!folder) {
      console.error('❌ No story.json found in output/');
      process.exit(1);
    }
  }
  
  const storyPath = path.join(outputDir, folder, 'story.json');
  if (!fs.existsSync(storyPath)) {
    console.error(`❌ No story.json at ${storyPath}`);
    process.exit(1);
  }
  
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  const segments = story.segments || [];
  
  // Run all checks
  const hook = checkHookStrength(segments);
  const pacing = checkPacing(segments);
  const structure = checkStructure(segments);
  const cliches = checkCliches(segments);
  const completeness = checkCompleteness(story);
  const overall = computeOverallScore(hook, pacing, structure, cliches, completeness);
  const grade = gradeFromScore(overall);
  
  if (showJson) {
    const result = {
      folder,
      overall: { score: overall, ...grade },
      checks: { hook, pacing, structure, cliches, completeness },
      warnings: [
        hook.issue, pacing.issue, structure.issue, cliches.issue, completeness.issue
      ].filter(Boolean)
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  // Human-readable output
  console.log(`\n🔍 Story Quality Report: ${folder}`);
  console.log('='.repeat(45));
  console.log(`📊 Overall Score: ${overall}/100  Grade: ${grade.color} ${grade.letter} (${grade.label})`);
  console.log('-'.repeat(45));
  console.log(`   Hook Strength:    ${hook.score}/100 ${hook.score < 50 ? '❌' : hook.score < 75 ? '⚠️' : '✅'}`);
  if (hook.issue) console.log(`     └─ ${hook.issue}`);
  console.log(`   Pacing:            ${pacing.score}/100 ${pacing.score < 50 ? '❌' : pacing.score < 75 ? '⚠️' : '✅'}`);
  if (pacing.issue) console.log(`     └─ ${pacing.issue}`);
  console.log(`   Structure:         ${structure.score}/100 ${structure.score < 50 ? '❌' : structure.score < 75 ? '⚠️' : '✅'}`);
  if (structure.issue) console.log(`     └─ ${structure.issue}`);
  console.log(`   Clichés:           ${cliches.score}/100 ${cliches.score < 50 ? '❌' : cliches.score < 75 ? '⚠️' : '✅'}`);
  if (cliches.issue) console.log(`     └─ ${cliches.issue}`);
  console.log(`   Completeness:      ${completeness.score}/100 ${completeness.score < 50 ? '❌' : completeness.score < 75 ? '⚠️' : '✅'}`);
  if (completeness.issue) console.log(`     └─ ${completeness.issue}`);
  
  const allWarnings = [
    hook.issue, pacing.issue,
    ...(structure.issues || []),
    ...(cliches.found || []).map(f => `Cliché: ${f}`),
    ...(completeness.issues || [])
  ].filter(Boolean);
  
  if (allWarnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    allWarnings.forEach(w => console.log(`   • ${w}`));
  }
  
  if (cliches.found && cliches.found.length > 0) {
    console.log(`\n🔄 Detected Clichés (${cliches.found.length}):`);
    cliches.found.forEach(c => console.log(`   • ${c}`));
  }
  
  console.log('\n📝 Story Summary:');
  console.log(`   Title: ${story.title}`);
  console.log(`   Genre: ${story.genre || 'unknown'}`);
  console.log(`   Segments: ${segments.length}`);
  console.log(`   Words: ${story.total_words || 'N/A'}`);
  console.log(`   Character shots: ${segments.filter(s => s.isCharacterShot).length}`);
  console.log(`   Generated: ${story.generated ? new Date(story.generated).toLocaleString() : 'unknown'}`);
  
  // First and last segment preview
  if (segments.length > 0) {
    console.log('\n🎬 Opening:');
    console.log(`   "${segments[0].text.substring(0, 120)}${segments[0].text.length > 120 ? '...' : ''}"`);
    if (segments.length > 1) {
      console.log('\n🎬 Closing:');
      console.log(`   "${segments[segments.length - 1].text.substring(0, 120)}${segments[segments.length - 1].text.length > 120 ? '...' : ''}"`);
    }
  }
  
  console.log('');
  
  if (overall < 55) {
    console.log('⚠️  This story scores below 55 — consider regenerating before processing.');
    console.log('   Tip: Use `node generate.js --prompt "different story description"`\n');
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
