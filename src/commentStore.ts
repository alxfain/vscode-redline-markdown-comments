/**
 * commentStore — pure functions over the raw text of a Markdown file.
 *
 * The one place where a bug means corrupting the user's file.
 * No VS Code dependencies: a string in, a string out.
 *
 * Storage format:
 *   line text <!-- MC:{"id","anchor","comment","line","date"} -->
 *
 * The tag sits at the end of the line it refers to. For a fragment inside a
 * fenced code block that line is the block's opening fence — the tail of the
 * fence line, after the info string, is the one place inside a block where a
 * tag is markup rather than code. The `line` field is a hint; the real
 * position always comes from where the tag actually is.
 */

export interface Comment {
  /** Sequential id within the file: c1, c2, … */
  id: string;
  /** The selected text. Never empty for comments created from the UI. */
  anchor: string;
  /** The comment body. */
  comment: string;
  /** 1-based line number, derived from the tag's position. */
  line: number;
  /** ISO-8601 creation time. */
  date: string;
}

/** Opening or closing fence of a fenced code block. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** A span of text where tags are content, not markup. */
interface CodeRange {
  from: number;
  to: number;
  kind: "fence" | "inline";
}

/**
 * Spans where tags are not treated as markup: fenced code blocks and
 * inline code. Their content belongs to the document.
 */
function codeRanges(text: string): CodeRange[] {
  const ranges: CodeRange[] = [];
  const plainLines: Array<[number, number]> = [];

  let offset = 0;
  let fence: { char: string; len: number; start: number } | null = null;

  for (const line of text.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    offset = lineEnd + 1;

    const marker = FENCE.exec(line)?.[1];

    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.len) {
        ranges.push({ from: fence.start, to: lineEnd, kind: "fence" });
        fence = null;
      }
      continue;
    }

    if (marker) {
      // The range starts at the end of the opening line: its tail (the info
      // string and anything after it) is markup, so a tag can live there (D79).
      fence = { char: marker[0] as string, len: marker.length, start: lineEnd };
      continue;
    }

    plainLines.push([lineStart, lineEnd]);
  }

  // An unclosed fence swallows the rest of the file — exactly what CommonMark does.
  if (fence) ranges.push({ from: fence.start, to: text.length, kind: "fence" });

  for (const [start, end] of plainLines) {
    const line = text.slice(start, end);
    const runs = /`+/g;
    let open: { index: number; len: number } | null = null;
    let run: RegExpExecArray | null;

    while ((run = runs.exec(line)) !== null) {
      const len = run[0].length;
      if (!open) {
        open = { index: run.index, len };
      } else if (len === open.len) {
        ranges.push({ from: start + open.index, to: start + run.index + len, kind: "inline" });
        open = null;
      }
    }
  }

  return ranges;
}

/** Line numbers for ascending offsets in one pass — many tags must not mean many scans. */
function lineCounter(text: string): (offset: number) => number {
  let line = 1;
  let scanned = 0;
  return (offset) => {
    for (; scanned < offset; scanned++) {
      if (text.charCodeAt(scanned) === 10) line++;
    }
    return line;
  };
}

/** A tag that was found, with its bounds in the source text. */
interface FoundTag {
  /** Offset of the opening `<!--`. */
  start: number;
  /** Offset right after the closing `-->`. */
  end: number;
  comment: Comment;
}

const OPEN = "<!--";
const CLOSE = "-->";

/**
 * Finds every valid comment tag together with its bounds.
 *
 * A single linear scan, not a regex: a crafted file full of unclosed openers
 * must not freeze the extension host (this runs on every keystroke). A tag
 * always sits on one line, so a closer is only looked for up to the end of
 * the line, and both the line end and the closer position are cached so
 * neither is searched for twice.
 *
 * Tags inside code blocks are ignored — from the end of the opening fence line
 * to the end of the closing one, and inside inline code. A tag with broken JSON is skipped —
 * and the file is left alone: the user's data matters more than our parser.
 * After a broken tag the scan resumes right after its opener, so a real tag
 * hiding behind garbage on the same line is still found.
 */
function findTags(text: string): FoundTag[] {
  // Openers are visited in ascending order, so one pointer over the sorted ranges is enough.
  const skip = codeRanges(text).sort((a, b) => a.from - b.from);
  let skipIndex = 0;
  const inCode = (offset: number): boolean => {
    while (skipIndex < skip.length && (skip[skipIndex] as CodeRange).to <= offset) skipIndex++;
    const range = skip[skipIndex];
    return range !== undefined && range.from <= offset;
  };

  const found: FoundTag[] = [];
  const lineAt = lineCounter(text);

  let cursor = 0;
  let lineEnd = -1;
  let closeAt = -1;

  for (;;) {
    const start = text.indexOf(OPEN, cursor);
    if (start === -1) break;

    if (start >= lineEnd) {
      const newline = text.indexOf("\n", start);
      lineEnd = newline === -1 ? text.length : newline;
    }
    if (closeAt < start + OPEN.length) closeAt = text.indexOf(CLOSE, start + OPEN.length);

    if (closeAt === -1 || closeAt > lineEnd) {
      cursor = lineEnd; // nothing closes on this line — skip it whole
      continue;
    }

    cursor = start + OPEN.length; // default: resume right after this opener
    if (inCode(start)) continue;

    const inner = text.slice(start + OPEN.length, closeAt).trim();
    if (!inner.startsWith("MC:")) continue;
    const json = inner.slice(3).trim();
    if (!json.startsWith("{") || !json.endsWith("}")) continue;

    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      continue;
    }
    if (typeof data !== "object" || data === null) continue;
    const raw = data as Record<string, unknown>;
    if (typeof raw["id"] !== "string") continue;

    const end = closeAt + CLOSE.length;
    found.push({
      start,
      end,
      comment: {
        id: raw["id"],
        anchor: typeof raw["anchor"] === "string" ? raw["anchor"] : "",
        comment: typeof raw["comment"] === "string" ? raw["comment"] : "",
        line: lineAt(start),
        date: typeof raw["date"] === "string" ? raw["date"] : "",
      },
    });
    cursor = end;
  }

  return found;
}

/** Parses every comment in the document, in file order. */
export function parseComments(text: string): Comment[] {
  return findTags(text).map((tag) => tag.comment);
}

/**
 * Returns the document without tags — what goes to the renderer and the exporter.
 *
 * The whitespace that separated a tag from the text is removed with it,
 * otherwise the line would keep a dangling tail after the comment is gone.
 */
export function stripComments(text: string): string {
  // One forward pass collecting the kept pieces: rebuilding the string per tag would be quadratic.
  const parts: string[] = [];
  let cursor = 0;

  for (const tag of findTags(text)) {
    let from = tag.start;
    while (from > cursor) {
      const prev = text[from - 1];
      if (prev !== " " && prev !== "\t") break;
      from--;
    }
    parts.push(text.slice(cursor, from));
    cursor = tag.end;
  }
  parts.push(text.slice(cursor));

  return parts.join("");
}

/** Everything needed to write a new comment. */
export interface NewComment {
  /** 1-based line number the comment refers to. */
  line: number;
  anchor: string;
  comment: string;
  /** ISO-8601. Passed in from outside so the function stays pure. */
  date: string;
}

/**
 * Serialises a comment into a tag.
 *
 * `-->` inside any string field would close the tag early and break the
 * file; so would `--!>`, which HTML parsers also accept as a comment end.
 * Both are written with the JSON escape `\u003e` for the `>`.
 *
 * A backtick is written as `\u0060`: on an opening fence line the tag is
 * part of the info string, and CommonMark forbids a backtick there — one
 * literal backtick turns the whole block into a paragraph. Escaping it in
 * every tag, not only on fence lines, keeps one rule and lets
 * `updateComment` stay ignorant of where a tag lives (D79).
 *
 * `JSON.parse` turns all three back.
 */
function serialize(comment: Comment): string {
  const json = JSON.stringify({
    id: comment.id,
    anchor: comment.anchor,
    comment: comment.comment,
    line: comment.line,
    date: comment.date,
  })
    .replaceAll("-->", "--\\u003e")
    .replaceAll("--!>", "--!\\u003e")
    .replaceAll("`", "\\u0060");

  return `<!-- MC:${json} -->`;
}

