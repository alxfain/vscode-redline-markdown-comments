/**
 * Export to a standalone HTML file.
 *
 * A pure function: no `vscode`, file access goes through the `readFile`
 * passed in. The body arrives already rendered and sanitised by the webview
 * (DOMPurify, the one sanitiser in the extension); this module only wraps it,
 * inlines images and adds a script-free CSP for the plain browser it opens in.
 *
 * Images are inlined only from the allowed roots and only if they are image
 * files. Anything else — `/etc/hosts`, `../.ssh/…`, an absolute `file://` —
 * is left as a link and never read: a malicious document must not be able to
 * smuggle local files into an HTML you then share.
 */

import type { Theme } from "./theme.js";

export interface ExportInput {
  /** Page title — usually the file name. */
  title: string;
  theme: Theme;
  /** The full preview CSS (media/webview.css) — inlined. */
  css: string;
  /** Rendered and sanitised body HTML, produced by the webview. */
  bodyHtml: string;
  /** `file://…/` folders images may be read from. Empty means: inline nothing. */
  allowedRoots: string[];
  /**
   * Reads a file by its normalised `file://` URL. The host performs realpath
   * containment before reading; a refusal is an error, and the image stays a link.
   */
  readFile(url: string): Promise<Uint8Array>;
  /** PDF: light palette and print rules regardless of the preview theme. */
  forPrint?: boolean;
  /**
   * `redline.allowRemoteImages`. Off: remote images are replaced by an inert
   * note, as in the preview, and the CSP allows no network images either —
   * a tracking pixel in a document must not fire for every reader of the export.
   */
  remoteImages: boolean;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
};

const EXPORT_CSS = `
.rl-export { max-width: 980px; margin: 0 auto; padding: 32px 24px 96px; }
`;

const PRINT_CSS = `
@page { margin: 18mm 16mm; }
@media print {
  body.rl { background: #fff; }
  .rl-export { max-width: none; padding: 0; }
  pre, table, blockquote, img, li { break-inside: avoid; }
  h1, h2, h3, h4 { break-after: avoid; }
  a { color: inherit; text-decoration: underline; }
  pre { white-space: pre-wrap; }
}
`;

/** No scripts from anywhere, network only for images and only when allowed. The file opens outside VS Code. */
function exportCsp(remoteImages: boolean): string {
  return `default-src 'none'; img-src data:${remoteImages ? " https:" : ""}; style-src 'unsafe-inline'`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** A folder URL with dot-segments resolved and a trailing slash, for prefix checks. */
function folder(url: string): string {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
  return parsed.href;
}

/**
 * `<img src="file://…">` → data URI, only for image files inside the allowed roots.
 * The URL check here is the cheap first gate; the host's realpath check is the real one.
 */
async function inlineImages(html: string, readFile: ExportInput["readFile"], roots: string[]): Promise<string> {
  const pattern = /<img\b([^>]*?)\ssrc="(file:\/\/[^"]+)"/g;
  const urls = new Set(Array.from(html.matchAll(pattern), (m) => m[2] as string));
  const inlined = new Map<string, string>();

  for (const url of urls) {
    let href: URL;
    try {
      href = new URL(url); // resolves `..`, `.` and `%2e%2e` — the check below sees the real path
    } catch {
      continue;
    }
    if (!roots.some((root) => href.href.startsWith(root))) continue;

    const ext = href.pathname.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME[ext];
    if (!mime) continue;

    try {
      const bytes = await readFile(href.href);
      inlined.set(url, `data:${mime};base64,${toBase64(bytes)}`);
    } catch {
      // refused or unreadable — keep the link; a broken image beats a leaked file
    }
  }

  return html.replace(pattern, (whole, attrs: string, url: string) => {
    const data = inlined.get(url);
    return data ? `<img${attrs} src="${data}"` : whole;
  });
}

/**
 * `<img src="http(s)://…">` → the same note the preview shows. The body is
 * DOMPurify output, so attributes are double-quoted and `alt` is entity-escaped.
 */
function blockRemoteImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/g, (whole, attrs: string) => {
    const src = /\ssrc="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (!/^https?:/i.test(src)) return whole;
    const alt = /\salt="([^"]*)"/.exec(attrs)?.[1] ?? "";
    return `<span class="rl-img-blocked">Remote image not loaded${alt ? `: ${alt}` : ""}</span>`;
  });
}

export async function buildExportHtml(input: ExportInput): Promise<string> {
  const theme: Theme = input.forPrint ? "light" : input.theme;
  const roots = input.allowedRoots.map(folder);
  const inlined = await inlineImages(input.bodyHtml, input.readFile, roots);
  const body = input.remoteImages ? inlined : blockRemoteImages(inlined);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${exportCsp(input.remoteImages)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>
${input.css}
${EXPORT_CSS}${input.forPrint ? PRINT_CSS : ""}
</style>
</head>
<body class="rl rl-${theme}">
<main class="rl-export"><article class="markdown-body">
${body}
</article></main>
</body>
</html>
`;
}
