import { App, Component, MarkdownRenderer, Platform, setIcon } from "obsidian";
import { Flashcard, isCorrectAnswer } from "./parser";

/**
 * Draws one card (flip, multiple-choice or typed-answer) and tracks progress on it.
 * Used by the flashcard view and by ```flashcard-inline blocks in notes.
 */
export class CardWidget {
	private flipped = false;
	/** Option picked on a multiple-choice card, or null if unanswered. */
	private answer: number | null = null;
	/** Answer submitted on a typed-answer card, or null if not checked yet. */
	private typed: string | null = null;
	// What's in the answer box before it's checked, so re-renders (like starring) don't wipe it.
	private draft = "";
	private card: Flashcard | null = null;
	private cardEl: HTMLElement | null = null;
	private inputEl: HTMLInputElement | null = null;

	/**
	 * @param onAnswer runs after an answer is picked or checked, so the owner can re-render.
	 * @param autofocus puts the cursor in a typed-answer box when it's drawn (not on phones).
	 */
	constructor(private app: App, private onAnswer: () => void, private autofocus = false) {}

	/** Whether the current multiple-choice or typed-answer card has been answered. */
	get answered(): boolean {
		return this.answer !== null || this.typed !== null;
	}

	/** Whether the current card is a regular front/back card. */
	get isFlipCard(): boolean {
		return this.cardEl !== null;
	}

	/** Clears progress: which side is up and any chosen or typed answer. */
	reset(): void {
		this.flipped = false;
		this.answer = null;
		this.typed = null;
		this.draft = "";
	}

	/** Draws the card into `parent` and returns its .fc-card element. Markdown is owned by `component`. */
	render(parent: HTMLElement, card: Flashcard, sourcePath: string, component: Component): HTMLElement {
		this.card = card;
		this.cardEl = null;
		this.inputEl = null;
		const render = (el: HTMLElement, markdown: string): void => {
			void MarkdownRenderer.render(this.app, markdown, el, sourcePath, component);
		};
		if (card.choices.length) return this.renderChoiceCard(parent, card, render);
		if (card.answers.length) return this.renderTypedCard(parent, card, render);
		return this.renderFlipCard(parent, card, render);
	}

	flip(): void {
		if (!this.cardEl) return;
		this.flipped = !this.flipped;
		this.cardEl.toggleClass("is-flipped", this.flipped);
	}

	/** Picks an option on a multiple-choice card; the first pick is final. */
	choose(choice: number): void {
		if (!this.card || this.answer !== null || choice >= this.card.choices.length) return;
		this.answer = choice;
		this.onAnswer();
	}

	/** Checks a typed answer; blank answers are ignored and the first check is final. */
	check(text: string): void {
		if (!this.card || this.typed !== null || !this.card.answers.length || !text.trim()) return;
		this.typed = text.trim();
		this.onAnswer();
	}

	focusAnswer(): void {
		this.inputEl?.focus();
	}

	private renderFlipCard(parent: HTMLElement, card: Flashcard, render: MarkdownRender): HTMLElement {
		const cardEl = parent.createDiv("fc-card");
		cardEl.toggleClass("is-flipped", this.flipped);
		const inner = cardEl.createDiv("fc-card-inner");
		this.renderFace(inner, "Front", card.front, render);
		this.renderFace(inner, "Back", card.back, render);
		cardEl.onclick = (evt) => {
			// Let links inside the card work without flipping it.
			if (!(evt.target as HTMLElement).closest("a")) this.flip();
		};
		this.cardEl = cardEl;
		return cardEl;
	}

	private renderChoiceCard(parent: HTMLElement, card: Flashcard, render: MarkdownRender): HTMLElement {
		const cardEl = parent.createDiv("fc-card fc-choice-card");
		const face = cardEl.createDiv("fc-face");
		face.createDiv({ cls: "fc-face-label", text: "Question" });
		render(face.createDiv("fc-face-body"), card.front);

		const answer = this.answer;
		const list = face.createDiv("fc-choices");
		list.toggleClass("is-answered", answer !== null);
		card.choices.forEach((choice, i) => {
			const btn = list.createEl("button", { cls: "fc-choice" });
			btn.createSpan({ cls: "fc-choice-key", text: String(i + 1) });
			render(btn.createDiv("fc-choice-text"), choice.text);
			if (answer !== null) {
				if (choice.correct) btn.addClass("is-correct");
				else if (i === answer) btn.addClass("is-wrong");
			}
			btn.onclick = (evt) => {
				if (!(evt.target as HTMLElement).closest("a")) this.choose(i);
			};
		});

		if (answer === null) return cardEl;
		const correct = card.choices[answer].correct;
		const result = face.createDiv(`fc-result ${correct ? "is-correct" : "is-wrong"}`);
		setIcon(result.createSpan("fc-result-icon"), correct ? "check" : "x");
		result.createSpan({ text: correct ? "Correct!" : "Not quite. The right answer is highlighted." });
		// An optional back: on a multiple-choice card is shown as an explanation once answered.
		if (card.back) render(face.createDiv("fc-explanation"), card.back);
		return cardEl;
	}

	private renderTypedCard(parent: HTMLElement, card: Flashcard, render: MarkdownRender): HTMLElement {
		const cardEl = parent.createDiv("fc-card fc-typed-card");
		const face = cardEl.createDiv("fc-face");
		face.createDiv({ cls: "fc-face-label", text: "Question" });
		render(face.createDiv("fc-face-body"), card.front);

		const typed = this.typed;
		const row = face.createDiv("fc-answer-row");
		const input = row.createEl("input", {
			cls: "fc-answer-input",
			type: "text",
			attr: { placeholder: "Type your answer", autocomplete: "off", autocapitalize: "off", spellcheck: "false" },
		});

		if (typed === null) {
			this.inputEl = input;
			input.value = this.draft;
			input.oninput = () => { this.draft = input.value; };
			input.onkeydown = (evt) => {
				if (evt.key === "Enter") {
					evt.preventDefault();
					this.check(input.value);
				} else if (evt.key === "Escape") {
					input.blur();
				}
			};
			row.createEl("button", { cls: "mod-cta", text: "Check" }).onclick = () => this.check(input.value);
			// Ready to type, unless focus is somewhere else (like an editor beside the view) or it would pop up a phone keyboard.
			const focused = input.doc.activeElement;
			if (this.autofocus && !Platform.isMobile && (!focused || focused === input.doc.body)) input.focus();
			return cardEl;
		}

		const correct = isCorrectAnswer(card, typed);
		input.value = typed;
		input.disabled = true;
		input.addClass(correct ? "is-correct" : "is-wrong");

		const result = face.createDiv(`fc-result ${correct ? "is-correct" : "is-wrong"}`);
		setIcon(result.createSpan("fc-result-icon"), correct ? "check" : "x");
		const message = result.createSpan({ text: correct ? "Correct!" : "Not quite. The answer is " });
		if (!correct) {
			message.createEl("strong", { text: card.answers[0] });
			message.appendText(".");
		}
		if (card.back) render(face.createDiv("fc-explanation"), card.back);
		return cardEl;
	}

	private renderFace(parent: HTMLElement, label: string, markdown: string, render: MarkdownRender): void {
		const face = parent.createDiv(`fc-face fc-${label.toLowerCase()}`);
		face.createDiv({ cls: "fc-face-label", text: label });
		const body = face.createDiv("fc-face-body");
		if (markdown) {
			render(body, markdown);
		} else {
			body.createSpan({ cls: "fc-placeholder", text: `(no ${label.toLowerCase()})` });
		}
	}
}

type MarkdownRender = (el: HTMLElement, markdown: string) => void;
