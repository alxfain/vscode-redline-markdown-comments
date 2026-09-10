/**
 * A snapshot of the selection at the moment the mouse is released.
 *
 * Returns everything the button and the popover need: the source line, the
 * anchor text, the drag direction and the caret rectangle where the selection ended.
 */

import type { Direction } from "./geometry.js";

export interface SelectionInfo {
  /** 1-based line of the block where the selection starts. */
  line: number;
  anchor: string;
  direction: Direction;
  /** The caret where the mouse was released, in viewport coordinates. */
  caret: DOMRect;
}

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

/** Does the release point (focus) come after the start point (anchor) in document order? */
function isForward(selection: Selection): boolean {
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus) return true;
  if (anchor === focus) return selection.focusOffset >= selection.anchorOffset;
  return Boolean(anchor.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING);
}

export function captureSelection(doc: HTMLElement): SelectionInfo | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const anchor = selection.toString().trim();
  if (!anchor) return null;

  const range = selection.getRangeAt(0);
  if (!doc.contains(range.commonAncestorContainer)) return null;

  // Comments inside code blocks are not supported: a tag has nowhere to live there.
  const startElement = elementOf(range.startContainer);
  if (!startElement || startElement.closest("pre")) return null;

  // Highlights carry data-line too — we need a real document block.
  const block = startElement.closest<HTMLElement>("[data-line]:not(.rl-mark)");
  if (!block) return null;
  const line = Number(block.dataset["line"]);
  if (!Number.isInteger(line) || line < 1) return null;

  const direction: Direction = isForward(selection) ? "forward" : "backward";

  let caret = new DOMRect();
  if (selection.focusNode) {
    const caretRange = document.createRange();
    caretRange.setStart(selection.focusNode, selection.focusOffset);
    caretRange.collapse(true);
    caret = caretRange.getBoundingClientRect();
  }
  if (caret.width === 0 && caret.height === 0) {
    const rects = range.getClientRects();
    const edge = direction === "forward" ? rects[rects.length - 1] : rects[0];
    if (edge) caret = edge;
  }

  return { line, anchor, direction, caret };
}
