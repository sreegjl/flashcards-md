import { Component, ItemView, Platform, Scope, TFile, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { CardWidget } from "./card";
import { Flashcard, parseCards, setStarred } from "./parser";

export const VIEW_TYPE_FLASHCARDS = "flashcards-md-view";

/** True when a key press is going into a text field, where it should type rather than trigger a shortcut. */
function isTyping(evt: KeyboardEvent): boolean {
	const el = evt.target as HTMLElement | null;
	return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

interface FlashcardViewState {
	file?: string;
	starredOnly?: boolean;
	shuffled?: boolean;
}

export class FlashcardView extends ItemView {
	private file: TFile | null = null;
	private cards: Flashcard[] = [];
	private position = 0;
	private starredOnly = false;
	private shuffled = false;
	// Random sort key per card (keyed by block index), so the shuffled order survives re-reads of the note.
	private shuffleRanks = new Map<number, number>();
	private widget = new CardWidget(this.app, () => this.render(), true);
	// Owns the markdown rendered for the current card so it can be torn down on re-render.
	private renderComponent: Component | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.scope = new Scope(this.app.scope);
		// Shortcuts step aside while typing an answer; arrows still navigate from an empty answer box.
		const shortcut = (key: string, action: () => void, whileEmpty = false): void => {
			this.scope!.register([], key, (evt) => {
				if (isTyping(evt) && !(whileEmpty && !(evt.target as HTMLInputElement).value)) return true;
				action();
				return false;
			});
		};
		shortcut(" ", () => this.flip());
		shortcut("Enter", () => this.enter());
		shortcut("ArrowRight", () => this.move(1), true);
		shortcut("ArrowLeft", () => this.move(-1), true);
		shortcut("s", () => void this.toggleStar());
		for (let n = 1; n <= 9; n++) shortcut(String(n), () => this.choose(n - 1));
	}

	getViewType(): string {
		return VIEW_TYPE_FLASHCARDS;
	}

	getDisplayText(): string {
		return this.file ? `${this.file.basename} (flashcards)` : "Flashcards";
	}

	getIcon(): string {
		return "layers";
	}

	getState(): Record<string, unknown> {
		return { file: this.file?.path, starredOnly: this.starredOnly, shuffled: this.shuffled };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const { file, starredOnly, shuffled } = (state ?? {}) as FlashcardViewState;
		const found = file ? this.app.vault.getAbstractFileByPath(file) : null;
		this.file = found instanceof TFile ? found : null;
		this.starredOnly = !!starredOnly;
		this.shuffled = !!shuffled;
		this.shuffleRanks.clear();
		this.position = 0;
		this.resetCard();
		await this.reload();
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("fc-view");
		this.registerEvent(this.app.vault.on("modify", (file) => {
			if (file === this.file) void this.reload(true);
		}));
		this.registerEvent(this.app.vault.on("rename", (file) => {
			if (file === this.file) this.render();
		}));
		this.registerEvent(this.app.vault.on("delete", (file) => {
			if (file === this.file) {
				this.file = null;
				void this.reload();
			}
		}));
		this.render();
	}

	getFile(): TFile | null {
		return this.file;
	}

	/** Switches this tab back to the normal note view. */
	openNote(): void {
		if (this.file) void this.leaf.openFile(this.file);
	}

	private get visibleCards(): Flashcard[] {
		const cards = this.starredOnly ? this.cards.filter((card) => card.starred) : this.cards;
		return this.shuffled ? [...cards].sort((a, b) => this.shuffleRank(a) - this.shuffleRank(b)) : cards;
	}

	private shuffleRank(card: Flashcard): number {
		let rank = this.shuffleRanks.get(card.index);
		if (rank === undefined) {
			rank = Math.random();
			this.shuffleRanks.set(card.index, rank);
		}
		return rank;
	}

	/** Re-reads the note. With `keepPosition`, stays on the same card if it still exists. */
	private async reload(keepPosition = false): Promise<void> {
		const currentIndex = this.visibleCards[this.position]?.index;
		this.cards = this.file ? parseCards(await this.app.vault.read(this.file)) : [];

		const found = this.visibleCards.findIndex((card) => card.index === currentIndex);
		if (keepPosition && found >= 0) {
			this.position = found;
		} else {
			this.resetCard();
			this.position = keepPosition ? Math.min(this.position, Math.max(this.visibleCards.length - 1, 0)) : 0;
		}
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		if (this.renderComponent) this.removeChild(this.renderComponent);
		this.renderComponent = this.addChild(new Component());

		const header = root.createDiv("fc-header");
		header.createDiv({ cls: "fc-title", text: this.file?.basename ?? "Flashcards" });

		if (!this.file) {
			root.createDiv({ cls: "fc-empty", text: "No note selected. Open a note and run \"Open in flashcard view\"." });
			return;
		}
		const file = this.file;

		const starredCount = this.cards.filter((card) => card.starred).length;
		const filter = header.createDiv("fc-filter");
		const allBtn = filter.createEl("button", { text: `All (${this.cards.length})` });
		const starredBtn = filter.createEl("button", { text: `Starred (${starredCount})` });
		(this.starredOnly ? starredBtn : allBtn).addClass("is-active");
		allBtn.onclick = () => this.setStarredOnly(false);
		starredBtn.onclick = () => this.setStarredOnly(true);

		const shuffleBtn = header.createEl("button", {
			cls: "clickable-icon fc-shuffle",
			attr: { "aria-label": this.shuffled ? "Back to note order" : "Shuffle" },
		});
		setIcon(shuffleBtn, "shuffle");
		shuffleBtn.toggleClass("is-active", this.shuffled);
		shuffleBtn.onclick = () => this.toggleShuffle();

		const editBtn = header.createEl("button", { cls: "clickable-icon fc-edit", attr: { "aria-label": "Edit note" } });
		setIcon(editBtn, "pencil");
		editBtn.onclick = () => this.openNote();

		const cards = this.visibleCards;
		if (cards.length === 0) {
			root.createDiv({
				cls: "fc-empty",
				text: this.starredOnly
					? "No starred cards yet. Star a card to add it here."
					: "No flashcards in this note. Add a ```flashcard block with front: and back: lines.",
			});
			return;
		}

		const card = cards[this.position];
		const isChoice = card.choices.length > 0;
		const isTyped = !isChoice && card.answers.length > 0;
		this.addSwipe(this.widget.render(root, card, file.path, this.renderComponent));

		const controls = root.createDiv("fc-controls");
		this.iconButton(controls, "arrow-left", "Previous card", () => this.move(-1));
		if (!isChoice && !isTyped) controls.createEl("button", { cls: "mod-cta fc-flip", text: "Flip" }).onclick = () => this.flip();
		const starBtn = this.iconButton(controls, "star", card.starred ? "Unstar" : "Star", () => void this.toggleStar());
		starBtn.toggleClass("is-starred", card.starred);
		this.iconButton(controls, "arrow-right", "Next card", () => this.move(1));

		root.createDiv({ cls: "fc-counter", text: `${this.position + 1} / ${cards.length}` });
		// Phones get touch hints; everything else (including iPads, which often have keyboards) gets shortcuts.
		let hint: string;
		if (Platform.isPhone) {
			hint = `${isChoice ? "Tap an answer" : isTyped ? "Type your answer" : "Tap the card to flip"} · Swipe to change cards`;
		} else if (isTyped) {
			hint = !this.widget.answered ? "Enter to check · ← → to navigate" : "Enter for the next card · ← → to navigate · S to star";
		} else {
			hint = `${isChoice ? `1–${Math.min(card.choices.length, 9)} to answer` : "Space to flip"} · ← → to navigate · S to star`;
		}
		root.createDiv({ cls: "fc-hint", text: hint });
	}

	/** Swiping left/right on the card goes to the next/previous card. */
	private addSwipe(el: HTMLElement): void {
		let startX = 0;
		let startY = 0;
		let tracking = false;
		// Stop propagation so Obsidian mobile doesn't also treat the swipe as opening a sidebar.
		el.addEventListener("touchstart", (evt) => {
			evt.stopPropagation();
			tracking = evt.touches.length === 1;
			if (!tracking) return;
			startX = evt.touches[0].clientX;
			startY = evt.touches[0].clientY;
		}, { passive: true });
		el.addEventListener("touchmove", (evt) => evt.stopPropagation(), { passive: true });
		el.addEventListener("touchend", (evt) => {
			evt.stopPropagation();
			if (!tracking) return;
			tracking = false;
			const dx = evt.changedTouches[0].clientX - startX;
			const dy = evt.changedTouches[0].clientY - startY;
			// Mostly-horizontal and far enough to be deliberate, so vertical scrolling and taps aren't swipes.
			if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy)) this.move(dx < 0 ? 1 : -1);
		});
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
		const btn = parent.createEl("button", { attr: { "aria-label": label } });
		setIcon(btn, icon);
		btn.onclick = onClick;
		return btn;
	}

	private flip(): void {
		this.widget.flip();
	}

	private move(delta: number): void {
		const count = this.visibleCards.length;
		if (count === 0) return;
		this.position = (this.position + delta + count) % count;
		this.resetCard();
		this.render();
	}

	private choose(choice: number): void {
		this.widget.choose(choice);
	}

	/** Enter flips a flip card, focuses an unchecked answer box, and goes to the next card once a question is answered. */
	private enter(): void {
		if (!this.visibleCards[this.position]) return;
		if (this.widget.isFlipCard) this.widget.flip();
		else if (this.widget.answered) this.move(1);
		else this.widget.focusAnswer();
	}

	private resetCard(): void {
		this.widget.reset();
	}

	private setStarredOnly(starredOnly: boolean): void {
		if (this.starredOnly === starredOnly) return;
		this.starredOnly = starredOnly;
		this.position = 0;
		this.resetCard();
		this.render();
		this.app.workspace.requestSaveLayout();
	}

	/** Turns shuffling on (with a fresh random order) or off (back to note order), starting from the first card. */
	private toggleShuffle(): void {
		this.shuffled = !this.shuffled;
		this.shuffleRanks.clear();
		this.position = 0;
		this.resetCard();
		this.render();
		this.app.workspace.requestSaveLayout();
	}

	/** Writes the star into the note; the resulting modify event re-renders the view. */
	private async toggleStar(): Promise<void> {
		const card = this.visibleCards[this.position];
		if (!card || !this.file) return;
		await this.app.vault.process(this.file, (text) => setStarred(text, card.index, !card.starred));
	}
}
