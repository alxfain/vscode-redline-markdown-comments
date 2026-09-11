/**
 * Position of the "Add comment" button.
 *
 * The button sits next to the caret where the mouse was released, on the side
 * of the drag: forward selection — to the right, backward — to the left.
 * At the window edge it mirrors inwards.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Direction = "forward" | "backward";

export function placeButton(
  caret: Rect,
  direction: Direction,
  button: Size,
  viewport: Size,
  gap = 8,
): { left: number; top: number } {
  const rightOfCaret = caret.right + gap;
  const leftOfCaret = caret.left - gap - button.width;

  let left = direction === "forward" ? rightOfCaret : leftOfCaret;
  if (left + button.width > viewport.width) left = leftOfCaret;
  if (left < 0) left = rightOfCaret;

  const centred = caret.top + caret.height / 2 - button.height / 2;
  const top = Math.min(Math.max(centred, 4), viewport.height - button.height - 4);

  return { left, top };
}

/**
 * Pushes a caret inside a block's box.
 *
 * A wide code block scrolls horizontally, and the selection's focus can sit
 * past the visible edge; the button must still land on the block, not over
 * whatever is beside it (D79).
 */
export function clampToBox(caret: Rect, box: Rect): Rect {
  const left = Math.min(Math.max(caret.left, box.left), box.right);
  const right = Math.min(Math.max(caret.right, box.left), box.right);
  const top = Math.min(Math.max(caret.top, box.top), box.bottom);
  const bottom = Math.min(Math.max(caret.bottom, box.top), box.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
