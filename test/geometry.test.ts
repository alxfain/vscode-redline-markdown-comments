import { describe, expect, test } from "vitest";
import { clampToBox, placeButton } from "../media/webview/geometry.js";

const caret = { left: 400, top: 200, right: 402, bottom: 220, width: 2, height: 20 };
const button = { width: 120, height: 28 };
const viewport = { width: 1000, height: 800 };

describe("placeButton (D27)", () => {
  test("forward selection: 8px to the right of the caret, centred on the line", () => {
    expect(placeButton(caret, "forward", button, viewport)).toEqual({ left: 410, top: 196 });
  });

  test("backward selection: 8px to the left of the caret", () => {
    expect(placeButton(caret, "backward", button, viewport)).toEqual({ left: 272, top: 196 });
  });

  test("mirrors to the left when it would overflow the right edge", () => {
    const nearRight = { ...caret, left: 950, right: 952 };
    expect(placeButton(nearRight, "forward", button, viewport).left).toBe(950 - 8 - 120);
  });

  test("mirrors to the right when it would overflow the left edge", () => {
    const nearLeft = { ...caret, left: 30, right: 32 };
    expect(placeButton(nearLeft, "backward", button, viewport).left).toBe(32 + 8);
  });

  test("keeps the button inside the viewport vertically", () => {
    const atBottom = { ...caret, top: 790, bottom: 810 };
    const { top } = placeButton(atBottom, "forward", button, viewport);
    expect(top + button.height).toBeLessThanOrEqual(viewport.height);
  });
});

describe("clampToBox (D79): a caret past the edge of a scrolling code block", () => {
  const box = { left: 100, top: 50, right: 500, bottom: 250, width: 400, height: 200 };

  test("a caret scrolled out to the right is pulled back to the block's right edge", () => {
    const out = { left: 640, top: 120, right: 642, bottom: 140, width: 2, height: 20 };
    const clamped = clampToBox(out, box);

    expect(clamped.left).toBe(500);
    expect(clamped.right).toBe(500);
    expect(clamped.top).toBe(120);
    expect(clamped.width).toBe(0);
  });

  test("a caret scrolled out to the left is pulled to the block's left edge", () => {
    const out = { left: 20, top: 120, right: 22, bottom: 140, width: 2, height: 20 };

    expect(clampToBox(out, box).left).toBe(100);
  });

  test("a caret inside the box is returned unchanged", () => {
    const inside = { left: 300, top: 120, right: 302, bottom: 140, width: 2, height: 20 };

    expect(clampToBox(inside, box)).toEqual(inside);
  });
});
