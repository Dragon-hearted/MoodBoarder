---
system: "moodboarder"
type: dependencies
version: 1
lastUpdated: "2026-05-27"
lastUpdatedBy: build-mode
---

# Dependencies — MoodBoarder

## Runtime Dependencies

_Required for the system to execute._

| Dependency | Version | Purpose |
|-----------|---------|---------|
| bun | 1.0+ | JavaScript/TypeScript runtime + package manager |
| playwright | ^1.52.0 | Headless/headed Chromium for Pinterest scraping |
| zod | ^3.23.0 | Runtime schema validation for Claude responses + CLI args |
| ffmpeg | system | Keyframe extraction from video input (`brew install ffmpeg`) |
| ffprobe | system | Video duration probe — bundled with ffmpeg |
| claude (Claude Code CLI) | latest | Vision analysis + keyword synthesis. **No API key** — reuses the user's logged-in `claude` session |

## Build Dependencies

_Required for development and building._

| Dependency | Version | Purpose |
|-----------|---------|---------|
| @biomejs/biome | ^1.9.0 | Linter + formatter (tab indent, 100-col width) |
| @types/bun | latest | Bun runtime type definitions |
| typescript | ^5.7.0 | Type checker (strict mode) |

## Optional Dependencies

_Enhance functionality but not required._

| Dependency | Version | Purpose |
|-----------|---------|---------|
| (none) | — | The reference moodboard does everything with playwright + node:https + node:fs. Do NOT add puppeteer, cheerio, axios, or image-processing libraries. |

## External Services

_APIs, models, or services the system depends on._

| Service | Purpose | Failure Impact |
|---------|---------|---------------|
| Pinterest (`pinterest.com`, `pinimg.com`, `v.pinimg.com`) | Source of moodboard pins | System cannot scrape — exits with clear error |
| Claude Code (local `claude` CLI) | Vision analysis + keyword synthesis | Analyze/keywords stages fail; can fall back to `MOODBOARDER_REPLAY_FIXTURES=1` mode in CI |

## Installation

```bash
# from monorepo root
cd systems/MoodBoarder
bun install
bunx playwright install chromium

# system-wide deps (one-time)
brew install ffmpeg  # macOS
# claude is installed via the Claude Code installer
```

## CI / Fixture-Replay Mode

CI environments do not have `claude` on PATH. When `MOODBOARDER_REPLAY_FIXTURES=1` is set, `analyze.ts` and `keywords.ts` read fixtures from `tests/fixtures/` instead of spawning `claude`. This keeps tests deterministic and CI-runnable without a Claude login.

## Pinterest Cookie Drift Note

Pinterest rotates auth cookie naming. The current best-effort cookie names are `_auth` and `_pinterest_sess` (verified 2026-05-27). The `REQUIRED_COOKIES` heuristic logs a warning and treats sessions as "needs login" rather than hard-failing on a missing specific name. If Pinterest's naming changes, update the heuristic in `src/browser-login.ts` and document the new names here.
