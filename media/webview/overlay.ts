/**
 * The comment layer on top of the rendered document.
 *
 * Owns everything visible besides the markdown itself:
 *  - anchor highlights in the text and chips in the gutter;
 *  - the "Add comment" button and the input popover next to a selection;
 *  - the centred reading card with edit and delete.
 *
 * Document state belongs to the host: every operation is sent there as a
 * message, and the layer re-renders on the next `update`.
 */

import type { Comment } from "../../src/commentStore.js";
import { findAnchor, wrapTextRange } from "./anchors.js";
import { placeButton } from "./geometry.js";
import { ICON } from "./icons.js";
import type { SelectionInfo } from "./selection.js";
import { relativeTime } from "./time.js";

export interface CommentHost {
  add(line: number, anchor: string, comment: string): void;
  update(id: string, comment: string): void;
  remove(id: string): void;
}

interface Placed {
  comment: Comment;
  block: HTMLElement;
  orphan: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function text(node: HTMLElement, value: string): HTMLElement {
  node.textContent = value;
  return node;
}

/** Comment ids come from the file; a crafted one must not break a selector. */
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\\]]/g, "\\$&");
}

/**
 * Cmd+Z / Cmd+Shift+Z inside a field undoes typing, and only typing.
 * VS Code forwards unhandled keys from the webview to the workbench; without
 * this, the editor's undo would revert the previous comment while you type.
 */
function keepUndoInField(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") event.stopPropagation();
}

export class CommentLayer {
  private placed: Placed[] = [];
  private readonly ui: HTMLElement;
  private addButton: HTMLElement | null = null;
  private popover: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private pending: SelectionInfo | null = null;
  private openLine: number | null = null;
  /** One comment is open (click on a highlight) or the whole line (click on a chip). */
  private openId: string | undefined;

  constructor(
    private readonly doc: HTMLElement,
    private readonly gutter: HTMLElement,
    private readonly host: CommentHost,
  ) {
    this.ui = el("div", "rl-ui");
    document.body.appendChild(this.ui);
  }

  /* ── Highlights and chips ────────────────────────────────────────── */

  apply(comments: Comment[]): void {
    this.unwrapMarks();
    this.placed = [];

    for (const comment of comments) {
      const block = this.blockFor(comment.line);
      if (!block) continue;

      const span = findAnchor(block.textContent ?? "", comment.anchor);
      if (span) {
        wrapTextRange(block, span.start, span.end, () => {
          const mark = el("span", "rl-mark");
          mark.dataset["line"] = String(comment.line);
          mark.dataset["id"] = comment.id;
          mark.setAttribute("role", "button");
          mark.tabIndex = 0;
          return mark;
        });
      }
      this.placed.push({ comment, block, orphan: !span });
    }

    this.layoutChips();

    // A card is open but the agent has already cleaned its line — close it.
    if (this.openLine !== null) {
      const stillThere = this.placed.some(
        (p) => p.comment.line === this.openLine && (this.openId === undefined || p.comment.id === this.openId),
      );
      if (stillThere) this.openCard(this.openLine, this.openId);
      else this.closeCard();
    }
  }

  layoutChips(): void {
    this.gutter.innerHTML = "";
    const gutterTop = this.gutter.getBoundingClientRect().top;
    const byLine = new Map<number, Placed[]>();
    for (const item of this.placed) {
      const list = byLine.get(item.comment.line) ?? [];
      list.push(item);
      byLine.set(item.comment.line, list);
    }

    for (const [line, items] of byLine) {
      const block = items[0]?.block;
      if (!block) continue;
      const orphan = items.every((i) => i.orphan);

      const chip = el("button", `rl-chip${orphan ? " is-orphan" : ""}${line === this.openLine ? " is-active" : ""}`);
      chip.type = "button";
      chip.dataset["line"] = String(line);
      chip.innerHTML = `${ICON.chip}<span>${items.length}</span>`;
      chip.setAttribute("aria-label", `${items.length} comment${items.length === 1 ? "" : "s"}`);
      chip.style.top = `${block.getBoundingClientRect().top - gutterTop + 1}px`;
      this.gutter.appendChild(chip);
    }
  }

  private unwrapMarks(): void {
    const marks = Array.from(this.doc.querySelectorAll<HTMLElement>(".rl-mark"));
    for (const mark of marks.reverse()) mark.replaceWith(...Array.from(mark.childNodes));
    this.doc.normalize();
  }

  /**
   * The deepest block starting on this line; otherwise the nearest one above.
   * Highlights carry data-line too — they are excluded, otherwise the second
   * anchor on a line would be searched inside the first highlight and orphaned.
   */
  private blockFor(line: number): HTMLElement | null {
    const all = Array.from(this.doc.querySelectorAll<HTMLElement>("[data-line]:not(.rl-mark)"));
    const exact = all.filter((b) => Number(b.dataset["line"]) === line);
    if (exact.length > 0) return exact[exact.length - 1] as HTMLElement;

    let best: HTMLElement | null = null;
    for (const block of all) {
      const start = Number(block.dataset["line"]);
      if (start < line && (!best || start >= Number(best.dataset["line"]))) best = block;
    }
    return best;
  }

