# Redline — Markdown Comments

![Redline in action: select text, add a comment, read and edit it. The file is saved every time.](docs/demo.gif)

Comment on Markdown without leaving VS Code. A comment is stored in the `.md` file itself, as an HTML tag at the end of the line it refers to. Markdown renderers skip it, an AI agent can read it, and the file is saved the moment you finish typing.

Redline exists for one loop: the agent writes a document, you mark it up, the agent fixes it.

## How it works

1. Open a `.md` file and click the Redline icon in the editor title bar, or press <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd>. The tab turns into a GitHub-styled page, scrolled to the line your cursor was on. The same button (`</>`) takes you back to the source.
2. Select some text. An **Add comment** button appears where you released the mouse. Type your note and press <kbd>Cmd</kbd>+<kbd>Enter</kbd>.
3. The comment is written into the file, and the file is saved:

   ```markdown
   Grease for bearings · $10.99 <!-- MC:{"id":"c1","anchor":"bearings","comment":"check the brand","line":12,"date":"2026-09-08T10:00:00Z"} -->
   ```

4. Tell your agent: *"Address every `<!-- MC: -->` comment in `docs/spec.md` in place and remove the tags you've handled."* The preview updates live, so you can watch the highlights disappear as it works.

There are no sidecar files and no database. The `.md` stays the single source of truth, and it still renders cleanly on GitHub, in VS Code and in Notion.

## Features

- **Anchored comments.** The selected text is highlighted, a chip in the gutter shows how many comments the line has, and the card opens in the centre of the screen.
- **Comments in code blocks.** Select a line inside a fenced block and comment it like any other text. The tag lands on the block's opening fence line, so the code itself is never touched.
- **Instant save.** Add, edit, delete or undo, and the document is written to disk.
- **Several comments per line.** They stack in one card, each with its own Edit and Delete.
- **Orphans stay visible.** When the agent rewrites the anchored text, the comment turns grey but keeps its quote, so you can check what it was about and delete it.
- **Live preview.** The page re-renders while the agent edits the file. Your scroll position stays where it was.
- **One tab.** Source and preview replace each other in place, in the same tab and at the same position in the document.
- **Navigation.** <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>↓</kbd> and <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd> walk through the comments in file order.
- **Themes.** Six GitHub looks (light, dark, dark dimmed, high contrast, colorblind), or the colours of your VS Code theme.
- **Export.** A standalone HTML file with images inlined, or a print-ready page for PDF. Comments are never included.
- **GFM.** Tables, task lists, strikethrough, autolinks and syntax highlighting.

## Keybindings

> On Windows and Linux, <kbd>Cmd</kbd> is <kbd>Ctrl</kbd>.

| Shortcut | Action |
|---|---|
| <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> | Open the preview, or go back to the source |
| <kbd>Cmd</kbd>+<kbd>Enter</kbd> | Save the comment you are typing |
| <kbd>Esc</kbd> | Close the card, cancel |
| <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>↓</kbd> / <kbd>↑</kbd> | Next / previous comment |
| <kbd>Cmd</kbd>+<kbd>Z</kbd> | Undo the last change (the file is saved again) |

## Settings

| Setting | Default | What it does |
|---|---|---|
| `redline.theme` | `auto` | `auto`, `light`, `dark`, `dark-dimmed`, `dark-high-contrast`, `light-colorblind`, `dark-colorblind`, or `vscode` to follow your editor. The ☀ button in the preview header switches it too. |
| `redline.openByDefault` | `false` | Open every `.md` in Redline instead of the text editor. |
| `redline.allowRemoteImages` | `false` | Load images from `https://` URLs in the preview and keep them in exports. |

## Privacy

**Nothing leaves your machine.** There is no telemetry and no account.

- **Your documents** are rendered locally and are never uploaded anywhere.
- **Opening a file makes no network requests.** Remote images are shown as a placeholder until you turn on `redline.allowRemoteImages`.
- **Exports** contain no scripts. With remote images off they contain no remote URLs either, so a file you send to someone cannot call home when it is opened.
- **Untrusted files are contained.** Raw HTML is sanitised before it reaches the preview, and the preview can read only the folder the document is in.

## Install

Search for **Redline** in the Extensions panel, or run `code --install-extension alxfain.redline-markdown-comments`. Every release is also on [GitHub](https://github.com/alxfain/vscode-redline-markdown-comments/releases) as a `.vsix`.

## Changelog

See [CHANGELOG.md](https://github.com/alxfain/vscode-redline-markdown-comments/blob/main/CHANGELOG.md).

## License

MIT
