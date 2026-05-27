import { describe, expect, test } from "bun:test";
import { mergeDNAs } from "../src/dna-merge";
import type { VisualDNA } from "../src/types";

function dna(overrides: Partial<VisualDNA>): VisualDNA {
	return {
		subject: "portrait",
		mood: "moody",
		lighting: "soft",
		composition: "centered",
		style: "editorial",
		era_or_genre: "contemporary",
		texture: "smooth",
		color_palette: ["#000000"],
		dominant_colors: ["black"],
		...overrides,
	};
}

describe("mergeDNAs", () => {
	test("returns single frame as-is (no frames array)", () => {
		const merged = mergeDNAs([dna({ subject: "interior" })]);
		expect(merged.subject).toBe("interior");
		expect(merged.frames).toBeUndefined();
	});

	test("mode-merges categorical fields across frames", () => {
		const frames = [
			dna({ subject: "portrait", mood: "happy" }),
			dna({ subject: "portrait", mood: "moody" }),
			dna({ subject: "landscape", mood: "moody" }),
		];
		const merged = mergeDNAs(frames);
		expect(merged.subject).toBe("portrait");
		expect(merged.mood).toBe("moody");
		expect(merged.frames).toHaveLength(3);
	});

	test("ties broken by first-occurrence order", () => {
		const frames = [dna({ style: "editorial" }), dna({ style: "documentary" })];
		const merged = mergeDNAs(frames);
		expect(merged.style).toBe("editorial");
	});

	test("color_palette is union deduped → top 5 by frequency", () => {
		const frames = [
			dna({ color_palette: ["#aaa", "#bbb", "#ccc"] }),
			dna({ color_palette: ["#aaa", "#ddd", "#eee"] }),
			dna({ color_palette: ["#aaa", "#bbb", "#fff"] }),
		];
		const merged = mergeDNAs(frames);
		expect(merged.color_palette).toHaveLength(5);
		expect(merged.color_palette[0]).toBe("#aaa"); // most frequent
		expect(merged.color_palette[1]).toBe("#bbb"); // second
	});

	test("dominant_colors keeps top 3", () => {
		const frames = [
			dna({ dominant_colors: ["red", "blue", "green"] }),
			dna({ dominant_colors: ["red", "yellow", "blue"] }),
		];
		const merged = mergeDNAs(frames);
		expect(merged.dominant_colors).toHaveLength(3);
		expect(merged.dominant_colors[0]).toBe("red");
	});

	test("case-insensitive dedupe in palette", () => {
		const frames = [
			dna({ color_palette: ["#AAA", "#bbb"] }),
			dna({ color_palette: ["#aaa", "#BBB"] }),
		];
		const merged = mergeDNAs(frames);
		expect(merged.color_palette).toHaveLength(2);
	});

	test("throws on empty frames", () => {
		expect(() => mergeDNAs([])).toThrow();
	});
});
