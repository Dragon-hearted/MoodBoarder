---
system: "moodboarder"
type: domain
version: 1
lastUpdated: "2026-05-27"
lastUpdatedBy: build-mode
---

# Domain Knowledge — MoodBoarder

## Core Domain

Pinterest is the dominant visual-reference repository for moodboards in marketing, fashion, photography, and film pre-production. Pins are indexed by user-supplied keyword tags rather than visual content (Pinterest's image-similarity API requires authenticated lens-search, which is out of scope for this system). MoodBoarder therefore translates "this reference image's vibe" into 5 high-signal keyword searches, runs them in parallel, and deduplicates the resulting pin URLs.

The output is bound to a specific **client × deliverable** rather than a flat library — moodboards rot quickly (different clients, different campaigns) and storing them ad-hoc on a developer's laptop loses the link to the storyboard, ad brief, and post-production assets they belong to. The `client/<client>/<deliverable>/moodboard/moodboard_<ts>/` convention puts MoodBoarder output next to scene-board's `storyboards/` and pinboard's `references/` for the same deliverable.

## Process Knowledge

### Pinimg URL upgrade trick

Pinterest serves the same pin at multiple resolutions via a path-segment swap:

```
https://i.pinimg.com/236x/AB/CD/EF/abcdef….jpg   ← thumbnail (default in DOM)
https://i.pinimg.com/736x/AB/CD/EF/abcdef….jpg   ← hi-res (what we want)
https://i.pinimg.com/originals/AB/CD/EF/abcdef….jpg ← original (sometimes 404s)
```

The scraper collects whatever the DOM gives (usually `/236x/` or a `srcset` member), then upgrades to `/736x/` before downloading. `/originals/` is preferred when present but 404s for a non-trivial fraction of pins — the downloader retries with `/736x/` on 404.

The `pinHash()` dedupe key is everything after the resolution segment — that's the stable content identifier across resolutions.

### Video pin URL pattern

Video pins live on a different subdomain:

```
https://v.pinimg.com/videos/mc/720p/AB/CD/EF/abcdef….mp4
https://v1.pinimg.com/videos/720p/…
```

Unlike images, Pinterest serves a single best-rez per video pin — there's no resolution-swap trick. The `videoHash()` dedupe key is the last path segment of the `.mp4` URL. Video pins are typically <30s reel-style content; the system has no per-video size cap by design (user-confirmed). A 120s download timeout in `downloader.ts` provides a soft ceiling on pathological cases.

### Scrape engine (`--engine scrapling`)

By default MoodBoarder harvests with the local Playwright browser. `--engine scrapling`
(or `MOODBOARDER_ENGINE=scrapling`) instead routes each keyword through the in-repo
**scrape-engine** CLI (Scrapling StealthyFetcher: anti-bot + Cloudflare bypass + `adaptive=True`
element relocation) over a process boundary — MoodBoarder spawns it, with no TS dependency. On any
engine failure (block / dependency / timeout) it **reverts to the Playwright collector** for that
keyword, so the flag is safe to leave on. The same `cookies.json` feeds both engines.

**Trade-off (why Playwright stays default):** a single StealthyFetcher fetch is ONE page load,
not the 14-round scroll harvest — so per-keyword yield is lower (~one screenful of pins). Reach
for scrapling when anti-bot blocking or the `<video>`→`<source>` markup drift below is biting;
stay on Playwright when raw per-keyword volume matters most.

### Pinterest video markup may drift

Video pins are served via Idea-Pin / story-pin components whose DOM structure Pinterest A/Bs. The current `<video>` + `<source src>` selector works as of 2026-05-27 but should be verified during any future scrape run. If Pinterest moves the URL into a `data-*` attribute or a JSON blob, the scraper needs a fallback path. The `--media images` feature-flag bypass keeps the system useful even if the video path breaks temporarily.

### Claude CLI vision contract

`src/analyze.ts` and `src/keywords.ts` spawn the local `claude` binary (Claude Code) — they do NOT call the Anthropic API directly. This means:

- **No API key required** at the system level — the user's existing `claude` login is reused.
- The analyze prompt uses `claude --print --allowedTools Read --add-dir <image-dir>` so Claude can Read the image via its tool harness.
- The keywords prompt is text-only (`claude --print <prompt>`) — no tools, no image.
- Both prompts demand JSON-only output and the system retries once on parse-fail with a stricter "JSON only, no prose" preamble.
- CI environments without `claude` on PATH must use the fixture-replay layer (set `MOODBOARDER_REPLAY_FIXTURES=1`).

#### Auth resolution (subscription-first)

Both spawns go through `src/claude.ts` `runClaude()`, which picks the auth path in this order:

1. **subscription** — spawns `claude` with `ANTHROPIC_API_KEY` **stripped from the env**, so the CLI uses the logged-in Claude Code subscription (Pro/Max).
2. **apikey** — spawns with the inherited env (uses `ANTHROPIC_API_KEY`, i.e. pay-as-you-go console billing). Only attempted as a fallback, and only when a key is actually set.

This is deliberate: a depleted `ANTHROPIC_API_KEY` (exported in the shell or a project `.env`) otherwise shadows the subscription and the CLI fails with **"Credit balance is too low"**. Subscription-first means that no longer blocks a user who has an active subscription. If the first mode exits non-zero and another is available, the next is tried; the thrown error lists every mode's failure.

Override with **`MOODBOARDER_CLAUDE_AUTH`**:
- unset / `auto` → `subscription` then `apikey` (default)
- `subscription` → subscription only (never touch the key)
- `apikey` / `api` → API key only (legacy behaviour; falls back to subscription if no key is set)

### ffmpeg keyframe heuristic

For video input, `src/input/video.ts` extracts N (default 5) evenly-spaced keyframes:

```
ffprobe -v error -show_entries format=duration -of csv=p=0 <video>
ffmpeg -ss <t> -i <video> -frames:v 1 -q:v 2 <tmp>/frame_N.jpg
```

The first and last 5% of the timeline are dropped — most short-form videos have intro/outro slates (logo card, "follow me", etc.) that contaminate the visual DNA. The remaining 90% is divided into N evenly-spaced sample points. Each frame runs through the same `analyze.ts` pipeline as a single image, then `dna-merge.ts` reduces N `VisualDNA`s to one `MergedDNA`.

### Merged-DNA strategy

- **Categorical fields** (`subject`, `mood`, `lighting`, `composition`, `style`, `era_or_genre`, `texture`) — take the **mode** (most common value). Ties broken by first-occurrence order.
- **`color_palette`** (array of hex) — **union** across all frames, then dedup case-insensitively, then keep the **top 5** by frequency. This preserves the dominant color story while collapsing per-frame variation.
- **`dominant_colors`** (array of color names) — same union → frequency → top-3 logic.
- **`frames`** field — the per-frame `VisualDNA[]` is preserved on the merged object so downstream tooling can audit the inputs. Empty for image input.

## Quality Signals

**Good moodboard cohesion** (soft criteria, surfaced to human judgment):

- **Palette consistency** — the 40 downloaded pins share the dominant 3 colors of the input. A pin with neon orange in a moody-blue moodboard is a miss.
- **Subject relevance** — the pins share the input's primary subject (e.g., "portrait" → portraits, "interior" → interiors). Off-subject pins drift the moodboard.
- **Image quality** — pins are high-res (>720px short side), not thumbnail-grade. The pinimg upgrade trick handles this for most pins; skip on file size <8KB.
- **Variety within theme** — not 40 near-duplicates. Pinterest's recommendation engine sometimes returns variations of the same pin.

## Edge Cases & Gotchas

### Pinterest cookie names may drift

Unlike Instagram (stable cookie names `csrftoken`/`sessionid`/`ds_user_id`/`mid`), Pinterest rotates auth cookie naming. The `REQUIRED_COOKIES` heuristic in `src/browser-login.ts` does NOT hard-fail on a missing specific cookie name — it logs a warning and treats the session as "needs login" if the heuristic doesn't match. The current best-effort cookie names are `_auth` and `_pinterest_sess` (verified 2026-05-27).

### Pinterest may rate-limit / block rapid scraping

Per-keyword scroll delay (`SCROLL_WAIT_MS = 1800`) and modest inter-keyword pacing keep us well under detection thresholds. On 429, the scraper retries once with double the delay and bails with a clear error if still blocked. No aggressive evasion is implemented — the system is for legitimate moodboard work.

### Login redirect mid-session

Pinterest occasionally bounces an active session to `/login` after a few searches. The scraper detects `page.url().includes("/login")` and falls back to headed mode for re-auth (user is prompted on the terminal to log in, then presses Enter).

### Empty subfolder hygiene

When `--media images` is passed, the assembler does NOT create an empty `videos/` directory in the output. Vice versa for `--media videos`. This keeps the moodboard folder clean for consumers (designer hands it to client, sees only the kinds they asked for).

### Claude returning non-JSON

Both `analyze.ts` and `keywords.ts` first try `JSON.parse(raw)`, then a regex fallback `raw.match(/\{[\s\S]*\}/)` / `raw.match(/\[[\s\S]*\]/)`. On both failures the spawn is retried once with a stricter preamble. After two failures the system errors with the raw output for debugging.

### Video download timeouts

Videos can be 10–50 MB at 720p. The downloader uses a 120s timeout (vs 20s for images) and runs videos at lower concurrency (3 vs 8 for images) to avoid bandwidth swamp. No size cap — user-confirmed.

## Tacit Expertise

- **`--count` sugar prefers a 70/30 image:video split for `both` mode** because moodboards are still primarily image-driven. A run of 50 with `--media both` yields 35 images + 15 videos.
- **Default `--image-count 40`** mirrors the reference moodboard; **default `--video-count 10`** is calibrated to Pinterest's video pin density (typically 10–20% of search results are videos).
- **No cross-fill on under-delivery** — if only 25 of 40 image URLs work, the downloader does NOT pull extra videos to make up the gap. The user wants reproducible per-kind counts.
- **Skip silently on broken URLs** — Pinterest's 404 rate on `/originals/` is ~15%. Logging every skip would drown the useful output. Final count is reported instead.
- **First-run UX**: the headed Chromium opens visibly so the user can see what's happening and complete login. After cookie persistence, subsequent runs go headless by default.
