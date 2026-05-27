import { createWriteStream, statSync, unlinkSync } from "node:fs";
import { get as httpGet } from "node:http";
import type { ClientRequest, IncomingMessage } from "node:http";
import { get as httpsGet } from "node:https";
import { join } from "node:path";
import { toHiRes, toOriginal } from "./pinterest-scraper";
import type { DownloadResult, PinAsset } from "./types";

const IMAGE_TIMEOUT_MS = 20_000;
const VIDEO_TIMEOUT_MS = 120_000;
const IMAGE_CONCURRENCY = 8;
const VIDEO_CONCURRENCY = 3;
const MIN_IMAGE_BYTES = 8_192;
const MIN_VIDEO_BYTES = 32_768;

interface DownloadOptions {
	imagesDir: string;
	videosDir: string;
	imageTarget: number;
	videoTarget: number;
}

function fetchToFile(
	url: string,
	dest: string,
	timeoutMs: number,
	expectedTypePrefix: "image/" | "video/",
): Promise<boolean> {
	return new Promise((resolve) => {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			return resolve(false);
		}
		const proto = parsed.protocol === "https:" ? httpsGet : httpGet;
		const file = createWriteStream(dest);
		let settled = false;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			file.close(() => {
				if (!ok) {
					try {
						unlinkSync(dest);
					} catch {
						// already gone
					}
				}
				resolve(ok);
			});
		};

		const req: ClientRequest = proto(
			url,
			{
				timeout: timeoutMs,
				headers: { "User-Agent": "Mozilla/5.0 MoodBoarder/0.1" },
			},
			(res: IncomingMessage) => {
				if (res.statusCode !== 200) {
					res.resume();
					return finish(false);
				}
				const ct = res.headers["content-type"] || "";
				if (!ct.startsWith(expectedTypePrefix)) {
					res.resume();
					return finish(false);
				}
				res.pipe(file);
				file.on("finish", () => finish(true));
				file.on("error", () => finish(false));
			},
		);
		req.on("error", () => finish(false));
		req.on("timeout", () => {
			req.destroy();
			finish(false);
		});
	});
}

async function downloadImageWithFallback(url: string, dest: string): Promise<boolean> {
	// Try /originals/ first (highest fidelity)
	const original = toOriginal(url);
	if (original !== url) {
		const ok = await fetchToFile(original, dest, IMAGE_TIMEOUT_MS, "image/");
		if (ok) return true;
	}
	// Fall back to /736x/ (what the scraper already upgraded to)
	const hires = toHiRes(url);
	return fetchToFile(hires, dest, IMAGE_TIMEOUT_MS, "image/");
}

async function pool<T, R>(
	items: T[],
	worker: (item: T) => Promise<R>,
	concurrency: number,
	stopWhen: () => boolean,
): Promise<R[]> {
	const results: R[] = [];
	let index = 0;
	const runners = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
		while (true) {
			if (stopWhen()) return;
			const i = index++;
			if (i >= items.length) return;
			results.push(await worker(items[i]));
		}
	});
	await Promise.all(runners);
	return results;
}

function isPassableSize(dest: string, kind: "image" | "video"): boolean {
	try {
		const size = statSync(dest).size;
		const min = kind === "image" ? MIN_IMAGE_BYTES : MIN_VIDEO_BYTES;
		if (size < min) {
			unlinkSync(dest);
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

export async function downloadAssets(
	assets: PinAsset[],
	opts: DownloadOptions,
): Promise<DownloadResult> {
	const images = assets.filter((a) => a.kind === "image");
	const videos = assets.filter((a) => a.kind === "video");

	let savedImages = 0;
	let savedVideos = 0;
	let skipped = 0;

	const imageTasks = images.map((asset, idx) => async () => {
		if (savedImages >= opts.imageTarget) return;
		const dest = join(opts.imagesDir, `tmp_${String(idx).padStart(4, "0")}.jpg`);
		const ok = await downloadImageWithFallback(asset.url, dest);
		if (!ok) {
			skipped++;
			return;
		}
		if (!isPassableSize(dest, "image")) {
			skipped++;
			return;
		}
		savedImages++;
	});

	const videoTasks = videos.map((asset, idx) => async () => {
		if (savedVideos >= opts.videoTarget) return;
		const dest = join(opts.videosDir, `tmp_${String(idx).padStart(4, "0")}.mp4`);
		const ok = await fetchToFile(asset.url, dest, VIDEO_TIMEOUT_MS, "video/");
		if (!ok) {
			skipped++;
			return;
		}
		if (!isPassableSize(dest, "video")) {
			skipped++;
			return;
		}
		savedVideos++;
	});

	// Wrap into items-and-workers for pool()
	if (opts.imageTarget > 0 && images.length > 0) {
		await pool(
			imageTasks,
			(t) => t(),
			IMAGE_CONCURRENCY,
			() => savedImages >= opts.imageTarget,
		);
	}
	if (opts.videoTarget > 0 && videos.length > 0) {
		await pool(
			videoTasks,
			(t) => t(),
			VIDEO_CONCURRENCY,
			() => savedVideos >= opts.videoTarget,
		);
	}

	return { images: savedImages, videos: savedVideos, skipped };
}
