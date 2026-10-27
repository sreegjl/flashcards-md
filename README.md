<div align="center">

<img src="docs/banner.png" alt="flashcards.md: simple flashcards for your Obsidian vault" width="100%" />

</div>

# Flashcards MD

An Obsidian plugin for writing flashcards in your notes and studying them in a flip-card view.

<p align="center">
  <img src="docs/flashcard_front.png" alt="Flashcard view showing the front of a card" width="49%" />
  <img src="docs/flashcard_back.png" alt="The same card flipped to its back" width="49%" />
</p>

## Writing cards

Each `flashcard` code block is one card:

````markdown
```flashcard
front: What is the capital of France?
back: Paris
```
````

- Values can run over several lines. Any line that doesn't start with `front:`, `back:` or `starred:` continues the field above it.
- Markdown works on both sides, including bold, lists, links and images.
- In reading view, each block shows as a small front/back preview.

<img src="docs/flashcards_md.png" alt="A note of flashcards in reading view, one starred" width="100%" />

### Multiple choice

Give a card options as a checklist instead of a `back:`, and mark the right one with `[x]`:

````markdown
```flashcard
front: Which planet is closest to the Sun?
- [ ] Venus
- [x] Mercury
- [ ] Mars
```
````

<p align="center">
  <img src="docs/flashcard_choice.png" alt="A multiple-choice card with four numbered options" width="49%" />
  <img src="docs/flashcard_choice_answered.png" alt="The same card after a wrong pick: the pick is red, the right answer green, with an explanation below" width="49%" />
</p>

In flashcard view, a multiple-choice card shows its options instead of flipping. Pick one to see if you got it right. The correct option turns green and a wrong pick turns red. If more than one option is marked `[x]`, any of them counts as right. You can still add a `back:` line, and it shows as an explanation after you answer.

Any `- [ ]` or `- [x]` line in a card is treated as an option, so don't use checklists inside a regular card's `back:`.

## Studying

Open a note in flashcard view in any of these ways. The ribbon icon and the command are toggles, so using either again switches back to the normal note:

- the **layers** icon in the ribbon,
- the command **Flashcards MD: Toggle flashcard view**,
- right-clicking the note in the file explorer and choosing **Open in flashcard view**.

In the view:

| Action | Mouse | Key |
| --- | --- | --- |
| Flip card | Click the card or **Flip** | `Space` / `Enter` |
| Answer a multiple-choice card | Click an option | `1`–`9` |
| Previous / next card | Arrow buttons | `←` / `→` |
| Star / unstar | Star button | `S` |
| Show all or only starred cards | **All** / **Starred** toggle | |
| Shuffle, or go back to note order | Shuffle button | |
| Go back to editing | Pencil button | |

Stars are saved in the note as a `starred: true` line inside the card's block. They stay with the note when you sync, rename or move it.

## Other commands

- **Create new flashcard note** creates `Flashcards.md` with a few example cards.
- **Insert flashcard** adds an empty card at the cursor.
- **Insert multiple choice flashcard** adds an empty multiple-choice card with three options.

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # type-check and production build
npm run banner  # re-render docs/banner.png from docs/banner/banner.html
```

To install by hand, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/flashcards-md/`. Then turn on the plugin under **Settings → Community plugins**.
