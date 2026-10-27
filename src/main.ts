import { MarkdownRenderChild, MarkdownRenderer, Notice, Plugin, TFile, normalizePath, setIcon } from "obsidian";
import { parseBlock } from "./parser";
import { FlashcardView, VIEW_TYPE_FLASHCARDS } from "./view";

const CARD_SNIPPET = "```flashcard\nfront: \nback: \n```\n";

const NEW_NOTE_TEMPLATE = `# Flashcards

\`\`\`flashcard
front: What is the capital of France?
back: Paris
\`\`\`

\`\`\`flashcard
front: What is 7 × 8?
back: 56
\`\`\`
`;

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
			for (const side of ["front", "back"] as const) {
				const row = el.createDiv("fc-inline-row");
				row.createDiv({ cls: "fc-inline-label", text: side === "front" ? "Front" : "Back" });
				const body = row.createDiv("fc-inline-body");
				void MarkdownRenderer.render(this.app, card[side], body, ctx.sourcePath, child);
			}
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
			editorCallback: (editor) => {
				const cursor = editor.getCursor();
				const prefix = cursor.ch > 0 ? "\n" : "";
				editor.replaceRange(prefix + CARD_SNIPPET, cursor);
				// Put the cursor right after "front: ".
				editor.setCursor({ line: cursor.line + (prefix ? 2 : 1), ch: "front: ".length });
			},
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
