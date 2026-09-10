import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveImageInside, resolveInside } from "../src/safePath.js";

/**
 * A real directory tree, because the whole point is realpath and symlinks:
 *
 *   <tmp>/outside/secret.png
 *   <tmp>/root/img/a.png
 *   <tmp>/root/link.png        -> ../outside/secret.png   (file symlink escaping the root)
 *   <tmp>/root/linkdir         -> ../outside              (directory symlink escaping the root)
 *   <tmp>/rootlink             -> root                    (the root itself reached through a symlink)
 *   <tmp>/root/notes.txt
 *   <tmp>/root/fake.png        -> notes.txt               (image name, non-image target)
 *   <tmp>/root/alias.png       -> img/a.png               (image name, image target)
 */
function tree() {
  const base = mkdtempSync(join(tmpdir(), "redline-safepath-"));
  mkdirSync(join(base, "outside"));
  mkdirSync(join(base, "root", "img"), { recursive: true });
  writeFileSync(join(base, "outside", "secret.png"), "secret");
  writeFileSync(join(base, "root", "img", "a.png"), "image");
  symlinkSync(join(base, "outside", "secret.png"), join(base, "root", "link.png"));
  symlinkSync(join(base, "outside"), join(base, "root", "linkdir"));
  symlinkSync(join(base, "root"), join(base, "rootlink"));
  writeFileSync(join(base, "root", "notes.txt"), "not an image");
  symlinkSync(join(base, "root", "notes.txt"), join(base, "root", "fake.png"));
  symlinkSync(join(base, "root", "img", "a.png"), join(base, "root", "alias.png"));
  return base;
}

describe("resolveInside(root, target): the only way export is allowed to read a file", () => {
  const base = tree();
  const root = join(base, "root");

  // macOS puts the temp dir behind a symlink (/var → /private/var); the real path is what we expect back.
  const real = (p: string) => realpathSync.native(p);

  test("returns the real path of a file inside the root", () => {
    expect(resolveInside(root, join(root, "img", "a.png"))).toBe(real(join(root, "img", "a.png")));
  });

  test("resolves a root given through a symlink to the same real directory", () => {
    expect(resolveInside(join(base, "rootlink"), join(root, "img", "a.png"))).toBe(real(join(root, "img", "a.png")));
  });

  test("refuses `..` traversal out of the root", () => {
    expect(resolveInside(root, join(root, "..", "outside", "secret.png"))).toBeNull();
    expect(resolveInside(root, join(root, "img", "..", "..", "outside", "secret.png"))).toBeNull();
  });

  test("refuses a file symlink that points outside the root", () => {
    expect(resolveInside(root, join(root, "link.png"))).toBeNull();
  });

  test("refuses a file reached through a directory symlink that points outside the root", () => {
    expect(resolveInside(root, join(root, "linkdir", "secret.png"))).toBeNull();
  });

  test("refuses a sibling whose name merely starts with the root's name", () => {
    mkdirSync(join(base, "root-evil"));
    writeFileSync(join(base, "root-evil", "x.png"), "x");
    expect(resolveInside(root, join(base, "root-evil", "x.png"))).toBeNull();
  });

  test("refuses a path that does not exist, without throwing", () => {
    expect(resolveInside(root, join(root, "missing.png"))).toBeNull();
  });

  test("accepts the root directory itself as a target only for files, never directories", () => {
    expect(resolveInside(root, root)).toBeNull();
    expect(resolveInside(root, join(root, "img"))).toBeNull();
  });
});

describe("resolveImageInside: the extension check follows the symlink", () => {
  const base = tree();
  const root = join(base, "root");
  const real = (p: string) => realpathSync.native(p);

  test("accepts an image, directly or through a symlink to another image", () => {
    expect(resolveImageInside(root, join(root, "img", "a.png"))).toBe(real(join(root, "img", "a.png")));
    expect(resolveImageInside(root, join(root, "alias.png"))).toBe(real(join(root, "img", "a.png")));
  });

  test("refuses an image-named symlink that points at a non-image file", () => {
    expect(resolveImageInside(root, join(root, "fake.png"))).toBeNull();
  });

  test("refuses a non-image file even inside the root", () => {
    expect(resolveImageInside(root, join(root, "notes.txt"))).toBeNull();
  });
});