/** The next free id: one above the highest in use. */
function nextId(text: string): string {
  // A loop, not `Math.max(...ids)`: spreading a few hundred thousand ids overflows the call stack.
  let highest = 0;
  for (const comment of parseComments(text)) {
    const digits = /^c(\d+)$/.exec(comment.id)?.[1];
    if (digits !== undefined) highest = Math.max(highest, Number(digits));
  }
  return `c${highest + 1}`;
}

/**
 * Appends a comment to the end of the given line.
 *
 * The rest of the document does not change by a single byte. Several
 * comments on one line line up in the order they were added.
 */
export function insertComment(text: string, input: NewComment): { text: string; id: string } {
  const lines = text.split("\n");
  const index = input.line - 1;

  if (index < 0 || index >= lines.length) {
    throw new RangeError(`Line ${input.line} is outside a document of ${lines.length} lines`);
  }

  // Below the opening fence line the parser would never see the tag — the
  // comment would vanish silently. The opening line itself is allowed (D79).
  const lineStart = lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0);
  const fenced = codeRanges(text).some(
    (range) => range.kind === "fence" && lineStart >= range.from && lineStart <= range.to,
  );
  if (fenced) {
    throw new RangeError(`Line ${input.line} is inside a fenced code block`);
  }

  const id = nextId(text);
  const tag = serialize({ id, anchor: input.anchor, comment: input.comment, line: input.line, date: input.date });
  const current = lines[index] as string;

  lines[index] = current.length === 0 ? tag : `${current} ${tag}`;

  return { text: lines.join("\n"), id };
}

/** Replaces the comment body. Unknown `id` — the document is returned unchanged. */
export function updateComment(text: string, id: string, comment: string): string {
  const target = findTags(text).find((tag) => tag.comment.id === id);
  if (!target) return text;

  const tag = serialize({ ...target.comment, comment });
  return text.slice(0, target.start) + tag + text.slice(target.end);
}

/**
 * Removes a comment together with the whitespace that separated it from the text.
 * Unknown `id` — the document is returned unchanged.
 */
export function deleteComment(text: string, id: string): string {
  const target = findTags(text).find((tag) => tag.comment.id === id);
  if (!target) return text;

  let from = target.start;
  while (from > 0) {
    const prev = text[from - 1];
    if (prev !== " " && prev !== "\t") break;
    from--;
  }

  return text.slice(0, from) + text.slice(target.end);
}
