import { describe, expect, test } from "bun:test";
import { extractedToPinAssets } from "../src/scrapling-collector";

const img = (src: string, srcset?: string) => {
	const attributes: Record<string, string | null> = { src };
	if (srcset) attributes.srcset = srcset;
	return { text: "", attributes };
};
const vid = (src: string) => ({ text: "", attributes: { src } as Record<string, string | null> });

describe("extractedToPinAssets", () => {
	test("keeps pinimg images, upgrades thumbnails to 736x", () => {
		const out = extractedToPinAssets(
			{ images: [img("https://i.pinimg.com/236x/ab/cd/ef/hash.jpg")] },
			"images",
		);
		expect(out).toEqual([
			{ kind: "image", url: "https://i.pinimg.com/736x/ab/cd/ef/hash.jpg", ext: "jpg" },
		]);
	});

	test("dedups same pin by hash, keeping the larger variant", () => {
		const out = extractedToPinAssets(
			{
				images: [
					img("https://i.pinimg.com/236x/ab/cd/ef/hash.jpg"),
					img("https://i.pinimg.com/originals/ab/cd/ef/hash.jpg"),
				],
			},
			"images",
		);
		expect(out).toHaveLength(1);
		expect(out[0].url).toBe("https://i.pinimg.com/originals/ab/cd/ef/hash.jpg");
	});

	test("expands srcset members", () => {
		const out = extractedToPinAssets(
			{
				images: [
					img(
						"https://i.pinimg.com/236x/aa/bb/cc/x.jpg",
						"https://i.pinimg.com/736x/aa/bb/cc/x.jpg 2x, https://i.pinimg.com/236x/aa/bb/cc/x.jpg 1x",
					),
				],
			},
			"images",
		);
		expect(out).toHaveLength(1);
		expect(out[0].url).toBe("https://i.pinimg.com/736x/aa/bb/cc/x.jpg");
	});

	test("drops junk (avatars/tiny) and non-pinimg urls", () => {
		const out = extractedToPinAssets(
			{
				images: [
					img("https://i.pinimg.com/75x75/aa/bb/cc/x.jpg"),
					img("https://i.pinimg.com/avatars/user.jpg"),
					img("https://example.com/not-a-pin.jpg"),
				],
			},
			"images",
		);
		expect(out).toEqual([]);
	});

	test("collects videos from v*.pinimg.com / .mp4", () => {
		const out = extractedToPinAssets(
			{ videos: [vid("https://v1.pinimg.com/videos/mc/720p/aa/bb/cc/clip.mp4")] },
			"videos",
		);
		expect(out).toEqual([
			{ kind: "video", url: "https://v1.pinimg.com/videos/mc/720p/aa/bb/cc/clip.mp4", ext: "mp4" },
		]);
	});

	test("media=images ignores videos and vice versa", () => {
		const extracted = {
			images: [img("https://i.pinimg.com/736x/aa/bb/cc/x.jpg")],
			videos: [vid("https://v1.pinimg.com/videos/720p/aa/clip.mp4")],
		};
		expect(extractedToPinAssets(extracted, "images").every((a) => a.kind === "image")).toBe(true);
		expect(extractedToPinAssets(extracted, "videos").every((a) => a.kind === "video")).toBe(true);
		expect(extractedToPinAssets(extracted, "both")).toHaveLength(2);
	});

	test("handles missing/empty extracted", () => {
		expect(extractedToPinAssets(undefined, "both")).toEqual([]);
		expect(extractedToPinAssets({}, "both")).toEqual([]);
	});
});
