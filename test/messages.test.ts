import { describe, expect, test } from "vitest";
import { isWebviewMessage } from "../src/messages.js";

describe("isWebviewMessage: the host trusts nothing the webview sends until it has the right shape", () => {
  test("accepts every well-formed message", () => {
    expect(isWebviewMessage({ type: "ready" })).toBe(true);
    expect(isWebviewMessage({ type: "pickTheme" })).toBe(true);
    expect(isWebviewMessage({ type: "export" })).toBe(true);
    expect(isWebviewMessage({ type: "addComment", line: 3, anchor: "a", comment: "b" })).toBe(true);
    expect(isWebviewMessage({ type: "updateComment", id: "c1", comment: "b" })).toBe(true);
    expect(isWebviewMessage({ type: "deleteComment", id: "c1" })).toBe(true);
    expect(isWebviewMessage({ type: "exportHtml", requestId: "ab", html: "<p>x</p>" })).toBe(true);
    expect(isWebviewMessage({ type: "viewport", line: 12 })).toBe(true);
  });

  test("rejects wrong types, missing fields and unknown messages", () => {
    expect(isWebviewMessage(null)).toBe(false);
    expect(isWebviewMessage("ready")).toBe(false);
    expect(isWebviewMessage({ type: "addComment", line: "3", anchor: "a", comment: "b" })).toBe(false);
    expect(isWebviewMessage({ type: "addComment", line: 3.5, anchor: "a", comment: "b" })).toBe(false);
    expect(isWebviewMessage({ type: "addComment", line: 3, anchor: { toString: () => "a" }, comment: "b" })).toBe(false);
    expect(isWebviewMessage({ type: "updateComment", id: "c1" })).toBe(false);
    expect(isWebviewMessage({ type: "deleteComment", id: 7 })).toBe(false);
    expect(isWebviewMessage({ type: "runCommand", command: "rm -rf" })).toBe(false);
    expect(isWebviewMessage({ type: "viewport", line: 0 })).toBe(false);
    expect(isWebviewMessage({ type: "viewport", line: "12" })).toBe(false);
  });

  test("rejects an anchor or comment that is unreasonably large", () => {
    expect(isWebviewMessage({ type: "addComment", line: 1, anchor: "a", comment: "x".repeat(200_001) })).toBe(false);
  });
});
