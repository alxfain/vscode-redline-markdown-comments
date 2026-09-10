import { describe, expect, test } from "vitest";
import { parseComments } from "../src/commentStore.js";

/** Builds a raw tag exactly as it sits in the .md file. */
function tag(payload: Record<string, unknown>): string {
  return `<!-- MC:${JSON.stringify(payload)} -->`;
}

describe("parseComments", () => {
  test("returns nothing for a document without tags", () => {
    expect(parseComments("# Heading\n\nJust text.\n")).toEqual([]);
  });

  test("reads every field of a single comment", () => {
    const md = `Grease for bearings · $10.99 ${tag({
      id: "c1",
      anchor: "bearings",
      comment: "check the brand",
      line: 1,
      date: "2026-09-07T10:00:00Z",
    })}\n`;

    expect(parseComments(md)).toEqual([
      {
        id: "c1",
        anchor: "bearings",
        comment: "check the brand",
        line: 1,
        date: "2026-09-07T10:00:00Z",
      },
    ]);
  });

  test("takes the line from where the tag actually sits, not from the stored line field", () => {
    const md = [
      "first line",
      "second line",
      `third line ${tag({ id: "c1", anchor: "third", comment: "here", line: 99, date: "2026-09-07T10:00:00Z" })}`,
    ].join("\n");

    expect(parseComments(md)[0]?.line).toBe(3);
  });

  test("keeps file order for several comments on one line", () => {
    const md =
      "one line " +
      tag({ id: "c1", anchor: "one", comment: "first", line: 1, date: "2026-09-07T10:00:00Z" }) +
      " " +
      tag({ id: "c2", anchor: "line", comment: "second", line: 1, date: "2026-09-07T10:01:00Z" });

    expect(parseComments(md).map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  test("unescapes a comment body that contains the sequence -->", () => {
    // In the file the sequence is stored as >, otherwise it would close the tag.
    const raw = '<!-- MC:{"id":"c1","anchor":"x","comment":"arrow --\\u003e here","line":1,"date":"2026-09-07T10:00:00Z"} -->';

    expect(parseComments(`text ${raw}`)[0]?.comment).toBe("arrow --> here");
  });

  test("ignores a tag inside a fenced code block", () => {
    const md = [
      "Markup example:",
      "```markdown",
      `text ${tag({ id: "c9", anchor: "text", comment: "not real", line: 3, date: "2026-09-07T10:00:00Z" })}`,
      "```",
      "The end.",
    ].join("\n");

    expect(parseComments(md)).toEqual([]);
  });

  test("ignores a tag inside an inline code span", () => {
    const md = `The format is \`${tag({ id: "c9", anchor: "x", comment: "no", line: 1, date: "2026-09-07T10:00:00Z" })}\` — like this.`;

    expect(parseComments(md)).toEqual([]);
  });

  test("skips a tag with broken JSON and keeps the valid ones", () => {
    const md = [
      "line one <!-- MC:{not json} -->",
      `line two ${tag({ id: "c2", anchor: "two", comment: "alive", line: 2, date: "2026-09-07T10:00:00Z" })}`,
    ].join("\n");

    expect(parseComments(md).map((c) => c.id)).toEqual(["c2"]);
  });

  test("preserves non-ASCII text and emoji in anchor and body", () => {
    const md = `text ${tag({
      id: "c1",
      anchor: "naïve café",
      comment: "fix 🚲 and 🔧",
      line: 1,
      date: "2026-09-07T10:00:00Z",
    })}`;

    const found = parseComments(md)[0];
    expect(found?.anchor).toBe("naïve café");
    expect(found?.comment).toBe("fix 🚲 and 🔧");
  });

  test("stays linear on a file full of unclosed tag openers — a crafted file must not freeze the host", () => {
    const doc = "<!-- MC:{ ".repeat(20_000) + "\n";
    const started = performance.now();
    expect(parseComments(doc)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(300);
  });

  test("stays linear when every line carries inline code and a plain HTML comment", () => {
    const doc = "`x` text <!-- not a tag -->\n".repeat(40_000);
    const started = performance.now();
    expect(parseComments(doc)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(300);
  });

  test("still finds a real tag after garbage openers on the same line", () => {
    const md = "<!-- MC:{ <!-- MC:{ text " + tag({ id: "c1", anchor: "text", comment: "ok", line: 1, date: "2026-09-07T10:00:00Z" });
    expect(parseComments(md).map((c) => c.id)).toEqual(["c1"]);
  });
});
