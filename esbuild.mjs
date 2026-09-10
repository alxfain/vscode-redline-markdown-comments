import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import postcss from "postcss";
import prefixSelector from "postcss-prefix-selector";

const require = createRequire(import.meta.url);
const watch = process.argv.includes("--watch");
const prod = process.argv.includes("--production");

/* ── Host: Node, CommonJS, vscode external ───────────────────────── */
const host = {
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  sourcemap: !prod,
  minify: prod,
};

/* ── Webview: browser, IIFE, everything bundled ──────────────────── */
const webview = {
  entryPoints: ["media/webview/main.ts"],
  outfile: "media/webview.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: !prod,
  minify: prod,
};

/* ── CSS: every theme under its own switch class ──────────────────
 *
 * github-markdown-css and highlight.js ship light and dark themes as separate
 * files with hard-coded colours. Each one is scoped under its own class so
 * that switching themes is a single class change on <body>, no re-render.
 */
async function scoped(file, prefix) {
  const css = readFileSync(require.resolve(file), "utf8");
  const result = await postcss([
    prefixSelector({
      prefix,
      transform(scope, selector, prefixed) {
        // html/body are the root, not nested elements: replace, don't nest
        return /^(html|body)\b/.test(selector) ? selector.replace(/^(html|body)/, scope) : prefixed;
      },
    }),
  ]).process(css, { from: undefined });
  return `/* ${file} → ${prefix} */\n${result.css}`;
}

async function buildCss() {
  const parts = [
    readFileSync("media/webview/tokens.css", "utf8"),
    // Every GitHub look, each under its own <body> class
    await scoped("github-markdown-css/github-markdown-light.css", ".rl-light"),
    await scoped("github-markdown-css/github-markdown-dark.css", ".rl-dark"),
    await scoped("github-markdown-css/github-markdown-dark-dimmed.css", ".rl-dark-dimmed"),
    await scoped("github-markdown-css/github-markdown-dark-high-contrast.css", ".rl-dark-high-contrast"),
    await scoped("github-markdown-css/github-markdown-light-colorblind.css", ".rl-light-colorblind"),
    await scoped("github-markdown-css/github-markdown-dark-colorblind.css", ".rl-dark-colorblind"),
    await scoped("highlight.js/styles/github.css", ".rl-light"),
    await scoped("highlight.js/styles/github.css", ".rl-light-colorblind"),
    await scoped("highlight.js/styles/github-dark.css", ".rl-dark"),
    await scoped("highlight.js/styles/github-dark.css", ".rl-dark-high-contrast"),
    await scoped("highlight.js/styles/github-dark.css", ".rl-dark-colorblind"),
    await scoped("highlight.js/styles/github-dark-dimmed.css", ".rl-dark-dimmed"),
    // "VS Code theme" mode: colours from --vscode-*, code in the native One Dark palette
    await scoped("highlight.js/styles/atom-one-light.css", ".rl-light.rl-vscode"),
    await scoped("highlight.js/styles/atom-one-dark.css", ".rl-dark.rl-vscode"),
    readFileSync("media/webview/vscode-theme.css", "utf8"),
    readFileSync("media/webview/webview.css", "utf8"),
  ];
  writeFileSync("media/webview.css", parts.join("\n\n"));
}

const cssPlugin = {
  name: "redline-css",
  setup(build) {
    build.onStart(buildCss);
  },
};

if (watch) {
  const contexts = await Promise.all([
    esbuild.context(host),
    esbuild.context({ ...webview, plugins: [cssPlugin] }),
  ]);
  await Promise.all(contexts.map((context) => context.watch()));
  console.log("watching…");
} else {
  await Promise.all([esbuild.build(host), esbuild.build({ ...webview, plugins: [cssPlugin] })]);
  console.log("built");
}
