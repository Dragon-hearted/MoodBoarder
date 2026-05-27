import type { MergedDNA, VisualDNA } from "./types";

function mode(values: string[]): string {
	if (values.length === 0) return "";
	const counts = new Map<string, { count: number; firstIndex: number }>();
	values.forEach((v, i) => {
		const key = v.trim().toLowerCase();
		const existing = counts.get(key);
		if (existing) existing.count += 1;
		else counts.set(key, { count: 1, firstIndex: i });
	});
	// Sort by count desc, then first-occurrence index asc
	const sorted = [...counts.entries()].sort((a, b) => {
		if (b[1].count !== a[1].count) return b[1].count - a[1].count;
		return a[1].firstIndex - b[1].firstIndex;
	});
	// Return the original-cased value from the winning bucket
	const winnerKey = sorted[0][0];
	for (const v of values) {
		if (v.trim().toLowerCase() === winnerKey) return v;
	}
	return values[0];
}

function topByFrequency(values: string[], limit: number): string[] {
	const counts = new Map<string, { count: number; firstIndex: number; original: string }>();
	values.forEach((v, i) => {
		const key = v.trim().toLowerCase();
		const existing = counts.get(key);
		if (existing) existing.count += 1;
		else counts.set(key, { count: 1, firstIndex: i, original: v });
	});
	return [...counts.values()]
		.sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count;
			return a.firstIndex - b.firstIndex;
		})
		.slice(0, limit)
		.map((v) => v.original);
}

export function mergeDNAs(frames: VisualDNA[]): MergedDNA {
	if (frames.length === 0) {
		throw new Error("mergeDNAs requires at least one frame");
	}

	if (frames.length === 1) {
		return { ...frames[0], frames: undefined };
	}

	const merged: MergedDNA = {
		source_image: frames
			.map((f) => f.source_image)
			.filter(Boolean)
			.join(", "),
		subject: mode(frames.map((f) => f.subject)),
		mood: mode(frames.map((f) => f.mood)),
		lighting: mode(frames.map((f) => f.lighting)),
		composition: mode(frames.map((f) => f.composition)),
		style: mode(frames.map((f) => f.style)),
		era_or_genre: mode(frames.map((f) => f.era_or_genre)),
		texture: mode(frames.map((f) => f.texture)),
		color_palette: topByFrequency(
			frames.flatMap((f) => f.color_palette),
			5,
		),
		dominant_colors: topByFrequency(
			frames.flatMap((f) => f.dominant_colors),
			3,
		),
		frames,
	};

	return merged;
}
