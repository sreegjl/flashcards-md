export interface Flashcard {
	/** Position of the ```flashcard block within the note (0-based). */
	index: number;
	front: string;
	back: string;
	starred: boolean;
}

// Matches a whole ```flashcard fenced block; group 1 is the body.
const BLOCK_RE = /^```flashcard[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
const FIELD_RE = /^(front|back|starred)\s*:\s?(.*)$/i;
const STARRED_LINE_RE = /^starred\s*:/i;

/**
 * Parses the body of a flashcard block. Lines that don't start with a
 * known key continue the previous field, so values can span multiple lines.
 */
export function parseBlock(source: string): Omit<Flashcard, "index"> {
	const fields: Record<"front" | "back", string[]> = { front: [], back: [] };
	let current: "front" | "back" | null = null;
	let starred = false;

	for (const line of source.split(/\r?\n/)) {
		const match = line.match(FIELD_RE);
		if (match) {
			const key = match[1].toLowerCase();
			if (key === "starred") {
				starred = match[2].trim().toLowerCase() === "true";
				current = null;
			} else {
				current = key as "front" | "back";
				fields[current].push(match[2]);
			}
		} else if (current) {
			fields[current].push(line);
		}
	}

	return {
		front: fields.front.join("\n").trim(),
		back: fields.back.join("\n").trim(),
		starred,
	};
}

/** Returns every non-empty flashcard in a note. */
export function parseCards(text: string): Flashcard[] {
	const cards: Flashcard[] = [];
	let index = 0;
	for (const match of text.matchAll(BLOCK_RE)) {
		const card = parseBlock(match[1]);
		if (card.front || card.back) cards.push({ index, ...card });
		index++;
	}
	return cards;
}

/** Rewrites the note so the block at `blockIndex` has the given starred state. */
export function setStarred(text: string, blockIndex: number, starred: boolean): string {
	let i = 0;
	return text.replace(BLOCK_RE, (block: string, body: string) => {
		if (i++ !== blockIndex) return block;

		const eol = block.includes("\r\n") ? "\r\n" : "\n";
		const header = block.slice(0, block.indexOf("\n") + 1);
		const lines = body.split(/\r?\n/);
		// The body ends with a newline, which leaves an empty last element.
		if (lines[lines.length - 1] === "") lines.pop();

		const kept = lines.filter((line) => !STARRED_LINE_RE.test(line));
		if (starred) kept.push("starred: true");
		return header + kept.map((line) => line + eol).join("") + "```";
	});
}
