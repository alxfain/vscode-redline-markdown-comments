/**
 * The webview HTML shell. A pure function — every URI and the nonce come from outside.
 *
 * Strict CSP: scripts only with the nonce, styles and fonts only from the
 * extension, images from the extension's resource roots and data: — and from
 * https: only when the user has opted in (`redline.allowRemoteImages`).
 */

import type { Appearance } from "./theme.js";

export interface WebviewHtmlOptions {
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
  appearance: Appearance;
  /** Allow `https:` images. Off: the preview makes no network requests at all. */
  remoteImages: boolean;
  /** Source line to scroll to before the document is first shown (the cursor line of the text editor). */
  initialLine?: number;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function buildWebviewHtml(options: WebviewHtmlOptions): string {
  const { cspSource, nonce, scriptUri, styleUri, appearance, remoteImages, initialLine } = options;
  // rl-loading: the document area stays hidden (background painted) until the first render has scrolled into place.
  const bodyClass = `rl rl-loading rl-${appearance.palette}${appearance.vscodeColors ? " rl-vscode" : ""}`;
  const lineAttr = initialLine !== undefined ? ` data-line="${Math.max(1, Math.floor(initialLine))}"` : "";
  const csp = [
    "default-src 'none'",
    `img-src ${cspSource} data:${remoteImages ? " https:" : ""}`,
    `style-src ${cspSource}`,
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${escapeHtml(styleUri)}">
<title>Redline</title>
</head>
<body class="${bodyClass}"${lineAttr}>
<header class="rl-topbar">
  <span class="rl-file" id="fileName"></span>
  <span class="rl-spacer"></span>
  <span class="rl-count" id="commentCount"></span>
  <span class="rl-sep"></span>
  <button class="rl-iconbtn" id="exportBtn" type="button" aria-label="Export" title="Export">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10V2M8 2 5 5M8 2l3 3"/><path d="M2.5 10v2.5h11V10"/></svg>
  </button>
  <button class="rl-iconbtn" id="themeBtn" type="button" aria-label="Theme" title="Theme">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><path d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1" stroke-linecap="round"/></svg>
  </button>
</header>
<main class="rl-main">
  <article id="doc" class="markdown-body"></article>
  <aside class="rl-gutter" id="gutter"></aside>
</main>
<script nonce="${nonce}" src="${escapeHtml(scriptUri)}"></script>
</body>
</html>`;
}
