import { describe, expect, test } from "vitest";
import { buildWebviewHtml, type WebviewHtmlOptions } from "../src/webviewHtml.js";

const BASE: WebviewHtmlOptions = {
  cspSource: "vscode-resource:",
  nonce: "n0nce",
  scriptUri: "https://x/webview.js",
  styleUri: "https://x/webview.css",
  appearance: { palette: "dark-dimmed", vscodeColors: false },
  remoteImages: false,
};

function body(html: string): string {
  return html.match(/<body[^>]*>/)?.[0] ?? "";
}

describe("buildWebviewHtml: first frame carries the starting position", () => {
  test("the cursor line goes into the shell so the first render can scroll before it is shown", () => {
    expect(body(buildWebviewHtml({ ...BASE, initialLine: 12 }))).toContain('data-line="12"');
  });

  test("no line when the preview was not opened from a text cursor", () => {
    expect(body(buildWebviewHtml(BASE))).not.toContain("data-line");
  });

  test("the document area starts hidden behind the theme background until the first render", () => {
    expect(body(buildWebviewHtml(BASE))).toMatch(/class="[^"]*\brl-loading\b/);
  });
});
