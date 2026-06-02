---
system: "moodboarder"
type: history
version: 1
lastUpdated: "2026-05-27"
lastUpdatedBy: build-mode
---

# History — MoodBoarder

## Build Log

### 2026-05-27 — Initial Build

- **Built by**: build-mode (non-interactive run of `/adcelerate-build`, driven by `specs/build-moodboarder-system.md`)
- **Knowledge captured**:
  - Pinterest URL upgrade trick (`/236x/` → `/736x/` → `/originals/`) for hi-res images.
  - Distinct video pin URL pattern on `v.pinimg.com`; no resolution-swap (single best-rez served).
  - ffmpeg keyframe heuristic: N evenly-spaced frames with first/last 5% dropped to skip intro/outro slates.
  - Merged-DNA strategy: mode for categorical fields, union → top-5 for color palette.
  - Pinterest cookie names drift — heuristic warn-don't-hard-fail (vs Instagram's stable cookie names).
  - Claude CLI vision contract: `claude --print --allowedTools Read --add-dir <dir>` for image, text-only for keywords; no API key.
- **Acceptance criteria**: 25+ hard gates (filesystem, build, security, registry, CLI contract, output hygiene, smoke), 5 soft criteria (palette, subject, quality, variety, CLI polish).
- **Validation**: see the Adcelerate parent monorepo's `specs/_validation-moodboarder.md`.
- **Reference**: Ported from an internal `my-moodboard` prototype (Claude-vision → 5 keywords → headed Chromium → 40 images). Re-implemented in TypeScript + Bun + Zod on top of Adcelerate scaffolding (instagram-scrapper auth pattern, autoCaption ffmpeg pattern, scene-board client-deliverable folder convention).

## Execute Log

### 2026-05-28 — dragonhearted_labs / social-launch-pixel

- **System**: MoodBoarder (via precomputed driver `scripts/run-with-precomputed.ts`)
- **Reason for driver**: claude CLI returned "Credit balance is too low"; Stages 1 (VisualDNA) + 2 (keywords) authored manually instead.
- **Input**: `/Users/dragonhearted/Downloads/pixel_avatar.png`
- **Stages**: analyze (manual) → keywords (manual, rejected once, modified for low-poly/pixel/glitch aesthetic) → login (auto-detect, cookies cached) → scrape (5 keywords, 1266 unique pins) → download (67 saved, 0 skipped) → finalize
- **Output**: `client/dragonhearted_labs/social-launch-pixel/moodboard/moodboard_2026-05-28_09-18-01/` (67 images, 31 MB)
- **Validation**: Hard gates output-level PASS (analysis JSONs, pin_NNN naming, no empty subdirs, all files >8 KB).
- **Delivered**: Yes

### 2026-06-01 — dragonhearted_labs / brand-identity

- **System**: MoodBoarder (standard pipeline, via `/adcelerate-execute`)
- **Input**: 8 reference images (3 WhatsApp jpegs + 5 macOS screenshots; screenshots use U+202F narrow-no-break space before "PM" — staged to `.tmp/dragonhearted_refs/` with clean names).
- **Credit block + fix**: `claude` subprocess hit "Credit balance is too low" again (same as 2026-05-28). Root cause: an `sk-ant-...` `ANTHROPIC_API_KEY` is exported in the shell + project `.env`, so the CLI bills console credits (depleted) instead of the Claude Code subscription. **Fix: run with `env -u ANTHROPIC_API_KEY`** → CLI falls back to subscription auth and the standard analyze/keywords pipeline works (no manual driver needed this time).
- **Strategy**: one run per reference (8 runs), images-only, 25 each. First cat run subject-locked ("low poly cat"); switched to a **subject-suppressing, phrase-seeded `--description`** to force style-forward keywords (the `--description` lever alone can override subject-lock only when it explicitly instructs "ignore the subject" + seeds phrases — a plain style blurb does not, because the keyword prompt anchors to the DNA `subject`).
- **Gotcha confirmed**: `MOODBOARDER_REPLAY_FIXTURES=1` skips the Pinterest scrape entirely (CI-only) — cannot be used to inject keywords for a real run. Also `--headless` produced 0 downloads (all candidates skipped) while headed saved ~30; **use headed mode**.
- **Output**: 8 folders renamed by cluster under `client/dragonhearted_labs/brand-identity/moodboard/` — `01-lowpoly-3d`, `02-lowpoly-neon-glow`, `03-ascii-dotmatrix`, `04-crt-phosphor`, `05-y2k-chrome`, `06-ascii-glow-night`, `07-chrome-space`, `08-popart-screenprint`. **248 images total**.
- **Validation**: Output hard gates PASS 8/8 (analysis JSONs present, `pin_NNN.jpg` naming, no empty `videos/`). Soft: strong style cohesion, all 7 named vibes covered; minor drift in pop-art cluster (~1–2 folk-art pins).
- **Delivered**: Yes (engineer approved + requested cluster-label rename).

