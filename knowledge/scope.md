---
system: "moodboarder"
type: scope
version: 1
lastUpdated: "2026-05-27"
lastUpdatedBy: build-mode
---

# Scope — MoodBoarder

## Identity

- **System id**: `moodboarder`
- **Display name**: MoodBoarder
- **One-line description**: Per-client visual-reference scraper. Given a reference image OR video plus an optional text description, analyzes the visual style with Claude vision, generates Pinterest search keywords, scrapes high-resolution Pinterest images and/or videos, and assembles them into a timestamped moodboard folder bound to a specific client + deliverable.

## Capability Tags

- **task_types**: `["moodboard-generation", "pinterest-scraping", "visual-reference-collection", "mood-analysis"]`
- **input_types**: `["image-file", "video-file", "text-description", "client-name", "deliverable-slug"]`
- **output_types**: `["moodboard-image-collection", "moodboard-video-collection", "visual-dna-json", "search-keywords-json"]`
- **domain_tags**: `["pinterest", "ai", "visual", "scraping", "moodboard", "client-deliverable"]`

## Stages

1. **input-analysis** — Parses image OR video input; for video, ffmpeg extracts N evenly-spaced keyframes (drop first/last 5%); produces a merged `VisualDNA` (mode-merge for categorical fields, union → top-5 for color palette).
2. **keyword-generation** — Synthesizes exactly 5 Pinterest search phrases from the merged DNA + optional text description via Claude CLI.
3. **pinterest-authentication** — Opens headed Chromium on first run for user login; persists cookies to `cookies.json` (gitignored). Subsequent runs default to headless. Falls back to headed if cookies are stale.
4. **scraping** — Per keyword: navigates Pinterest search; scrolls N rounds; harvests both `<img>` (pinimg.com) and `<video>`/`<source>` (v.pinimg.com) URLs gated by `--media`; dedupes via `pinHash()` for images and `videoHash()` for videos.
5. **assembly** — Creates `client/<client>/<deliverable>/moodboard/moodboard_<timestamp>/` with `images/` and/or `videos/` subfolders (empty subfolders are not created); renames to `pin_001.{jpg,mp4}`…; writes `analysis/visual_dna.json` (with per-frame breakdown for video) + `analysis/search_keywords.json`.

## User-confirmed choices (2026-05-27)

1. **Video handling**: extract N (default 5) keyframes via ffmpeg, run Claude vision on each, merge visual DNAs into one combined search-keyword set (mode for categorical fields, union → top-5 for color palette).
2. **Pinterest auth**: persist cookies in `cookies.json` on first headed login, run headless on subsequent invocations (mirrors `instagram-scrapper` pattern).
3. **Output path**: `client/<client>/<deliverable-slug>/moodboard/moodboard_<timestamp>/` with `images/` and `videos/` subfolders — fits alongside scene-board's `storyboards/` and pinboard's `references/` for the same deliverable.
4. **GitHub repo**: `Dragon-hearted/MoodBoarder`, **public** from day one. Requires the publish-audit gate before flipping visibility.
5. **Media types**: user-controlled via `--media=images|videos|both` (default `both`). Pinterest video pins scraped from `<video>`/`<source>` elements on `v.pinimg.com` URLs; saved as `.mp4`. No per-video size cap.

## Non-goals

- **No per-pin metadata extraction beyond URL.** No pin descriptions, board names, pin author, or repin counts. The reference image is the source of truth for vibe — Pinterest metadata is noise.
- **No AI image generation.** Use ImageEngine for that. MoodBoarder only finds existing reference material.
- **No Pinterest board editing.** Read-only scraper.
- **No camera-search-by-image.** That endpoint requires authenticated POST + image upload via Pinterest's lens API; out of scope. Only keyword-based search is implemented.
- **No CI without claude CLI.** The analyzer + keyword stages spawn `claude --print`. Environments without `claude` on PATH must use the fixture-replay layer (documented in `dependencies.md`).
- **No multi-image / multi-video input.** Exactly one `--image` OR one `--video` per invocation. For video, frame count is configurable but treated as one logical input.

## Entry Point

- `src/cli.ts` (invoked via `bun run src/cli.ts ...` or `just sub moodboarder dev`).
- `src/index.ts` is the orchestrator the CLI hands off to after parseArgs.

## Notes for the formalizer

- Acceptance criteria must include: CLI exit codes, cookies.json gitignored + never tracked, `--media` enum validation, `--count` ↔ `--image-count`/`--video-count` mutual exclusion, default per-kind counts (40/10), `--count` sugar 70/30 split for `both` mode, no empty subfolders when one media kind is excluded.
- Domain knowledge must cover: pinimg URL upgrade trick (`/originals/` ↔ `/736x/`), claude-CLI vision contract (no API key — reuses logged-in session), ffmpeg keyframe heuristic, merged-DNA strategy, Pinterest cookie name drift (warn, don't hard-fail).
- Dependencies must list: bun, ffmpeg/ffprobe, playwright (chromium), claude CLI on PATH.
