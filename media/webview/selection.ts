/**
 * A snapshot of the selection at the moment the mouse is released.
 *
 * Returns everything the button and the popover need: the source line, the
 * anchor text, the drag direction and the caret rectangle where the selection ended.
 */

import { clampToBox, type Direction } from "./geometry.js";

export interface SelectionInfo {
  /** 1-based line of the block where the selection starts. */
  line: number;
  anchor: string;
  direction: Direction;
  /** The caret where the mouse was released, in viewport coordinates. */
  caret: DOMRect;
}

/** A selection Redline understands but cannot comment on — the layer explains why. */
export interface BlockedSelection {
  /** An indented code block has no fence line for the tag to live on (D79). */
  reason: "indented-code";
  direction: Direction;
  caret: DOMRect;
}

export type SelectionResult = { kind: "ok"; info: SelectionInfo } | { kind: "blocked"; blocked: BlockedSelection };

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

/** The document block an element belongs to. Highlights carry data-line too — skip them. */
function blockOf(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>("[data-line]:not(.rl-mark)");
}

/** The caret rectangle where the mouse was released. */
function caretOf(selection: Selection, range: Range, direction: Direction): DOMRect {
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
  return caret;
}

/**
 * Returns `null` when there is nothing to show: no selection, an empty one,
 * one outside the document, or one that starts and ends in different blocks —
 * a comment belongs to exactly one block (D79).
 */
export function captureSelection(doc: HTMLElement): SelectionResult | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const anchor = selection.toString().trim();
  if (!anchor) return null;

  const range = selection.getRangeAt(0);
  if (!doc.contains(range.commonAncestorContainer)) return null;

  const startElement = elementOf(range.startContainer);
  const endElement = elementOf(range.endContainer);
  if (!startElement || !endElement) return null;

  const direction: Direction = isForward(selection) ? "forward" : "backward";

  // A fenced block has an opening fence line for the tag; an indented one has
  // nowhere at all — say so instead of staying silent (D79).
  const pre = startElement.closest<HTMLElement>("pre");
  if (pre && !pre.hasAttribute("data-fence")) {
    return { kind: "blocked", blocked: { reason: "indented-code", direction, caret: caretOf(selection, range, direction) } };
  }

  const block = blockOf(startElement);
  if (!block || blockOf(endElement) !== block) return null;

  const line = Number(block.dataset["line"]);
  if (!Number.isInteger(line) || line < 1) return null;

  let caret = caretOf(selection, range, direction);
  // A wide code block scrolls sideways; keep the button on the block.
  if (pre) {
    const c = clampToBox(caret, pre.getBoundingClientRect());
    caret = new DOMRect(c.left, c.top, c.width, c.height);
  }

  return { kind: "ok", info: { line, anchor, direction, caret } };
}
