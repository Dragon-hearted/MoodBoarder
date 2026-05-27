# MoodBoarder
set dotenv-load := true

# List all recipes
default:
  @just --list

# Run in development mode (watch)
dev:
  bun run dev

# Run a one-off scrape (proxies to the CLI)
scrape *args:
  bun run src/cli.ts {{args}}

# Run tests
test:
  bun test

# Build for production
build:
  bun run build

# Lint code
lint:
  bun run lint

# Check and fix formatting
check:
  bun run check

# Install Playwright Chromium (one-time)
install-chromium:
  bunx playwright install chromium
