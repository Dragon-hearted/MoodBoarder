#!/usr/bin/env bun
// Driver that bypasses the claude-CLI analyze+keywords stages by accepting a
// pre-authored visual_dna.json + search_keywords.json, then runs the scrape +
// download + assembly stages directly. Used when the claude CLI is unavailable
// (e.g. depleted credits) but the operator can supply the DNA/keywords manually.
//
// Also replaces the stdin-blocking Pinterest login prompt with a polling loop
// that auto-detects login completion, so the driver can run from a context
// without an interactive TTY.

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { type Browser, type BrowserContext, chromium } from "playwright";
import {
	finalizeNaming,
	prepareOutputDirs,
	pruneEmptySubdirs,
	writeAnalysis,
} from "../src/assembler";
import { downloadAssets } from "../src/downloader";
import { buildClientPath, nowTimestamp } from "../src/paths";
import { collectForKeyword } from "../src/pinterest-scraper";
import { loadSession, saveSession } from "../src/session";
import {
	KeywordsSchema,
	type MediaMode,
	MediaModeSchema,
	MergedDNASchema,
	type PinAsset,
} from "../src/types";

interface Args {
	client: string;
	deliverable: string;
	dna: string;
	keywords: string;
	media: MediaMode;
	imageCount: number;
	videoCount: number;
	headless: boolean;
	loginTimeoutSec: number;
}

function parseArgs(): Args {
	const a: Partial<Args> = { headless: false, loginTimeoutSec: 600 };
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const k = argv[i];
		const v = argv[i + 1];
		switch (k) {
			case "--client":
				a.client = v;
				i++;
				break;
			case "--deliverable":
				a.deliverable = v;
				i++;
				break;
			case "--dna":
				a.dna = v;
				i++;
				break;
			case "--keywords":
				a.keywords = v;
				i++;
				break;
			case "--media":
				a.media = MediaModeSchema.parse(v);
				i++;
				break;
			case "--image-count":
				a.imageCount = Number.parseInt(v, 10);
				i++;
				break;
			case "--video-count":
				a.videoCount = Number.parseInt(v, 10);
				i++;
				break;
			case "--headless":
				a.headless = true;
				break;
			case "--login-timeout":
				a.loginTimeoutSec = Number.parseInt(v, 10);
				i++;
				break;
			default:
				throw new Error(`Unknown flag: ${k}`);
		}
	}
	if (!a.client || !a.deliverable || !a.dna || !a.keywords) {
		throw new Error("--client, --deliverable, --dna, --keywords are required");
	}
	a.media ??= "both";
	a.imageCount ??= a.media === "videos" ? 0 : 40;
	a.videoCount ??= a.media === "images" ? 0 : 10;
	return a as Args;
}

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function createContext(browser: Browser, cookies?: unknown[]): Promise<BrowserContext> {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		userAgent: USER_AGENT,
		locale: "en-US",
		extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
	});
	await context.addInitScript(() => {
		Object.defineProperty(navigator, "webdriver", { get: () => undefined });
	});
	if (cookies && cookies.length > 0) {
		// biome-ignore lint/suspicious/noExplicitAny: cookies shape is internal
		await context.addCookies(cookies as any);
	}
	return context;
}

