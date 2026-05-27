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

- [✨ Features](#features)
- [🏗 Architecture](#architecture)
- [🛠 Tech Stack](#tech-stack)
- [🚀 Getting Started](#getting-started)
- [💻 Development](#development)
- [📂 Project Structure](#project-structure)
- [🤝 Contributing](#contributing)
- [📄 License](#license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **moodboard-generation** | Core task type |
| **pinterest-scraping** | Core task type |
| **visual-reference-collection** | Core task type |
| **mood-analysis** | Core task type |
| **image-file Input** | Supported input type |
| **video-file Input** | Supported input type |
| **text-description Input** | Supported input type |
| **client-name Input** | Supported input type |
| **deliverable-slug Input** | Supported input type |
| **moodboard-image-collection Output** | Supported output type |
| **moodboard-video-collection Output** | Supported output type |
| **visual-dna-json Output** | Supported output type |
| **search-keywords-json Output** | Supported output type |

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
| **Playwright 1** | Browser automation & testing |
| **Zod 3** | Schema validation |

---

## 🚀 Getting Started

### Prerequisites

- [**Bun**](https://bun.sh/) v1.0+ — `curl -fsSL https://bun.sh/install | bash`

### Install

```bash
cd systems/MoodBoarder
bun install
```

### Run

```bash
bun run systems/MoodBoarder/src/cli.ts
```

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
├── biome.json
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
