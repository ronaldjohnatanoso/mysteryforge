/**
 * SRT Subtitle Generation
 *
 * Converts narration text to SRT subtitle format.
 * Used by pipeline.js and assemble-video.js.
 *
 * Usage:
 *   const { generateSRT, formatSRTTime } = require('./src/video/subtitles');
 *   const srt = generateSRT(narrationText, durationSeconds);
 */

const SRT_CHUNK_SIZE = 8; // words per subtitle line

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 */
function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Generate SRT subtitle file content from plain narration text.
 *
 * Splits text into sentences, then into chunks of ~8 words each,
 * and assigns time ranges proportionally based on total duration.
 *
 * @param {string} text - Narration text (plain, no timestamps)
 * @param {number} duration - Total audio duration in seconds
 * @returns {string} SRT file content
 */
function generateSRT(text, duration) {
  if (!text || text.trim().length === 0) return '';
  if (duration <= 0) return '';

  // Split into sentences (keep the delimiter in the result)
  const sentences = text
    .replace(/\.\.\./g, '.')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim());

  if (sentences.length === 0) return '';

  const totalWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0);
  if (totalWords === 0) return '';

  const wordsPerSecond = totalWords / duration;

  let time = 0;
  let index = 1;
  const srtLines = [];

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    const wordCount = words.length;
    if (wordCount === 0) continue;

    const sentenceDuration = wordCount / wordsPerSecond;

    // Split sentence into chunks of SRT_CHUNK_SIZE words
    for (let j = 0; j < words.length; j += SRT_CHUNK_SIZE) {
      const chunk = words.slice(j, j + SRT_CHUNK_SIZE).join(' ');
      const chunkWordCount = chunk.split(/\s+/).length;
      const chunkDuration = (chunkWordCount / wordCount) * sentenceDuration;

      srtLines.push(`${index}`);
      srtLines.push(`${formatSRTTime(time)} --> ${formatSRTTime(time + chunkDuration)}`);
      srtLines.push(chunk);
      srtLines.push('');

      index++;
      time += chunkDuration;
    }
  }

  return srtLines.join('\n');
}

/**
 * Generate SRT from word-level timestamps (more accurate).
 * Requires output from transcribeAudio() which provides per-word timestamps.
 *
 * @param {Array<{word: string, start: number, end: number}>} words - Word timestamps
 * @param {number} chunkSize - Words per subtitle line (default 8)
 * @returns {string} SRT file content
 */
function generateSRTFromWords(words, chunkSize = SRT_CHUNK_SIZE) {
  if (!words || words.length === 0) return '';

  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize));
  }

  return chunks.map((chunk, i) => {
    const start = formatSRTTime(chunk[0].start);
    const end = formatSRTTime(chunk[chunk.length - 1].end);
    const text = chunk.map(w => w.word).join(' ');
    return `${i + 1}\n${start} --> ${end}\n${text}\n`;
  }).join('\n');
}

module.exports = {
  generateSRT,
  generateSRTFromWords,
  formatSRTTime,
  SRT_CHUNK_SIZE
};
