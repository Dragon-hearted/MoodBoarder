import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ClientPath } from "./types";

const ROOT_MARKER = "systems.yaml";

export function findMonorepoRoot(startDir: string = process.cwd()): string {
	let current = resolve(startDir);
	while (true) {
		if (existsSync(join(current, ROOT_MARKER))) return current;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	throw new Error(
		`MoodBoarder must run from inside the Adcelerate monorepo (could not find ${ROOT_MARKER} in any parent of ${startDir}).`,
	);
}

export function buildClientPath(
	client: string,
	deliverable: string,
	timestamp: string,
	startDir: string = process.cwd(),
): ClientPath {
	const root = findMonorepoRoot(startDir);
	const moodboardDir = join(
		root,
		"client",
		client,
		deliverable,
		"moodboard",
		`moodboard_${timestamp}`,
	);
	return {
		root,
		moodboardDir,
		imagesDir: join(moodboardDir, "images"),
		videosDir: join(moodboardDir, "videos"),
		analysisDir: join(moodboardDir, "analysis"),
	};
}

export function nowTimestamp(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
