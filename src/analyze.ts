import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type VisualDNA, VisualDNASchema } from "./types";

const PROMPT_PATH = new URL("../prompts/visual-dna.md", import.meta.url).pathname;

function loadPrompt(imagePath: string): string {
	const template = readFileSync(PROMPT_PATH, "utf8");
	return template.replace(/\{\{IMAGE_PATH\}\}/g, imagePath);
}

function extractJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		const match = raw.match(/\{[\s\S]*\}/);
		if (!match) {
			throw new Error(`Could not extract JSON from response:\n${raw}`);
		}
		return JSON.parse(match[0]);
	}
}

function runClaude(prompt: string, addDir: string, timeoutMs: number): string {
	const args = ["--print", "--allowedTools", "Read", "--add-dir", addDir];
	const result = spawnSync("claude", args, {
		input: prompt,
		encoding: "utf8",
		timeout: timeoutMs,
	});
	if (result.status !== 0) {
		throw new Error(
			`claude CLI failed (exit ${result.status}): ${result.stderr || result.error?.message || "no stderr"}`,
		);
	}
	return (result.stdout || "").trim();
}

function loadFixture(imagePath: string): VisualDNA | null {
	const fixtureDir = process.env.MOODBOARDER_FIXTURE_DIR;
	if (!fixtureDir) return null;
	const fixture = join(fixtureDir, "visual_dna.json");
	if (!existsSync(fixture)) return null;
	const raw = JSON.parse(readFileSync(fixture, "utf8"));
	const parsed = VisualDNASchema.parse({ ...raw, source_image: imagePath });
	return parsed;
}

export async function analyzeImage(imagePath: string, imageDirectory: string): Promise<VisualDNA> {
	// Fixture-replay path for CI (no claude CLI on PATH)
	if (process.env.MOODBOARDER_REPLAY_FIXTURES === "1") {
		const fixture = loadFixture(imagePath);
		if (fixture) return fixture;
		throw new Error(
			"MOODBOARDER_REPLAY_FIXTURES=1 but no fixture found. Set MOODBOARDER_FIXTURE_DIR.",
		);
	}

	const prompt = loadPrompt(imagePath);
	let raw: string;
	try {
		raw = runClaude(prompt, imageDirectory, 60_000);
	} catch (e) {
		// retry once with stricter preamble
		const strict = `Return ONLY the JSON object — no markdown fences, no prose. If you cannot read the image, output exactly: {"error":"unreadable"}\n\n${prompt}`;
		raw = runClaude(strict, imageDirectory, 60_000);
		if (!raw) throw e;
	}

	let candidate: unknown;
	try {
		candidate = extractJson(raw);
	} catch {
		// one more retry
		const strict = `Return ONLY a single JSON object with the exact keys shown. No prose.\n\n${prompt}`;
		const second = runClaude(strict, imageDirectory, 60_000);
		candidate = extractJson(second);
	}

	const dna = VisualDNASchema.parse({ ...(candidate as object), source_image: imagePath });
	return dna;
}
