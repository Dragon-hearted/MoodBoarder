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

## Fix Log

### fix-002 — 2026-06-02 — Subscription-first Claude auth (don't let a dead API key block runs)

- **Symptom**: with an `ANTHROPIC_API_KEY` exported in the shell / project `.env`, the spawned `claude` subprocess billed console credits and failed **"Credit balance is too low" (exit 1)** even when the user had an active Claude Code subscription. Recurred 2026-05-28 and 2026-06-01.
- **Fix**: new `src/claude.ts` centralises the `claude` spawn with an auth-mode order — **subscription first** (spawns with `ANTHROPIC_API_KEY` stripped from the env → uses the subscription login), then **apikey** as a fallback (only if a key is set). `analyze.ts`/`keywords.ts` now delegate to it (call sites unchanged). Override via `MOODBOARDER_CLAUDE_AUTH` = `auto` (default) | `subscription` | `apikey`.
- **Why**: stripping `ANTHROPIC_API_KEY` for the child was the manual workaround used during the 2026-06-01 run (`env -u ANTHROPIC_API_KEY`); this bakes it into the system as the default and adds a fallback + opt-out.
- **Files**: `src/claude.ts` (new), `src/analyze.ts`, `src/keywords.ts`, `tests/claude.test.ts` (new, 8 cases), `knowledge/domain.md`. biome clean; 60/60 tests pass. Verified live: depleted key in env → resolves `[subscription, apikey]` → succeeds via subscription.

## Diagnosis Log

_Entries added when system issues are investigated._
