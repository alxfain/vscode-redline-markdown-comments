// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { sanitizeHtml } from "../media/webview/sanitize.js";

describe("sanitizeHtml: what must never survive", () => {
  test("scripts, in any spelling", () => {
    for (const payload of [
      "<script>alert(1)</script>",
      "<SCRIPT SRC=https://evil.example/x.js></SCRIPT>",
      "<script/xss>alert(1)</script>",
      "<svg><script>alert(1)</script></svg>",
    ]) {
      expect(sanitizeHtml(payload)).not.toMatch(/<script/i);
      expect(sanitizeHtml(payload)).not.toContain("alert(1)");
    }
  });

  test("event handlers, including ones glued to a quoted attribute", () => {
    for (const payload of [
      '<img src="x" onerror="alert(1)">',
      '<img src="x"onerror="alert(1)">',
      "<div onmouseover=alert(1)>hover</div>",
      '<body onload="alert(1)">',
    ]) {
      expect(sanitizeHtml(payload)).not.toMatch(/on[a-z]+\s*=/i);
    }
  });

  test("javascript: and other active URL schemes in every URL attribute", () => {
    for (const payload of [
      '<a href="javascript:alert(1)">a</a>',
      '<a href="JaVaScRiPt:alert(1)">a</a>',
      '<a href="java&#10;script:alert(1)">a</a>',
      '<a href="vbscript:msgbox(1)">a</a>',
      '<img src="javascript:alert(1)">',
      '<button formaction="javascript:alert(1)">c</button>',
    ]) {
      expect(sanitizeHtml(payload)).not.toMatch(/javascript:|vbscript:/i);
    }
  });

  test("active and embedding elements", () => {
    const html = sanitizeHtml(
      [
        '<iframe src="https://evil.example"></iframe>',
        '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
        '<object data="x.swf"></object>',
        '<embed src="x.swf">',
        '<base href="https://evil.example/">',
        '<meta http-equiv="refresh" content="0;url=https://evil.example">',
        '<link rel="stylesheet" href="https://evil.example/x.css">',
        '<form action="https://evil.example"><button>go</button></form>',
        "<style>body { display: none }</style>",
        "<svg><a xlink:href=\"javascript:alert(1)\"><text>svg</text></a></svg>",
        "<math><mi>x</mi></math>",
        "<template><img src=x onerror=alert(1)></template>",
      ].join("\n"),
    );

    expect(html).not.toMatch(/<(iframe|object|embed|base|meta|link|form|style|svg|math|template)\b/i);
    expect(html).not.toMatch(/srcdoc|alert\(1\)/i);
  });
});

describe("sanitizeHtml: a document cannot impersonate the comment layer", () => {
  test("classes of the comment UI are stripped from document content, other classes stay", () => {
    const html = sanitizeHtml('<span class="rl-mark note markdown-body">x</span><button class="rl-chip">1</button>');

    expect(html).toContain('<span class="note">x</span>');
    expect(html).not.toContain("rl-");
    expect(html).not.toContain("markdown-body");
  });

  test("only disabled checkboxes survive as inputs — no text fields, no image inputs", () => {
    const html = sanitizeHtml(
      '<input type="text" placeholder="type here"><input type="image" src="https://x/p.png"><input type="checkbox" checked><input>',
    );

    expect(html).not.toContain('type="text"');
    expect(html).not.toContain('type="image"');
    expect(html).not.toContain("placeholder");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
    expect(html).toMatch(/<input[^>]*disabled[^>]*>/);
    expect((html.match(/<input/g) ?? []).length).toBe(1);
  });
});

describe("sanitizeHtml: what the preview needs must survive", () => {
  test("the rendered document structure with its line stamps", () => {
    const html = sanitizeHtml('<h2 data-line="4">Title</h2><p data-line="6">Text with <strong>bold</strong> and <code>code</code>.</p>');

    expect(html).toContain('<h2 data-line="4">');
    expect(html).toContain('<p data-line="6">');
    expect(html).toContain("<strong>bold</strong>");
  });

  test("task-list checkboxes and highlighted code", () => {
    const html = sanitizeHtml(
      '<li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox" checked disabled> done</li>' +
        '<pre><code class="hljs language-ts"><span class="hljs-keyword">const</span> x</code></pre>',
    );

    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain('class="hljs-keyword"');
  });

  test("tables, links, images with https and data URIs, and details/summary", () => {
    const html = sanitizeHtml(
      '<table><tr><td>1</td></tr></table><a href="https://example.com/x">x</a>' +
        '<img src="https://file+.vscode-resource.vscode-cdn.net/Users/a/img.png" alt="a"><img src="data:image/png;base64,AAAA">' +
        "<details><summary>More</summary>hidden</details>",
    );

    expect(html).toContain("<table>");
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('src="https://file+.vscode-resource.vscode-cdn.net/Users/a/img.png"');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain("<details>");
  });

  test("file: image sources only when explicitly allowed (export path)", () => {
    const payload = '<img src="file:///Users/a/docs/img.png">';

    expect(sanitizeHtml(payload)).not.toContain("file://");
    expect(sanitizeHtml(payload, { allowFileImages: true })).toContain('src="file:///Users/a/docs/img.png"');
  });

  test("even on the export path, file: is allowed on image sources only — never on links", () => {
    const payload = '<a href="file:///etc/passwd">pw</a><img src="file:///Users/a/docs/img.png"><img src="javascript:alert(1)">';
    const html = sanitizeHtml(payload, { allowFileImages: true });

    expect(html).not.toContain("file:///etc/passwd");
    expect(html).toContain('src="file:///Users/a/docs/img.png"');
    expect(html).not.toContain("javascript:");
  });
});
