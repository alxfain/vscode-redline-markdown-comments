/**
 * Markdown → HTML rendering for the webview.
 *
 * A pure function: a string in, a string out. Runs in the browser and in
 * Node alike — which is why plain Vitest tests cover it.
 *
 * `markdown-it` was chosen for `token.map`: every block knows which source
 * line it starts on. We expose that as `data-line` — anchoring comments to
 * file lines rests on it.
 *
 * Output is NOT safe to insert as-is: raw HTML is allowed through so that
 * README-style `<details>`, `<kbd>` and the author's own `<!-- -->` notes work.
 */

import hljs from "highlight.js/lib/common";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

export interface RenderOptions {
  /** Webview URI of the document folder, with a trailing slash. Relative images resolve against it. */
  baseUri: string;
}

/** Our env on top of what markdown-it requires. */
type Env = MarkdownIt.Env & { baseUri: string };

type Token = MarkdownIt.Token;
type Rule = MarkdownIt.RendererRule;
type RenderOptionsAll = Required<MarkdownIt.MarkdownItOptions>;

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, lang) {
    // Unknown language — no guessing: markdown-it escapes the text itself.
    if (!lang || !hljs.getLanguage(lang)) return "";
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  },
});

md.use(taskLists, { enabled: false, label: false });

/* ── data-line on every block ────────────────────────────────────── */

const renderToken = md.renderer.renderToken.bind(md.renderer);
md.renderer.renderToken = function (tokens: Token[], idx: number, options: RenderOptionsAll): string {
  const token = tokens[idx];
  if (token && token.map && token.nesting === 1) {
    token.attrSet("data-line", String(token.map[0] + 1));
  }
  return renderToken(tokens, idx, options);
};

// Fences render through their own rule, bypassing renderToken.
const fence = md.renderer.rules["fence"] as Rule;
md.renderer.rules["fence"] = (tokens, idx, options, env, self) => {
  const html = fence(tokens, idx, options, env, self);
  const token = tokens[idx];
  return token && token.map ? html.replace(/^<pre/, `<pre data-line="${token.map[0] + 1}"`) : html;
};

/* ── raw HTML cannot forge the source mapping ─────────────────────── */

/**
 * `data-line` / `data-id` are how comments find their block and highlight.
 * The renderer stamps them on the blocks it creates; an author's raw HTML
 * must not carry its own, or a comment could be steered onto any line.
 * Raw HTML reaches the output only through these two token types.
 */
const MAPPING_ATTR = /\s+data-(?:line|id)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;

for (const type of ["html_block", "html_inline"] as const) {
  const rule = md.renderer.rules[type] as Rule;
  md.renderer.rules[type] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token) token.content = token.content.replace(MAPPING_ATTR, "");
    return rule(tokens, idx, options, env, self);
  };
}

/* ── relative images → webview URI ───────────────────────────────── */

const hasScheme = /^[a-z][a-z0-9+.-]*:/i;

function isRelative(src: string): boolean {
  return !hasScheme.test(src) && !src.startsWith("//") && !src.startsWith("#");
}

const image = md.renderer.rules["image"] as Rule;
md.renderer.rules["image"] = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token?.attrGet("src");
  const baseUri = (env as Env | undefined)?.baseUri;
  if (token && typeof src === "string" && baseUri && isRelative(src)) {
    token.attrSet("src", new URL(src, baseUri).toString());
  }
  return image(tokens, idx, options, env, self);
};

/**
 * Raw HTML passes through untouched here. The webview sanitises the result
 * with DOMPurify right before `innerHTML` (see sanitize.ts) — that is the
 * security boundary, and it has to run on the browser's own parser.
 */
export function renderMarkdown(markdown: string, options: RenderOptions): string {
  const env: Env = { baseUri: options.baseUri };
  return md.render(markdown, env);
}
