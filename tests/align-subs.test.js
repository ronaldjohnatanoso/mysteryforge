/**
 * Tests for align-subs.js — TikTok-style subtitle alignment
 */

const { parseSRT, formatTime } = require('../align-subs.js');

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:02,500
Hello

2
00:00:02,600 --> 00:00:04,000
World

3
00:00:05,000 --> 00:00:06,000
This is a test`;

describe('align-subs.js', () => {
  describe('parseSRT', () => {
    it('parses valid SRT content into subtitle objects', () => {
      const subs = parseSRT(SAMPLE_SRT);
      expect(subs).toHaveLength(3);
      expect(subs[0].text).toBe('Hello');
      expect(subs[0].start).toBeCloseTo(1.0, 1);
      expect(subs[0].end).toBeCloseTo(2.5, 1);
    });

    it('handles multi-word subtitle blocks', () => {
      const multi = `1
00:00:01,000 --> 00:00:03,000
This is multiple words`;
      const subs = parseSRT(multi);
      expect(subs).toHaveLength(1);
      expect(subs[0].text).toBe('This is multiple words');
    });

    it('skips malformed blocks', () => {
      const bad = `1
not a time --> 00:00:02,000
text`;
      const subs = parseSRT(bad);
      expect(subs).toHaveLength(0);
    });
  });

  describe('formatTime', () => {
    it('formats seconds into SRT time code', () => {
      expect(formatTime(1.0)).toBe('00:00:01,000');
      expect(formatTime(61.5)).toBe('00:01:01,500');
      expect(formatTime(3661.123)).toBe('01:01:01,123');
    });

    it('pads single-digit hours/minutes/seconds/ms', () => {
      expect(formatTime(0.005)).toBe('00:00:00,005');
      expect(formatTime(65.04)).toBe('00:01:05,040');
    });
  });
});

// We test parseSRT and formatTime — the core pure functions.
// generateTikTokSRT is integration-level (requires full subtitles array + ffmpeg).
// The main CLI path requires actual files, covered manually.