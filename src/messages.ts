/**
 * Runtime shape check for messages coming from the webview.
 *
 * TypeScript types stop at the process boundary. The webview renders untrusted
 * documents; if it were ever compromised, the host must still only act on
 * messages of exactly the expected shape and size.
 */

import type { WebviewToExtension } from "./types.js";

const MAX_TEXT = 200_000;
const MAX_ID = 64;
/** Export bodies carry the whole rendered document; images are still links at this point. */
const MAX_EXPORT_HTML = 50_000_000;

function isText(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === "string" && value.length <= max;
}

export function isWebviewMessage(value: unknown): value is WebviewToExtension {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;

  switch (message["type"]) {
    case "ready":
    case "pickTheme":
    case "export":
      return true;
    case "addComment":
      return (
        Number.isInteger(message["line"]) &&
        (message["line"] as number) > 0 &&
        isText(message["anchor"]) &&
        isText(message["comment"])
      );
    case "updateComment":
      return isText(message["id"], MAX_ID) && isText(message["comment"]);
    case "deleteComment":
      return isText(message["id"], MAX_ID);
    case "exportHtml":
      return isText(message["requestId"], MAX_ID) && isText(message["html"], MAX_EXPORT_HTML);
    case "viewport":
      return Number.isInteger(message["line"]) && (message["line"] as number) > 0;
    default:
      return false;
  }
}
