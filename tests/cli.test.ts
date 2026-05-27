import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolveCounts } from "../src/cli";

const CLI = ["bun", "run", "src/cli.ts"];

function run(args: string[]): { code: number; stdout: string; stderr: string } {
	const result = spawnSync(CLI[0], [...CLI.slice(1), ...args], {
		encoding: "utf8",
		timeout: 10_000,
	});
	return {
		code: result.status ?? -1,
		stdout: result.stdout || "",
		stderr: result.stderr || "",
	};
}

describe("resolveCounts (pure)", () => {
	test("defaults: both → 40 + 10", () => {
		expect(resolveCounts("both", undefined, undefined, undefined)).toEqual({
			imageCount: 40,
			videoCount: 10,
		});
	});

	test("defaults: images → 40 + 0", () => {
		expect(resolveCounts("images", undefined, undefined, undefined)).toEqual({
			imageCount: 40,
			videoCount: 0,
		});
	});

	test("defaults: videos → 0 + 10", () => {
		expect(resolveCounts("videos", undefined, undefined, undefined)).toEqual({
			imageCount: 0,
			videoCount: 10,
		});
	});

	test("--count 50 with --media both splits 70/30 (35/15)", () => {
		expect(resolveCounts("both", 50, undefined, undefined)).toEqual({
			imageCount: 35,
			videoCount: 15,
		});
	});

	test("--count preserves total in both mode", () => {
		const { imageCount, videoCount } = resolveCounts("both", 50, undefined, undefined);
		expect(imageCount + videoCount).toBe(50);
	});

	test("--count with --media images is all images", () => {
		expect(resolveCounts("images", 20, undefined, undefined)).toEqual({
			imageCount: 20,
			videoCount: 0,
		});
	});

	test("--count with --media videos is all videos", () => {
		expect(resolveCounts("videos", 12, undefined, undefined)).toEqual({
			imageCount: 0,
			videoCount: 12,
		});
	});

	test("--image-count + --video-count override defaults", () => {
		expect(resolveCounts("both", undefined, 5, 3)).toEqual({
			imageCount: 5,
			videoCount: 3,
		});
	});

	test("--count + --image-count throws (mutex)", () => {
		expect(() => resolveCounts("both", 10, 5, undefined)).toThrow(/use --count alone/);
	});

	test("--count + --video-count throws (mutex)", () => {
		expect(() => resolveCounts("both", 10, undefined, 3)).toThrow(/use --count alone/);
	});

	test("--media images zeroes video count even with --video-count", () => {
		const r = resolveCounts("images", undefined, 5, 3);
		expect(r.videoCount).toBe(0);
	});
});

describe("CLI argument validation", () => {
	test("no args → exits non-zero", () => {
		const r = run([]);
		expect(r.code).not.toBe(0);
		expect(r.stderr).toMatch(/--client is required/);
	});

	test("missing --client → exits with client error", () => {
		const r = run(["--deliverable", "x", "--image", "foo.png"]);
		expect(r.code).not.toBe(0);
		expect(r.stderr).toMatch(/--client/);
	});

	test("missing --deliverable → exits with deliverable error", () => {
		const r = run(["--client", "x", "--image", "foo.png"]);
		expect(r.code).not.toBe(0);
		expect(r.stderr).toMatch(/--deliverable/);
	});

	test("both --image and --video → exits", () => {
		const r = run(["--client", "x", "--deliverable", "y", "--image", "a.png", "--video", "b.mp4"]);
		expect(r.code).not.toBe(0);
		expect(r.stderr).toMatch(/mutually exclusive/);
	});

	test("invalid --media → exits with allowed values listed", () => {
		const r = run(["--client", "x", "--deliverable", "y", "--image", "a.png", "--media", "bogus"]);
		expect(r.code).not.toBe(0);
		expect(r.stderr).toMatch(/images.*videos.*both/);
	});

	test("--count + --image-count → exits with mutex error", () => {
		const r = run([
			"--client",
			"x",
			"--deliverable",
			"y",
			"--image",
			"a.png",
			"--count",
			"10",
			"--image-count",
			"5",
		]);
		expect(r.code).not.toBe(0);
		expect(r.stderr).toMatch(/use --count alone/);
	});

	test("--help → exits 0 with USAGE/FLAGS/EXAMPLES/LEARN MORE/FEEDBACK", () => {
		const r = run(["--help"]);
		expect(r.code).toBe(0);
		expect(r.stdout).toMatch(/USAGE/);
		expect(r.stdout).toMatch(/FLAGS/);
		expect(r.stdout).toMatch(/EXAMPLES/);
		expect(r.stdout).toMatch(/LEARN MORE/);
		expect(r.stdout).toMatch(/FEEDBACK/);
	});

	test("--media images parses without error (fails later for missing fixture, that's fine)", () => {
		const r = run([
			"--client",
			"x",
			"--deliverable",
			"y",
			"--image",
			"definitely-nonexistent-image-xyz.png",
			"--media",
			"images",
		]);
		// Should fail with image-not-found, NOT with arg validation
		expect(r.stderr).not.toMatch(/--media must be one of/);
	});
});
