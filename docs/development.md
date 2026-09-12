# Development

```sh
npm test                 # Vitest — parser, rendering, sanitising, export, layout logic
npm run test:integration # launches a real VS Code and checks tab switching end to end
npm run typecheck        # tsc --noEmit
npm run compile          # esbuild: host, webview, CSS (unminified, with source maps)
npm run watch
npx vsce package --no-dependencies   # production build, minified
```

The comment parser (`src/commentStore.ts`) is the one place where a bug would corrupt a user's file. It is pure, dependency-free and covered by tests with hostile fixtures: `-->` inside a comment, braces, code fences, emoji, duplicate ids, and files large enough to expose quadratic behaviour.

Tab switching cannot be unit-tested — only a real VS Code knows what a tab is. `npm run test:integration` starts one, switches source ↔ preview with neighbouring tabs open, and asserts exactly one tab per file, the tab's position and the cursor line carried both ways.

## How the preview stays safe

- Opening a document makes no network requests. Images from `https://` URLs are replaced with a placeholder until `redline.allowRemoteImages` is on; exports follow the same setting and carry no remote image URLs when it is off.
- The preview loads local images only from the document's own folder and the extension's assets; the webview has no access to the rest of the workspace. Raw HTML is sanitised with DOMPurify before it reaches the DOM, under a nonce-based Content-Security-Policy.
- Export inlines only image files from the document's folder or the open workspace, after resolving symlinks and `..`; `file:` links never reach the exported file, and the exported HTML carries its own CSP that forbids scripts.
- A document cannot impersonate the comment layer: Redline's own classes and line markers are stripped from raw HTML, so a file cannot draw fake highlights or steer a comment onto another line. Form fields are reduced to inert task-list checkboxes.
- The tag parser is linear and runs in milliseconds on files with tens of thousands of tags or unclosed `<!--` openers; timing tests guard both.

## Things to know

- Saving goes through VS Code, so `formatOnSave` formatters run. Prettier may rewrap your Markdown; that is your formatter's behaviour, not Redline's.
- Before publishing a file elsewhere, have the agent remove the tags (or delete the comments) — some importers, Notion among them, may show HTML comments as text.
- Indented code blocks (four spaces, no fence) cannot take comments: there is no fence line for the tag to live on. The preview says so when you select text in one.
