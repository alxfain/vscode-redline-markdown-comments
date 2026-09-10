// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { findAnchor, wrapTextRange } from "../media/webview/anchors.js";

describe("findAnchor: locating the anchor inside a block's text", () => {
  test("returns the offsets of an exact match", () => {
    expect(findAnchor("Grease for bearings · $10.99", "bearings")).toEqual({ start: 11, end: 19 });
  });

  test("takes the first occurrence when the anchor repeats", () => {
    expect(findAnchor("ab ab ab", "ab")).toEqual({ start: 0, end: 2 });
  });

  test("matches across a soft line break: the source has a newline where the selection had a space", () => {
    expect(findAnchor("two\nwords here", "two words")).toEqual({ start: 0, end: 9 });
  });

  test("collapses runs of whitespace on both sides", () => {
    expect(findAnchor("a   b", "a b")).toEqual({ start: 0, end: 5 });
  });

  test("falls back to the anchor's first line when the whole anchor spans blocks", () => {
    expect(findAnchor("the first paragraph in full", "paragraph in full\nsecond paragraph")).toEqual({ start: 10, end: 27 });
  });

  test("returns null when nothing matches — the comment is orphaned", () => {
    expect(findAnchor("something else entirely", "bearings")).toBeNull();
  });

  test("returns null for an empty anchor", () => {
    expect(findAnchor("text", "")).toBeNull();
  });
});

function block(html: string): HTMLElement {
  const el = document.createElement("p");
  el.innerHTML = html;
  return el;
}

const mark = () => {
  const span = document.createElement("span");
  span.className = "rl-mark";
  return span;
};

describe("wrapTextRange: wrapping a text offset range in spans", () => {
  test("wraps inside a single text node, splitting it", () => {
    const p = block("Grease for bearings and pads");
    wrapTextRange(p, 11, 19, mark);

    expect(p.innerHTML).toBe('Grease for <span class="rl-mark">bearings</span> and pads');
  });

  test("never changes the visible text", () => {
    const p = block("a <strong>bold</strong> c <em>d</em>");
    const before = p.textContent;
    wrapTextRange(p, 2, 8, mark);

    expect(p.textContent).toBe(before);
  });

  test("wraps a range that crosses inline elements with one span per text node", () => {
    const p = block("a <strong>bold</strong> c");
    wrapTextRange(p, 2, 8, mark); // "bold c"

    expect(p.innerHTML).toBe('a <strong><span class="rl-mark">bold</span></strong><span class="rl-mark"> c</span>');
  });

  test("nests a second wrap inside the first when ranges overlap", () => {
    const p = block("abcdef");
    wrapTextRange(p, 0, 4, mark); // abcd
    wrapTextRange(p, 2, 6, mark); // cdef

    expect(p.querySelectorAll(".rl-mark .rl-mark")).toHaveLength(1);
    expect(p.textContent).toBe("abcdef");
  });

  test("does nothing for an empty or inverted range", () => {
    const p = block("abc");
    wrapTextRange(p, 2, 2, mark);
    wrapTextRange(p, 3, 1, mark);

    expect(p.innerHTML).toBe("abc");
  });
});
