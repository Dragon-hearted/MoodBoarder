import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizeNaming, prepareOutputDirs } from "../src/assembler";
import type { ClientPath } from "../src/types";

function makePaths(): { paths: ClientPath; cleanup: () => void } {
	const root = mkdtempSync(join(tmpdir(), "moodboarder-test-"));
	const moodboardDir = join(root, "moodboard");
	const paths: ClientPath = {
		root,
		moodboardDir,
		imagesDir: join(moodboardDir, "images"),
		videosDir: join(moodboardDir, "videos"),
		analysisDir: join(moodboardDir, "analysis"),
	};
	return { paths, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeTmp(dir: string, name: string): void {
	writeFileSync(join(dir, name), "x");
}

describe("finalizeNaming prune under --media both", () => {
	test("prunes empty videos/ dir when only images were scraped", () => {
		const { paths, cleanup } = makePaths();
		try {
			prepareOutputDirs(paths, "both");
			writeTmp(paths.imagesDir, "tmp_001.jpg");

			const counts = finalizeNaming(paths, "both");

			expect(counts.images).toBe(1);
			expect(counts.videos).toBe(0);
			expect(existsSync(paths.imagesDir)).toBe(true);
			// The empty videos/ subdir must NOT ship.
			expect(existsSync(paths.videosDir)).toBe(false);
		} finally {
			cleanup();
		}
	});

	test("prunes empty images/ dir when only videos were scraped", () => {
		const { paths, cleanup } = makePaths();
		try {
			prepareOutputDirs(paths, "both");
			writeTmp(paths.videosDir, "tmp_001.mp4");

			const counts = finalizeNaming(paths, "both");

			expect(counts.images).toBe(0);
			expect(counts.videos).toBe(1);
			expect(existsSync(paths.videosDir)).toBe(true);
			expect(existsSync(paths.imagesDir)).toBe(false);
		} finally {
			cleanup();
		}
	});

	test("keeps both dirs when both kinds present", () => {
		const { paths, cleanup } = makePaths();
		try {
			prepareOutputDirs(paths, "both");
			writeTmp(paths.imagesDir, "tmp_001.jpg");
			writeTmp(paths.videosDir, "tmp_001.mp4");

			const counts = finalizeNaming(paths, "both");

			expect(counts.images).toBe(1);
			expect(counts.videos).toBe(1);
			expect(existsSync(paths.imagesDir)).toBe(true);
			expect(existsSync(paths.videosDir)).toBe(true);
		} finally {
			cleanup();
		}
	});

	test("renumbers tmp_ files to pin_NNN sequentially", () => {
		const { paths, cleanup } = makePaths();
		try {
			prepareOutputDirs(paths, "both");
			writeTmp(paths.imagesDir, "tmp_003.jpg");
			writeTmp(paths.imagesDir, "tmp_001.jpg");
			writeTmp(paths.imagesDir, "tmp_002.jpg");

			const counts = finalizeNaming(paths, "both");

			expect(counts.images).toBe(3);
			expect(existsSync(join(paths.imagesDir, "pin_001.jpg"))).toBe(true);
			expect(existsSync(join(paths.imagesDir, "pin_002.jpg"))).toBe(true);
			expect(existsSync(join(paths.imagesDir, "pin_003.jpg"))).toBe(true);
		} finally {
			cleanup();
		}
	});
});
