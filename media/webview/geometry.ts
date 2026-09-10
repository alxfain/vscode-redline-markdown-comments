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
