export interface Choice {
	text: string;
	correct: boolean;
}

export interface Flashcard {
	/** Position of the ```flashcard block within the note (0-based). */
	index: number;
	front: string;
	back: string;
	/** Multiple-choice options; empty for a regular flip card. */
	choices: Choice[];
	/** Accepted answers for a typed-answer card; empty unless the card has answer: lines. */
	answers: string[];
	starred: boolean;
}

// Matches a whole ```flashcard or ```flashcard-inline fenced block; group 1 is the body.
const BLOCK_RE = /^```flashcard(?:-inline)?[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
const FIELD_RE = /^(front|back|answer|starred)\s*:\s?(.*)$/i;
// A task-list item is a multiple-choice option: "- [ ] wrong", "- [x] right".
const CHOICE_RE = /^\s*[-*+]\s+\[([ xX])\](?:\s+(.*))?$/;
const STARRED_LINE_RE = /^starred\s*:/i;

/**
 * Parses the body of a flashcard block. Lines that don't start with a
 * known key continue the previous field, so values can span multiple lines.
 * Task-list lines are multiple-choice options and are never part of a field.
 * Each answer: line is one accepted answer for a typed-answer card.
 */
export function parseBlock(source: string): Omit<Flashcard, "index"> {
	const fields: Record<"front" | "back", string[]> = { front: [], back: [] };
	const choices: Choice[] = [];
	const answers: string[] = [];
	let current: "front" | "back" | null = null;
	let starred = false;

	for (const line of source.split(/\r?\n/)) {
		const choice = line.match(CHOICE_RE);
		if (choice) {
			const text = (choice[2] ?? "").trim();
			if (text) choices.push({ text, correct: choice[1] !== " " });
			current = null;
			continue;
		}

		const match = line.match(FIELD_RE);
		if (match) {
			const key = match[1].toLowerCase();
			if (key === "starred") {
				starred = match[2].trim().toLowerCase() === "true";
				current = null;
			} else if (key === "answer") {
				const answer = match[2].trim();
				if (answer) answers.push(answer);
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
		choices,
		answers,
		starred,
	};
}

/** Lowercases and tidies spacing and trailing punctuation, so "  paris." matches "Paris". */
function normalizeAnswer(text: string): string {
	return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").replace(/^ +|[ .!?]+$/g, "");
}

interface NumericAnswer {
	value: number;
	/** How far off an answer can be and still count; 0 for an exact match. */
	tolerance: number;
	unit: string;
}

const NUMBER = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?`;
// A number, then optionally "± 0.05" or "± 2%" (also written +- or +/-), then optionally a unit starting with a letter.
const NUMERIC_RE = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:±|\+\/?-)\s*(${NUMBER})\s*(%)?)?\s*((?:[\p{L}°µ].*)?)$`, "iu");

/** Reads answers like "3.467", "9.9 ± 0.1 m/s" or "120 ± 5% N"; returns null for anything that isn't a number. */
function parseNumeric(text: string): NumericAnswer | null {
	const match = normalizeAnswer(text).replace(/\u2212/g, "-").match(NUMERIC_RE);
	if (!match) return null;
	const value = Number(match[1]);
	const spread = match[2] ? Math.abs(Number(match[2])) : 0;
	return { value, tolerance: match[3] ? Math.abs(value) * spread / 100 : spread, unit: match[4] };
}

/** Whether a typed answer matches one accepted answer, by number (within its ± range) or else by text. */
function matchesAnswer(answer: string, typed: string): boolean {
	const expected = parseNumeric(answer);
	const guess = parseNumeric(typed);
	if (expected && guess && guess.tolerance === 0) {
		// A unit is optional, but if one is typed it has to be the right one.
		if (guess.unit && guess.unit !== expected.unit) return false;
		// The small extra allowance absorbs floating-point error at the edges of the range.
		return Math.abs(guess.value - expected.value) <= expected.tolerance + 1e-9 * Math.max(1, Math.abs(expected.value));
	}
	return normalizeAnswer(answer) === normalizeAnswer(typed);
}

/** Whether a typed answer matches any of the card's accepted answers. */
export function isCorrectAnswer(card: Flashcard, typed: string): boolean {
	return card.answers.some((answer) => matchesAnswer(answer, typed));
}

/** Returns every non-empty flashcard in a note. */
export function parseCards(text: string): Flashcard[] {
	const cards: Flashcard[] = [];
	let index = 0;
	for (const match of text.matchAll(BLOCK_RE)) {
		const card = parseBlock(match[1]);
		if (card.front || card.back || card.choices.length || card.answers.length) cards.push({ index, ...card });
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
