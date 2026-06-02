import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyUrl, pinHash, pinResolutionRank, toHiRes, videoHash } from "./pinterest-scraper";
import type { MediaMode, PinAsset } from "./types";

/**
 * Sentinel raised whenever the scrape-engine subprocess can't deliver a usable
 * result — non-zero exit, unparseable stdout, or `ok !== true`. The caller in
 * index.ts catches THIS (or any error) and falls back to the Playwright harvest.
 * We deliberately do NOT replicate scrape-engine's typed-error taxonomy across
 * the process boundary: any failure means "fall back".
 */
export class ScrapeEngineUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScrapeEngineUnavailableError";
	}
}

// Same junk filter as pinterest-scraper's private isJunkPinUrl (replicated
// inline per contract — it isn't exported).
function isJunkPinUrl(u: string): boolean {
	return (
		u.includes("/avatars/") ||
		u.includes("/user_images/") ||
		u.includes("/75x75/") ||
		u.includes("/45x45/")
	);
}

/** Default scrape-engine system dir: sibling `../scrape-engine` of MoodBoarder. */
function defaultScrapeEngineDir(): string {
	const here = dirname(fileURLToPath(import.meta.url)); // .../MoodBoarder/src
	return resolve(here, "..", "..", "scrape-engine");
}

interface ExtractedElement {
	text?: string;
	attributes?: Record<string, string | null>;
}

/**
 * Pull the candidate URLs out of one extracted element: its `src` plus the first
 * URL of each `srcset` entry (split on commas, then on whitespace).
 */
function urlsFromElement(el: ExtractedElement): string[] {
	const attrs = el.attributes ?? {};
	const out: string[] = [];
	const src = attrs.src;
	if (src) out.push(src);
	const srcset = attrs.srcset;
	if (srcset) {
		for (const entry of srcset.split(",")) {
			const first = entry.trim().split(/\s+/)[0];
			if (first) out.push(first);
		}
	}
	return out;
}

/**
 * Opt-in Pinterest harvest via the sibling scrape-engine CLI (StealthyFetcher +
 * adaptive CSS). Spawns the CLI as a subprocess (no shell — array args avoid the
 * comma in the video selector being mangled). On ANY failure throws
 * ScrapeEngineUnavailableError so the caller can fall back to Playwright.
 *
 * Mirrors collectForKeyword's asset-shaping exactly, reusing the exported
 * helpers (pinHash/videoHash/pinResolutionRank/toHiRes/classifyUrl).
 */
export async function collectForKeywordViaScrapling(
	keyword: string,
	opts: { media: MediaMode; cookiesPath?: string; scrapeEngineDir?: string },
): Promise<PinAsset[]> {
	const dir = opts.scrapeEngineDir ?? process.env.SCRAPE_ENGINE_DIR ?? defaultScrapeEngineDir();
	const q = encodeURIComponent(keyword);
	const url = `https://www.pinterest.com/search/pins/?q=${q}&rs=typed`;

	const args = [
		"run",
		`${dir}/src/cli.ts`,
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
		"--adaptive",
		"--headless",
		"--timeout-ms",
		"35000",
		"--json",
	];
	if (opts.cookiesPath) {
		args.push("--cookies", opts.cookiesPath);
	}

	let stdout: string;
	let stderr: string;
	let exitCode: number;
	try {
		const proc = Bun.spawn(["bun", ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: process.env,
		});
		const [out, err, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		stdout = out;
		stderr = err;
		exitCode = code;
	} catch (e) {
		throw new ScrapeEngineUnavailableError(
			`failed to spawn scrape-engine CLI: ${e instanceof Error ? e.message : String(e)}`,
		);
	}

	if (exitCode !== 0) {
		throw new ScrapeEngineUnavailableError(
			`scrape-engine exited ${exitCode}: ${stderr.trim().slice(-500) || "(no stderr)"}`,
		);
	}

	let parsed: {
		ok?: boolean;
		extracted?: Record<string, ExtractedElement[]>;
	};
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new ScrapeEngineUnavailableError(
			`scrape-engine stdout was not valid JSON: ${stdout.trim().slice(0, 300)}`,
		);
	}

	if (parsed.ok !== true) {
		throw new ScrapeEngineUnavailableError(
			`scrape-engine returned ok=${String(parsed.ok)}: ${stderr.trim().slice(-500) || stdout.trim().slice(0, 300)}`,
		);
	}

	const extracted = parsed.extracted ?? {};
	const imageEls = extracted.images ?? [];
	const videoEls = extracted.videos ?? [];

	const seenImages = new Map<string, string>(); // hash → best URL
	const seenVideos = new Map<string, string>(); // hash → URL

	if (opts.media === "images" || opts.media === "both") {
		for (const el of imageEls) {
			for (const u of urlsFromElement(el)) {
				if (!u) continue;
				if (classifyUrl(u) !== "image") continue;
				if (isJunkPinUrl(u)) continue;
				const h = pinHash(u);
				const existing = seenImages.get(h);
				if (!existing || pinResolutionRank(u) > pinResolutionRank(existing)) {
					seenImages.set(h, u);
				}
			}
		}
	}

	if (opts.media === "videos" || opts.media === "both") {
		for (const el of videoEls) {
			for (const u of urlsFromElement(el)) {
				if (!u) continue;
				if (classifyUrl(u) !== "video") continue;
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
