import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type { Cookie } from "playwright";

export interface PinterestSession {
	cookies: Cookie[];
	cookiesPath: string;
}

// Pinterest rotates cookie names — these are best-effort markers, not strict
// requirements. We warn rather than hard-fail when they're missing.
const KNOWN_AUTH_MARKERS = ["_auth", "_pinterest_sess", "_b", "csrftoken"] as const;

export function loadSession(cookiesPath: string): PinterestSession | null {
	if (!existsSync(cookiesPath)) return null;
	try {
		const cookies = JSON.parse(readFileSync(cookiesPath, "utf8")) as Cookie[];
		if (!Array.isArray(cookies) || cookies.length === 0) return null;
		return { cookies, cookiesPath };
	} catch {
		return null;
	}
}

export function saveSession(cookiesPath: string, cookies: Cookie[]): void {
	writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
}

export function clearSession(cookiesPath: string): void {
	if (existsSync(cookiesPath)) unlinkSync(cookiesPath);
}

/**
 * Heuristic session check: cookies file exists, is non-empty, and has at least
 * one of the known Pinterest auth markers. Pinterest cookie names drift — we
 * warn on mismatch but don't hard-fail.
 */
export function isSessionPotentiallyValid(session: PinterestSession): boolean {
	if (session.cookies.length === 0) return false;
	const names = new Set(session.cookies.map((c) => c.name));
	const hasMarker = KNOWN_AUTH_MARKERS.some((m) => names.has(m));
	if (!hasMarker) {
		console.warn(
			"[session] No known Pinterest auth-cookie markers in saved session. Pinterest may have rotated cookie names — will fall back to headed login if requests fail.",
		);
	}
	// Check expiry on any auth-related cookie
	const now = Math.floor(Date.now() / 1000);
	const authCookies = session.cookies.filter((c) =>
		KNOWN_AUTH_MARKERS.includes(c.name as (typeof KNOWN_AUTH_MARKERS)[number]),
	);
	if (authCookies.length > 0 && authCookies.every((c) => c.expires > 0 && c.expires < now)) {
		return false;
	}
	return true;
}
