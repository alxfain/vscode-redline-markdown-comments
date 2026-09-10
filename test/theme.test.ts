import { describe, expect, test } from "vitest";
import { resolveAppearance, resolveTheme } from "../src/theme.js";

describe("resolveAppearance (follow the VS Code theme)", () => {
  test("'vscode' keeps the editor's light/dark palette and switches on VS Code colours", () => {
    expect(resolveAppearance("vscode", "dark")).toEqual({ palette: "dark", vscodeColors: true });
    expect(resolveAppearance("vscode", "hc-light")).toEqual({ palette: "light", vscodeColors: true });
  });

  test("every other value keeps GitHub colours", () => {
    expect(resolveAppearance("auto", "dark")).toEqual({ palette: "dark", vscodeColors: false });
    expect(resolveAppearance("light", "dark")).toEqual({ palette: "light", vscodeColors: false });
    expect(resolveAppearance(undefined, "light")).toEqual({ palette: "light", vscodeColors: false });
  });
});

describe("resolveTheme", () => {
  test("auto follows a light VS Code theme", () => {
    expect(resolveTheme("auto", "light")).toBe("light");
  });

  test("auto follows a dark VS Code theme", () => {
    expect(resolveTheme("auto", "dark")).toBe("dark");
  });

  test("auto treats high-contrast dark as dark", () => {
    expect(resolveTheme("auto", "hc-dark")).toBe("dark");
  });

  test("auto treats high-contrast light as light", () => {
    expect(resolveTheme("auto", "hc-light")).toBe("light");
  });

  test("an explicit light setting wins over a dark VS Code theme", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
  });

  test("an explicit dark setting wins over a light VS Code theme", () => {
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  test("a GitHub variant is used as-is (D54)", () => {
    expect(resolveTheme("dark-dimmed", "light")).toBe("dark-dimmed");
    expect(resolveTheme("dark-high-contrast", "light")).toBe("dark-high-contrast");
    expect(resolveTheme("light-colorblind", "dark")).toBe("light-colorblind");
    expect(resolveTheme("dark-colorblind", "light")).toBe("dark-colorblind");
  });

  test("an unknown setting value behaves like auto", () => {
    expect(resolveTheme("purple", "dark")).toBe("dark");
    expect(resolveTheme(undefined, "light")).toBe("light");
  });
});
