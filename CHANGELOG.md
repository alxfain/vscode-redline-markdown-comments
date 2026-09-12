# Changelog

All notable changes to Redline are documented here. Versions follow [semantic
versioning](https://semver.org); dates are ISO. Every version below is a
[GitHub release](https://github.com/alxfain/vscode-redline-markdown-comments/releases)
with its `.vsix` attached.

## 0.3.6 — 2026-09-12

- Changelog trimmed to the versions that exist as releases. No changes to the
  extension.

## 0.3.5 — 2026-09-12

- README rewritten for the Marketplace page. Developer notes moved to
  `docs/development.md`.

## 0.3.4 — 2026-09-12

- New Marketplace icon: an amber plate with the comment bubble, readable on the
  white Marketplace page and in a dark extension list alike.

## 0.3.3 — 2026-09-12

First version on the Visual Studio Marketplace.

- Package renamed to `redline-markdown-comments`: the Marketplace requires a name
  that is unique across all publishers, and `markdown-comments` was taken. The
  extension id is `alxfain.redline-markdown-comments`; package files are named
  `redline-markdown-comments-<version>.vsix`.

## 0.3.2 — 2026-09-12

- Publisher changed to `alxfain`. Builds installed under an earlier id must be
  uninstalled once, otherwise VS Code registers the preview twice.

## 0.3.1 — 2026-09-11

- The preview button and `Cmd+Alt+M` appear on every `.md` file. VS Code 1.137
  gives some Markdown files a language id of their own (`SKILL.md` is `skill`,
  `*.prompt.md` is `prompt`, `*.instructions.md` is `instructions`); both were
  gated on the language being `markdown` and are gated on the `.md` extension now.

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

Marketplace-ready build.

- Extension identity, icon, this changelog, and `--production` packaging. No
  changes to the extension's behaviour.

---

Builds 0.1.0–0.1.5 (9–10 September 2026) were distributed as `.vsix` files
before the repository was recreated and are no longer available. They covered the
initial release, four security passes and the in-place tab switching that 0.2.0
ships with.
