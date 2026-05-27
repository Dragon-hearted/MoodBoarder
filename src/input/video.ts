import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);

export interface ResolvedVideo {
	absolutePath: string;
	durationSec: number;
	frames: string[]; // absolute paths to extracted keyframe JPGs
	frameDir: string;
}

export function probeDuration(videoPath: string): number {
	const out = execFileSync(
		"ffprobe",
		["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath],
		{ encoding: "utf8", timeout: 15_000 },
	).trim();
	const n = Number.parseFloat(out);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`Could not probe duration for ${videoPath} (got "${out}")`);
	}
	return n;
}

export function extractKeyframes(videoPath: string, frameCount: number): ResolvedVideo {
	const absolutePath = resolve(videoPath);

	if (!existsSync(absolutePath)) {
		throw new Error(`Video not found: ${absolutePath}`);
	}
	const stats = statSync(absolutePath);
	if (!stats.isFile()) {
		throw new Error(`Video path is not a file: ${absolutePath}`);
	}
	const extension = absolutePath.slice(absolutePath.lastIndexOf(".")).toLowerCase();
	if (!VIDEO_EXTS.has(extension)) {
		throw new Error(
			`Unsupported video extension '${extension}'. Allowed: ${[...VIDEO_EXTS].join(", ")}`,
		);
	}

	const duration = probeDuration(absolutePath);
	const frameDir = join(tmpdir(), `moodboarder-frames-${Date.now()}-${process.pid}`);
	mkdirSync(frameDir, { recursive: true });

	// Drop first/last 5% of timeline to skip intro/outro slates
	const startTrim = duration * 0.05;
	const endTrim = duration * 0.95;
	const usableSpan = Math.max(endTrim - startTrim, 0.1);
	const step = frameCount > 1 ? usableSpan / (frameCount - 1) : 0;

	const frames: string[] = [];
	for (let i = 0; i < frameCount; i++) {
		const t = frameCount === 1 ? startTrim + usableSpan / 2 : startTrim + i * step;
		const frameOut = join(frameDir, `frame_${String(i + 1).padStart(2, "0")}.jpg`);
		const result = spawnSync(
			"ffmpeg",
			[
				"-y",
				"-loglevel",
				"error",
				"-ss",
				t.toFixed(3),
				"-i",
				absolutePath,
				"-frames:v",
				"1",
				"-q:v",
				"2",
				frameOut,
			],
			{ encoding: "utf8", timeout: 30_000 },
		);
		if (result.status !== 0) {
			throw new Error(
				`ffmpeg keyframe extraction failed at t=${t.toFixed(2)}s: ${result.stderr || result.error?.message || "unknown error"}`,
			);
		}
		if (!existsSync(frameOut) || statSync(frameOut).size === 0) {
			throw new Error(`ffmpeg produced empty frame at t=${t.toFixed(2)}s: ${frameOut}`);
		}
		frames.push(frameOut);
	}

	return { absolutePath, durationSec: duration, frames, frameDir };
}
