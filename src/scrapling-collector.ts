/**
 * Scrapling collector — the opt-in `--engine scrapling` harvest path.
 *
 * Instead of driving Pinterest with the local Playwright browser
 * (`pinterest-scraper.ts`), this shells out to the in-repo **scrape-engine** CLI
 * (`systems/scrape-engine/src/cli.ts`), which runs a Scrapling StealthyFetcher
 * sidecar with anti-bot + adaptive extraction. We talk to it over a process
 * boundary (one `fetch … --json` invocation per keyword) — the same
 * spawn-a-sibling-system pattern used elsewhere in the repo (claude, higgsfield,
 * scene-board → image-engine) — so MoodBoarder takes NO TypeScript dependency on
 * scrape-engine and a standalone clone still runs on the default Playwright path.
 *
 * The raw URLs come back through scrape-engine, then run through MoodBoarder's
 * EXISTING pure helpers (pinHash / videoHash / pinResolutionRank / toHiRes /
 * isJunkPinUrl) so the resulting PinAsset[] is byte-identical to the Playwright
 * path's dedup/upgrade contract.
 *
 * Any failure here throws — index.ts catches and falls back to Playwright for
 * that keyword.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isJunkPinUrl, pinHash, pinResolutionRank, toHiRes, videoHash } from "./pinterest-scraper";
import type { MediaMode, PinAsset } from "./types";

/** Raised on any scrape-engine failure (missing engine, block, timeout, bad output). */
export class ScrapeEngineError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScrapeEngineError";
	}
}

/** Shape of one extracted element in scrape-engine's FetchResult.extracted. */
interface ExtractedElement {
	text?: string;
	attributes?: Record<string, string | null>;
}

/**
 * Resolve the scrape-engine CLI entry point. Defaults to the sibling system in
 * the monorepo layout (`systems/scrape-engine/src/cli.ts`); override with
 * SCRAPE_ENGINE_CLI for non-standard checkouts.
 */
function getScrapeEngineCli(): string {
	if (process.env.SCRAPE_ENGINE_CLI) return process.env.SCRAPE_ENGINE_CLI;
	const here =
		typeof import.meta !== "undefined" && import.meta.url
			? dirname(fileURLToPath(import.meta.url))
			: __dirname;
	// src → MoodBoarder root → systems/ → scrape-engine/src/cli.ts
	return resolve(here, "..", "..", "scrape-engine", "src", "cli.ts");
}

/** The `bun` runner (overridable via SCRAPE_ENGINE_BUN, e.g. an absolute path). */
function getBun(): string {
	return process.env.SCRAPE_ENGINE_BUN ?? "bun";
}

const SEARCH_URL = (keyword: string): string =>
	`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}&rs=typed`;

