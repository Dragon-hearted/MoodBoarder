---
system: "moodboarder"
type: index
version: 1
lastUpdated: "2026-05-27"
lastUpdatedBy: build-mode
---

# MoodBoarder

## Summary

Per-client visual-reference scraper. Given a reference image OR video (plus an optional text description), MoodBoarder analyzes the visual style with Claude vision, synthesizes 5 Pinterest search phrases, scrapes high-resolution images and/or videos from Pinterest, and assembles them into a timestamped moodboard folder bound to a specific client + deliverable. Plugs into the same `client/<client>/<deliverable>/` convention that scene-board and pinboard use, so all visual material for one deliverable lives together.

## Entry Points

- **CLI**: `src/cli.ts` — `bun run src/cli.ts --client <slug> --deliverable <slug> (--image <path> | --video <path>) [options]`
- **Orchestrator**: `src/index.ts` — sequence input → analyze → merge → keywords → scrape → download → assemble.

## Stage Definitions

1. `input-analysis` — Parses image OR video; extracts keyframes for video; produces merged `VisualDNA`.
2. `keyword-generation` — Claude synthesizes 5 Pinterest search phrases from `MergedDNA` + optional description.
3. `pinterest-authentication` — Headed first-run login; persisted cookies thereafter.
4. `scraping` — Per-keyword search + scroll; harvests `<img>` and/or `<video>` URLs per `--media`.
5. `assembly` — Writes timestamped folder under `client/<client>/<deliverable>/moodboard/`.

## Knowledge Files

- [Scope](scope.md) — System identity, capability tags, user-confirmed choices, non-goals
- [Domain Knowledge](domain.md) — Pinterest URL upgrade trick, claude CLI vision contract, ffmpeg heuristic, merged-DNA strategy
- [Acceptance Criteria](acceptance-criteria.md) — Hard gates and soft quality criteria
- [Dependencies](dependencies.md) — bun, ffmpeg, playwright, claude CLI
- [History](history.md) — Build, fix, and diagnosis history

## Cross-References

- **scene-board** — MoodBoarder output feeds Style Anchor input for scene-board storyboards (pipeline).
- **pinboard** — Both manage visual reference collections (shared-dependency).
- **instagram-scrapper** — Shares the Playwright + `cookies.json` browser-login pattern (shared-dependency).
- **autoCaption** — Shares ffmpeg for media processing (shared-dependency).
