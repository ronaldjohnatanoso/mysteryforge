# MysteryForge ⚒️

Automated fictional mystery/crime story generator for YouTube content. Generate unlimited mystery scripts with AI — minimal effort, maximum output.

## Features

- 🎭 **5 Story Structures**: whodunit, found-footage, unsolved-twist, anthology, interactive-clues
- 🤖 **Multiple LLM Providers**: Groq (free tier), OpenAI, or local Ollama
- 📝 **YouTube-Ready Output**: Hook-optimized, narration-friendly format
- 🔒 **Security-First**: CI/CD secret scanning, pre-commit hooks

## Quick Start

```bash
# Clone the repo
git clone https://github.com/ronaldjohnatanoso/mysteryforge.git
cd mysteryforge

# Set your API key (choose one method)
export GROQ_API_KEY=your_key_here
# OR create a .env file (never commit this!)
echo "GROQ_API_KEY=your_key_here" > .env

# Generate a story
node generate.js

# With options
node generate.js --genre crime --length 10 --structure whodunit
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--genre` | Story genre (mystery, crime, paranormal, thriller) | mystery |
| `--length` | Target length in minutes | 10 |
| `--structure` | Story structure type | random |
| `--provider` | LLM provider (groq, openai, ollama) | groq |
| `--output` | Output directory | output/scripts |
| `--list` | List available structures | - |

## Story Structures

| Structure | Description | Ending |
|-----------|-------------|--------|
| `whodunit` | Classic "who did it" with suspects | Resolved |
| `found-footage` | Told through discovered evidence | Unresolved |
| `unsolved-twist` | Multiple theories, mindfuck ending | Twist |
| `anthology` | Standalone complete story | Varies |
| `interactive-clues` | Audience solves before reveal | Resolved |

## Setup

### Get a Free API Key

1. **Groq** (Recommended - Free Tier): https://console.groq.com/keys
2. **OpenAI** (Pay-per-use): https://platform.openai.com/api-keys
3. **Ollama** (Local, Free): https://ollama.ai/

### Environment Variables

```bash
# Option 1: Export directly
export GROQ_API_KEY=gsk_xxx

# Option 2: Use a credentials file
export CREDENTIALS_PATH=/path/to/.env

# Option 3: Create .env in project root (gitignored)
echo "GROQ_API_KEY=gsk_xxx" > .env
```

## Security

**⚠️ NEVER commit API keys or secrets to this repository.**

This project includes multiple security measures:

1. **`.gitignore`** - Blocks `.env` files, credentials folders
2. **Pre-commit hook** - Scans staged files for secrets
3. **GitHub Actions** - CI/CD pipeline checks with Gitleaks

### Install Pre-commit Hook

```bash
cp scripts/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### If You Accidentally Commit a Secret

1. **Immediately rotate the key** at the provider's dashboard
2. Remove from git history: `git filter-branch --force --index-filter "git rm --cached --ignore-unmatch path/to/file" HEAD`
3. Force push: `git push origin --force --all`

## Roadmap

- [x] Phase 1: Script generation
- [ ] Phase 2: Voice synthesis (ElevenLabs)
- [ ] Phase 3: Visual assembly (stock + AI images)
- [ ] Phase 4: Full automation & YouTube upload

## Project Structure

```
mysteryforge/
├── generate.js           # Main CLI tool
├── config.json           # Settings (hooks, endings, style)
├── prompts/
│   ├── base-story.md     # Master prompt template
│   └── structures.json   # Story beat patterns
├── output/
│   └── scripts/          # Generated content
├── scripts/
│   └── pre-commit        # Secret scanning hook
└── .github/workflows/
    └── security.yml      # CI/CD security scan
```

## License

MIT

---

Built by Hephaestus ⚒️ for lazy content creators everywhere.