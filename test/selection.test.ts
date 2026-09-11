// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { captureSelection } from "../media/webview/selection.js";

// jsdom has no layout: Range has neither getBoundingClientRect nor
// getClientRects. Give it a fixed caret so the code under test runs.
const CARET = () => new DOMRect(400, 20, 2, 18);

let doc: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  doc = document.createElement("article");
  doc.innerHTML = [
    '<p data-line="1">Trades below.</p>',
    '<pre data-line="3" data-fence=""><code>| buy  | 3.000 |\n| sell | 0.240 |</code></pre>',
    "<pre><code>indented code</code></pre>",
    '<p data-line="8">After the table.</p>',
  ].join("");
  document.body.appendChild(doc);
  Object.assign(Range.prototype, { getBoundingClientRect: CARET, getClientRects: () => [] });
});

function select(startNode: Node, start: number, endNode: Node, end: number): void {
  const range = document.createRange();
  range.setStart(startNode, start);
  range.setEnd(endNode, end);
  const selection = window.getSelection() as Selection;
  selection.removeAllRanges();
  selection.addRange(range);
}

const textOf = (selector: string): Text => doc.querySelector(selector)?.firstChild as Text;

describe("captureSelection inside a fenced code block (D79)", () => {
  test("is accepted with the block's line and the selected code as anchor", () => {
    const code = textOf("pre[data-fence] code");
    select(code, 17, code, 31); // "| sell | 0.240"

    const result = captureSelection(doc);

    expect(result?.kind).toBe("ok");
    if (result?.kind !== "ok") return;
    expect(result.info.line).toBe(3);
    expect(result.info.anchor).toBe("| sell | 0.240");
  });

  test("keeps a selection that spans two code lines as one multi-line anchor", () => {
    const code = textOf("pre[data-fence] code");
    select(code, 0, code, 31);

    const result = captureSelection(doc);

    expect(result?.kind).toBe("ok");
    if (result?.kind !== "ok") return;
    expect(result.info.anchor).toContain("\n");
  });

  test("clamps the caret into the block's box when the block scrolled it out of view", () => {
    const pre = doc.querySelector("pre[data-fence]") as HTMLElement;
    pre.getBoundingClientRect = () => new DOMRect(0, 0, 300, 60);
    const code = textOf("pre[data-fence] code");
    select(code, 17, code, 31);

    const result = captureSelection(doc);

    expect(result?.kind).toBe("ok");
    if (result?.kind !== "ok") return;
    expect(result.info.caret.left).toBe(300); // CARET sits at x=400, the box ends at 300
  });
});

describe("captureSelection in an indented code block (D79)", () => {
  test("is blocked with a reason instead of silently ignored", () => {
    const code = textOf("pre:not([data-fence]) code");
    select(code, 0, code, 8);

    const result = captureSelection(doc);

    expect(result?.kind).toBe("blocked");
    if (result?.kind !== "blocked") return;
    expect(result.blocked.reason).toBe("indented-code");
    expect(result.blocked.direction).toBe("forward");
  });
});

describe("captureSelection across a block boundary (D79)", () => {
  test("starting in the code block and ending in the paragraph after it gives nothing", () => {
    select(textOf("pre[data-fence] code"), 18, textOf('p[data-line="8"]'), 5);

    expect(captureSelection(doc)).toBeNull();
  });

  test("starting in a paragraph and ending inside the code block gives nothing", () => {
    select(textOf('p[data-line="1"]'), 0, textOf("pre[data-fence] code"), 5);

    expect(captureSelection(doc)).toBeNull();
  });
});

describe("captureSelection in plain text (unchanged)", () => {
  test("a paragraph selection is accepted with its line", () => {
    const p = textOf('p[data-line="1"]');
    select(p, 0, p, 6);

    const result = captureSelection(doc);

    expect(result?.kind).toBe("ok");
    if (result?.kind !== "ok") return;
    expect(result.info.line).toBe(1);
    expect(result.info.anchor).toBe("Trades");
  });

  test("a collapsed selection gives nothing", () => {
    const p = textOf('p[data-line="1"]');
    select(p, 2, p, 2);

    expect(captureSelection(doc)).toBeNull();
  });
});
