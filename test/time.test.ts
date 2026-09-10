import { describe, expect, test } from "vitest";
import { relativeTime } from "../media/webview/time.js";

const now = new Date("2026-09-08T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const s = 1000, m = 60 * s, h = 60 * m, d = 24 * h;

describe("relativeTime (English UI, D41)", () => {
  test("under a minute is 'just now'", () => {
    expect(relativeTime(ago(20 * s), now)).toBe("just now");
  });

  test("minutes, singular and plural", () => {
    expect(relativeTime(ago(1 * m), now)).toBe("1 minute ago");
    expect(relativeTime(ago(18 * m), now)).toBe("18 minutes ago");
  });

  test("hours, singular and plural", () => {
    expect(relativeTime(ago(1 * h), now)).toBe("1 hour ago");
    expect(relativeTime(ago(2 * h), now)).toBe("2 hours ago");
  });

  test("yesterday between 24 and 48 hours", () => {
    expect(relativeTime(ago(30 * h), now)).toBe("yesterday");
  });

  test("days up to a week", () => {
    expect(relativeTime(ago(3 * d), now)).toBe("3 days ago");
  });

  test("older than a week shows the date; year only when it differs", () => {
    expect(relativeTime("2026-09-01T10:00:00Z", now)).toBe("Sep 1");
    expect(relativeTime("2025-12-24T10:00:00Z", now)).toBe("Dec 24, 2025");
  });

  test("garbage input yields an empty string, never throws", () => {
    expect(relativeTime("not a date", now)).toBe("");
    expect(relativeTime("", now)).toBe("");
  });
});
