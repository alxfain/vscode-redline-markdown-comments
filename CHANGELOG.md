# Changelog

All notable changes to Redline are documented here. Versions follow [semantic
versioning](https://semver.org); dates are ISO.

## 0.3.0 — 2026-09-11

Comments inside fenced code blocks.

- Select text inside a ```` ``` ```` or `~~~` block and the "Add comment" button
  appears as anywhere else. The tag is written at the end of the block's opening
  fence line, after the language name: renderers treat it as part of the info
  string and show nothing, the code inside the block is never touched, and the
  file keeps the same number of lines.
- Several comments on one block share a chip with a count and stack in one card;
  the card's quote keeps the code's spacing, so a table row still reads as a row.
- A selection that starts in one block and ends in another no longer creates a
  comment that would orphan on the next render — the button simply does not appear.
- Selecting inside an indented code block (four spaces, no fence) now shows a
  short explanation instead of nothing: such a block has no fence line for a tag.
- Backticks inside a comment or its anchor are written into the tag as `\u0060`
  and read back unchanged. On a fence line a literal backtick is invalid
  CommonMark and would turn the block into a paragraph.

## 0.2.0 — 2026-09-10

First release on the Visual Studio Marketplace.

- Extension identity is now `redline.markdown-comments`. Installing from a `.vsix`
  built before this version leaves the old copy behind — uninstall it once.
- Added a Marketplace icon and this changelog.
- No changes to the extension's behaviour.

## 0.1.5 — 2026-09-10

A document can no longer forge the comment layer.

- `data-line` and `data-id` are stripped from raw HTML inside the document, in
  the `html_block` / `html_inline` renderer rules — so `<div data-line="9999">`
  can no longer move someone else's comment, and `<span data-id="c1">` can no
  longer pose as a highlight. The renderer's own stamps are untouched.
- `rl-*` and `markdown-body` classes are stripped from document content.
- Of `<input>`, only a disabled `type="checkbox"` survives; text fields and
  `type="image"` are removed.

## 0.1.4 — 2026-09-10

Fourth security and performance pass.

- `stripComments` and `findTags` are linear again. Both run on the host on every
  keystroke: 40 000 tags took 8.8 s and now takes 31 ms; 40 000 lines carrying
  inline code plus a comment took 1.4 s and now takes 15 ms.
- `nextId` no longer throws `RangeError` on files with ~125 000 tags.
- Export follows `redline.allowRemoteImages`. With the setting off, remote images
  become an inert note and the exported file's CSP allows `img-src data:` only —
  an exported document can no longer load a tracking pixel for every reader.
- On the export path the `file:` scheme is allowed on `img src` only, not on links.

## 0.1.3 — 2026-09-09

Source and preview replace each other in the same tab.

- Switching uses VS Code's own in-place editor replacement, so the tab keeps its
  slot in the row; the previous "open beside, close the old tab" path remains as
  a fallback. Time spent showing two tabs at once dropped from 38–61 ms to 10–18 ms.
- The preview shows the document in one frame: the cursor line is written into
  the webview shell before the first load, and the content stays hidden until the
  first render has scrolled to it.
- The position carries over both ways — cursor line to the preview, top visible
  line back to the cursor.
- Packaging builds with `--production`: `webview.js` is 326 KB instead of 736 KB,
  with no source maps.
- Added an integration harness that launches a real VS Code and asserts exactly
  one tab per file in both directions.

## 0.1.2 — 2026-09-09

Second security pass.

- Security-relevant settings are read from user scope only and declared as
  `restrictedConfigurations`, so a `.vscode/settings.json` from someone else's
  repository cannot turn on network access or claim `.md` files.
- The tag parser is a hand-written linear scan instead of a lazy regex: 300 000
  unclosed openers (2.9 MB) parse in 7 ms, and junk openers no longer hide a real tag.
- Messages from the webview are validated for shape and size at runtime.
- PDF export writes into a private temporary directory.
- The extension is checked against the real file behind a symlink.

## 0.1.1 — 2026-09-09

Export and sanitising hardened.

- The hand-written regex sanitiser is replaced with DOMPurify in the webview,
  applied right before `innerHTML`, with a strict allowlist. Export asks the
  webview for sanitised HTML instead of rendering on the host.
- `localResourceRoots` is narrowed to the document folder and the extension's own
  media; the webview no longer reads the whole workspace.
- Remote images are off by default (`redline.allowRemoteImages`): opening a
  document makes no network requests until you opt in.
- Export inlines images only after resolving both paths and checking containment,
  so a symlink out of the folder, `..`, or another volume is rejected.
- The exported HTML carries its own script-free CSP.

## 0.1.0 — 2026-09-09

Initial release: Markdown comments inside VS Code.

- Comments are stored in the `.md` file itself as `<!-- MC:{…} -->` tags at the
  end of the line they refer to — invisible to every Markdown renderer, readable
  by any agent, and written to disk on every change.
- Anchored highlights, a count chip in the gutter, a card with Edit / Delete,
  several comments per line, and orphans that stay visible when the anchored text
  is rewritten.
- Live preview that re-renders while an agent edits the file, keeping scroll position.
- `Cmd+Alt+M` to open, `Cmd+Alt+↓` / `Cmd+Alt+↑` to walk through comments.
- Six GitHub themes or the colours of the active VS Code theme.
- Export to a standalone HTML file or a print-ready page for PDF, always without comments.
