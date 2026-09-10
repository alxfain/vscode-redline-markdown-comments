/**
 * Path containment for files the exporter is allowed to read.
 *
 * Both the root and the target go through `realpath` first, so `..`,
 * symlinks pointing outside the root, and case differences on
 * case-insensitive filesystems are all resolved before the check.
 * A plain `startsWith` on the unresolved path would be fooled by every one of them.
 *
 * Fail closed: anything that cannot be resolved, is not a regular file, or
 * ends up outside the root yields `null`.
 */

import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"]);

/**
 * Like `resolveInside`, but both the requested path and the real file must
 * have an image extension — a symlink named `x.png` pointing at `notes.txt`
 * inside the root is still refused.
 */
export function resolveImageInside(root: string, target: string): string | null {
  const real = resolveInside(root, target);
  if (!real) return null;
  const ext = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext(target)) && IMAGE_EXTENSIONS.has(ext(real)) ? real : null;
}

/** The real path of `target` if it is a regular file strictly inside `root`; otherwise `null`. */
export function resolveInside(root: string, target: string): string | null {
  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = realpathSync.native(root);
    realTarget = realpathSync.native(target);
  } catch {
    return null;
  }

  try {
    if (!statSync(realTarget).isFile()) return null;
  } catch {
    return null;
  }

  const rel = relative(realRoot, realTarget);
  if (rel === "" || isAbsolute(rel)) return null; // the root itself, or another drive
  if (rel.split(sep)[0] === "..") return null; // escapes the root

  return realTarget;
}
