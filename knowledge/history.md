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

## Fix Log

_Entries added by diagnosis workflow._

## Diagnosis Log

_Entries added when system issues are investigated._
