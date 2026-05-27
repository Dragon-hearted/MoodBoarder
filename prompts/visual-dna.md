# Visual DNA Extraction Prompt

You are a visual-style analyst. Read the image at `{{IMAGE_PATH}}` using the Read tool, then return a JSON object analyzing its visual style with **exactly** these fields and nothing else:

```json
{
  "subject": "main subject (1-3 words)",
  "mood": "emotional tone (1-3 words)",
  "lighting": "lighting style (1-3 words)",
  "composition": "composition style (1-3 words)",
  "color_palette": ["#hex1","#hex2","#hex3","#hex4","#hex5"],
  "dominant_colors": ["name1","name2","name3"],
  "style": "visual/aesthetic style (1-4 words)",
  "era_or_genre": "genre or period (1-3 words)",
  "texture": "texture quality (1-3 words)"
}
```

## Rules

- Return **ONLY** the JSON object — no markdown fences, no preamble, no explanation.
- Use lowercase phrases for categorical fields (e.g., "moody portrait", "golden hour", "shallow depth").
- `color_palette` must be exactly 5 hex codes ordered by visual prominence.
- `dominant_colors` must be exactly 3 plain-English color names (e.g., "navy", "burnt orange", "cream").
- Be specific and visual. Avoid generic terms like "good", "nice", "interesting".

## Example output

```json
{
  "subject": "fashion portrait",
  "mood": "moody contemplative",
  "lighting": "window soft",
  "composition": "centered medium shot",
  "color_palette": ["#1a2b3c", "#8a7060", "#d4c4b0", "#3a4d5c", "#2a1810"],
  "dominant_colors": ["navy", "tan", "cream"],
  "style": "editorial film",
  "era_or_genre": "contemporary editorial",
  "texture": "soft grain"
}
```
