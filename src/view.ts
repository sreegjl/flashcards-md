import { Component, ItemView, MarkdownRenderer, Scope, TFile, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { Flashcard, parseCards, setStarred } from "./parser";

export const VIEW_TYPE_FLASHCARDS = "flashcards-md-view";

interface FlashcardViewState {
	file?: string;
	starredOnly?: boolean;
}

export class FlashcardView extends ItemView {
	private file: TFile | null = null;
	private cards: Flashcard[] = [];
	private position = 0;
	private flipped = false;
	private starredOnly = false;
	private cardEl: HTMLElement | null = null;
	// Owns the markdown rendered for the current card so it can be torn down on re-render.
	private renderComponent: Component | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.scope = new Scope(this.app.scope);
		this.scope.register([], " ", () => { this.flip(); return false; });
		this.scope.register([], "Enter", () => { this.flip(); return false; });
		this.scope.register([], "ArrowRight", () => { this.move(1); return false; });
		this.scope.register([], "ArrowLeft", () => { this.move(-1); return false; });
		this.scope.register([], "s", () => { void this.toggleStar(); return false; });
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
		return { file: this.file?.path, starredOnly: this.starredOnly };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const { file, starredOnly } = (state ?? {}) as FlashcardViewState;
		const found = file ? this.app.vault.getAbstractFileByPath(file) : null;
		this.file = found instanceof TFile ? found : null;
		this.starredOnly = !!starredOnly;
		this.position = 0;
		this.flipped = false;
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
		return this.starredOnly ? this.cards.filter((card) => card.starred) : this.cards;
	}

	/** Re-reads the note. With `keepPosition`, stays on the same card if it still exists. */
	private async reload(keepPosition = false): Promise<void> {
		const currentIndex = this.visibleCards[this.position]?.index;
		this.cards = this.file ? parseCards(await this.app.vault.read(this.file)) : [];

		const found = this.visibleCards.findIndex((card) => card.index === currentIndex);
		if (keepPosition && found >= 0) {
			this.position = found;
		} else {
			this.flipped = false;
			this.position = keepPosition ? Math.min(this.position, Math.max(this.visibleCards.length - 1, 0)) : 0;
		}
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		this.cardEl = null;
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
		const cardEl = root.createDiv("fc-card");
		cardEl.toggleClass("is-flipped", this.flipped);
		const inner = cardEl.createDiv("fc-card-inner");
		this.renderFace(inner, "Front", card.front, file.path);
		this.renderFace(inner, "Back", card.back, file.path);
		cardEl.onclick = (evt) => {
			// Let links inside the card work without flipping it.
			if (!(evt.target as HTMLElement).closest("a")) this.flip();
		};
		this.cardEl = cardEl;

		const controls = root.createDiv("fc-controls");
		this.iconButton(controls, "arrow-left", "Previous card", () => this.move(-1));
		controls.createEl("button", { cls: "mod-cta fc-flip", text: "Flip" }).onclick = () => this.flip();
		const starBtn = this.iconButton(controls, "star", card.starred ? "Unstar" : "Star", () => void this.toggleStar());
		starBtn.toggleClass("is-starred", card.starred);
		this.iconButton(controls, "arrow-right", "Next card", () => this.move(1));

		root.createDiv({ cls: "fc-counter", text: `${this.position + 1} / ${cards.length}` });
		root.createDiv({ cls: "fc-hint", text: "Space to flip · ← → to navigate · S to star" });
	}

	private renderFace(parent: HTMLElement, label: string, markdown: string, sourcePath: string): void {
		const face = parent.createDiv(`fc-face fc-${label.toLowerCase()}`);
		face.createDiv({ cls: "fc-face-label", text: label });
		const body = face.createDiv("fc-face-body");
		if (markdown) {
			void MarkdownRenderer.render(this.app, markdown, body, sourcePath, this.renderComponent!);
		} else {
			body.createSpan({ cls: "fc-placeholder", text: `(no ${label.toLowerCase()})` });
		}
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
		const btn = parent.createEl("button", { attr: { "aria-label": label } });
		setIcon(btn, icon);
		btn.onclick = onClick;
		return btn;
	}

	private flip(): void {
		if (!this.cardEl) return;
		this.flipped = !this.flipped;
		this.cardEl.toggleClass("is-flipped", this.flipped);
	}

	private move(delta: number): void {
		const count = this.visibleCards.length;
		if (count === 0) return;
		this.position = (this.position + delta + count) % count;
		this.flipped = false;
		this.render();
	}

	private setStarredOnly(starredOnly: boolean): void {
		if (this.starredOnly === starredOnly) return;
		this.starredOnly = starredOnly;
		this.position = 0;
		this.flipped = false;
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
