#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { run } from "./index";
import { type MediaMode, MediaModeSchema, type MoodboardConfig } from "./types";

const HELP = `MoodBoarder — per-client Pinterest moodboard generator

USAGE
  bun run src/cli.ts --client <slug> --deliverable <slug>
                     (--image <path> | --video <path>)
                     [options]

FLAGS
  --client <slug>           Client identifier (required). Maps to client/<slug>/.
  --deliverable <slug>      Deliverable identifier (required). Maps to client/<c>/<slug>/.
  --image <path>            Reference image file. Mutually exclusive with --video.
  --video <path>            Reference video file. Mutually exclusive with --image.
  --description <text>      Optional description nudge for keyword synthesis.
  --keywords <n>            How many Pinterest search phrases to synthesize. Default 5.
  --media <mode>            images | videos | both. Default both.
  --image-count <n>         Target image downloads. Default 40 (when --media is images or both).
  --video-count <n>         Target video downloads. Default 10 (when --media is videos or both).
  --count <n>               Sugar for total. Conflicts with --image-count and --video-count.
                            For --media both, splits 70/30 image:video.
  --frame-count <n>         Video keyframe count for analysis. Default 5.
  --headless                Run Pinterest scrape in headless mode (only after first login).
  --no-color                Disable colored output.
  -h, --help                Show this help.

EXAMPLES
  # Basic image moodboard (40 images + 10 videos by default)
  bun run src/cli.ts --client acme --deliverable spring-launch --image ref.jpg

  # Images only, custom count
  bun run src/cli.ts --client acme --deliverable spring-launch \\
      --image ref.jpg --media images --image-count 60

  # Video reference, total of 30 split 70/30
  bun run src/cli.ts --client acme --deliverable spring-launch \\
      --video ref.mp4 --count 30 --description "soft natural light"

LEARN MORE
  Knowledge base : systems/MoodBoarder/knowledge/
  Acceptance     : systems/MoodBoarder/knowledge/acceptance-criteria.md

FEEDBACK
  Issues / PRs   : https://github.com/Dragon-hearted/MoodBoarder
  Diagnose mode  : just diagnose moodboarder
`;

function die(msg: string, code = 1): never {
	console.error(`error: ${msg}`);
	console.error("");
	console.error("Run with --help for usage.");
	process.exit(code);
}

interface RawArgs {
	client?: string;
	deliverable?: string;
	image?: string;
	video?: string;
	description?: string;
	keywords?: number;
	media?: MediaMode;
	imageCount?: number;
	videoCount?: number;
	count?: number;
	frameCount?: number;
	headless?: boolean;
	noColor?: boolean;
}

function parseInt10(s: string, flag: string): number {
	const n = Number.parseInt(s, 10);
	if (!Number.isFinite(n) || n < 0) die(`--${flag} must be a non-negative integer (got "${s}")`);
	return n;
}

function parseRawArgs(): RawArgs {
	let parsed: ReturnType<
		typeof parseArgs<{ options: Record<string, { type: "string" | "boolean" }> }>
	>;
	try {
		parsed = parseArgs({
			args: process.argv.slice(2),
			strict: true,
			allowPositionals: false,
			options: {
				client: { type: "string" },
				deliverable: { type: "string" },
				image: { type: "string" },
				video: { type: "string" },
				description: { type: "string" },
				keywords: { type: "string" },
				media: { type: "string" },
				"image-count": { type: "string" },
				"video-count": { type: "string" },
				count: { type: "string" },
				"frame-count": { type: "string" },
				headless: { type: "boolean" },
				"no-color": { type: "boolean" },
				help: { type: "boolean", short: "h" },
			},
		});
	} catch (e) {
		die(`bad arguments: ${e instanceof Error ? e.message : String(e)}`);
	}

	const v = parsed.values;
	if (v.help) {
		console.log(HELP);
		process.exit(0);
	}

	const raw: RawArgs = {
		client: v.client as string | undefined,
		deliverable: v.deliverable as string | undefined,
		image: v.image as string | undefined,
		video: v.video as string | undefined,
		description: v.description as string | undefined,
		headless: v.headless as boolean | undefined,
		noColor: v["no-color"] as boolean | undefined,
	};
	if (typeof v.keywords === "string") raw.keywords = parseInt10(v.keywords, "keywords");
	if (typeof v.media === "string") {
		const result = MediaModeSchema.safeParse(v.media);
		if (!result.success) die(`--media must be one of: images, videos, both (got "${v.media}")`);
		raw.media = result.data;
	}
	if (typeof v["image-count"] === "string")
		raw.imageCount = parseInt10(v["image-count"], "image-count");
	if (typeof v["video-count"] === "string")
		raw.videoCount = parseInt10(v["video-count"], "video-count");
	if (typeof v.count === "string") raw.count = parseInt10(v.count, "count");
	if (typeof v["frame-count"] === "string")
		raw.frameCount = parseInt10(v["frame-count"], "frame-count");

	return raw;
}

