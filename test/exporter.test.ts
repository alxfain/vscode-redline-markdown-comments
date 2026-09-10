import { describe, expect, test } from "vitest";
import { renderMarkdown } from "../media/webview/render.js";
import { buildExportHtml, type ExportInput } from "../src/exporter.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG signature — enough for base64
const DOCS = "file:///Users/alex/docs/";

/** The webview renders and sanitises; the exporter receives finished body HTML. */
const body = (md: string) => renderMarkdown(md, { baseUri: DOCS });

function input(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    title: "bike-parts.md",
    theme: "dark-dimmed",
    css: ".markdown-body { color: red }",
    bodyHtml: body("# Hub\n\nGrease for bearings\n"),
    allowedRoots: [DOCS],
    readFile: async () => PNG,
    remoteImages: true,
    ...overrides,
  };
}

describe("buildExportHtml", () => {
  test("is a complete standalone document with the title and inline CSS", async () => {
    const html = await buildExportHtml(input());

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>bike-parts.md</title>");
    expect(html).toContain("<style>");
    expect(html).toContain(".markdown-body { color: red }");
    expect(html).not.toContain("<link ");
    expect(html).not.toContain("<script");
  });

  test("places the body it was given inside the document", async () => {
    const html = await buildExportHtml(input());

    expect(html).toContain("<h1");
    expect(html).toContain("Grease for bearings");
    expect(html).not.toContain("rl-mark");
  });

  test("carries the theme as the body class", async () => {
    expect(await buildExportHtml(input({ theme: "dark-dimmed" }))).toContain('<body class="rl rl-dark-dimmed">');
    expect(await buildExportHtml(input({ theme: "light" }))).toContain('<body class="rl rl-light">');
  });

  test("inlines a relative image as a data URI", async () => {
    const html = await buildExportHtml(input({ bodyHtml: body("![diagram](img/scheme.png)") }));

    expect(html).toContain('src="data:image/png;base64,iVBORw=="');
    expect(html).not.toContain("file://");
  });

  test("asks for the image by its file URL under the document folder", async () => {
    const asked: string[] = [];
    await buildExportHtml(input({ bodyHtml: body("![a](img/a.jpg)"), readFile: async (u) => (asked.push(u), PNG) }));

    expect(asked).toEqual(["file:///Users/alex/docs/img/a.jpg"]);
  });

  test("reads from a sibling folder only when it is an allowed root", async () => {
    const asked: string[] = [];
    const read = async (u: string) => (asked.push(u), PNG);

    await buildExportHtml(input({ bodyHtml: body("![a](../shared/a.jpg)"), readFile: read }));
    expect(asked).toEqual([]);

    await buildExportHtml(input({ bodyHtml: body("![a](../shared/a.jpg)"), readFile: read, allowedRoots: ["file:///Users/alex/"] }));
    expect(asked).toEqual(["file:///Users/alex/shared/a.jpg"]);
  });

  test("never reads a file outside the allowed roots, however the path is written", async () => {
    const asked: string[] = [];
    const read = async (u: string) => (asked.push(u), PNG);
    const attempts = [
      "![x](/etc/hosts)",
      "![x](file:///Users/alex/.ssh/id_rsa.png)",
      "![x](file:///Users/alex/docs/../.ssh/id_rsa.png)",
      "![x](file:///Users/alex/docs/%2e%2e/.ssh/id_rsa.png)",
      "![x](../../etc/passwd.png)",
    ];

    for (const md of attempts) await buildExportHtml(input({ bodyHtml: body(md), readFile: read }));

    expect(asked).toEqual([]);
  });

  test("with no allowed roots it reads nothing at all — fail closed", async () => {
    const asked: string[] = [];
    await buildExportHtml(input({ bodyHtml: body("![a](img/a.png)"), allowedRoots: [], readFile: async (u) => (asked.push(u), PNG) }));

    expect(asked).toEqual([]);
  });

  test("only inlines files with an image extension", async () => {
    const asked: string[] = [];
    await buildExportHtml(input({ bodyHtml: body("![x](notes.txt) ![y](secret) ![z](a.png)"), readFile: async (u) => (asked.push(u), PNG) }));

    expect(asked).toEqual(["file:///Users/alex/docs/a.png"]);
  });

  test("with remote images allowed, leaves remote images and data URIs untouched", async () => {
    const html = await buildExportHtml(input({ bodyHtml: body("![a](https://x.io/a.png) ![b](data:image/gif;base64,R0lG)") }));

    expect(html).toContain('src="https://x.io/a.png"');
    expect(html).toContain('src="data:image/gif;base64,R0lG"');
  });

  test("with remote images off, a remote image becomes an inert note — a tracking pixel must not fire for every reader", async () => {
    const html = await buildExportHtml(
      input({ remoteImages: false, bodyHtml: body("![tracker](https://x.io/a.png) ![b](data:image/gif;base64,R0lG) ![c](local.png)") }),
    );
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] ?? "";

    expect(html).not.toContain("https://x.io/a.png");
    expect(html).toContain("Remote image not loaded: tracker");
    expect(html).toContain('src="data:image/gif;base64,R0lG"');
    expect(html).toContain('src="data:image/png;base64,');
    expect(csp).toMatch(/img-src data:(;|$)/);
    expect(csp).not.toContain("http");
  });

  test("keeps the original src when the image cannot be read (a refused path looks the same)", async () => {
    const html = await buildExportHtml(
      input({ bodyHtml: body("![a](missing.png)"), readFile: async () => { throw new Error("refused"); } }),
    );

    expect(html).toContain('src="file:///Users/alex/docs/missing.png"');
  });

  test("ships a Content-Security-Policy that forbids scripts, since the file opens in a plain browser", async () => {
    const html = await buildExportHtml(input());
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] ?? "";

    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/script-src\s+(?!'none')/);
    expect(csp).toContain("img-src data: https:");
  });

  test("for print: light palette and page rules, regardless of the preview theme", async () => {
    const html = await buildExportHtml(input({ theme: "dark", forPrint: true }));

    expect(html).toContain('<body class="rl rl-light">');
    expect(html).toContain("@page");
    expect(html).toContain("break-inside: avoid");
  });
});
