import { z } from "zod";

// ── VisualDNA ─────────────────────────────────────────────────────────────────
// Matches the reference moodboard's visual_dna.json shape verbatim so downstream
// tooling stays compatible.

export const VisualDNASchema = z.object({
	source_image: z.string().optional(),
	subject: z.string(),
	mood: z.string(),
	lighting: z.string(),
	composition: z.string(),
	color_palette: z.array(z.string()),
	dominant_colors: z.array(z.string()),
	style: z.string(),
	era_or_genre: z.string(),
	texture: z.string(),
});
export type VisualDNA = z.infer<typeof VisualDNASchema>;

export const MergedDNASchema = VisualDNASchema.extend({
	frames: z.array(VisualDNASchema).optional(),
});
export type MergedDNA = z.infer<typeof MergedDNASchema>;

// ── Keywords ──────────────────────────────────────────────────────────────────
// Strict length-5 by default; downstream Pinterest scraper assumes exactly 5
// for per-keyword target distribution. The count is configurable via --keywords.

export const KeywordsSchema = z.object({
	keywords: z.array(z.string().min(1)).min(1).max(20),
});
export type Keywords = z.infer<typeof KeywordsSchema>;

// ── Media mode ────────────────────────────────────────────────────────────────

export const MediaModeSchema = z.enum(["images", "videos", "both"]);
export type MediaMode = z.infer<typeof MediaModeSchema>;

// ── PinAsset ──────────────────────────────────────────────────────────────────
// Discriminated union — kind drives the downloader's content-type guard, the
// dedupe key (pinHash vs videoHash), and the destination subfolder.

const ImagePinSchema = z.object({
	kind: z.literal("image"),
	url: z.string().url(),
	ext: z.literal("jpg"),
});

const VideoPinSchema = z.object({
	kind: z.literal("video"),
	url: z.string().url(),
	ext: z.literal("mp4"),
});

export const PinAssetSchema = z.discriminatedUnion("kind", [ImagePinSchema, VideoPinSchema]);
export type PinAsset = z.infer<typeof PinAssetSchema>;

// ── MoodboardConfig ───────────────────────────────────────────────────────────
// CLI args after parseArgs validation. cli.ts resolves the --count sugar into
// explicit imageCount/videoCount before constructing this object.

export const MoodboardConfigSchema = z
	.object({
		client: z.string().min(1),
		deliverable: z.string().min(1),
		image: z.string().optional(),
		video: z.string().optional(),
		description: z.string().optional(),
		keywords: z.number().int().positive().default(5),
		media: MediaModeSchema.default("both"),
		engine: z.enum(["playwright", "scrapling"]).default("playwright"),
		imageCount: z.number().int().min(0),
		videoCount: z.number().int().min(0),
		headless: z.boolean().default(false),
		frameCount: z.number().int().positive().default(5),
		noColor: z.boolean().default(false),
	})
	.refine((v) => (v.image ? !v.video : !!v.video), {
		message: "Provide exactly one of --image or --video",
		path: ["image"],
	});
export type MoodboardConfig = z.infer<typeof MoodboardConfigSchema>;

// ── ClientPath ────────────────────────────────────────────────────────────────
// Resolved absolute paths, all rooted at the monorepo's `client/<c>/<d>/`.

export const ClientPathSchema = z.object({
	root: z.string(),
	moodboardDir: z.string(),
	imagesDir: z.string(),
	videosDir: z.string(),
	analysisDir: z.string(),
});
export type ClientPath = z.infer<typeof ClientPathSchema>;

// ── DownloadResult ────────────────────────────────────────────────────────────

export interface DownloadResult {
	images: number;
	videos: number;
	skipped: number;
}
