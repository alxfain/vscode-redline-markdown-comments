import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * VS Code gives some Markdown files a language id of their own: `SKILL.md` is
 * `skill`, `*.prompt.md` is `prompt`, `*.instructions.md` and everything under
 * `.claude/rules/` is `instructions` (built-in `prompt-basics`, VS Code 1.137).
 * The custom editor is registered for `*.md`, so the button and the shortcut
 * must be gated on the extension too — never on `resourceLangId` (D80).
 */
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  contributes: {
    menus: Record<string, Array<{ command: string; when: string }>>;
    keybindings: Array<{ command: string; when: string }>;
    customEditors: Array<{ selector: Array<{ filenamePattern: string }> }>;
  };
};

const opensPreview = (item: { command: string }) => item.command === "redline.openPreview";

describe("contributions: opening the preview is gated on the .md extension, not the language id (D80)", () => {
  test("the custom editor claims *.md", () => {
    expect(pkg.contributes.customEditors[0]?.selector[0]?.filenamePattern).toBe("*.md");
  });

  test("the editor title button uses resourceExtname", () => {
    const item = pkg.contributes.menus["editor/title"]?.find(opensPreview);

    expect(item?.when).toContain("resourceExtname == .md");
    expect(item?.when).not.toContain("resourceLangId");
  });

  test("the explorer context item uses resourceExtname", () => {
    const item = pkg.contributes.menus["explorer/context"]?.find(opensPreview);

    expect(item?.when).toContain("resourceExtname == .md");
  });

  test("the keyboard shortcut uses resourceExtname", () => {
    const item = pkg.contributes.keybindings.find(opensPreview);

    expect(item?.when).toContain("resourceExtname == .md");
    expect(item?.when).not.toContain("resourceLangId");
  });
});
