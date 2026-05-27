export function formatDescriptionBlock(description: string | undefined): string {
	if (!description || !description.trim()) {
		return "";
	}
	return `## User description nudge\n\n${description.trim()}\n\nWeight this language in the synthesis, but stay anchored to the visual DNA above.`;
}
