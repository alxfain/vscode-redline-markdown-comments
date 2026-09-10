import { describe, expect, test } from "vitest";
import { deleteComment, insertComment, parseComments, updateComment } from "../src/commentStore.js";

const DATE = "2026-09-07T10:00:00Z";

const DOC = ["# Front hub", "", "- Grease for bearings · $10.99", "- Brake pads · $12.68", ""].join("\n");

describe("insertComment", () => {
  test("puts the tag at the end of the target line", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "bearings", comment: "check the brand", date: DATE });

    expect(text.split("\n")[2]).toBe(
      '- Grease for bearings · $10.99 <!-- MC:{"id":"c1","anchor":"bearings","comment":"check the brand","line":3,"date":"2026-09-07T10:00:00Z"} -->',
    );
  });

  test("leaves every other line byte-for-byte identical", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "bearings", comment: "check", date: DATE });
    const before = DOC.split("\n");
    const after = text.split("\n");

    expect(after.filter((_, i) => i !== 2)).toEqual(before.filter((_, i) => i !== 2));
  });

  test("hands back the id it assigned", () => {
    expect(insertComment(DOC, { line: 3, anchor: "a", comment: "b", date: DATE }).id).toBe("c1");
  });

  test("numbers the next comment above the highest existing id", () => {
    const once = insertComment(DOC, { line: 3, anchor: "a", comment: "first", date: DATE });
    const twice = insertComment(once.text, { line: 4, anchor: "b", comment: "second", date: DATE });

    expect(twice.id).toBe("c2");
  });

  test("does not reuse an id after gaps in the sequence", () => {
    const withGap = DOC.replace(
      "- Brake pads · $12.68",
      '- Brake pads · $12.68 <!-- MC:{"id":"c7","anchor":"x","comment":"y","line":4,"date":"2026-09-07T10:00:00Z"} -->',
    );

    expect(insertComment(withGap, { line: 3, anchor: "a", comment: "b", date: DATE }).id).toBe("c8");
  });

  test("appends a second comment after the first one on the same line", () => {
    const once = insertComment(DOC, { line: 3, anchor: "a", comment: "first", date: DATE });
    const twice = insertComment(once.text, { line: 3, anchor: "b", comment: "second", date: DATE });

    expect(parseComments(twice.text).map((c) => c.comment)).toEqual(["first", "second"]);
  });

  test("escapes an arrow in the body so it cannot close the tag early", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "a", comment: "arrow --> here", date: DATE });
    const line = text.split("\n")[2] as string;

    expect(line).toContain("--\\u003e");
    // The only `-->` on the line is the one closing the tag.
    expect(line.match(/-->/g)).toHaveLength(1);
  });

  test("escapes the alternative comment closer --!> as well", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "a", comment: "odd --!> closer", date: DATE });
    const line = text.split("\n")[2] as string;

    expect(line).not.toContain("--!>");
    expect(parseComments(text)[0]?.comment).toBe("odd --!> closer");
  });

  test("round-trips an arrow in the body back through the parser", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "a", comment: "arrow --> here", date: DATE });

    expect(parseComments(text)[0]?.comment).toBe("arrow --> here");
  });

  test("round-trips non-ASCII text and emoji", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "naïve", comment: "fix 🚲", date: DATE });
    const found = parseComments(text)[0];

    expect(found?.anchor).toBe("naïve");
    expect(found?.comment).toBe("fix 🚲");
  });

  test("refuses a line number outside the document", () => {
    expect(() => insertComment(DOC, { line: 99, anchor: "a", comment: "b", date: DATE })).toThrow();
  });
});

describe("insertComment on a very large file", () => {
  test("assigns the next id in a file with 200 000 comments", () => {
    const lines = Array.from({ length: 200_000 }, (_, i) => `l <!-- MC:{"id":"c${i + 1}","anchor":"l","comment":"n","line":${i + 1},"date":"${DATE}"} -->`);
    const { id } = insertComment(lines.join("\n"), { line: 1, anchor: "l", comment: "one more", date: DATE });
    expect(id).toBe("c200001");
  });
});

describe("updateComment", () => {
  test("replaces only the body of the named comment", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "bearings", comment: "old", date: DATE });
    const updated = updateComment(text, "c1", "new");
    const found = parseComments(updated)[0];

    expect(found?.comment).toBe("new");
    expect(found?.anchor).toBe("bearings");
    expect(found?.date).toBe(DATE);
  });

  test("leaves neighbouring comments alone", () => {
    const a = insertComment(DOC, { line: 3, anchor: "a", comment: "first", date: DATE });
    const b = insertComment(a.text, { line: 4, anchor: "b", comment: "second", date: DATE });
    const updated = updateComment(b.text, "c1", "edited");

    expect(parseComments(updated).map((c) => c.comment)).toEqual(["edited", "second"]);
  });

  test("escapes an arrow in the new body", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "a", comment: "old", date: DATE });
    const updated = updateComment(text, "c1", "arrow --> here");

    expect(parseComments(updated)[0]?.comment).toBe("arrow --> here");
    expect((updated.split("\n")[2] as string).match(/-->/g)).toHaveLength(1);
  });

  test("returns the document unchanged for an unknown id", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "a", comment: "b", date: DATE });
    expect(updateComment(text, "c99", "anything")).toBe(text);
  });
});

describe("deleteComment", () => {
  test("restores the line to exactly what it was before the comment", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "bearings", comment: "check", date: DATE });
    expect(deleteComment(text, "c1")).toBe(DOC);
  });

  test("removes only the named comment", () => {
    const a = insertComment(DOC, { line: 3, anchor: "a", comment: "first", date: DATE });
    const b = insertComment(a.text, { line: 4, anchor: "b", comment: "second", date: DATE });

    expect(parseComments(deleteComment(b.text, "c1")).map((c) => c.comment)).toEqual(["second"]);
  });

  test("removes one of two comments sharing a line without touching the other", () => {
    const a = insertComment(DOC, { line: 3, anchor: "a", comment: "first", date: DATE });
    const b = insertComment(a.text, { line: 3, anchor: "b", comment: "second", date: DATE });
    const left = deleteComment(b.text, "c1");

    expect(parseComments(left).map((c) => c.comment)).toEqual(["second"]);
    expect(left.split("\n")[2]).not.toContain("first");
  });

  test("returns the document unchanged for an unknown id", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "a", comment: "b", date: DATE });
    expect(deleteComment(text, "c99")).toBe(text);
  });
});
