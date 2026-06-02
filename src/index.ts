import { rmSync } from "node:fs";
import { relative } from "node:path";
import { analyzeImage } from "./analyze";
import { finalizeNaming, prepareOutputDirs, pruneEmptySubdirs, writeAnalysis } from "./assembler";
import { BrowserLogin } from "./browser-login";
import { mergeDNAs } from "./dna-merge";
import { downloadAssets } from "./downloader";
import { resolveImage } from "./input/image";
import { extractKeyframes } from "./input/video";
import { generateKeywords } from "./keywords";
import { buildClientPath, nowTimestamp } from "./paths";
import { collectForKeyword, pinHash, videoHash } from "./pinterest-scraper";
import { collectForKeywordViaScrapling } from "./scrapling-collector";
import type { MoodboardConfig, PinAsset, VisualDNA } from "./types";

export interface RunResult {
	images: number;
	videos: number;
	moodboardRelative: string;
	moodboardAbsolute: string;
}

function banner(title: string) {
	console.log("");
	console.log(title);
}

export async function run(config: MoodboardConfig): Promise<RunResult> {
	console.log("╔══════════════════════════════════════╗");
	console.log("║   MoodBoarder                        ║");
	console.log("╚══════════════════════════════════════╝");

	const timestamp = nowTimestamp();
	const paths = buildClientPath(config.client, config.deliverable, timestamp);
	prepareOutputDirs(paths, config.media);
	const moodboardRelative = relative(paths.root, paths.moodboardDir);

	// Track frame dir for cleanup
	let frameDirToClean: string | undefined;

	try {
		// ── Step 1/3: analyze ───────────────────────────────────────────────────
		banner("Step 1/3 — Analyzing reference with Claude vision…");
		let frames: VisualDNA[];
		if (config.image) {
			const img = resolveImage(config.image);
			console.log(`  Image: ${relative(paths.root, img.absolutePath)}`);
			const dna = await analyzeImage(img.absolutePath, img.directory);
			frames = [dna];
		} else if (config.video) {
			const vid = extractKeyframes(config.video, config.frameCount);
			frameDirToClean = vid.frameDir;
			console.log(
				`  Video: ${relative(paths.root, vid.absolutePath)} (${vid.durationSec.toFixed(1)}s, ${vid.frames.length} frames)`,
			);
			frames = [];
			for (let i = 0; i < vid.frames.length; i++) {
				console.log(`    Analyzing frame ${i + 1}/${vid.frames.length}…`);
				const dna = await analyzeImage(vid.frames[i], vid.frameDir);
				frames.push(dna);
			}
		} else {
			throw new Error("internal: neither image nor video set on config");
		}

		const merged = mergeDNAs(frames);
		console.log(`  Subject: ${merged.subject} | Mood: ${merged.mood} | Style: ${merged.style}`);

		// ── Step 2/3: keywords ──────────────────────────────────────────────────
		banner("Step 2/3 — Generating Pinterest search keywords…");
		const keywords = await generateKeywords(merged, config.description, config.keywords);
		keywords.keywords.forEach((k, i) => console.log(`  ${i + 1}. ${k}`));

		// Write analysis early so it's preserved even if scrape fails
		writeAnalysis(paths, merged, keywords);

		// ── Step 3/3: scrape + download ─────────────────────────────────────────
		banner("Step 3/3 — Scraping Pinterest and downloading…");
		if (process.env.MOODBOARDER_REPLAY_FIXTURES === "1") {
			console.log("  [replay] skipping Pinterest scrape — fixture-replay mode active");
		} else {
			const login = new BrowserLogin({
				headless: config.headless,
				cookiesPath: "./cookies.json",
			});
			const { browser, context } = await login.authenticate();

			try {
				const globalImages = new Map<string, PinAsset>();
				const globalVideos = new Map<string, PinAsset>();
				// Per-keyword buckets of first-seen pins, so the downloader can sample
				// evenly across ALL keywords instead of draining keyword 1 first (a
				// single keyword often yields 200+ uniques, more than the target).
				const imagesByKeyword: PinAsset[][] = [];
				const videosByKeyword: PinAsset[][] = [];
				for (const keyword of keywords.keywords) {
					let assets: PinAsset[];
					try {
						if (config.engine === "scrapling") {
							// Opt-in: harvest via the scrape-engine StealthyFetcher. On ANY
							// engine failure (block / dependency / timeout) revert to the
							// existing Playwright collector for this keyword.
							try {
								assets = await collectForKeywordViaScrapling(keyword, "./cookies.json", {
									media: config.media,
								});
								console.log(
									`  Searching: "${keyword}"  → via scrape-engine: ${assets.length} assets`,
								);
							} catch (se) {
								console.warn(
									`  ⚠  scrape-engine fell back to Playwright for "${keyword}": ${se instanceof Error ? se.message : String(se)}`,
								);
								assets = await collectForKeyword(context, keyword, { media: config.media });
							}
						} else {
							assets = await collectForKeyword(context, keyword, { media: config.media });
						}
					} catch (e) {
						// A transient per-keyword failure (e.g. Pinterest nav timeout) must
						// not abort the whole run — log and move on to the next keyword.
						console.warn(
							`  ⚠  skipping "${keyword}" — scrape failed: ${e instanceof Error ? e.message : String(e)}`,
						);
						continue;
					}
					const kwImages: PinAsset[] = [];
					const kwVideos: PinAsset[] = [];
					for (const a of assets) {
						if (a.kind === "image") {
							const k = pinHash(a.url);
							if (!globalImages.has(k)) {
								globalImages.set(k, a);
								kwImages.push(a);
							}
						} else {
							const k = videoHash(a.url);
							if (!globalVideos.has(k)) {
								globalVideos.set(k, a);
								kwVideos.push(a);
							}
						}
					}
					imagesByKeyword.push(kwImages);
					videosByKeyword.push(kwVideos);
					console.log(
						`  Global unique pins: ${globalImages.size + globalVideos.size} (i=${globalImages.size} v=${globalVideos.size})`,
					);
				}
				// Round-robin interleave across keywords so the downloader's
				// take-first-N selection draws ~evenly from every keyword.
				const interleave = (buckets: PinAsset[][]): PinAsset[] => {
					const out: PinAsset[] = [];
					const max = buckets.reduce((m, b) => Math.max(m, b.length), 0);
					for (let i = 0; i < max; i++) {
						for (const b of buckets) {
							if (i < b.length) out.push(b[i]);
						}
					}
					return out;
				};
				const candidates: PinAsset[] = [
					...interleave(imagesByKeyword),
					...interleave(videosByKeyword),
				];
				console.log(
					`\n  Downloading up to ${config.imageCount} images + ${config.videoCount} videos from ${candidates.length} candidates…`,
				);
				const dl = await downloadAssets(candidates, {
					imagesDir: paths.imagesDir,
					videosDir: paths.videosDir,
					imageTarget: config.imageCount,
					videoTarget: config.videoCount,
				});
				console.log(`  Saved ${dl.images} images + ${dl.videos} videos (${dl.skipped} skipped)`);
			} finally {
				await browser.close();
			}
		}

		// ── Finalize ────────────────────────────────────────────────────────────
		const final = finalizeNaming(paths, config.media);
		pruneEmptySubdirs(paths, config.media);

		return {
			images: final.images,
			videos: final.videos,
			moodboardRelative,
			moodboardAbsolute: paths.moodboardDir,
		};
	} finally {
		if (frameDirToClean) {
			try {
				rmSync(frameDirToClean, { recursive: true, force: true });
			} catch {
				// best effort
			}
		}
	}
}