interface SpawnOutcome {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Spawn `bun <cli> <args…>`, capturing output. Never throws on non-zero exit. */
async function spawnEngine(cli: string, args: string[]): Promise<SpawnOutcome> {
	const bin = getBun();
	const argv = [bin, cli, ...args];

	const bun = (globalThis as { Bun?: typeof import("bun") }).Bun;
	if (bun?.spawn) {
		const proc = bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env });
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;
		return { exitCode, stdout, stderr };
	}

	const { spawn } = await import("node:child_process");
	return new Promise<SpawnOutcome>((resolvePromise) => {
		const child = spawn(bin, [cli, ...args], {
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr?.on("data", (d: Buffer) => {
			stderr += d.toString();
		});
		child.on("error", (err: Error) =>
			resolvePromise({ exitCode: 127, stdout, stderr: String(err) }),
		);
		child.on("close", (code: number | null) =>
			resolvePromise({ exitCode: code ?? 0, stdout, stderr }),
		);
	});
}

/** Pull every candidate URL (src + srcset members) off one extracted element. */
function urlsFromElement(el: ExtractedElement): string[] {
	const attrs = el.attributes ?? {};
	const out: string[] = [];
	const src = attrs.src;
	if (src) out.push(src);
	const srcset = attrs.srcset;
	if (srcset) {
		for (const entry of srcset.split(",")) {
			const u = entry.trim().split(/\s+/)[0];
			if (u) out.push(u);
		}
	}
	return out;
}

/**
 * Map scrape-engine's `extracted` payload into PinAsset[] using MoodBoarder's
 * existing dedup/upgrade rules. Pure + exported for unit testing.
 */
export function extractedToPinAssets(
	extracted: Record<string, ExtractedElement[]> | undefined,
	media: MediaMode,
): PinAsset[] {
	const seenImages = new Map<string, string>(); // pinHash → best URL
	const seenVideos = new Map<string, string>(); // videoHash → URL

	const wantImages = media === "images" || media === "both";
	const wantVideos = media === "videos" || media === "both";

	for (const el of extracted?.images ?? []) {
		for (const u of urlsFromElement(el)) {
			if (!u.includes("pinimg.com") || isJunkPinUrl(u)) continue;
			if (wantImages) {
				const h = pinHash(u);
				const existing = seenImages.get(h);
				// Best-URL contract: keep the larger variant for the same pin.
				if (!existing || pinResolutionRank(u) > pinResolutionRank(existing)) {
					seenImages.set(h, u);
				}
			}
		}
	}

	for (const el of extracted?.videos ?? []) {
		for (const u of urlsFromElement(el)) {
			if (!(/v\d*\.pinimg\.com/.test(u) || /\.mp4(\?|$)/.test(u))) continue;
			if (wantVideos) {
				const h = videoHash(u);
				if (!seenVideos.has(h)) seenVideos.set(h, u);
			}
		}
	}

	const assets: PinAsset[] = [];
	for (const u of seenImages.values()) {
		const best = pinResolutionRank(u) >= 736 ? u : toHiRes(u);
		assets.push({ kind: "image", url: best, ext: "jpg" });
	}
	for (const u of seenVideos.values()) {
		assets.push({ kind: "video", url: u, ext: "mp4" });
	}
	return assets;
}

interface ScraplingCollectOptions {
	media: MediaMode;
	timeoutMs?: number;
}

/**
 * Harvest one keyword's PinAssets via the scrape-engine StealthyFetcher.
 * Throws ScrapeEngineError on any failure (caller falls back to Playwright).
 *
 * NOTE: a single StealthyFetcher fetch is ONE page load — not the 14-round
 * scroll harvest of the Playwright path — so per-keyword yield is lower
 * (typically ~one screen of pins). The anti-bot/adaptive resilience is the
 * trade. (Documented in knowledge/domain.md.)
 */
export async function collectForKeywordViaScrapling(
	keyword: string,
	cookiesPath: string,
	opts: ScraplingCollectOptions,
): Promise<PinAsset[]> {
	const cli = getScrapeEngineCli();
	const url = SEARCH_URL(keyword);
	const args = [
		"fetch",
		url,
		"--fetcher",
		"stealthy",
		"--output",
		"extracted",
		"--css",
		"images=img",
		"--css",
		"videos=video, video source",
		"--attr",
		"src",
		"--attr",
		"srcset",
		"--cookies",
		cookiesPath,
		"--timeout-ms",
		String(opts.timeoutMs ?? 45_000),
		"--json",
	];

	const { exitCode, stdout, stderr } = await spawnEngine(cli, args);
	if (exitCode !== 0) {
		const tail = stderr.trim().slice(-400) || stdout.trim().slice(-400) || "no output";
		throw new ScrapeEngineError(`scrape-engine exit ${exitCode}: ${tail}`);
	}

	let parsed: { ok?: boolean; extracted?: Record<string, ExtractedElement[]> };
	try {
		parsed = JSON.parse(stdout.trim());
	} catch {
		throw new ScrapeEngineError(
			`scrape-engine produced no parseable JSON: ${stderr.trim().slice(-300)}`,
		);
	}
	if (parsed.ok !== true) {
		throw new ScrapeEngineError(`scrape-engine returned a non-ok result for "${keyword}"`);
	}

	return extractedToPinAssets(parsed.extracted, opts.media);
}
