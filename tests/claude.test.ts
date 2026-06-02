import { describe, expect, test } from "bun:test";
import { resolveAuthOrder } from "../src/claude";

describe("resolveAuthOrder", () => {
	test("default (auto) with a key → subscription first, key fallback", () => {
		expect(resolveAuthOrder({ ANTHROPIC_API_KEY: "sk-ant-xxx" })).toEqual([
			"subscription",
			"apikey",
		]);
	});

	test("default (auto) with no key → subscription only", () => {
		expect(resolveAuthOrder({})).toEqual(["subscription"]);
	});

	test('explicit "subscription" → subscription only, even with a key', () => {
		expect(
			resolveAuthOrder({
				ANTHROPIC_API_KEY: "sk-ant-xxx",
				MOODBOARDER_CLAUDE_AUTH: "subscription",
			}),
		).toEqual(["subscription"]);
	});

	test('explicit "apikey" with a key → apikey only', () => {
		expect(
			resolveAuthOrder({ ANTHROPIC_API_KEY: "sk-ant-xxx", MOODBOARDER_CLAUDE_AUTH: "apikey" }),
		).toEqual(["apikey"]);
	});

	test('"api" alias behaves like "apikey"', () => {
		expect(
			resolveAuthOrder({ ANTHROPIC_API_KEY: "sk-ant-xxx", MOODBOARDER_CLAUDE_AUTH: "api" }),
		).toEqual(["apikey"]);
	});

	test('explicit "apikey" but no key set → falls back to subscription', () => {
		expect(resolveAuthOrder({ MOODBOARDER_CLAUDE_AUTH: "apikey" })).toEqual(["subscription"]);
	});

	test("blank/whitespace key is treated as no key", () => {
		expect(resolveAuthOrder({ ANTHROPIC_API_KEY: "   " })).toEqual(["subscription"]);
	});

	test("override is case-insensitive and trimmed", () => {
		expect(
			resolveAuthOrder({
				ANTHROPIC_API_KEY: "sk-ant-xxx",
				MOODBOARDER_CLAUDE_AUTH: "  SubScription ",
			}),
		).toEqual(["subscription"]);
	});
});
