import { existsSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export interface ResolvedImage {
	absolutePath: string;
	directory: string;
	extension: string;
}

export function resolveImage(input: string): ResolvedImage {
	const absolutePath = resolve(input);

	if (!existsSync(absolutePath)) {
		throw new Error(`Image not found: ${absolutePath}`);
	}

	const stats = statSync(absolutePath);
	if (!stats.isFile()) {
		throw new Error(`Image path is not a file: ${absolutePath}`);
	}
	if (stats.size === 0) {
		throw new Error(`Image is empty (0 bytes): ${absolutePath}`);
	}

	const extension = extname(absolutePath).toLowerCase();
	if (!IMAGE_EXTS.has(extension)) {
		throw new Error(
			`Unsupported image extension '${extension}'. Allowed: ${[...IMAGE_EXTS].join(", ")}`,
		);
	}

	const lastSlash = absolutePath.lastIndexOf("/");
	const directory = lastSlash > 0 ? absolutePath.slice(0, lastSlash) : "/";

	return { absolutePath, directory, extension };
}
