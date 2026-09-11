import { describe, expect, test } from "vitest";
import { deleteComment, insertComment, parseComments, stripComments, updateComment } from "../src/commentStore.js";

const DATE = "2026-09-11T10:00:00Z";
const TAG = `<!-- MC:{"id":"c1","anchor":"| sell | 0.240 |","comment":"why 0.43 gas","line":3,"date":"${DATE}"} -->`;

/** A trade table inside a bare fence, the shape the owner's journal uses. */
const DOC = ["Trades:", "", "```", "| buy  | 3.000 |", "| sell | 0.240 |", "```", "after", ""].join("\n");

/** DOC with one line replaced. */
function withLine(index: number, value: string): string {
  const lines = DOC.split("\n");
  lines[index] = value;
  return lines.join("\n");
}

describe("a tag on the opening fence line (D79)", () => {
  test("is a real comment whose line is the fence line", () => {
    const md = withLine(2, "``` " + TAG);

    expect(parseComments(md)).toEqual([
      { id: "c1", anchor: "| sell | 0.240 |", comment: "why 0.43 gas", line: 3, date: DATE },
    ]);
  });

  test("keeps the info string in front of it", () => {
    const md = withLine(2, "```text " + TAG);

    expect(parseComments(md)).toHaveLength(1);
    expect(stripComments(md)).toBe(withLine(2, "```text"));
  });

  test("is stripped for the renderer, leaving the bare fence", () => {
    expect(stripComments(withLine(2, "``` " + TAG))).toBe(DOC);
  });

  test("works on a tilde fence", () => {
    const md = withLine(2, "~~~ " + TAG).replace("\n```\nafter", "\n~~~\nafter");

    expect(parseComments(md).map((c) => c.line)).toEqual([3]);
  });

  test("works on a four-backtick fence", () => {
    const md = withLine(2, "```` " + TAG).replace("\n```\nafter", "\n````\nafter");

    expect(parseComments(md).map((c) => c.line)).toEqual([3]);
  });

  test("is found on the opener of a fence that never closes", () => {
    const md = ["``` " + TAG, "| buy | 3.000 |"].join("\n");

    expect(parseComments(md).map((c) => c.id)).toEqual(["c1"]);
  });

  test("can be updated in place, fence intact", () => {
    const md = withLine(2, "``` " + TAG);
    const next = updateComment(md, "c1", "changed");

    expect(parseComments(next)[0]?.comment).toBe("changed");
    expect(stripComments(next)).toBe(DOC);
  });

  test("can be deleted, leaving the document as it was", () => {
    expect(deleteComment(withLine(2, "``` " + TAG), "c1")).toBe(DOC);
  });
});

describe("a tag below the opening fence line is still content (D50)", () => {
  test("on a code line", () => {
    expect(parseComments(withLine(3, "| buy  | 3.000 | " + TAG))).toEqual([]);
  });

  test("on the closing fence line", () => {
    expect(parseComments(withLine(5, "``` " + TAG))).toEqual([]);
  });
});

describe("insertComment on a fenced block (D79)", () => {
  test("puts the tag at the end of the opening fence line", () => {
    const { text, id } = insertComment(DOC, { line: 3, anchor: "| sell | 0.240 |", comment: "why", date: DATE });

    expect(id).toBe("c1");
    expect(text.split("\n")[2]).toBe(
      `\`\`\` <!-- MC:{"id":"c1","anchor":"| sell | 0.240 |","comment":"why","line":3,"date":"${DATE}"} -->`,
    );
  });

  test("changes neither the code nor the number of lines", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "| sell | 0.240 |", comment: "why", date: DATE });
    const before = DOC.split("\n");
    const after = text.split("\n");

    expect(after).toHaveLength(before.length);
    expect(after.filter((_, i) => i !== 2)).toEqual(before.filter((_, i) => i !== 2));
  });

  test("lines a second comment on the same block up after the first", () => {
    const once = insertComment(DOC, { line: 3, anchor: "| buy  | 3.000 |", comment: "first", date: DATE });
    const twice = insertComment(once.text, { line: 3, anchor: "| sell | 0.240 |", comment: "second", date: DATE });

    expect(parseComments(twice.text).map((c) => [c.id, c.comment])).toEqual([
      ["c1", "first"],
      ["c2", "second"],
    ]);
    expect(stripComments(twice.text)).toBe(DOC);
  });

  test("still refuses a line inside the block", () => {
    expect(() => insertComment(DOC, { line: 4, anchor: "x", comment: "y", date: DATE })).toThrow(/code block/);
  });

  test("still refuses the closing fence line", () => {
    expect(() => insertComment(DOC, { line: 6, anchor: "x", comment: "y", date: DATE })).toThrow(/code block/);
  });
});

describe("backticks in a tag are written as \\u0060 (D79)", () => {
  test("on a fence line, so the info string stays valid CommonMark", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "| sell |", comment: "check `gas` here", date: DATE });
    const fenceLine = text.split("\n")[2] as string;

    // The only backticks on the line are the three of the fence itself.
    expect(fenceLine.slice(3)).not.toContain("`");
    expect(fenceLine).toContain("check \\u0060gas\\u0060 here");
    expect(parseComments(text)[0]?.comment).toBe("check `gas` here");
  });

  test("in the anchor as well", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "`x` = 1", comment: "why", date: DATE });

    expect((text.split("\n")[2] as string).slice(3)).not.toContain("`");
    expect(parseComments(text)[0]?.anchor).toBe("`x` = 1");
  });

  test("on an ordinary line too — one rule, no exceptions", () => {
    const { text } = insertComment(DOC, { line: 1, anchor: "Trades", comment: "use `code`", date: DATE });

    expect(text.split("\n")[0]).toContain("use \\u0060code\\u0060");
    expect(parseComments(text)[0]?.comment).toBe("use `code`");
  });

  test("survives an update", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "| sell |", comment: "first", date: DATE });
    const next = updateComment(text, "c1", "now `second`");

    expect((next.split("\n")[2] as string).slice(3)).not.toContain("`");
    expect(parseComments(next)[0]?.comment).toBe("now `second`");
  });
});
