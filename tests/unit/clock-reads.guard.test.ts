/// <reference types="node" />
/**
 * Guard: one clock per scope. A character in a campaign reads its time of day from
 * the campaign clock, so no reader may take it from `session.timeOfDay` directly:
 * every read goes through `clockFor` (src/lib/play/clock.ts). The files below hold
 * the sheet's own clock (storage, sanitizing, and the transitions that move a solo
 * sheet's clock); nothing else names the field.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../../src");

const OWNERS = new Set([
  "lib/play/clock.ts",
  "lib/session-state-codec.ts",
  "lib/sanitize-session.ts",
  "types/character.ts",
  // The transitions that move a solo sheet's own clock.
  "lib/play/time.ts",
  "lib/play/rests.ts",
  "features/character/rest-world-boundary.ts",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("the time of day is read through clockFor", () => {
  it("no file outside the clock's owners names session.timeOfDay", () => {
    const readers = files(SRC)
      .filter((path) => !OWNERS.has(relative(SRC, path)))
      .filter((path) => /session\??\.timeOfDay\b/.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC, path));
    expect(readers).toEqual([]);
  });

  it("each owner still names it (the list is not stale)", () => {
    for (const owner of OWNERS) {
      expect(readFileSync(join(SRC, owner), "utf8"), owner).toMatch(/timeOfDay/);
    }
  });
});
