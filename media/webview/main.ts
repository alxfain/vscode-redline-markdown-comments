/**
 * Webview: receives state from the host, renders the document and the comment layer.
 *
 * Incremental: the markdown is re-rendered only when the tag-free text
 * changed; a theme change is a class change on <body>; the scroll position
 * survives every update.
 */

import type { ExtensionToWebview, WebviewToExtension } from "../../src/types.js";
import { CommentLayer } from "./overlay.js";
import { renderMarkdown } from "./render.js";
import { sanitizeHtml } from "./sanitize.js";
import { captureSelection } from "./selection.js";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtension): void;
};

const vscode = acquireVsCodeApi();

const doc = document.getElementById("doc") as HTMLElement;
const gutter = document.getElementById("gutter") as HTMLElement;
const fileName = document.getElementById("fileName") as HTMLElement;
const commentCount = document.getElementById("commentCount") as HTMLElement;

const layer = new CommentLayer(doc, gutter, {
  add: (line, anchor, comment) => vscode.postMessage({ type: "addComment", line, anchor, comment }),
  update: (id, comment) => vscode.postMessage({ type: "updateComment", id, comment }),
  remove: (id) => vscode.postMessage({ type: "deleteComment", id }),
});

let lastRender: string | null = null;

/** Starting line handed over in the shell (`data-line`), consumed by the first render. */
const initialLine = Number(document.body.dataset["line"]);
let shown = false;

/** Show the document area once, after it has been scrolled into place. */
function show(): void {
  if (shown) return;
  shown = true;
  document.body.classList.remove("rl-loading");
}
// Whatever happens to the first update, the document must not stay hidden.
setTimeout(show, 3000);

function plural(count: number): string {
  return count === 1 ? "1 comment" : `${count} comments`;
}

/**
 * With remote images off, swap every `https:` image for an inert placeholder.
 * Done inside a <template>, which never loads anything, before the nodes touch
 * the live document — the CSP would block the request anyway; this is the UX.
 */
function blockRemoteImages(fragment: DocumentFragment, allowed: boolean): void {
  if (allowed) return;
  fragment.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!/^https?:/i.test(src)) return;
    const note = document.createElement("span");
    note.className = "rl-img-blocked";
    note.title = src;
    note.textContent = `Remote image not loaded${img.alt ? `: ${img.alt}` : ""} · enable redline.allowRemoteImages to show it`;
    img.replaceWith(note);
  });
}

/** Sanitise, then build the DOM in an inert template before inserting it. */
function renderInto(target: HTMLElement, markdown: string, baseUri: string, remoteImages: boolean): void {
  const template = document.createElement("template");
  template.innerHTML = sanitizeHtml(renderMarkdown(markdown, { baseUri }));
  blockRemoteImages(template.content, remoteImages);
  target.replaceChildren(template.content);
}

function applyUpdate(message: Extract<ExtensionToWebview, { type: "update" }>): void {
  const scrollY = window.scrollY;

  // Exactly one palette class: rl-light, rl-dark, rl-dark-dimmed, … Other classes are left alone.
  for (const cls of Array.from(document.body.classList)) {
    if (cls.startsWith("rl-") && cls !== "rl-vscode") document.body.classList.remove(cls);
  }
  document.body.classList.add(`rl-${message.theme}`);
  document.body.classList.toggle("rl-vscode", message.vscodeColors);

  const renderKey = `${message.remoteImages}\u0000${message.markdown}`;
  if (renderKey !== lastRender) {
    renderInto(doc, message.markdown, message.baseUri, message.remoteImages);
    lastRender = renderKey;
  }

  layer.apply(message.comments);

  fileName.textContent = message.fileName;
  commentCount.textContent = message.comments.length > 0 ? plural(message.comments.length) : "";

  if (shown) {
    window.scrollTo(0, scrollY);
  } else {
    if (Number.isInteger(initialLine) && initialLine > 0) revealLine(initialLine);
    show();
  }
  reportViewport();
}

// Theme button in the header — the host shows the theme list.
document.getElementById("themeBtn")?.addEventListener("click", () => vscode.postMessage({ type: "pickTheme" }));
document.getElementById("exportBtn")?.addEventListener("click", () => vscode.postMessage({ type: "export" }));

window.addEventListener("message", (event: MessageEvent<ExtensionToWebview>) => {
  const message = event.data;
  if (message.type === "update") applyUpdate(message);
  if (message.type === "navigate") layer.navigate(message.direction);
  if (message.type === "reveal") revealLine(message.line);
  if (message.type === "renderForExport") {
    // Same renderer, same sanitiser; `file:` images allowed so the host can vet and inline them.
    const html = sanitizeHtml(renderMarkdown(message.markdown, { baseUri: message.baseUri }), { allowFileImages: true });
    vscode.postMessage({ type: "exportHtml", requestId: message.requestId, html });
  }
});

/* ── Keeping the place across the tab switch ─────────────────────── */

const HEADER_HEIGHT = 38;

function blocks(): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>("[data-line]:not(.rl-mark)"));
}

/** Scroll so the block holding this source line sits just under the header. */
function revealLine(line: number): void {
  let target: HTMLElement | null = null;
  for (const block of blocks()) {
    if (Number(block.dataset["line"]) <= line) target = block;
    else break;
  }
  if (!target) return;
  window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT - 8, behavior: "auto" });
}

/** The source line of the first block whose bottom edge is below the header. */
function topVisibleLine(): number | undefined {
  for (const block of blocks()) {
    if (block.getBoundingClientRect().bottom > HEADER_HEIGHT + 1) {
      const line = Number(block.dataset["line"]);
      return Number.isInteger(line) && line > 0 ? line : undefined;
    }
  }
  return undefined;
}

let viewportTimer: number | undefined;
function reportViewport(): void {
  if (viewportTimer !== undefined) return;
  viewportTimer = window.setTimeout(() => {
    viewportTimer = undefined;
    const line = topVisibleLine();
    if (line !== undefined) vscode.postMessage({ type: "viewport", line });
  }, 250);
}

/* ── Selection → button ──────────────────────────────────────────── */

doc.addEventListener("mouseup", () => {
  // The selection settles after mouseup — read it on the next tick.
  setTimeout(() => {
    const result = captureSelection(doc);
    if (!result) layer.hideAddButton();
    else if (result.kind === "ok") layer.showAddButton(result.info);
    else layer.showHint(result.blocked);
  }, 0);
});

document.addEventListener("selectionchange", () => {
  if (window.getSelection()?.isCollapsed) layer.hideAddButton();
});

document.addEventListener("mousedown", (event) => layer.onMouseDown(event));
document.addEventListener("click", (event) => layer.onClick(event));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    layer.escape();
    return;
  }
  const target = event.target as HTMLElement | null;
  if ((event.key === "Enter" || event.key === " ") && target?.classList.contains("rl-mark")) {
    event.preventDefault();
    layer.toggleFor(target);
  }
});

window.addEventListener("scroll", () => {
  layer.hideAddButton();
  reportViewport();
}, { passive: true });
window.addEventListener("resize", () => layer.layoutChips());
// Images load after the render and shift blocks — the chips must be re-laid out.
doc.addEventListener("load", () => layer.layoutChips(), true);

vscode.postMessage({ type: "ready" });
