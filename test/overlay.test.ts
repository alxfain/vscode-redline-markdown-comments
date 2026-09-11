// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import type { Comment } from "../src/commentStore.js";
import { CommentLayer } from "../media/webview/overlay.js";

const host = { add() {}, update() {}, remove() {} };

function comment(id: string, line: number, anchor: string): Comment {
  return { id, line, anchor, comment: `note ${id}`, date: "2026-09-08T10:00:00Z" };
}

let doc: HTMLElement;
let gutter: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  doc = document.createElement("article");
  gutter = document.createElement("aside");
  document.body.append(doc, gutter);
});

const LINE = '<p data-line="3">Grease for bearings and pads for the brakes</p>';

describe("CommentLayer.apply: two comments on one line", () => {
  test("highlights both anchors — the first mark must not hide the second", () => {
    doc.innerHTML = LINE;
    const layer = new CommentLayer(doc, gutter, host);

    layer.apply([comment("c1", 3, "bearings"), comment("c2", 3, "pads")]);

    const marks = Array.from(doc.querySelectorAll(".rl-mark")).map((m) => m.textContent);
    expect(marks).toEqual(["bearings", "pads"]);
  });

  test("shows one chip with the count and no orphan state", () => {
    doc.innerHTML = LINE;
    const layer = new CommentLayer(doc, gutter, host);

    layer.apply([comment("c1", 3, "bearings"), comment("c2", 3, "pads")]);

    const chips = gutter.querySelectorAll(".rl-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toBe("2");
    expect(chips[0]?.classList.contains("is-orphan")).toBe(false);
  });

  test("the card gives every comment its own Edit / Delete", () => {
    doc.innerHTML = LINE;
    const layer = new CommentLayer(doc, gutter, host);
    layer.apply([comment("c1", 3, "bearings"), comment("c2", 3, "pads")]);

    layer.openCard(3);

    const foots = document.querySelectorAll(".rl-card .rl-card-foot");
    expect(foots).toHaveLength(2);
    foots.forEach((foot) => {
      expect(Array.from(foot.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Edit", "Delete"]);
    });
  });

  test("clicking a highlight opens only that comment", () => {
    doc.innerHTML = LINE;
    const layer = new CommentLayer(doc, gutter, host);
    layer.apply([comment("c1", 3, "bearings"), comment("c2", 3, "pads")]);

    const second = Array.from(doc.querySelectorAll<HTMLElement>(".rl-mark"))[1] as HTMLElement;
    layer.toggleFor(second);

    const texts = Array.from(document.querySelectorAll(".rl-card .rl-text")).map((t) => t.textContent);
    expect(texts).toEqual(["note c2"]);
  });

  test("clicking the gutter chip opens every comment of the line", () => {
    doc.innerHTML = LINE;
    const layer = new CommentLayer(doc, gutter, host);
    layer.apply([comment("c1", 3, "bearings"), comment("c2", 3, "pads")]);

    layer.toggleFor(gutter.querySelector<HTMLElement>(".rl-chip") as HTMLElement);

    const texts = Array.from(document.querySelectorAll(".rl-card .rl-text")).map((t) => t.textContent);
    expect(texts).toEqual(["note c1", "note c2"]);
  });

  test("re-applying does not stack marks inside marks", () => {
    doc.innerHTML = '<p data-line="3">Grease for bearings</p>';
    const layer = new CommentLayer(doc, gutter, host);

    layer.apply([comment("c1", 3, "bearings")]);
    layer.apply([comment("c1", 3, "bearings")]);

    expect(doc.querySelectorAll(".rl-mark")).toHaveLength(1);
    expect(doc.textContent).toBe("Grease for bearings");
  });
});

describe("CommentLayer.navigate", () => {
  const openText = () => Array.from(document.querySelectorAll(".rl-card .rl-text")).map((t) => t.textContent);

  function fourComments() {
    doc.innerHTML = [
      '<p data-line="1">first paragraph about the hub</p>',
      '<p data-line="5">second paragraph about pads and brakes</p>',
      '<p data-line="9">third paragraph about the chain</p>',
    ].join("");
    Element.prototype.scrollIntoView = () => {};
    const layer = new CommentLayer(doc, gutter, host);
    layer.apply([comment("c1", 1, "hub"), comment("c2", 5, "pads"), comment("c3", 5, "brakes"), comment("c4", 9, "chain")]);
    return layer;
  }

  test("next from nothing opens the first comment, one at a time", () => {
    const layer = fourComments();
    layer.navigate("next");
    expect(openText()).toEqual(["note c1"]);
    layer.navigate("next");
    expect(openText()).toEqual(["note c2"]);
    layer.navigate("next");
    expect(openText()).toEqual(["note c3"]);
  });

  test("wraps around at both ends", () => {
    const layer = fourComments();
    layer.navigate("prev");
    expect(openText()).toEqual(["note c4"]);
    layer.navigate("next");
    expect(openText()).toEqual(["note c1"]);
  });

  test("continues from the comment currently open", () => {
    const layer = fourComments();
    layer.toggleFor(Array.from(doc.querySelectorAll<HTMLElement>(".rl-mark"))[2] as HTMLElement); // c3
    layer.navigate("prev");
    expect(openText()).toEqual(["note c2"]);
  });

  test("does nothing without comments", () => {
    doc.innerHTML = '<p data-line="1">empty</p>';
    const layer = new CommentLayer(doc, gutter, host);
    layer.apply([]);
    layer.navigate("next");
    expect(document.querySelector(".rl-card")).toBeNull();
  });
});

describe("CommentLayer.showHint (D79): an indented code block explains itself", () => {
  const blocked = { reason: "indented-code" as const, direction: "forward" as const, caret: new DOMRect(10, 10, 2, 18) };

  test("renders the explanation where the button would be", () => {
    const layer = new CommentLayer(doc, gutter, host);

    layer.showHint(blocked);

    const hint = document.querySelector(".rl-hint");
    expect(hint?.textContent).toContain("fenced");
    expect(document.querySelector(".rl-addbtn")).toBeNull();
  });

  test("hideAddButton removes it", () => {
    const layer = new CommentLayer(doc, gutter, host);
    layer.showHint(blocked);

    layer.hideAddButton();

    expect(document.querySelector(".rl-hint")).toBeNull();
  });

  test("showing the button afterwards replaces the hint", () => {
    const layer = new CommentLayer(doc, gutter, host);
    layer.showHint(blocked);

    layer.showAddButton({ line: 3, anchor: "x", direction: "forward", caret: new DOMRect(10, 10, 2, 18) });

    expect(document.querySelector(".rl-hint")).toBeNull();
    expect(document.querySelectorAll(".rl-addbtn")).toHaveLength(1);
  });
});
