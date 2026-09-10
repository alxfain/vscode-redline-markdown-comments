/**
 * Message protocol between the extension host and the webview.
 * One file for both sides — imported type-only, never bundled.
 */

import type { Comment } from "./commentStore.js";
import type { Theme } from "./theme.js";

/** Host → webview: the full document state. */
export interface UpdateMessage {
  type: "update";
  /** Markdown with the comment tags stripped. */
  markdown: string;
  comments: Comment[];
  /** Webview URI of the document folder, with a trailing slash. */
  baseUri: string;
  theme: Theme;
  /** Paint the preview with the active VS Code theme's colours. */
  vscodeColors: boolean;
  /** Load `https:` images. Off by default: opening a document must not make network requests. */
  remoteImages: boolean;
  fileName: string;
}

/** Host → webview: render and sanitise this markdown for export, reply with `exportHtml`. */
export interface RenderForExportMessage {
  type: "renderForExport";
  requestId: string;
  /** Markdown with the comment tags stripped. */
  markdown: string;
  /** `file://…/` of the document folder — images resolve to file URLs the exporter can vet. */
  baseUri: string;
}

/** Host → webview: jump to the next or previous comment. */
export interface NavigateMessage {
  type: "navigate";
  direction: "next" | "prev";
}

/** Host → webview: scroll so that the block containing this source line is in view (tab switch keeps the place). */
export interface RevealMessage {
  type: "reveal";
  line: number;
}

export type ExtensionToWebview = UpdateMessage | NavigateMessage | RenderForExportMessage | RevealMessage;

/** Webview → host. */
export type WebviewToExtension =
  | { type: "ready" }
  /** Theme button in the header: show the theme list. */
  | { type: "pickTheme" }
  /** Export button in the header: choose HTML or PDF. */
  | { type: "export" }
  /** Reply to `renderForExport`: sanitised body HTML. */
  | { type: "exportHtml"; requestId: string; html: string }
  /** The source line of the first block visible under the header — reported on scroll, throttled. */
  | { type: "viewport"; line: number }
  | { type: "addComment"; line: number; anchor: string; comment: string }
  | { type: "updateComment"; id: string; comment: string }
  | { type: "deleteComment"; id: string };