### 2026-06-01 — dragonhearted_labs / brand-identity (re-run after fix-001)

- Re-ran all 8 references after patching the keyword-spread bug (see Fix Log fix-001). **250 images**, each cluster now sampling ~evenly across its 5 keywords.
- One run (ref_05 chrome) hit a transient Playwright `goto` timeout on its 5th keyword and aborted (0 saved); single retry succeeded (32 saved). Tier-1 recovery.
- Output hard gates PASS 8/8. Folders relabeled by cluster (`01-lowpoly-3d` … `08-popart-screenprint`). A `gallery.html` contact-sheet generator lives at monorepo `.tmp/make_gallery.ts` → writes into the moodboard dir.

## Feature Log

### feat-001 — 2026-06-02 — Opt-in `--engine scrapling` (scrape-engine adoption)

- Added an opt-in harvest path behind `--engine scrapling` (or `MOODBOARDER_ENGINE=scrapling`); default stays `playwright`, so existing behavior is unchanged.
- `src/scrapling-collector.ts` shells out to the in-repo **scrape-engine** CLI (`fetch … --json`) over a process boundary — the repo's spawn-a-sibling pattern (no TS dependency on scrape-engine; a standalone MoodBoarder clone still runs the default path). Raw URLs run back through the existing `pinHash`/`videoHash`/`pinResolutionRank`/`toHiRes`/`isJunkPinUrl` helpers, so the `PinAsset[]` contract is identical across engines.
- Per-keyword routing in `index.ts`: on ANY scrape-engine failure (block / dependency / timeout) it reverts to the Playwright `collectForKeyword` for that keyword; composes with the per-keyword resilience try/catch.
- Engine CLI path overridable via `SCRAPE_ENGINE_CLI` / `SCRAPE_ENGINE_BUN`. Verified live: a stealthy fetch returned 45 hi-res image PinAssets (~22s) with the real `cookies.json`. biome + tsc clean; +8 unit tests for `extractedToPinAssets`.
- **Trade-off:** one StealthyFetcher fetch ≠ the 14-round Playwright scroll, so per-keyword yield is lower (~one screen of pins). Use scrapling when anti-bot/markup-drift resilience matters; Playwright when raw yield does.

## Fix Log

### fix-001 — 2026-06-01 — Downloads drained keyword 1 only (no keyword spread)

- **Symptom**: every cluster's images came 100% from the FIRST of its 5 keywords; keywords 2–5 contributed nothing.
- **Root cause**: `index.ts` collected pins into one Map in keyword order (`[...kw1, ...kw2new, ...]`); `downloader.ts` walks candidates in order and stops at the target (25). Since a single keyword yields 200–367 uniques (>> 25), the downloader never reached later keywords.
- **Fix**: `index.ts` now keeps per-keyword buckets of first-seen pins and **round-robin interleaves** them (`interleave()`) before download, so take-first-N samples ~evenly across all keywords. Global dedup preserved. Verified: biome clean, 52/52 tests pass, visible variety in re-run output.
- **Files**: `src/index.ts` (scrape/collect block). No CLI/schema change.

### fix-002 — 2026-06-02 — Subscription-first Claude auth (don't let a dead API key block runs)

- **Symptom**: with an `ANTHROPIC_API_KEY` exported in the shell / project `.env`, the spawned `claude` subprocess billed console credits and failed **"Credit balance is too low" (exit 1)** even when the user had an active Claude Code subscription. Recurred 2026-05-28 and 2026-06-01.
- **Fix**: new `src/claude.ts` centralises the `claude` spawn with an auth-mode order — **subscription first** (spawns with `ANTHROPIC_API_KEY` stripped from the env → uses the subscription login), then **apikey** as a fallback (only if a key is set). `analyze.ts`/`keywords.ts` now delegate to it (call sites unchanged). Override via `MOODBOARDER_CLAUDE_AUTH` = `auto` (default) | `subscription` | `apikey`.
- **Why**: stripping `ANTHROPIC_API_KEY` for the child was the manual workaround used during the 2026-06-01 run (`env -u ANTHROPIC_API_KEY`); this bakes it into the system as the default and adds a fallback + opt-out.
- **Files**: `src/claude.ts` (new), `src/analyze.ts`, `src/keywords.ts`, `tests/claude.test.ts` (new, 8 cases), `knowledge/domain.md`. biome clean; 60/60 tests pass. Verified live: depleted key in env → resolves `[subscription, apikey]` → succeeds via subscription.

## Diagnosis Log

_Entries added when system issues are investigated._
