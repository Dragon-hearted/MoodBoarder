<div align="center">

![MoodBoarder](images/hero.svg)

### Per-client Pinterest moodboard generator

![Status](https://img.shields.io/badge/Status-active-brightgreen)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
![Playwright](https://img.shields.io/badge/Playwright-1-2EAD33?logo=playwright&logoColor=white)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)

</div>

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🏗 Architecture](#-architecture)
- [🛠 Tech Stack](#-tech-stack)
- [🚀 Getting Started](#-getting-started)
- [🚀 Usage](#-usage)
- [⚙️ Configuration](#️-configuration)
- [💻 Development](#-development)
- [📂 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Image reference analysis (Claude vision)** | Reads a reference image via the local `claude` CLI and extracts a structured visual DNA — subject, mood, lighting, composition, 5-hex color palette, 3 dominant colors, style, era/genre, texture. |
| **Video reference analysis** | ffmpeg extracts N evenly-spaced keyframes (intro/outro 5% trimmed), each analyzed by Claude vision, then merged into one visual DNA by frequency/mode voting across frames. |
| **Pinterest search-keyword synthesis** | Claude turns the merged visual DNA (plus an optional text nudge) into N ready-to-search Pinterest phrases. Count configurable via --keywords (default 5). |
| **Optional text-description nudge** | --description weights specific language into keyword synthesis while staying anchored to the extracted visual DNA. |
| **Hi-res Pinterest image scraping** | Playwright drives a logged-in Pinterest session, scroll-harvests pins per keyword, dedupes by pin hash keeping the largest variant, and upgrades thumbnails to /originals/ (falling back to /736x/). |
| **Pinterest video scraping** | Harvests v.pinimg.com / .mp4 sources alongside images; deduped by video hash and downloaded with a video/* content-type guard. |
| **Concurrent download with quality guards** | Pooled downloads (8 image / 3 video workers) enforce content-type prefix and minimum byte size (8KB images, 32KB videos), skipping junk avatars/thumbnails. |
| **Timestamped per-client / per-deliverable assembly** | Outputs to client/<client>/<deliverable>/moodboard/moodboard_<YYYY-MM-DD_HH-MM-SS>/ with images/, videos/, and analysis/ subfolders; empty media subdirs are pruned. |
| **Analysis artifacts** | Writes visual_dna.json and search_keywords.json into analysis/ early, so the moodboard is preserved even if the scrape stage fails. |
| **Media mode + count controls** | --media images\|videos\|both with --image-count/--video-count, or --count sugar (splits 70/30 image:video under 'both'). |
| **Session reuse + headed-login fallback** | Reuses saved Pinterest cookies (cookies.json) headlessly; falls back to an interactive headed browser login when cookies are missing or stale. --headless opts into headless after first login. |
| **Fixture-replay (CI) mode** | MOODBOARDER_REPLAY_FIXTURES=1 reads visual DNA + keywords from fixtures and skips the live scrape — deterministic, runnable without a Claude login or Pinterest session. |

---

## 🏗 Architecture

![Pipeline](images/pipeline.svg)

MoodBoarder processes data through a multi-stage pipeline.

---

## 🛠 Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| **TypeScript 5.7** | Type safety |
| **Bun** | JavaScript runtime & package manager |
| **Playwright 1** | Browser automation & scraping |
| **Zod 3** | Schema validation |

---

## 🚀 Getting Started

### Prerequisites

- Bun v1.0+ — curl -fsSL https://bun.sh/install | bash
- Claude Code CLI (`claude`) logged in — powers vision analysis + keyword synthesis. No API key; it reuses your local `claude` session.
- Playwright Chromium — bunx playwright install chromium
- ffmpeg + ffprobe (only for --video input) — brew install ffmpeg
- A Pinterest account — first run opens a headed browser for manual login; cookies are cached to cookies.json thereafter.
- Must run from inside the Adcelerate monorepo — output path resolves against the systems.yaml root marker.

### Install

```bash
cd systems/MoodBoarder
bun install
bunx playwright install chromium    # one-time
brew install ffmpeg                  # only needed for --video input
```

---

## 🚀 Usage

### 1. Show all commands and flags

```bash
bun run src/cli.ts --help
```

> **Expected:** Prints usage, the full flag list (--client, --deliverable, --image/--video, --media, --count, etc.), and examples. Verified.

### 2. Validate arguments fail-fast

```bash
bun run src/cli.ts --client acme
```

> **Expected:** Exits non-zero with 'error: --deliverable is required'. Verified — required-arg and mutually-exclusive --image/--video / --count conflict guards all fire.

### 3. Dry-run end-to-end (fixture replay, no credentials)

```bash
MOODBOARDER_REPLAY_FIXTURES=1 MOODBOARDER_FIXTURE_DIR=tests/fixtures bun run src/cli.ts --client acme --deliverable spring-launch --image tests/fixtures/sample.png --media images
```

> **Expected:** Verified — runs all 3 stages from fixtures, skips the live scrape, and writes client/acme/spring-launch/moodboard/moodboard_<timestamp>/analysis/{visual_dna.json,search_keywords.json}.

### 4. Generate an image moodboard from a reference image

```bash
bun run src/cli.ts --client acme --deliverable spring-launch --image ref.jpg
```

> **Expected:** requires logged-in `claude` CLI session + Pinterest login — not executed. Analyzes ref.jpg, synthesizes 5 keywords, scrapes Pinterest, and saves up to 40 images + 10 videos under client/acme/spring-launch/moodboard/moodboard_<timestamp>/.

### 5. Images only with a custom target count

```bash
bun run src/cli.ts --client acme --deliverable spring-launch --image ref.jpg --media images --image-count 60
```

> **Expected:** requires logged-in `claude` CLI session + Pinterest login — not executed. Saves up to 60 images and no videos.

### 6. Video reference with a total count and description nudge

```bash
bun run src/cli.ts --client acme --deliverable spring-launch --video ref.mp4 --count 30 --description "soft natural light"
```

> **Expected:** requires logged-in `claude` CLI session + Pinterest login + ffmpeg — not executed. Extracts 5 keyframes, analyzes each, merges DNA, and saves 30 assets split 70/30 (≈21 images + 9 videos).

### 7. Headless scrape after first login

```bash
bun run src/cli.ts --client acme --deliverable spring-launch --image ref.jpg --headless
```

> **Expected:** requires cached Pinterest cookies (cookies.json) from a prior headed login — not executed. Runs Chromium headless using saved cookies; falls back to headed login if cookies are stale.

### Command Reference

| Command | Description |
|---------|-------------|
| `bun run src/cli.ts --help` | List all commands and flags. |
| `just scrape <args>` | Proxy to the CLI (e.g. just scrape --client acme --deliverable d --image ref.jpg). |
| `just install-chromium` | Install the Playwright Chromium browser (one-time). |
| `bun test` | Run the test suite (52 tests; fixture-replay paths require no credentials). Verified passing. |
| `bun run lint` | Biome lint check (tab indent, 100-col width). |
| `bun run check` | Biome check + auto-fix formatting. |
| `bun run build` | Bundle src/index.ts to dist/ (Playwright/Chromium externalized). |
| `just diagnose moodboarder` | Run Adcelerate Diagnose Mode against this system. |

---

## ⚙️ Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MOODBOARDER_REPLAY_FIXTURES` | No | Set to 1 to read visual DNA + keywords from fixtures and skip the live Pinterest scrape (CI / offline / dry-run). |
| `MOODBOARDER_FIXTURE_DIR` | No | Directory holding visual_dna.json + search_keywords.json fixtures used when MOODBOARDER_REPLAY_FIXTURES=1 (e.g. tests/fixtures). |

---

## 💻 Development

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development mode |
| `bun run build` | Build for production |
| `bun test` | Run tests |
| `bun run lint` | Check code quality |

---

## 📂 Project Structure

```
MoodBoarder/
├── README.md
├── biome.json
├── images
│   ├── hero.svg
│   └── pipeline.svg
├── justfile
├── knowledge
│   ├── acceptance-criteria.md
│   ├── dependencies.md
│   ├── domain.md
│   ├── history.md
│   ├── index.md
│   └── scope.md
├── package.json
├── prompts
│   ├── keywords.md
│   └── visual-dna.md
├── scripts
│   ├── precomputed
│   │   ├── search_keywords.json
│   │   └── visual_dna.json
│   ├── preview-keywords.ts
│   └── run-with-precomputed.ts
├── src
│   ├── analyze.ts
│   ├── assembler.ts
│   ├── browser-login.ts
│   ├── cli.ts
│   ├── dna-merge.ts
│   ├── downloader.ts
│   ├── index.ts
│   ├── input
│   │   ├── description.ts
│   │   ├── image.ts
│   │   └── video.ts
│   ├── keywords.ts
│   ├── paths.ts
│   ├── pinterest-scraper.ts
│   ├── session.ts
│   └── types.ts
├── tests
│   ├── assembler.test.ts
│   ├── cli.test.ts
│   ├── dna-merge.test.ts
│   ├── fixtures
│   │   ├── sample.png
│   │   ├── search_keywords.json
│   │   └── visual_dna.json
│   ├── paths.test.ts
│   └── pinterest-scraper.test.ts
└── tsconfig.json
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and ensure tests pass
4. Commit your changes and open a pull request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Built with** 🧡 **using Bun, TypeScript**

</div>