  /* ── "Add comment" button and popover ───────────────────────────── */

  showAddButton(info: SelectionInfo): void {
    this.hideAddButton();
    this.pending = info;

    const button = el("button", "rl-addbtn", `${ICON.add}Add comment`);
    button.type = "button";
    button.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
    button.addEventListener("click", () => this.openPopover());
    this.ui.appendChild(button);
    this.addButton = button;
    this.position(button, info);
  }

  hideAddButton(): void {
    this.addButton?.remove();
    this.addButton = null;
    if (!this.popover) this.pending = null;
  }

  private openPopover(): void {
    const info = this.pending;
    if (!info) return;
    this.addButton?.remove();
    this.addButton = null;

    const popover = el("div", "rl-popover");
    const field = el("textarea", "rl-field");
    field.placeholder = "Add a comment…";
    field.rows = 1;
    const send = el("button", "rl-send", ICON.send);
    send.type = "button";
    send.setAttribute("aria-label", "Save");

    const sync = () => {
      send.classList.toggle("is-ready", field.value.trim().length > 0);
      field.style.height = "auto";
      field.style.height = `${Math.min(field.scrollHeight, 5 * 22)}px`;
    };
    const submit = () => {
      const comment = field.value.trim();
      if (!comment) return;
      this.host.add(info.line, info.anchor, comment);
      this.closePopover();
      window.getSelection()?.removeAllRanges();
    };

    field.addEventListener("input", sync);
    field.addEventListener("keydown", (e) => {
      keepUndoInField(e);
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    });
    send.addEventListener("click", submit);

    popover.append(field, send);
    this.ui.appendChild(popover);
    this.popover = popover;
    this.position(popover, info);
    field.focus();
  }

  private closePopover(): void {
    this.popover?.remove();
    this.popover = null;
    this.pending = null;
  }

