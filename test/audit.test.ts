import { describe, expect, test } from "vitest";
import { insertComment, parseComments, stripComments } from "../src/commentStore.js";

const DATE = "2026-09-07T10:00:00Z";
const DOC = ["# Heading", "", "a plain line", "```ts", "const x = 1;", "```", "after the code", ""].join("\n");

describe("audit: escaping covers every string field", () => {
  test("an arrow inside the anchor is escaped and round-trips", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "a --> b", comment: "body", date: DATE });

    expect((text.split("\n")[2] as string).match(/-->/g)).toHaveLength(1);
    expect(parseComments(text)[0]?.anchor).toBe("a --> b");
  });

  test("curly braces inside the body do not confuse the tag parser", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "x", comment: "object {a: 1} and more }", date: DATE });

    expect(parseComments(text)[0]?.comment).toBe("object {a: 1} and more }");
    expect(stripComments(text)).toBe(DOC);
  });

  test("a closing fence written inside the body does not open a code block", () => {
    const { text } = insertComment(DOC, { line: 3, anchor: "x", comment: "example: ``` like this", date: DATE });

    expect(parseComments(text)[0]?.comment).toBe("example: ``` like this");
  });
});

describe("audit: a comment can never land where the parser will not see it", () => {
  test("refuses to insert on a line inside a fenced code block", () => {
    expect(() => insertComment(DOC, { line: 5, anchor: "x", comment: "would vanish", date: DATE })).toThrow(/code block/);
  });

  test("refuses to insert on the fence line itself", () => {
    expect(() => insertComment(DOC, { line: 4, anchor: "x", comment: "would vanish", date: DATE })).toThrow(/code block/);
  });

  test("still inserts on the first line after the block closes", () => {
    const { text } = insertComment(DOC, { line: 7, anchor: "after", comment: "ok", date: DATE });
    expect(parseComments(text)[0]?.line).toBe(7);
  });
});
