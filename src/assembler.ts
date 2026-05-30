import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClientPath, Keywords, MediaMode, MergedDNA } from "./types";

export interface AssembleOptions {
	paths: ClientPath;
	dna: MergedDNA;
	keywords: Keywords;
	media: MediaMode;
}

export function prepareOutputDirs(paths: ClientPath, media: MediaMode): void {
	mkdirSync(paths.moodboardDir, { recursive: true });
	mkdirSync(paths.analysisDir, { recursive: true });
	if (media === "images" || media === "both") {
		mkdirSync(paths.imagesDir, { recursive: true });
	}
	if (media === "videos" || media === "both") {
		mkdirSync(paths.videosDir, { recursive: true });
	}
}

export function writeAnalysis(paths: ClientPath, dna: MergedDNA, keywords: Keywords): void {
	writeFileSync(join(paths.analysisDir, "visual_dna.json"), JSON.stringify(dna, null, 2));
	writeFileSync(join(paths.analysisDir, "search_keywords.json"), JSON.stringify(keywords, null, 2));
}

function renumberFiles(dir: string, ext: "jpg" | "mp4"): number {
	const entries = readdirSync(dir)
		.filter((f) => f.startsWith("tmp_") && f.endsWith(`.${ext}`))
		.sort();
	entries.forEach((name, i) => {
		const next = `pin_${String(i + 1).padStart(3, "0")}.${ext}`;
		renameSync(join(dir, name), join(dir, next));
	});
	return entries.length;
}

export function pruneEmptySubdirs(paths: ClientPath, media: MediaMode): void {
	if (media === "images") {
		try {
			rmSync(paths.videosDir, { recursive: true, force: true });
		} catch {
			// not present, nothing to do
		}
	} else if (media === "videos") {
		try {
			rmSync(paths.imagesDir, { recursive: true, force: true });
		} catch {
			// not present
		}
	}
}

export function finalizeNaming(
	paths: ClientPath,
	media: MediaMode,
): {
	images: number;
	videos: number;
} {
	let images = 0;
	let videos = 0;
	if (media === "images" || media === "both") {
		images = renumberFiles(paths.imagesDir, "jpg");
	}
	if (media === "videos" || media === "both") {
		videos = renumberFiles(paths.videosDir, "mp4");
	}

	// Under `both`, a scrape can yield zero of one kind (e.g. all images, no
	// videos). Prune the empty subdir so we never ship a stray empty
	// videos/ or images/ directory inside the moodboard.
	if (media === "both") {
		if (images === 0) {
			rmSync(paths.imagesDir, { recursive: true, force: true });
		}
		if (videos === 0) {
			rmSync(paths.videosDir, { recursive: true, force: true });
		}
	}

	return { images, videos };
}
