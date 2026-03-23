#!/usr/bin/env node

/**
 * Generate TikTok-style subtitles from Whisper word-level output
 * - Groups words into phrases (2-4 words)
 * - Fills gaps so no subtitle "sticks"
 */

const fs = require('fs');
const path = require('path');

function parseSRT(content) {
  const blocks = content.trim().split(/\n\n+/);
  const subtitles = [];
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    
    const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!timeMatch) continue;
    
    const start = parseInt(timeMatch[1])*3600 + parseInt(timeMatch[2])*60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4])/1000;
    const end = parseInt(timeMatch[5])*3600 + parseInt(timeMatch[6])*60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8])/1000;
    const text = lines.slice(2).join(' ').trim();
    
    subtitles.push({ start, end, text });
  }
  
  return subtitles;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateTikTokSRT(subtitles, maxWordsPerLine = 3) {
  const result = [];
  let index = 1;
  let i = 0;
  
  while (i < subtitles.length) {
    // Group 2-4 words
    const group = [];
    let wordCount = 0;
    let j = i;
    
    while (j < subtitles.length && wordCount < maxWordsPerLine) {
      group.push(subtitles[j]);
      wordCount++;
      
      // Stop at sentence-ending punctuation
      if (subtitles[j].text.match(/[.!?]$/)) break;
      j++;
    }
    
    const start = group[0].start;
    const end = group[group.length - 1].end;
    const text = group.map(s => s.text).join(' ');
    
    // Check for gap before this group
    if (result.length > 0) {
      const prevEnd = result[result.length - 1].end;
      const gap = start - prevEnd;
      
      // If gap > 200ms, extend previous subtitle to fill it
      if (gap > 0.2) {
        result[result.length - 1].end = start;
      }
    }
    
    result.push({ start, end, text });
    i = j + 1;
  }
  
  // Convert to SRT format
  const srtLines = [];
  for (const sub of result) {
    srtLines.push(`${index}`);
    srtLines.push(`${formatTime(sub.start)} --> ${formatTime(sub.end)}`);
    srtLines.push(sub.text);
    srtLines.push('');
    index++;
  }
  
  return srtLines.join('\n');
}

// Main
const args = process.argv.slice(2);
const srtPath = args[0];

if (!srtPath) {
  // Find latest story folder
  const outputDir = path.join(process.cwd(), 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  
  if (folders.length === 0) {
    console.error('No story folders found');
    process.exit(1);
  }
  
  const latestFolder = path.join(outputDir, folders[0].name);
  const whisperSRT = path.join(latestFolder, 'subtitles_whisper.srt');
  
  if (!fs.existsSync(whisperSRT)) {
    console.error('No subtitles_whisper.srt found. Run whisper alignment first.');
    process.exit(1);
  }
  
  const content = fs.readFileSync(whisperSRT, 'utf8');
  const subtitles = parseSRT(content);
  console.log(`Parsed ${subtitles.length} word-level subtitles from ${folders[0].name}`);
  
  const tiktokSRT = generateTikTokSRT(subtitles, 3);
  const outputPath = path.join(latestFolder, 'subtitles.srt');
  fs.writeFileSync(outputPath, tiktokSRT);
  
  const outputCount = tiktokSRT.split('\n\n').filter(b => b.trim()).length;
  console.log(`Generated ${outputCount} phrase-grouped subtitles`);
  console.log(`Saved to: ${outputPath}`);
} else {
  const content = fs.readFileSync(srtPath, 'utf8');
  const subtitles = parseSRT(content);
  console.log(`Parsed ${subtitles.length} word-level subtitles`);
  
  const tiktokSRT = generateTikTokSRT(subtitles, 3);
  const outputPath = srtPath.replace('_whisper.srt', '.srt');
  fs.writeFileSync(outputPath, tiktokSRT);
  
  const outputCount = tiktokSRT.split('\n\n').filter(b => b.trim()).length;
  console.log(`Generated ${outputCount} phrase-grouped subtitles`);
  console.log(`Saved to: ${outputPath}`);
}