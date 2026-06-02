import { spawnSync } from "node:child_process";

/**
 * Auth path for the local `claude` CLI.
 *  - "subscription": run with ANTHROPIC_API_KEY stripped from the env, so the CLI
 *    uses the logged-in Claude Code subscription (Pro/Max) instead of console credits.
 *  - "apikey": run with the inherited env, so the CLI uses ANTHROPIC_API_KEY
 *    (pay-as-you-go console billing).
 */
export type ClaudeAuthMode = "subscription" | "apikey";

/**
 * Resolve the ordered list of auth modes to attempt, most-preferred first.
 *
 * Default policy: **subscription first, then API key as a fallback** — so a
 * depleted `ANTHROPIC_API_KEY` ("Credit balance is too low") no longer blocks a
 * user who has an active Claude Code subscription. The API-key path is only
 * appended when a key is actually present.
 *
 * Override with `MOODBOARDER_CLAUDE_AUTH`:
 *  - unset / "auto"        → ["subscription", "apikey"?]  (default)
 *  - "subscription"        → ["subscription"]             (never use the key)
 *  - "apikey" | "api"      → ["apikey"]                   (legacy: key only, if set)
 */
export function resolveAuthOrder(env: NodeJS.ProcessEnv = process.env): ClaudeAuthMode[] {
	const hasKey = Boolean(env.ANTHROPIC_API_KEY?.trim());
	const pref = (env.MOODBOARDER_CLAUDE_AUTH ?? "auto").trim().toLowerCase();

	if (pref === "subscription") return ["subscription"];
	if (pref === "apikey" || pref === "api") return hasKey ? ["apikey"] : ["subscription"];

	// auto (default): prefer subscription, fall back to the key only if one exists.
	return hasKey ? ["subscription", "apikey"] : ["subscription"];
}

function envForMode(mode: ClaudeAuthMode, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	if (mode === "subscription") {
		// Drop the API key so the CLI falls back to the subscription OAuth login.
		const { ANTHROPIC_API_KEY: _drop, ...rest } = base;
		return rest;
	}
	return base; // apikey: inherit as-is (ANTHROPIC_API_KEY present)
}

/**
 * Run `claude <args>` with the resolved auth order, piping `input` to stdin.
 * Returns trimmed stdout on the first mode that exits 0. If a mode fails and
 * another is available, the next is tried; if all fail, throws with each
 * mode's error so the cause (e.g. low balance vs. not-logged-in) is visible.
 */
export function runClaude(args: string[], input: string, timeoutMs: number): string {
	const modes = resolveAuthOrder();
	const errors: string[] = [];

	for (const mode of modes) {
		const result = spawnSync("claude", args, {
			input,
			encoding: "utf8",
			timeout: timeoutMs,
			env: envForMode(mode, process.env),
		});
		if (result.status === 0) {
			return (result.stdout || "").trim();
		}
		const detail = result.stderr || result.stdout || result.error?.message || "no output";
		errors.push(`[${mode}] exit ${result.status}: ${detail.trim()}`);
	}

	throw new Error(`claude CLI failed (tried: ${modes.join(", ")}):\n${errors.join("\n")}`);
}
