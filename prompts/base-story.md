# Base Story Generation Prompt

You are a master mystery writer. Generate a compelling fictional mystery story suitable for YouTube narration.

## Requirements

- Length: {{LENGTH}} minutes when narrated (roughly {{WORD_COUNT}} words)
- Genre: {{GENRE}}
- Structure: {{STRUCTURE}}
- Tone: Suspenseful, engaging, mysterious but not gratuitously dark

## Story Structure: {{STRUCTURE}}

{{STRUCTURE_INSTRUCTIONS}}

## Opening Hook (Pick one or create similar)

- "What I'm about to tell you never made the headlines..."
- "This case file was found in an abandoned warehouse..."
- "The following story is entirely fictional, but it could have happened..."
- "There are places in this world where people simply disappear..."
- "I received an anonymous letter with no return address..."

## Requirements

1. **Hook in first 15 seconds** — Grab attention immediately
2. **Rising tension** — Each section should build mystery
3. **Vivid details** — Names, places, dates that feel real
4. **Satisfying (or deliberately unsatisfying) conclusion** — Twist or unresolved mystery
5. **Narration-friendly** — Natural pauses, avoid complex sentences

## Output Format

```
# [STORY TITLE]

## Hook
[Opening hook sentence]

## Part 1: The Beginning
[Scene setting, introduction to mystery]

## Part 2: The Investigation
[Clues, red herrings, mounting tension]

## Part 3: The Revelation
[Twist, answer, or deliberately unresolved ending]

## Closing
[Final thought, call to action for viewers]

## Thumbnail Text Suggestion
[Short catchy text for YouTube thumbnail]
```

## Variables to Fill

- GENRE: mystery, crime, paranormal, thriller
- LENGTH: minutes of content
- STRUCTURE: whodunit, found-footage, unsolved-twist, anthology, interactive-clues
- WORD_COUNT: approximately 150 words per minute