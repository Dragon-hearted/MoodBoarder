---
system: "moodboarder"
type: execution
driver: cli
entry: "just scrape --client <slug> --deliverable <slug> (--image <path> | --video <path>) [--description <text>] [--media images|videos|both] [--headless]"
mode: orchestrate
gates: executor
version: 1
lastUpdated: "2026-06-04"
lastUpdatedBy: build-mode
---

# Execution — MoodBoarder

How Execute Mode (`/adcelerate-execute`) runs this system. Execute Mode reads ONLY this manifest to decide how to run, then branches on `driver`.

## Invocation
Run the CLI (equivalently `bun run src/cli.ts <flags>`). Requires the logged-in `claude` CLI on PATH plus `ffmpeg`/`ffprobe`; first run opens a headed Chromium for Pinterest login. The full pipeline runs in a single invocation:

```
just scrape --client <slug> --deliverable <slug> (--image <path> | --video <path>) \
  [--description <text>] [--media images|videos|both] [--image-count <n>] [--video-count <n>] [--headless]
```

## Natural flow (awareness only — the system drives this on the skill path)
1. **input-analysis** — merge VisualDNA from the reference image (single frame) or video (N ffmpeg keyframes, mode-merged categorical fields, top-5 color palette).
2. **keyword-generation** — Claude CLI synthesizes N (default 5) Pinterest search phrases from the merged DNA + optional description.
3. **pinterest-authentication** — first-run headed Chromium login persists `cookies.json`; subsequent runs reuse it (use `--headless`).
4. **scraping** — collect deduplicated `PinAsset[]` (image and/or video URLs), gated by `--media`.
5. **assembly** — write `client/<client>/<deliverable>/moodboard/moodboard_<ts>/` with `images/` + `videos/` subfolders and `analysis/{visual_dna,search_keywords}.json`.

## Where the agent must check / supply input
- **input-analysis** — supply **`--client`** and **`--deliverable`** slugs (required), the **reference media** (`--image` or `--video`, required), and an optional **`--description`** nudge.
- **keyword-generation** — optionally review the synthesized keywords before scraping; set **`--keywords <n>`** / **`--media`** / count flags.
- **pinterest-authentication** — on first run, the engineer must complete the **Pinterest login** in the headed browser; persisted thereafter.
- **assembly** — review the output folder for **pin relevance** (color/subject match against the reference).

## Validation
After execution, validate the output against [acceptance-criteria.md](acceptance-criteria.md) (hard gates inline, soft criteria via the validator). Applies to both drivers.
