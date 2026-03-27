# MysteryForge ⚒️

Automated YouTube content factory for fictional mystery, horror, revenge, and confession stories. Generate scripts, synthesize voice, fetch images, and assemble videos — all from the command line.

## Features

- 🎭 **4 Story Genres**: Mystery, Horror, Revenge, Confession — each with topic variants
- 🤖 **Multiple LLM Providers**: Groq (free tier), Cerebras (fast), OpenAI
- 🎙️ **High-Quality TTS**: Kokoro neural voices (82M params) with fallback to Google
- 🖼️ **Image Sources**: Pexels stock photos + AI generation (Gemini Imagen, Pollinations)
- 🎬 **Video Assembly**: FFmpeg-powered with Ken Burns effects and crossfade transitions
- 📝 **Auto Subtitles**: SRT generation from narration text
- 📱 **Platform Templates**: Auto-create variants for YouTube, TikTok, Instagram, Twitter
- 🖼️ **Thumbnail Generation**: Extract key frames for video thumbnails
- 📤 **YouTube Upload**: OAuth-based upload script (requires setup)
- 🔒 **Security-First**: CI/CD secret scanning, pre-commit hooks

## Quick Start

```bash
# Clone and setup
git clone https://github.com/ronaldjohnatanoso/mysteryforge.git
cd mysteryforge

# Set your API keys
export GROQ_API_KEY=your_key_here      # Story generation (free at console.groq.com)
export PEXELS_API_KEY=your_key_here    # Stock images (free at pexels.com/api)
export GEMINI_API_KEY=your_key_here    # AI images (free at aistudio.google.com/apikey)

# Generate a 3-minute mystery story
node generate.js --genre mystery --length 3

# Synthesize voice (Kokoro TTS)
node synthesize.js

# Fetch images (Pexels stock photos)
node fetch-images.js --latest

# Or use AI-generated images (Gemini Imagen - 500/day free)
node fetch-images.js --latest --gemini

# Assemble final video
node assemble-video.js --latest

# Generate thumbnails
node generate-thumbnails.js --latest

# Create platform-specific variants
node platform-templates.js --latest --all
```

## Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  generate.js │────▶│ synthesize.js│────▶│fetch-images.js│────▶│assemble.js │────▶│platforms.js │
│   Story      │     │    TTS       │     │   Images    │     │   Video    │     │  Variants   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                   │                   │
      ▼                   ▼                   ▼                   ▼                   ▼
  story.json          narration.mp3       images/*.jpg        video.mp4        youtube.mp4
  narration.txt                                                                   tiktok.mp4
                                                                                  instagram.mp4
```

## CLI Commands

| Command | Description | Options |
|---------|-------------|---------|
| `node generate.js` | Generate story script | `--genre`, `--length`, `--provider`, `--topic` |
| `node batch-generate.js` | Generate multiple stories | `--count`, `--all-genres`, `--length`, `--delay` |
| `node synthesize.js` | Text-to-speech synthesis | `--voice`, `--speed` |
| `node fetch-images.js --latest` | Fetch images | `--gemini`, `--ai`, `--pexels`, `--count` |
| `node assemble-video.js --latest` | Assemble video | `--no-subs` |

### npm Scripts

```bash
npm run generate        # Generate single story
npm run batch           # Generate 5 stories (default)
npm run batch:all       # Generate 1 story per genre (4 total)
npm run synthesize      # Synthesize voice
npm run images          # Fetch Pexels images
npm run images:ai       # Fetch AI images (Gemini)
npm run assemble        # Assemble video
npm run thumbnails      # Generate thumbnail candidates
npm run platforms       # Create all platform variants
npm run platforms:youtube  # YouTube variant only
npm run platforms:tiktok   # TikTok variant only
npm run upload          # Upload to YouTube (requires auth)
npm run build           # Full pipeline (story → thumbnails)
npm run build:full      # Full pipeline + platform variants
npm test                # Run tests
```

### Batch Generation

Generate multiple stories at once with quality scoring:

```bash
# Generate 5 random stories
node batch-generate.js --count 5

# Generate 3 revenge stories, 3 minutes each
node batch-generate.js --genre revenge --count 3 --length 3

# Generate one story per genre (4 total)
node batch-generate.js --all-genres

# With custom delay between requests (avoid rate limits)
node batch-generate.js --count 10 --delay 3000
```

Each batch generates a report with quality scores (A-D grade) based on:
- Structure completeness
- Segment length (target: 20-30 words)
- Character shot ratio (target: 15-25%)
- Hook match
- Total word count

## Story Genres

| Genre | Description | Topics |
|-------|-------------|--------|
| **mystery** | Classic mystery/crime | internet-mystery, found-footage, disappearance |
| **horror** | Scary stories & creepypasta | monster, haunting, creature |
| **revenge** | Pro/petty/nuclear revenge stories | workplace, neighbor, family, ex, petty, nuclear |
| **confession** | Anonymous confessions & secrets | secret-life, dark-secret, confession |

```bash
# List all genres
node generate.js --list-genres

# Generate specific topic
node generate.js --genre revenge --topic workplace-revenge
```

## Output Structure

```
output/
└── <story_title>/
    ├── story.json        # Structured data with segments
    ├── narration.txt     # Clean text for TTS
    ├── narration.mp3     # Synthesized audio
    ├── images/           # Story images
    │   ├── img_000.jpg
    │   ├── img_001.jpg
    │   └── ...
    ├── subtitles.srt     # Generated subtitles
    └── video.mp4         # Final video
```

## API Keys

| Service | Free Tier | Get Key |
|---------|-----------|---------|
| Groq | ✅ Yes | https://console.groq.com/keys |
| Cerebras | ✅ Yes | https://cloud.cerebras.ai |
| Pexels | ✅ Yes | https://www.pexels.com/api/ |
| Gemini Imagen | ✅ 500/day | https://aistudio.google.com/apikey |

## Environment Variables

```bash
# LLM Providers (required for story generation)
GROQ_API_KEY=gsk_xxx           # Groq (recommended)
CEREBRAS_API_KEY=csk-xxx       # Cerebras (fastest)
OPENAI_API_KEY=sk-xxx          # OpenAI (best quality)

# Image Sources
PEXELS_API_KEY=xxx             # Stock photos (required for --pexels)
GEMINI_API_KEY=xxx             # AI images (required for --gemini)

# FFmpeg path (if not in PATH)
FFMPEG_PATH=~/.local/bin/ffmpeg
```

## Video Features

- **Ken Burns Effects**: Subtle zoom and pan for visual interest
- **Crossfade Transitions**: Smooth transitions between images
- **Auto Subtitles**: SRT generation with word-level timing
- **Color Grading**: Genre-specific color grades (thriller, horror, noir)
- **Platform Templates**: Auto-resize for YouTube, TikTok, Instagram, Twitter

## Platform Templates

Create platform-optimized video variants:

```bash
# Create all platform variants
node platform-templates.js --latest --all

# Create specific platform
node platform-templates.js --latest --youtube
node platform-templates.js --latest --tiktok
node platform-templates.js --latest --reels
node platform-templates.js --latest --instagram
node platform-templates.js --latest --twitter
```

| Platform | Resolution | Aspect Ratio | Max Duration |
|----------|------------|--------------|--------------|
| YouTube | 1920×1080 | 16:9 | None |
| TikTok | 1080×1920 | 9:16 | 3 min |
| Instagram Reels | 1080×1920 | 9:16 | 90 sec |
| Instagram Feed | 1080×1080 | 1:1 | 60 sec |
| Twitter/X | 1200×675 | 16:9 | 2:20 |

Outputs are saved to `output/<story>/platforms/`.

## YouTube Upload

Upload videos directly to YouTube (requires OAuth setup):

```bash
# Setup OAuth credentials
node youtube-upload.js --auth

# Upload latest video (unlisted by default)
node youtube-upload.js --latest

# Upload as public
node youtube-upload.js --latest --public
```

### Setup Instructions

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable YouTube Data API v3
3. Create OAuth 2.0 credentials (Desktop app)
4. Set environment variables:
   ```bash
   export YOUTUBE_CLIENT_ID="your-client-id"
   export YOUTUBE_CLIENT_SECRET="your-client-secret"
   export YOUTUBE_REFRESH_TOKEN="your-refresh-token"
   ```

> ⚠️ YouTube has upload quotas (6 videos/day default).

## Security

**⚠️ NEVER commit API keys or secrets to this repository.**

Security measures included:
- `.gitignore` blocks `.env` files and credentials folders
- Pre-commit hook scans staged files for secrets
- GitHub Actions CI/CD checks with Gitleaks

```bash
# Install pre-commit hook
cp scripts/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Roadmap

- [x] Phase 1: Script generation (multiple genres, LLM providers)
- [x] Phase 2: Voice synthesis (Kokoro neural TTS)
- [x] Phase 3: Visual assembly (Pexels + AI images, FFmpeg)
- [x] Phase 4: Full automation & YouTube upload
  - [x] Schedule queue (content calendar) ← NEW
  - [ ] Analytics feedback loop
- [ ] Phase 5: Scaling (multi-channel, trending topics, SEO)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT

---

Built by Hephaestus ⚒️ for content creators who value their time.Tube upload
- [ ] Phase 5: Scaling (multi-channel, trending topics, SEO)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT

---

Built by Hephaestus ⚒️ for content creators who value their time.