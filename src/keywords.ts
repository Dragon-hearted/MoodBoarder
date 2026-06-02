import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runClaude as spawnClaude } from "./claude";
import { formatDescriptionBlock } from "./input/description";
import { type Keywords, KeywordsSchema, type MergedDNA } from "./types";

const PROMPT_PATH = new URL("../prompts/keywords.md", import.meta.url).pathname;

function buildPrompt(dna: MergedDNA, description: string | undefined, count: number): string {
	const template = readFileSync(PROMPT_PATH, "utf8");
	return template
		.replace(/\{\{KEYWORD_COUNT\}\}/g, String(count))
		.replace(/\{\{DNA_JSON\}\}/g, JSON.stringify(dna, null, 2))
		.replace(/\{\{DESCRIPTION_BLOCK\}\}/g, formatDescriptionBlock(description));
}

function extractJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		const obj = raw.match(/\{[\s\S]*\}/);
		if (obj) return JSON.parse(obj[0]);
		const arr = raw.match(/\[[\s\S]*\]/);
		if (arr) return { keywords: JSON.parse(arr[0]) };
		throw new Error(`Could not extract JSON from response:\n${raw}`);
	}
}

function runClaude(prompt: string, timeoutMs: number): string {
	// Auth order (subscription-first, key fallback) is handled by ./claude.
	return spawnClaude(["--print"], prompt, timeoutMs);
}

function loadFixture(): Keywords | null {
	const fixtureDir = process.env.MOODBOARDER_FIXTURE_DIR;
	if (!fixtureDir) return null;
	const fixture = join(fixtureDir, "search_keywords.json");
	if (!existsSync(fixture)) return null;
	return KeywordsSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));
}

export async function generateKeywords(
	dna: MergedDNA,
	description: string | undefined,
	count: number,
): Promise<Keywords> {
	if (process.env.MOODBOARDER_REPLAY_FIXTURES === "1") {
		const fixture = loadFixture();
		if (fixture) return fixture;
		throw new Error("MOODBOARDER_REPLAY_FIXTURES=1 but no search_keywords.json fixture found.");
	}

	const prompt = buildPrompt(dna, description, count);
	let raw: string;
	try {
		raw = runClaude(prompt, 30_000);
	} catch (e) {
		const strict = `Return ONLY a JSON object with shape {"keywords":[string,...]}. No prose.\n\n${prompt}`;
		raw = runClaude(strict, 30_000);
		if (!raw) throw e;
	}

	let candidate: unknown;
	try {
		candidate = extractJson(raw);
	} catch {
		const strict = `Return ONLY a JSON object with shape {"keywords":[string,...]}. No prose.\n\n${prompt}`;
		const second = runClaude(strict, 30_000);
		candidate = extractJson(second);
	}

	// Tolerate raw arrays
	if (Array.isArray(candidate)) {
		candidate = { keywords: candidate };
	}

	return KeywordsSchema.parse(candidate);
}
