import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ScrapeEngineUnavailableError,
	collectForKeywordViaScrapling,
} from "../src/scrapling-collector";

// A canned FetchResult that exercises every shaping branch:
//  - a /236x/ thumbnail  → upgraded to /736x/
//  - an /originals/ url   → survives untouched, ranks above any size segment
//  - a duplicate pin (same hash, /236x/ vs /736x/) → collapses to higher-res
//  - an /avatars/ url     → dropped as junk
//  - a non-pinimg img     → dropped (classifyUrl null)
//  - a v.pinimg .mp4      → kept as video
//  - a non-video in the videos bucket → dropped
const CANNED = {
	ok: true,
	status: 200,
	fetcher: "stealthy",
	extracted: {
		images: [
			{ text: "", attributes: { src: "https://i.pinimg.com/236x/AB/CD/EF/dup.jpg" } },
			{ text: "", attributes: { src: "https://i.pinimg.com/736x/AB/CD/EF/dup.jpg" } },
			{ text: "", attributes: { src: "https://i.pinimg.com/originals/11/22/33/orig.jpg" } },
			{ text: "", attributes: { src: "https://i.pinimg.com/236x/99/88/77/thumb.jpg" } },
			{ text: "", attributes: { src: "https://i.pinimg.com/avatars/xyz/75x75/avatar.jpg" } },
			{ text: "", attributes: { src: "https://example.com/not-a-pin.jpg" } },
			{
				text: "",
				attributes: {
					src: null,
					srcset:
						"https://i.pinimg.com/474x/AA/BB/CC/srcset.jpg 1x, https://i.pinimg.com/736x/AA/BB/CC/srcset.jpg 2x",
				},
			},
		],
		videos: [
			{ text: "", attributes: { src: "https://v.pinimg.com/videos/mc/720p/AB/CD/EF/clip.mp4" } },
			{ text: "", attributes: { src: "https://v.pinimg.com/videos/mc/720p/AB/CD/EF/clip.mp4" } },
			{ text: "", attributes: { src: "https://i.pinimg.com/736x/not/a/video.jpg" } },
		],
	},
	meta: { scraplingVersion: "test", elapsedMs: 1 },
};

let engineDir: string; // shim that succeeds with the canned JSON
let failDir: string; // shim that exits non-zero

function writeShim(root: string, body: string): void {
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src", "cli.ts"), `#!/usr/bin/env bun\n${body}\n`);
}

beforeAll(() => {
	// Tiny bun shims standing in for scrape-engine's real CLI: ignore all args.
	engineDir = mkdtempSync(join(tmpdir(), "fake-scrape-engine-ok-"));
	writeShim(engineDir, `console.log(${JSON.stringify(JSON.stringify(CANNED))});`);

	failDir = mkdtempSync(join(tmpdir(), "fake-scrape-engine-fail-"));
	writeShim(failDir, `console.error("shim: simulated dependency failure");\nprocess.exit(2);`);
});

afterAll(() => {
	rmSync(engineDir, { recursive: true, force: true });
	rmSync(failDir, { recursive: true, force: true });
});

describe("collectForKeywordViaScrapling", () => {
	test("shapes success JSON: dedup, upgrade, junk drop, video keep", async () => {
		const assets = await collectForKeywordViaScrapling("neon city", {
			media: "both",
			scrapeEngineDir: engineDir,
		});

		const images = assets.filter((a) => a.kind === "image").map((a) => a.url);
		const videos = assets.filter((a) => a.kind === "video").map((a) => a.url);

		// /236x/ thumb upgraded to /736x/
		expect(images).toContain("https://i.pinimg.com/736x/99/88/77/thumb.jpg");
		// /originals/ survives untouched
		expect(images).toContain("https://i.pinimg.com/originals/11/22/33/orig.jpg");
		// duplicate pin collapsed to the higher-res variant only
		expect(images).toContain("https://i.pinimg.com/736x/AB/CD/EF/dup.jpg");
		expect(images).not.toContain("https://i.pinimg.com/236x/AB/CD/EF/dup.jpg");
		// srcset first-url with 736x kept (dedup keeps the larger of 474x/736x)
		expect(images).toContain("https://i.pinimg.com/736x/AA/BB/CC/srcset.jpg");
		// /avatars/ junk dropped, non-pinimg dropped
		expect(images.some((u) => u.includes("/avatars/"))).toBe(false);
		expect(images.some((u) => u.includes("example.com"))).toBe(false);

		// video deduped to a single entry; non-video dropped
		expect(videos).toEqual(["https://v.pinimg.com/videos/mc/720p/AB/CD/EF/clip.mp4"]);

		// 4 unique images (dup, orig, thumb, srcset)
		expect(images.length).toBe(4);
	});

	test("non-zero exit throws ScrapeEngineUnavailableError", async () => {
		let err: unknown;
		try {
			await collectForKeywordViaScrapling("anything", {
				media: "both",
				scrapeEngineDir: failDir,
			});
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(ScrapeEngineUnavailableError);
	});

	test("media:'images' yields no videos", async () => {
		const assets = await collectForKeywordViaScrapling("neon city", {
			media: "images",
			scrapeEngineDir: engineDir,
		});
		expect(assets.some((a) => a.kind === "video")).toBe(false);
		expect(assets.length).toBeGreaterThan(0);
	});
});
