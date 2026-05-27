import { describe, expect, test } from "bun:test";
import { classifyUrl, pinHash, toHiRes, toOriginal, videoHash } from "../src/pinterest-scraper";

describe("pinHash", () => {
	test("strips resolution segment for stable dedupe", () => {
		const a = "https://i.pinimg.com/236x/AB/CD/EF/abcdef1234.jpg";
		const b = "https://i.pinimg.com/736x/AB/CD/EF/abcdef1234.jpg";
		expect(pinHash(a)).toBe(pinHash(b));
	});

	test("strips query strings", () => {
		const a = "https://i.pinimg.com/236x/AB/CD/EF/abcdef.jpg?v=1";
		const b = "https://i.pinimg.com/236x/AB/CD/EF/abcdef.jpg?v=2";
		expect(pinHash(a)).toBe(pinHash(b));
	});

	test("returns full url when no pinimg pattern matches", () => {
		expect(pinHash("https://example.com/foo.jpg")).toBe("https://example.com/foo.jpg");
	});
});

describe("videoHash", () => {
	test("uses last url path segment as hash", () => {
		const u = "https://v.pinimg.com/videos/mc/720p/AB/CD/EF/abcdef.mp4";
		expect(videoHash(u)).toBe("abcdef.mp4");
	});

	test("strips query strings", () => {
		const a = "https://v.pinimg.com/videos/720p/AB/CD/EF/x.mp4?t=1";
		const b = "https://v.pinimg.com/videos/720p/AB/CD/EF/x.mp4?t=2";
		expect(videoHash(a)).toBe(videoHash(b));
	});
});

describe("toHiRes / toOriginal", () => {
	test("upgrades 236x to 736x", () => {
		const u = "https://i.pinimg.com/236x/AB/CD/EF/abc.jpg";
		expect(toHiRes(u)).toBe("https://i.pinimg.com/736x/AB/CD/EF/abc.jpg");
	});

	test("upgrades 736x to originals", () => {
		const u = "https://i.pinimg.com/736x/AB/CD/EF/abc.jpg";
		expect(toOriginal(u)).toBe("https://i.pinimg.com/originals/AB/CD/EF/abc.jpg");
	});

	test("upgrade is idempotent on already-hi-res urls", () => {
		const u = "https://i.pinimg.com/736x/AB/CD/EF/abc.jpg";
		expect(toHiRes(u)).toBe(u);
	});
});

describe("classifyUrl", () => {
	test("classifies pinimg image urls", () => {
		expect(classifyUrl("https://i.pinimg.com/736x/A/B/abc.jpg")).toBe("image");
	});

	test("classifies v.pinimg video urls", () => {
		expect(classifyUrl("https://v.pinimg.com/videos/720p/A/abc.mp4")).toBe("video");
	});

	test("classifies v1.pinimg video urls", () => {
		expect(classifyUrl("https://v1.pinimg.com/videos/A/abc.mp4")).toBe("video");
	});

	test("returns null for unrelated urls", () => {
		expect(classifyUrl("https://example.com/x.jpg")).toBe(null);
	});
});
