import { describe, expect, test } from "vitest";
import { stripComments } from "../src/commentStore.js";

function tag(payload: Record<string, unknown>): string {
  return `<!-- MC:${JSON.stringify(payload)} -->`;
}

const c = (id: string, comment = "note") => ({
  id,
  anchor: "anchor",
  comment,
  line: 1,
  date: "2026-09-07T10:00:00Z",
});

describe("stripComments", () => {
  test("leaves a document without tags untouched", () => {
    const md = "# Heading\n\nJust text.\n";
    expect(stripComments(md)).toBe(md);
  });

  test("removes the tag and the space that separated it from the text", () => {
    const md = `Grease for bearings · $10.99 ${tag(c("c1"))}\n`;
    expect(stripComments(md)).toBe("Grease for bearings · $10.99\n");
  });

  test("removes every tag on a line without leaving double spaces", () => {
    const md = `one line ${tag(c("c1"))} ${tag(c("c2"))}\n`;
    expect(stripComments(md)).toBe("one line\n");
  });

  test("keeps a tag that sits inside a fenced code block", () => {
    const md = ["```markdown", `example ${tag(c("c9"))}`, "```", ""].join("\n");
    expect(stripComments(md)).toBe(md);
  });

  test("keeps a tag that sits inside an inline code span", () => {
    const md = `Format: \`${tag(c("c9"))}\` — like this.\n`;
    expect(stripComments(md)).toBe(md);
  });

  test("preserves the surrounding line structure exactly", () => {
    const md = [
      "# Front hub",
      "",
      `- Grease for bearings ${tag(c("c1"))}`,
      `- Brake pads ${tag(c("c2"))}`,
      "",
      "The end.",
      "",
    ].join("\n");

    expect(stripComments(md)).toBe(
      ["# Front hub", "", "- Grease for bearings", "- Brake pads", "", "The end.", ""].join("\n"),
    );
  });

  test("does not eat a trailing newline", () => {
    expect(stripComments(`text ${tag(c("c1"))}\n`).endsWith("\n")).toBe(true);
  });

  test("leaves a tag with broken JSON alone rather than mangling the file", () => {
    const md = "line <!-- MC:{not json} -->\n";
    expect(stripComments(md)).toBe(md);
  });

  test("stays linear on a file with tens of thousands of tags — every keystroke runs this on the host", () => {
    const lines = Array.from({ length: 20_000 }, (_, i) => `line ${i} ${tag(c(`c${i + 1}`))}`);
    const started = performance.now();
    const out = stripComments(lines.join("\n"));
    expect(performance.now() - started).toBeLessThan(300);
    expect(out).toBe(Array.from({ length: 20_000 }, (_, i) => `line ${i}`).join("\n"));
  });
});
