/**
 * Anchoring a comment to a block's text.
 *
 * `findAnchor` is pure: it looks for the anchor inside the block's text,
 * tolerant of whitespace (a line break in the source, a space in the
 * selection). Not found — the comment is orphaned; that is a signal, not an error.
 *
 * `wrapTextRange` is DOM: it wraps a character range of the block in
 * elements, one per text node touched. That is how a highlight survives
 * bold, italics, links and overlaps with other highlights.
 */

export interface TextSpan {
  start: number;
  end: number;
}

interface Normalized {
  text: string;
  /** map[i] — offset of the i-th normalised character in the raw text. */
  map: number[];
}

/** Collapses whitespace runs into single spaces while remembering raw positions. */
function normalize(raw: string): Normalized {
  let text = "";
  const map: number[] = [];
  let inSpace = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i] as string;
    if (/\s/.test(char)) {
      if (!inSpace) {
        text += " ";
        map.push(i);
        inSpace = true;
      }
      continue;
    }
    text += char;
    map.push(i);
    inSpace = false;
  }

  return { text, map };
}

export function findAnchor(blockText: string, anchor: string): TextSpan | null {
  const firstLine = anchor.split("\n")[0] ?? "";
  const candidates = anchor === firstLine ? [anchor] : [anchor, firstLine];
  const haystack = normalize(blockText);

  for (const candidate of candidates) {
    const needle = normalize(candidate).text.trim();
    if (!needle) continue;

    const index = haystack.text.indexOf(needle);
    if (index < 0) continue;

    const start = haystack.map[index] as number;
    const end = (haystack.map[index + needle.length - 1] as number) + 1;
    return { start, end };
  }

  return null;
}

export function wrapTextRange(block: Element, start: number, end: number, make: () => HTMLElement): void {
  if (end <= start) return;

  // Collect the nodes with their offsets first, then split: splitting does not move recorded positions.
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; offset: number }> = [];
  let offset = 0;
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    const node = current as Text;
    nodes.push({ node, offset });
    offset += node.length;
  }

  for (const { node, offset: nodeStart } of nodes) {
    const nodeEnd = nodeStart + node.length;
    if (nodeEnd <= start || nodeStart >= end) continue;

    let target = node;
    const localStart = Math.max(start - nodeStart, 0);
    const localEnd = Math.min(end - nodeStart, node.length);

    if (localStart > 0) target = target.splitText(localStart);
    if (localEnd - localStart < target.length) target.splitText(localEnd - localStart);

    const wrapper = make();
    target.parentNode?.insertBefore(wrapper, target);
    wrapper.appendChild(target);
  }
}
