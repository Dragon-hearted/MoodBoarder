---
system: "moodboarder"
type: acceptance-criteria
version: 1
lastUpdated: "2026-05-27"
lastUpdatedBy: build-mode
---

# Acceptance Criteria — MoodBoarder

## Hard Gates

_Binary pass/fail criteria. ALL must pass for output to be considered valid._

### Filesystem & Scaffold

- [ ] `systems/MoodBoarder/` exists with `package.json`, `tsconfig.json`, `biome.json`, `justfile`, `.gitignore`, `bun.lock`, `README.md`.
- [ ] `knowledge/` contains exactly 6 files: `index.md`, `scope.md`, `domain.md`, `acceptance-criteria.md`, `dependencies.md`, `history.md`.
- [ ] `src/` contains `cli.ts`, `index.ts`, `types.ts`, `paths.ts`, `assembler.ts`, `analyze.ts`, `dna-merge.ts`, `keywords.ts`, `browser-login.ts`, `session.ts`, `pinterest-scraper.ts`, `downloader.ts`, and `src/input/{image,video,description}.ts`.
- [ ] `prompts/` contains `visual-dna.md` and `keywords.md`.
- [ ] `tests/` contains `cli.test.ts`, `dna-merge.test.ts`, `paths.test.ts`, `pinterest-scraper.test.ts`, plus a `fixtures/` directory.

### Build & Test

- [ ] `cd systems/MoodBoarder && bun test` exits 0 with all tests passing.
- [ ] `cd systems/MoodBoarder && bunx @biomejs/biome check .` exits 0.
- [ ] `cd systems/MoodBoarder && bun build src/index.ts --outdir dist --target bun` exits 0.

### Security & Privacy (publish-audit gate)

- [ ] `git -C systems/MoodBoarder ls-files | grep -E '(cookies\.json|\.env)$'` returns no results.
- [ ] `grep -F cookies.json systems/MoodBoarder/.gitignore` returns a match.
- [ ] Tracked-file scan for absolute home paths, the maintainer's personal email, or `^client/` references returns no matches. (Pattern intentionally not pasted here so this doc doesn't self-match the audit grep.)

### Registry & Topology

- [ ] `systems.yaml` contains a `moodboarder:` block with `name`, `path`, `status`, `description`, `task_types`, `knowledge_path`, `input_types`, `output_types`, `domain_tags`, `entry_point`, `justfile: true`, `stages` (≥5), `registered_at`.
- [ ] `knowledge/graph.yaml` `systems.moodboarder` has non-empty `depends_on` and `related_systems`.
- [ ] `knowledge/graph.yaml` `metadata.systemCount == 8`.
- [ ] `.gitmodules` contains `[submodule "systems/MoodBoarder"]` with `url = https://github.com/Dragon-hearted/MoodBoarder.git`.
- [ ] `just systems-validate` exits 0.
- [ ] `just systems-health` reports MoodBoarder with `knowledge: OK` + `justfile: OK`.

### CLI Contract

- [ ] CLI rejects invalid `--media` values: exits non-zero with a clear error mentioning the allowed values.
- [ ] CLI accepts `--media images`, `--media videos`, `--media both` without error.
- [ ] CLI rejects `--count` combined with `--image-count` or `--video-count`: exits non-zero with a clear message.
- [ ] CLI rejects both `--image` and `--video` supplied at once: exits non-zero.
- [ ] CLI rejects missing `--client` / `--deliverable`: exits non-zero with field-specific error.
- [ ] CLI's `--help` text contains USAGE / FLAGS / EXAMPLES / LEARN MORE / FEEDBACK sections (pinboard `fp-002` rubric).
- [ ] Default per-kind counts: `--media both` → 40 images + 10 videos; `--media images` → 40 + 0; `--media videos` → 0 + 10.
- [ ] `--count N` sugar: `--count 50 --media both` resolves to `imageCount=35, videoCount=15` (70/30 split, total preserved).
- [ ] `--count N --media images` resolves to `imageCount=N, videoCount=0`; `--count N --media videos` resolves to `imageCount=0, videoCount=N`.

### Output Hygiene

- [ ] Assembler does NOT create empty subfolders: `--media images` → no `videos/` left behind; `--media videos` → no `images/` left behind.
- [ ] `analysis/visual_dna.json` and `analysis/search_keywords.json` exist in every output folder.
- [ ] Downloaded files are named `pin_001.jpg`…`pin_NNN.jpg` and `pin_001.mp4`…`pin_NNN.mp4` (zero-padded to 3 digits).

### End-to-End Smoke

- [ ] `cd systems/MoodBoarder && bun run src/cli.ts --client _smoke --deliverable _smoke --image tests/fixtures/sample.png --image-count 3 --video-count 2 --media both` exits 0 and creates `client/_smoke/_smoke/moodboard/moodboard_*/analysis/visual_dna.json`. Cleanup leaves no `client/_smoke/` behind.

### Publish (post-publish only)

- [ ] `gh repo view Dragon-hearted/MoodBoarder --json visibility -q '.visibility'` returns `PUBLIC`.
- [ ] `https://github.com/Dragon-hearted/MoodBoarder` is reachable.

## Soft Criteria

_Quality guidance for human judgment at approval gates. Surfaced to the engineer for review._

### Palette Consistency

The 40 downloaded pins should share the **dominant 3 colors** of the input image's `dominant_colors` field. A neon-orange pin in a moody-blue moodboard is a miss — the keyword synthesis or the scraper picked up off-vibe results. **Bold signal**: 80%+ of pins read as visually in-family with the reference.

### Subject Relevance

The pins should share the input's **primary subject** (e.g., "portrait" → portraits, "interior" → interiors). Off-subject pins (e.g., "fashion editorial portrait" returning shoe close-ups) indicate the keyword synthesis drifted. **Bold signal**: at a glance, every pin reads as the same subject category as the reference.

### Image / Video Quality

Pins should be high-resolution (>720px short side for images; >480p for videos), not thumbnail-grade. The pinimg `/736x/` upgrade handles this for most images; the downloader's `<8KB` size filter catches the rest. **Bold signal**: zero visibly-pixelated pins in the output.

### Variety Within Theme

Pinterest's recommendation engine sometimes returns 5 variations of the same shot. The 5-keyword spread should mitigate this, but if the output has visible near-duplicates the keyword set was too narrow. **Bold signal**: every pin contributes something new visually.

### CLI Output Polish

The CLI banners ("Step 1/3 — Analyzing reference image with Claude vision…", etc.) should match the reference moodboard's UX. The final line should read `✓ 28 images + 12 videos saved to client/<client>/<deliverable>/moodboard/moodboard_<ts>/`. **Bold signal**: a new operator can read the CLI output and understand exactly what happened without consulting docs.