async function pollUntilLoggedIn(
	context: BrowserContext,
	timeoutSec: number,
): Promise<void> {
	const page = await context.newPage();
	await page.goto("https://www.pinterest.com/", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(2_000);

	const start = Date.now();
	const deadline = start + timeoutSec * 1000;
	console.log("");
	console.log("  ┌─────────────────────────────────────────────────────────┐");
	console.log("  │  Pinterest login window opened.                         │");
	console.log("  │  Log in there. The driver will auto-detect when you     │");
	console.log("  │  are logged in and continue — no Enter key needed.      │");
	console.log("  └─────────────────────────────────────────────────────────┘");

	let lastReport = 0;
	while (Date.now() < deadline) {
		const loggedIn = await page.evaluate(
			() =>
				!document.querySelector('[data-test-id="login-button"]') &&
				!document.querySelector('[data-test-id="signup-button"]'),
		);
		if (loggedIn) {
			console.log("  [login] detected logged-in state, continuing");
			await page.close();
			return;
		}
		const elapsed = Math.floor((Date.now() - start) / 1000);
		if (elapsed - lastReport >= 15) {
			console.log(`  [login] still waiting (${elapsed}s of ${timeoutSec}s)…`);
			lastReport = elapsed;
		}
		await page.waitForTimeout(3_000);
	}
	await page.close();
	throw new Error(`Login not detected within ${timeoutSec}s`);
}

async function main() {
	const args = parseArgs();

	const dnaRaw = JSON.parse(readFileSync(resolve(args.dna), "utf8"));
	const dna = MergedDNASchema.parse(dnaRaw);
	const kwRaw = JSON.parse(readFileSync(resolve(args.keywords), "utf8"));
	const keywords = KeywordsSchema.parse(kwRaw);

	console.log("╔══════════════════════════════════════╗");
	console.log("║   MoodBoarder (precomputed driver)   ║");
	console.log("╚══════════════════════════════════════╝");
	console.log(`  Client: ${args.client}`);
	console.log(`  Deliverable: ${args.deliverable}`);
	console.log(`  Media: ${args.media} (images=${args.imageCount}, videos=${args.videoCount})`);
	console.log(`  Subject: ${dna.subject} | Mood: ${dna.mood} | Style: ${dna.style}`);
	console.log("  Keywords:");
	keywords.keywords.forEach((k, i) => console.log(`    ${i + 1}. ${k}`));

	const timestamp = nowTimestamp();
	const paths = buildClientPath(args.client, args.deliverable, timestamp);
	prepareOutputDirs(paths, args.media);
	writeAnalysis(paths, dna, keywords);
	const moodboardRelative = relative(paths.root, paths.moodboardDir);
	console.log(`\n  Output: ${moodboardRelative}`);

	// Auth
	const cookiesPath = resolve("./cookies.json");
	const saved = loadSession(cookiesPath);
	const browser = await chromium.launch({
		headless: saved ? args.headless : false,
		slowMo: saved && args.headless ? 0 : 40,
		args: [
			"--disable-blink-features=AutomationControlled",
			"--no-sandbox",
			"--disable-setuid-sandbox",
		],
	});
	let context: BrowserContext;
	if (saved && saved.cookies.length > 0) {
		context = await createContext(browser, saved.cookies);
		console.log("  [auth] reusing saved cookies");
	} else {
		context = await createContext(browser);
		await pollUntilLoggedIn(context, args.loginTimeoutSec);
		const cookies = await context.cookies();
		saveSession(cookiesPath, cookies);
		console.log(`  [auth] saved ${cookies.length} cookies to ${cookiesPath}`);
	}

	try {
		const globalImages = new Map<string, PinAsset>();
		const globalVideos = new Map<string, PinAsset>();
		for (const keyword of keywords.keywords) {
			console.log(`\n  [scrape] keyword: "${keyword}"`);
			const assets = await collectForKeyword(context, keyword, { media: args.media });
			for (const a of assets) {
				if (a.kind === "image") {
					if (!globalImages.has(a.url)) globalImages.set(a.url, a);
				} else if (!globalVideos.has(a.url)) {
					globalVideos.set(a.url, a);
				}
			}
			console.log(
				`  [scrape] unique so far: ${globalImages.size + globalVideos.size} (i=${globalImages.size} v=${globalVideos.size})`,
			);
		}
		const candidates: PinAsset[] = [...globalImages.values(), ...globalVideos.values()];
		console.log(
			`\n  [download] up to ${args.imageCount} images + ${args.videoCount} videos from ${candidates.length} candidates`,
		);
		const dl = await downloadAssets(candidates, {
			imagesDir: paths.imagesDir,
			videosDir: paths.videosDir,
			imageTarget: args.imageCount,
			videoTarget: args.videoCount,
		});
		console.log(`  [download] saved ${dl.images} images + ${dl.videos} videos (${dl.skipped} skipped)`);
	} finally {
		await browser.close();
	}

	const final = finalizeNaming(paths, args.media);
	pruneEmptySubdirs(paths, args.media);

	console.log("\n══════════════════════════════════════");
	console.log(`  Done. ${final.images} images, ${final.videos} videos.`);
	console.log(`  Output: ${moodboardRelative}`);
	console.log("══════════════════════════════════════");
}

await main().catch((e) => {
	console.error("\nDriver failed:", e?.message ?? e);
	process.exit(1);
});