  private position(node: HTMLElement, info: SelectionInfo): void {
    const size = node.getBoundingClientRect();
    const { left, top } = placeButton(
      info.caret,
      info.direction,
      { width: size.width, height: size.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }

  /* ── Reading card ────────────────────────────────────────────────── */

  openCard(line: number, id?: string): void {
    const items = this.placed.filter((p) => p.comment.line === line && (id === undefined || p.comment.id === id));
    if (items.length === 0) {
      this.closeCard();
      return;
    }

    // The same card is already open (an update arrived) — refresh its content in
    // place, without recreating it or replaying the entrance animation.
    const existing = this.overlay?.querySelector<HTMLElement>(".rl-card");
    const sameCard = existing && this.openLine === line && this.openId === id;
    if (!sameCard) this.closeCard();
    this.openLine = line;
    this.openId = id;

    const overlay = sameCard ? (this.overlay as HTMLElement) : el("div", "rl-overlay is-open");
    const card = sameCard ? existing : el("div", "rl-card");
    card.className = `rl-card${items.length > 1 ? " is-stack" : ""}`;
    card.replaceChildren();

    // Every comment gets its own section and its own buttons: the action sits next to its object.
    items.forEach((item, index) => {
      const body = el("div", "rl-card-body");

      const time = relativeTime(item.comment.date) + (item.orphan ? " · text changed" : "");
      if (items.length > 1) {
        const head = el("div", "rl-card-head");
        head.append(text(el("span", "rl-time"), time), text(el("span", "rl-index"), `${index + 1}/${items.length}`));
        body.appendChild(head);
      } else {
        body.appendChild(text(el("div", "rl-time"), time));
      }
      body.appendChild(text(el("div", `rl-quote${item.orphan ? " is-orphan" : ""}`), item.comment.anchor));
      body.appendChild(text(el("div", "rl-text"), item.comment.comment));

      const foot = el("div", "rl-card-foot");
      const edit = el("button", "rl-cardbtn", `${ICON.edit}Edit`);
      const remove = el("button", "rl-cardbtn is-danger", `${ICON.remove}Delete`);
      edit.type = remove.type = "button";
      edit.addEventListener("click", () => this.startEdit(body, foot, item));

      const section = el("section", "rl-card-section");
      section.append(body, foot);
      remove.addEventListener("click", () => this.leave(item, card, section, items.length === 1));
      foot.append(edit, remove);

      card.appendChild(section);
    });

    if (!sameCard) {
      overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) this.closeCard();
      });
      overlay.appendChild(card);
      this.ui.appendChild(overlay);
      this.overlay = overlay;
    }
    this.layoutChips();
  }

  /**
   * Animated deletion: the card fades and settles, a stacked section collapses,
   * the highlight and chip fade in parallel. The file is written when the
   * animation ends, so the update does not redraw the card mid-motion.
   * With reduced-motion — immediately.
   */
  private leave(item: Placed, card: HTMLElement, section: HTMLElement, single: boolean): void {
    const id = item.comment.id;
    const line = item.comment.line;

    this.doc.querySelectorAll(`.rl-mark[data-id="${cssEscape(id)}"]`).forEach((m) => m.classList.add("is-leaving"));
    const lastOnLine = this.placed.filter((p) => p.comment.line === line).length === 1;
    if (lastOnLine) this.gutter.querySelector(`.rl-chip[data-line="${line}"]`)?.classList.add("is-leaving");

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.host.remove(id);
      if (single) this.closeCard();
    };

    const reduce = typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      finish();
      return;
    }

    if (single) {
      card.classList.add("is-leaving");
      card.addEventListener("animationend", finish, { once: true });
    } else {
      section.style.maxHeight = `${section.offsetHeight}px`;
      requestAnimationFrame(() => section.classList.add("is-leaving"));
      section.addEventListener("transitionend", (e) => {
        if (e.target === section && e.propertyName === "max-height") finish();
      });
    }
    setTimeout(finish, 400); // safety net in case the event never fires
  }

  closeCard(): void {
    this.overlay?.remove();
    this.overlay = null;
    if (this.openLine !== null) {
      this.openLine = null;
      this.openId = undefined;
      this.layoutChips();
    }
  }

  /**
   * Edit mode: the text becomes a field, `Edit`/`Delete` give way to `Save`.
   * On `Save`/`Cmd+Enter` the field turns back into text and the buttons return;
   * `Escape` does the same without saving.
   */
  private startEdit(body: HTMLElement, foot: HTMLElement, item: Placed): void {
    const textNode = body.querySelector<HTMLElement>(".rl-text");
    if (!textNode) return;

    const readButtons = Array.from(foot.children) as HTMLElement[];
    const save = el("button", "rl-cardbtn is-primary", `${ICON.send}Save`);
    save.type = "button";

    const field = el("textarea", "rl-field rl-field-edit");
    field.value = item.comment.comment;
    field.rows = Math.min(Math.max(item.comment.comment.split("\n").length, 1), 8);

    const finish = (commit: boolean) => {
      const next = field.value.trim();
      if (commit && next && next !== item.comment.comment) {
        this.host.update(item.comment.id, next);
        textNode.textContent = next; // the host will send an update, but show the text right away
      }
      field.replaceWith(textNode);
      save.replaceWith(...readButtons);
    };

    field.addEventListener("keydown", (e) => {
      keepUndoInField(e);
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    });
    save.addEventListener("click", () => finish(true));

    textNode.replaceWith(field);
    foot.replaceChildren(save);
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }

  /* ── Navigation ──────────────────────────────────────────────────── */

  /**
   * Next / previous comment in file order, wrapping around.
   * Counts from the open comment; if a whole line is open — from its first one;
   * if nothing is open — "next" gives the first, "prev" the last.
   * Opens a single comment (like a click on a highlight) and scrolls its block to the centre.
   */
  navigate(direction: "next" | "prev"): void {
    const all = this.placed;
    if (all.length === 0) return;

    let current = -1;
    if (this.openLine !== null) {
      current = all.findIndex(
        (p) => p.comment.line === this.openLine && (this.openId === undefined || p.comment.id === this.openId),
      );
    }

    const step = direction === "next" ? 1 : -1;
    const start = current === -1 ? (direction === "next" ? -1 : all.length) : current;
    const target = all[(start + step + all.length) % all.length] as Placed;

    const reduce = typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.block.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    this.openCard(target.comment.line, target.comment.id);
  }

  /* ── Global events ───────────────────────────────────────────────── */

  /** Escape closes whatever was opened last. */
  escape(): void {
    if (this.popover) this.closePopover();
    else if (this.overlay) this.closeCard();
    else this.hideAddButton();
  }

  onMouseDown(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (!target) return;
    if (this.ui.contains(target)) return;
    if (this.popover) this.closePopover();
    this.hideAddButton();
  }

  /** A click on a highlight or a chip opens the card. */
  onClick(event: MouseEvent): void {
    const target = (event.target as Element | null)?.closest<HTMLElement>(".rl-mark, .rl-chip");
    if (!target) return;
    event.preventDefault();
    this.toggleFor(target);
  }

  /**
   * A highlight opens only its own comment; a gutter chip opens every comment on the line.
   * A second click on the same target closes the card.
   */
  toggleFor(target: HTMLElement): void {
    const line = Number(target.dataset["line"]);
    if (!Number.isInteger(line)) return;
    const id = target.classList.contains("rl-mark") ? target.dataset["id"] : undefined;
    if (this.openLine === line && this.openId === id) this.closeCard();
    else this.openCard(line, id);
  }

  get isCardOpen(): boolean {
    return this.overlay !== null;
  }
}
