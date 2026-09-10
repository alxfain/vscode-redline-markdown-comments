/**
 * The one HTML sanitiser, applied in the webview right before `innerHTML`.
 *
 * DOMPurify runs on the browser's own parser, so it sees exactly the DOM the
 * page would get — malformed markup, entity tricks and parser differentials
 * included. This is the security boundary for document content; the nonce
 * CSP on the webview is defence in depth behind it.
 *
 * The allowlist is the HTML profile minus everything that can embed, load
 * or run anything: no scripts, styles, frames, objects, forms, SVG or MathML.
 * `input` stays for task-list checkboxes; it is inert without scripts.
 */

import DOMPurify from "dompurify";

const FORBID_TAGS = [
  "script", "noscript", "style", "link", "meta", "base", "template",
  "iframe", "frame", "frameset", "object", "embed", "applet",
  "form", "button", "select", "option", "textarea",
  "svg", "math", "video", "audio", "source", "track",
];

const FORBID_ATTR = ["style", "srcdoc", "formaction", "action", "background", "poster", "ping"];

/** http(s), mailto, tel, fragments and relative URLs. Whitespace is stripped before matching, so `java\nscript:` cannot slip through. */
const URI_DEFAULT = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;

/** A `file:` URL with nothing but the scheme in front — the only shape the exporter can vet. */
const FILE_URL = /^\s*file:\/\//i;

/** Set per call; read by the hook below. DOMPurify hooks are global to the instance. */
let fileImagesAllowed = false;

/** Classes of the comment layer and the article: a document must not be able to draw fake highlights, chips or cards. */
const RESERVED_CLASS = /^(?:rl-|markdown-body$)/;

DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  // Export path: `file:` survives on `<img src>` only — never on links or anything else.
  // The value is still a plain file URL; the host applies realpath containment before reading it.
  if (fileImagesAllowed && node.nodeName === "IMG" && data.attrName === "src" && FILE_URL.test(data.attrValue)) {
    data.forceKeepAttr = true;
  }
  if (data.attrName === "class") {
    const kept = data.attrValue.split(/\s+/).filter((name) => name && !RESERVED_CLASS.test(name));
    data.attrValue = kept.join(" ");
    if (kept.length === 0) data.keepAttr = false;
  }
});

// The only input a document may contain is an inert task-list checkbox.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "INPUT") return;
  if (node.getAttribute("type")?.toLowerCase() !== "checkbox") {
    node.parentNode?.removeChild(node);
    return;
  }
  node.setAttribute("disabled", "");
});

export interface SanitizeOptions {
  /** Allow `file:` image sources. Off in the preview (CSP blocks them anyway); on when rendering for export. */
  allowFileImages?: boolean;
}

export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  fileImagesAllowed = options.allowFileImages === true;
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS,
      FORBID_ATTR,
      ALLOW_DATA_ATTR: true, // data-line stamps on blocks
      ALLOWED_URI_REGEXP: URI_DEFAULT,
      RETURN_TRUSTED_TYPE: false,
    }) as string;
  } finally {
    fileImagesAllowed = false;
  }
}
