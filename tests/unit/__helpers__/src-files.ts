/// <reference types="node" />
/**
 * Shared, module-level-memoized crawl of the `src/` tree (S6).
 *
 * **Why:** ~20 source-tree guard tests each independently `readdirSync` +
 * `readFileSync` the whole (or a subtree of the) `src/` UI tree — the same disk
 * walk + the same file reads, repeated once per guard. That is O(guards × tree)
 * disk I/O for what is one immutable input within a single Vitest worker.
 *
 * This module performs the recursive crawl + per-file read EXACTLY ONCE per
 * worker process (the maps below are populated lazily on first access and cached
 * for the lifetime of the module). Every guard imports the shared input and keeps
 * ITS OWN predicate — identical assertions, shared (cached) intermediates.
 *
 * The crawl skips `node_modules` and dotfiles/dot-dirs (none live under `src`,
 * but cheap and safe). The result is a `path → content` map over EVERY file under
 * `src/` (all extensions — `.ts`, `.tsx`, `.css`, `.json`, …), so a CSS guard and
 * a TS guard share the SAME single walk. Convenience selectors filter that map by
 * subtree + extension; `readSrc(path)` returns the memoized content for any file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the repo's `src/` directory. */
export const SRC_ROOT = resolve(HERE, "..", "..", "..", "src");

/** Lazily-built, then frozen for the worker's lifetime. */
let FILE_MAP: ReadonlyMap<string, string> | null = null;

function crawl(dir: string, into: Map<string, string>): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      crawl(full, into);
    } else {
      into.set(full, readFileSync(full, "utf8"));
    }
  }
}

/**
 * The shared `absolutePath → fileContent` map over EVERY file under `src/`.
 * Built once per worker (lazy), then reused. Do not mutate.
 */
export function srcFileMap(): ReadonlyMap<string, string> {
  if (FILE_MAP === null) {
    const map = new Map<string, string>();
    crawl(SRC_ROOT, map);
    FILE_MAP = map;
  }
  return FILE_MAP;
}

/** Memoized content of a single source file (absolute path under `src/`). */
export function readSrc(absPath: string): string {
  const cached = srcFileMap().get(absPath);
  if (cached !== undefined) return cached;
  // Outside the cached `src/` tree (or read after the snapshot) — read directly.
  return readFileSync(absPath, "utf8");
}

/** Does `file` live within `dir` (or equal it)? Boundary-safe (no prefix bleed). */
function isUnder(file: string, dir: string): boolean {
  if (file === dir) return true;
  const prefix = dir.endsWith(sep) ? dir : dir + sep;
  return file.startsWith(prefix);
}

export interface SrcFilesOptions {
  /** Absolute directory to restrict to (defaults to the whole `src/` tree). */
  under?: string;
  /**
   * Lowercase file extensions to include, WITH the leading dot (e.g. `[".tsx"]`,
   * `[".ts", ".tsx"]`, `[".css"]`). Omit to include every file.
   */
  exts?: readonly string[];
}

/**
 * The absolute paths of source files matching `opts`, drawn from the shared crawl.
 * Each guard keeps its own predicate by reading content via `readSrc` (or the map).
 */
export function srcFiles(opts: SrcFilesOptions = {}): string[] {
  const { under = SRC_ROOT, exts } = opts;
  const out: string[] = [];
  for (const path of srcFileMap().keys()) {
    if (!isUnder(path, under)) continue;
    if (exts && !exts.some((e) => path.endsWith(e))) continue;
    out.push(path);
  }
  return out;
}
