/**
 * Boundary guard for the encounter's Firestore adapters.
 *
 * `src/lib/combat-io.ts` and `src/lib/combat-lease.ts` are the only modules that know the
 * encounter lives in a document, and their import boundary is load-bearing: they take a
 * `Firestore` instance from the caller and NEVER reach for the app's singleton
 * (`@/lib/firebase`). That is what lets the emulator suites run this exact code, unmocked,
 * under two authenticated contexts at once — the two-client gate would be impossible
 * otherwise. They are equally not UI: no React, no Zustand, no feature, store, component or
 * i18n import may cross into them.
 *
 * The module header of `combat-io.ts` argues why; this pins it.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = ["src/lib/combat-io.ts", "src/lib/combat-lease.ts"];

/** Every specifier these two modules are allowed to import from. */
const ALLOWED = [
  /^firebase\/firestore$/,
  /^(?:\.\/combat|@\/lib\/combat)\/[\w-]+$/,
  /^(?:\.|@\/lib)\/strip-undefined$/,
  /^(?:\.|@\/lib)\/combat-io$/,
];

/** Named for the error message: these are the imports the boundary exists to keep out. */
const FORBIDDEN: readonly [string, RegExp][] = [
  ["@/lib/firebase (the app singleton)", /^@\/lib\/firebase(?:\/|$)/],
  ["react", /^react(?:-dom)?(?:\/|$)/],
  ["zustand", /^zustand(?:\/|$)/],
  ["@/features", /^@\/features(?:\/|$)/],
  ["@/stores", /^@\/stores(?:\/|$)/],
  ["@/components", /^@\/components(?:\/|$)/],
  ["@/i18n", /^@\/i18n(?:\/|$)/],
];

function specifiers(text: string): string[] {
  return [...text.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1] ?? "");
}

describe("boundary — the encounter Firestore adapters", () => {
  it("import only `firebase/firestore` and pure siblings", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(resolvePath(process.cwd(), file), "utf8");
      for (const specifier of specifiers(text)) {
        const named = FORBIDDEN.find(([, pattern]) => pattern.test(specifier));
        if (named) offenders.push(`${file}: ${specifier} (${named[0]})`);
        else if (!ALLOWED.some((pattern) => pattern.test(specifier))) {
          offenders.push(`${file}: ${specifier} (not on the allowlist)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the allowlist is not vacuous — it would catch the app singleton", () => {
    // Assembled from string pieces, with no whitespace-then-quote boundary after the word
    // "from": the repo-wide Firebase-import scan (tests/unit/pure-modules-guard.test.ts) reads
    // this file's raw source text and would otherwise misidentify this synthetic fixture as a
    // real import of the app singleton.
    const source = [
      "import { db } from",
      " ",
      JSON.stringify("@/lib/firebase"),
      ";",
    ].join("");
    const forbidden = specifiers(source);
    expect(forbidden).toEqual(["@/lib/firebase"]);
    expect(ALLOWED.some((pattern) => pattern.test("@/lib/firebase"))).toBe(false);
  });
});
