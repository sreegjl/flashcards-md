import { Editor, MarkdownRenderChild, MarkdownRenderer, Notice, Plugin, TFile, normalizePath, setIcon } from "obsidian";
import { parseBlock } from "./parser";
import { FlashcardView, VIEW_TYPE_FLASHCARDS } from "./view";

const CARD_SNIPPET = "```flashcard\nfront: \nback: \n```\n";
const CHOICE_SNIPPET = "```flashcard\nfront: \n- [x] \n- [ ] \n- [ ] \n```\n";
const TYPED_SNIPPET = "```flashcard\nfront: \nanswer: \n```\n";

const NEW_NOTE_TEMPLATE = `# Flashcards

\`\`\`flashcard
front: What is the capital of France?
back: Paris
\`\`\`

\`\`\`flashcard
front: What is 7 × 8?
answer: 56
\`\`\`

\`\`\`flashcard
front: Which planet is closest to the Sun?
- [ ] Venus
- [x] Mercury
- [ ] Mars
\`\`\`
`;

/** Inserts a card snippet at the cursor, then puts the cursor right after "front: ". */
function insertSnippet(editor: Editor, snippet: string): void {
	const cursor = editor.getCursor();
	const prefix = cursor.ch > 0 ? "\n" : "";
	editor.replaceRange(prefix + snippet, cursor);
	editor.setCursor({ line: cursor.line + (prefix ? 2 : 1), ch: "front: ".length });
}

export default class FlashcardsPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE_FLASHCARDS, (leaf) => new FlashcardView(leaf));

		// Show each block as a small front/back preview in reading view.
		this.registerMarkdownCodeBlockProcessor("flashcard", (source, el, ctx) => {
			const card = parseBlock(source);
			const child = new MarkdownRenderChild(el);
			ctx.addChild(child);

			el.addClass("fc-inline");
			if (card.starred) setIcon(el.createDiv({ cls: "fc-inline-star", attr: { "aria-label": "Starred" } }), "star");
			const row = (label: string): HTMLElement => {
				const rowEl = el.createDiv("fc-inline-row");
				rowEl.createDiv({ cls: "fc-inline-label", text: label });
				return rowEl.createDiv("fc-inline-body");
			};
			const render = (markdown: string, target: HTMLElement): void => {
				void MarkdownRenderer.render(this.app, markdown, target, ctx.sourcePath, child);
			};

			render(card.front, row("Front"));
			if (card.choices.length) {
				const list = row("Choices").createEl("ol", { cls: "fc-inline-choices" });
				for (const choice of card.choices) {
					const item = list.createEl("li");
					item.toggleClass("is-correct", choice.correct);
					render(choice.text, item);
				}
			} else if (card.answers.length) {
				row("Answer").setText(card.answers.join(" / "));
			}
			// Multiple-choice and typed-answer cards only have a back when it's used as an explanation.
			if (card.back || (!card.choices.length && !card.answers.length)) render(card.back, row("Back"));
		});

		this.addRibbonIcon("layers", "Toggle flashcard view", () => {
			if (!this.toggleFlashcards(false)) new Notice("Open a note first.");
		});

		this.addCommand({
			id: "open-flashcard-view",
			name: "Toggle flashcard view",
			checkCallback: (checking) => this.toggleFlashcards(checking),
		});

		this.addCommand({
			id: "create-flashcard-note",
			name: "Create new flashcard note",
			callback: () => void this.createFlashcardNote(),
		});

		this.addCommand({
			id: "insert-flashcard",
			name: "Insert flashcard",
			editorCallback: (editor) => insertSnippet(editor, CARD_SNIPPET),
		});

		this.addCommand({
			id: "insert-multiple-choice-flashcard",
			name: "Insert multiple choice flashcard",
			editorCallback: (editor) => insertSnippet(editor, CHOICE_SNIPPET),
		});

		this.addCommand({
			id: "insert-typed-answer-flashcard",
			name: "Insert typed answer flashcard",
			editorCallback: (editor) => insertSnippet(editor, TYPED_SNIPPET),
		});

		this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			menu.addItem((item) => item
				.setTitle("Open in flashcard view")
				.setIcon("layers")
				.onClick(() => void this.openFlashcards(file)));
		}));
	}

	/**
	 * Switches the active tab between the note and its flashcard view.
	 * Returns false when there's nothing to toggle (follows the checkCallback convention).
	 */
	private toggleFlashcards(checking: boolean): boolean {
		const flashcardView = this.app.workspace.getActiveViewOfType(FlashcardView);
		if (flashcardView) {
			if (!flashcardView.getFile()) return false;
			if (!checking) flashcardView.openNote();
			return true;
		}

		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") return false;
		if (!checking) void this.openFlashcards(file);
		return true;
	}

	async openFlashcards(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({ type: VIEW_TYPE_FLASHCARDS, active: true, state: { file: file.path } });
	}

	private async createFlashcardNote(): Promise<void> {
		const parent = this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? "");
		let path = normalizePath(`${parent.path}/Flashcards.md`);
		for (let i = 1; this.app.vault.getAbstractFileByPath(path); i++) {
			path = normalizePath(`${parent.path}/Flashcards ${i}.md`);
		}
		const file = await this.app.vault.create(path, NEW_NOTE_TEMPLATE);
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}
