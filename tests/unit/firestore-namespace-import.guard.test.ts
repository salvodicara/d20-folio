/// <reference types="node" />
/**
 * Guard: no `import("firebase/firestore")`. A dynamic import of the whole namespace
 * keeps every Firestore export in the shared Firebase chunk, which is eager: #814's
 * clock writes did it and pushed the eager download 7.7 KB gz over its ceiling. Load
 * the module that uses Firestore with `import()` instead, and let it import the named
 * functions it needs (`clock-io.ts`, `campaign-io.ts`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("Firestore is never imported as a dynamic namespace", () => {
  it("no file dynamically imports firebase/firestore", () => {
    const offenders = files(SRC)
      .filter((path) =>
        /import\(\s*["']firebase\/firestore["']\s*\)/.test(readFileSync(path, "utf8"))
      )
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });
});
