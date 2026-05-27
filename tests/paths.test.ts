import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildClientPath, findMonorepoRoot, nowTimestamp } from "../src/paths";

function makeFakeMonorepo(): string {
	const root = mkdtempSync(join(tmpdir(), "moodboarder-test-root-"));
	writeFileSync(join(root, "systems.yaml"), "test: true\n");
	return root;
}

describe("findMonorepoRoot", () => {
	test("walks up to find systems.yaml", () => {
		const root = makeFakeMonorepo();
		const nested = join(root, "a", "b", "c");
		require("node:fs").mkdirSync(nested, { recursive: true });
		expect(findMonorepoRoot(nested)).toBe(root);
	});

	test("errors clearly when systems.yaml is not findable", () => {
		const root = mkdtempSync(join(tmpdir(), "moodboarder-no-root-"));
		expect(() => findMonorepoRoot(root)).toThrow(/Adcelerate monorepo/);
	});
});

describe("buildClientPath", () => {
	test("resolves all output subdirs under client/<c>/<d>/moodboard/", () => {
		const root = makeFakeMonorepo();
		const p = buildClientPath("acme", "spring-launch", "2026-05-27_12-00-00", root);
		expect(p.root).toBe(root);
		expect(p.moodboardDir).toBe(
			join(root, "client", "acme", "spring-launch", "moodboard", "moodboard_2026-05-27_12-00-00"),
		);
		expect(p.imagesDir).toBe(join(p.moodboardDir, "images"));
		expect(p.videosDir).toBe(join(p.moodboardDir, "videos"));
		expect(p.analysisDir).toBe(join(p.moodboardDir, "analysis"));
	});
});

describe("nowTimestamp", () => {
	test("matches the YYYY-MM-DD_HH-mm-ss format", () => {
		expect(nowTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
	});
});
