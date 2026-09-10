/**
 * Preview theme resolution.
 *
 * No `vscode` import, so the function stays pure and testable: the VS Code
 * theme kind is mapped to our `ColorThemeKind` at the boundary, in the provider.
 */

/** GitHub looks — exactly the ones github-markdown-css ships. */
export const GITHUB_THEMES = [
  "light",
  "dark",
  "dark-dimmed",
  "dark-high-contrast",
  "light-colorblind",
  "dark-colorblind",
] as const;

export type Theme = (typeof GITHUB_THEMES)[number];

/** The active VS Code theme kind, reduced to our four values. */
export type ColorThemeKind = "light" | "dark" | "hc-light" | "hc-dark";

function isGithubTheme(value: string | undefined): value is Theme {
  return (GITHUB_THEMES as readonly string[]).includes(value ?? "");
}

/**
 * An explicitly chosen GitHub look always wins.
 * Everything else (`auto`, `vscode`, garbage) follows the VS Code theme kind.
 */
export function resolveTheme(setting: string | undefined, kind: ColorThemeKind): Theme {
  if (isGithubTheme(setting)) return setting;
  return kind === "light" || kind === "hc-light" ? "light" : "dark";
}

export interface Appearance {
  /** Base palette — always one of the GitHub looks. */
  palette: Theme;
  /** On top of it — the active VS Code theme's colours via `--vscode-*`. */
  vscodeColors: boolean;
}

/** `vscode` — follow the editor's colours; everything else is a GitHub look. */
export function resolveAppearance(setting: string | undefined, kind: ColorThemeKind): Appearance {
  return { palette: resolveTheme(setting, kind), vscodeColors: setting === "vscode" };
}