export interface ResolvedCounts {
	imageCount: number;
	videoCount: number;
}

/**
 * Resolves per-kind counts from CLI args. Pure function — exported for testing.
 *
 * Rules:
 *  1. --count alone (no per-kind flags):
 *     - both    → round(0.7*N) images + (N - that) videos
 *     - images  → N images, 0 videos
 *     - videos  → 0 images, N videos
 *  2. --image-count / --video-count win when given (override defaults). Conflicts
 *     with --count → throws.
 *  3. Nothing supplied → defaults (40/10/0 by mode).
 */
export function resolveCounts(
	media: MediaMode,
	rawCount: number | undefined,
	rawImageCount: number | undefined,
	rawVideoCount: number | undefined,
): ResolvedCounts {
	const hasPerKind = rawImageCount !== undefined || rawVideoCount !== undefined;
	if (rawCount !== undefined && hasPerKind) {
		throw new Error("use --count alone or use --image-count/--video-count, not both");
	}

	if (rawCount !== undefined) {
		if (media === "both") {
			const imageCount = Math.round(rawCount * 0.7);
			return { imageCount, videoCount: rawCount - imageCount };
		}
		if (media === "images") return { imageCount: rawCount, videoCount: 0 };
		return { imageCount: 0, videoCount: rawCount };
	}

	if (hasPerKind) {
		const imageCount = media === "videos" ? 0 : (rawImageCount ?? 40);
		const videoCount = media === "images" ? 0 : (rawVideoCount ?? 10);
		if (media === "images" && rawVideoCount !== undefined && rawVideoCount > 0) {
			console.warn("[cli] --video-count ignored because --media is 'images'");
		}
		if (media === "videos" && rawImageCount !== undefined && rawImageCount > 0) {
			console.warn("[cli] --image-count ignored because --media is 'videos'");
		}
		return { imageCount, videoCount };
	}

	// Pure defaults
	if (media === "both") return { imageCount: 40, videoCount: 10 };
	if (media === "images") return { imageCount: 40, videoCount: 0 };
	return { imageCount: 0, videoCount: 10 };
}

function buildConfig(raw: RawArgs): MoodboardConfig {
	if (!raw.client) die("--client is required");
	if (!raw.deliverable) die("--deliverable is required");
	if (!raw.image && !raw.video) die("provide exactly one of --image or --video");
	if (raw.image && raw.video) die("--image and --video are mutually exclusive");

	const media = raw.media ?? "both";
	let counts: ResolvedCounts;
	try {
		counts = resolveCounts(media, raw.count, raw.imageCount, raw.videoCount);
	} catch (e) {
		die(e instanceof Error ? e.message : String(e));
	}

	return {
		client: raw.client,
		deliverable: raw.deliverable,
		image: raw.image,
		video: raw.video,
		description: raw.description,
		keywords: raw.keywords ?? 5,
		media,
		imageCount: counts.imageCount,
		videoCount: counts.videoCount,
		headless: raw.headless ?? false,
		frameCount: raw.frameCount ?? 5,
		noColor: raw.noColor ?? false,
	};
}

async function main() {
	const raw = parseRawArgs();
	const config = buildConfig(raw);

	// SIGINT cleanup handle is set by orchestrator
	process.on("SIGINT", () => {
		console.error("\n[cli] received SIGINT — exiting");
		process.exit(130);
	});

	try {
		const result = await run(config);
		console.log("");
		console.log("══════════════════════════════");
		console.log(
			`✓ ${result.images} images + ${result.videos} videos saved to ${result.moodboardRelative}`,
		);
		console.log("══════════════════════════════");
		process.exit(0);
	} catch (e) {
		console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
