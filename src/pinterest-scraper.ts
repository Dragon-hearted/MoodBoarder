import type { BrowserContext } from "playwright";
import type { MediaMode, PinAsset } from "./types";

const SCROLL_ROUNDS = 14;
const SCROLL_WAIT_MS = 1800;
const PER_KEYWORD_TARGET = 200;

// ── helpers ──────────────────────────────────────────────────────────────────

export function pinHash(url: string): string {
	const m = url.match(/pinimg\.com\/[^/]+\/(.+)/);
	return m ? m[1].split("?")[0] : url;
}

export function videoHash(url: string): string {
	const idx = url.lastIndexOf("/");
	const last = idx >= 0 ? url.slice(idx + 1) : url;
	return last.split("?")[0];
}

export function toHiRes(url: string): string {
	return url.replace(/pinimg\.com\/[^/]+\//, "pinimg.com/736x/");
}

/**
 * Rank a pinimg URL by the width of its size segment (e.g. `/236x/`, `/736x/`,
 * `/originals/`). Larger = higher quality. `originals` ranks highest; URLs with
 * no recognizable size segment rank lowest. Used to honor the best-URL dedup
 * contract: when two URLs share a pin hash, keep the larger variant.
 */
export function pinResolutionRank(url: string): number {
	const m = url.match(/pinimg\.com\/([^/]+)\//);
	if (!m) return 0;
	const seg = m[1];
	if (seg === "originals") return Number.POSITIVE_INFINITY;
	const wm = seg.match(/^(\d+)x/);
	return wm ? Number(wm[1]) : 0;
}

export function toOriginal(url: string): string {
	return url.replace(/pinimg\.com\/[^/]+\//, "pinimg.com/originals/");
}

export function classifyUrl(url: string): "image" | "video" | null {
	if (/v\d*\.pinimg\.com/.test(url) || /\.mp4(\?|$)/.test(url)) return "video";
	if (/pinimg\.com/.test(url)) return "image";
	return null;
}

export function isJunkPinUrl(u: string): boolean {
	return (
		u.includes("/avatars/") ||
		u.includes("/user_images/") ||
		u.includes("/75x75/") ||
		u.includes("/45x45/")
	);
}

// ── per-keyword scrape ───────────────────────────────────────────────────────

interface CollectOptions {
	media: MediaMode;
	scrollRounds?: number;
	scrollWaitMs?: number;
}

export async function collectForKeyword(
	context: BrowserContext,
	keyword: string,
	opts: CollectOptions,
): Promise<PinAsset[]> {
	const page = await context.newPage();
	const q = encodeURIComponent(keyword);
	const url = `https://www.pinterest.com/search/pins/?q=${q}&rs=typed`;
	const rounds = opts.scrollRounds ?? SCROLL_ROUNDS;
	const waitMs = opts.scrollWaitMs ?? SCROLL_WAIT_MS;

	console.log(`  Searching: "${keyword}"`);

	try {
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });

		if (page.url().includes("/login")) {
			console.warn(`  ⚠  Redirected to /login while searching "${keyword}". Cookies may be stale.`);
			await page.close();
			return [];
		}

		await page
			.waitForSelector('img[src*="pinimg.com"]', { timeout: 15_000 })
			.catch(() => undefined);
		await page.waitForTimeout(1_500);

		const seenImages = new Map<string, string>(); // hash → best URL
		const seenVideos = new Map<string, string>(); // hash → URL

		const harvest = async () => {
			const batch = await page.evaluate(() => {
				const images = new Set<string>();
				const videos = new Set<string>();

				for (const img of Array.from(document.querySelectorAll("img"))) {
					const pushImg = (u: string | null | undefined) => {
						if (!u) return;
						if (u.includes("pinimg.com")) images.add(u);
					};
					pushImg(img.getAttribute("src"));
					const ss = img.getAttribute("srcset") || "";
					for (const entry of ss.split(",")) {
						pushImg(entry.trim().split(/\s+/)[0]);
					}
				}

				for (const vid of Array.from(document.querySelectorAll("video"))) {
					const pushVid = (u: string | null | undefined) => {
						if (!u) return;
						if (/v\d*\.pinimg\.com/.test(u) || /\.mp4(\?|$)/.test(u)) videos.add(u);
					};
					pushVid(vid.getAttribute("src"));
					for (const s of Array.from(vid.querySelectorAll("source"))) {
						pushVid(s.getAttribute("src"));
					}
				}

				return { images: [...images], videos: [...videos] };
			});

			if (opts.media === "images" || opts.media === "both") {
				for (const u of batch.images) {
					if (isJunkPinUrl(u)) continue;
					const h = pinHash(u);
					const existing = seenImages.get(h);
					// Best-URL contract: keep the larger variant when a better
					// one is seen for the same pin (first-URL-wins lost detail).
					if (!existing || pinResolutionRank(u) > pinResolutionRank(existing)) {
						seenImages.set(h, u);
					}
				}
			}
			if (opts.media === "videos" || opts.media === "both") {
				for (const u of batch.videos) {
					const h = videoHash(u);
					if (!seenVideos.has(h)) seenVideos.set(h, u);
				}
			}
		};

		await harvest();
		const initial = seenImages.size + seenVideos.size;
		console.log(`    after load  : ${initial} assets (i=${seenImages.size} v=${seenVideos.size})`);

		for (let s = 0; s < rounds; s++) {
			await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
			await page.waitForTimeout(waitMs);
			await harvest();
			const total = seenImages.size + seenVideos.size;
			process.stdout.write(
				`\r    scroll ${String(s + 1).padStart(2)}/${rounds} : ${total} assets (i=${seenImages.size} v=${seenVideos.size})`,
			);
			if (total >= PER_KEYWORD_TARGET * 2) break;
		}

		const assets: PinAsset[] = [];
		for (const u of seenImages.values()) {
			// Upgrade small thumbnails to 736x, but never downgrade a larger
			// variant (e.g. /originals/, /1200x/) that we already captured.
			const best = pinResolutionRank(u) >= 736 ? u : toHiRes(u);
			assets.push({ kind: "image", url: best, ext: "jpg" });
		}
		for (const u of seenVideos.values()) {
			assets.push({ kind: "video", url: u, ext: "mp4" });
		}

		console.log(
			`\n    done        : ${assets.length} unique (i=${seenImages.size} v=${seenVideos.size})\n`,
		);
		return assets;
	} finally {
		await page.close().catch(() => undefined);
	}
}
