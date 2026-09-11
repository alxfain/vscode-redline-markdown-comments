import { describe, expect, test } from "vitest";
import { renderMarkdown } from "../media/webview/render.js";

const BASE = "https://file+.vscode-resource.vscode-cdn.net/Users/alex/docs/";

const render = (md: string) => renderMarkdown(md, { baseUri: BASE });

describe("renderMarkdown: source mapping", () => {
  test("stamps every block with the 1-based line it starts on", () => {
    const html = render(["# Heading", "", "A paragraph on line three.", "", "- item"].join("\n"));

    expect(html).toContain('<h1 data-line="1"');
    expect(html).toContain('<p data-line="3"');
    expect(html).toContain('<li data-line="5"');
  });

  test("stamps fenced code blocks too", () => {
    const html = render(["text", "", "```ts", "const x = 1;", "```"].join("\n"));

    expect(html).toContain('<pre data-line="3"');
  });

  test("marks a fenced block as a fence, so the selection guard can tell it apart (D79)", () => {
    const html = render(["text", "", "```", "| a | b |", "```"].join("\n"));

    expect(html).toContain('<pre data-line="3" data-fence=""');
  });

  test("an indented code block is neither stamped nor marked as a fence", () => {
    const html = render(["text", "", "    indented code"].join("\n"));

    expect(html).toContain("<pre><code>");
    expect(html).not.toContain("data-fence");
  });
});

describe("renderMarkdown: GFM", () => {
  test("renders a table", () => {
    const html = render(["| a | b |", "|---|---|", "| 1 | 2 |"].join("\n"));

    expect(html).toContain("<table");
    expect(html).toContain("<td>1</td>");
  });

  test("renders a task list with a checkbox", () => {
    const html = render("- [x] done\n- [ ] not yet");

    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  test("renders strikethrough", () => {
    expect(render("~~old~~")).toMatch(/<s>old<\/s>|<del>old<\/del>/);
  });

  test("turns a bare URL into a link", () => {
    expect(render("see https://example.com/x")).toContain('href="https://example.com/x"');
  });
});

describe("renderMarkdown: code", () => {
  test("highlights a fenced block with a known language", () => {
    const html = render("```ts\nconst x: number = 1;\n```");

    expect(html).toContain("language-ts");
    expect(html).toContain("hljs-keyword");
  });

  test("escapes a fenced block with an unknown language instead of guessing", () => {
    const html = render("```nosuchlang\n<b>not a tag</b>\n```");

    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
  });
});

describe("renderMarkdown: images", () => {
  test("resolves a relative image path against the document folder", () => {
    expect(render("![diagram](img/scheme.png)")).toContain(`src="${BASE}img/scheme.png"`);
  });

  test("resolves a parent-folder path", () => {
    expect(render("![diagram](../shared/a.png)")).toContain(
      'src="https://file+.vscode-resource.vscode-cdn.net/Users/alex/shared/a.png"',
    );
  });

  test("leaves absolute http(s) and data URLs alone", () => {
    expect(render("![a](https://x.io/a.png)")).toContain('src="https://x.io/a.png"');
    expect(render("![a](data:image/png;base64,AAAA)")).toContain('src="data:image/png;base64,AAAA"');
  });
});

describe("renderMarkdown: raw HTML", () => {
  test("passes raw HTML through untouched — sanitising is the webview's job, right before innerHTML", () => {
    const html = render("text <!-- an author's note --> <details><summary>more</summary>hidden</details>");

    expect(html).toContain("<!-- an author's note -->");
    expect(html).toContain("<details>");
  });
});

describe("renderMarkdown: raw HTML cannot forge the source mapping", () => {
  test("data-fence written by the author is dropped too, so a raw <pre> cannot pose as a fenced block (D79)", () => {
    const html = render('<pre data-fence="" data-line="3"><code>fake</code></pre>');

    expect(html).not.toContain("data-fence");
    expect(html).not.toContain("data-line");
  });

  test("data-line and data-id written by the author are dropped, the renderer's own stamps stay", () => {
    const html = render(['<div data-line="9999" data-id="c1">late</div>', "", "a <span data-line=5 DATA-ID='c2'>b</span> c"].join("\n"));

    expect(html).not.toContain("9999");
    expect(html).not.toContain("data-id");
    expect(html).not.toMatch(/data-line=5/i);
    expect(html).toContain('<p data-line="3"');
    expect(html).toContain("<div>late</div>");
  });
});

describe("renderMarkdown: a tag on the fence line (D79)", () => {
  test("a fence-line tag with an escaped backtick does not break the block", () => {
    const tag = '<!-- MC:{"id":"c1","anchor":"x","comment":"check \\u0060gas\\u0060","line":1,"date":"2026-09-11T10:00:00Z"} -->';
    const html = render(["``` " + tag, "| sell | 0.240 |", "```"].join("\n"));

    expect(html).toMatch(/^<pre/);
    expect(html).not.toContain("<p ");
    expect(html).not.toContain("MC:");
  });

  test("a literal backtick in the info string would break it — the reason for the escape", () => {
    const html = render(["``` <!-- MC:{\"comment\":\"check `gas`\"} -->", "| sell | 0.240 |", "```"].join("\n"));

    expect(html).toMatch(/^<p /);
    expect(html).toContain("MC:");
  });
});
