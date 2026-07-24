/**
 * Eager-partition tripwires — cheap source-scans that pin invariants the
 * bundle-budget BFS cannot see (it follows only static `import "./x.js"` edges).
 *
 *  - M1 (D-1): `route-prefetch.ts` must not idle-prefetch the codex browse route.
 *    Left in, the monster corpus + BOTH locale catalogues would download ~2 s
 *    after every app start despite being "lazy" — invisible to every other guard.
 *  - The lazy `monsters.json` shard must never be STATICALLY imported into the
 *    eager EN facts bundle (public `srd-en.ts` or the pack's `i18n/en.ts`).
 *  - `data/beasts/beasts.ts` must not import from `data/monsters` (D-5): the eager
 *    Polymorph projection is REGENERATED from the corpus, never runtime-coupled to
 *    it, so the eager graph can never grow.
 *  - `picker/index.ts` must never re-export `from "./specs"` (D-2): the barrel
 *    statically imports `monsterSpec` → the `@/data/monsters` corpus, and the cockpit
 *    add-modals import the concrete specs through this index — a barrel re-export
 *    would drag the lazy bestiary corpus into their chunk. The concrete specs
 *    re-export from their own modules; the barrel aggregate is reached only from
 *    the lazy compendium route + the palette `import()`, each of which awaits
 *    `ensureSrdKind("monster")` before it renders (the load-before-render gate that
 *    used to be a barrel TLA — moved out because a TLA fragmented the eager closure).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");

describe("eager-partition tripwires", () => {
  it("route-prefetch never references the codex browse route (M1)", () => {
    const src = read("src/app/route-prefetch.ts");
    expect(src).not.toMatch(/importCompendium/);
    expect(src).not.toMatch(/compendium/i);
  });

  it("the public EN facts bundle never statically imports the lazy monster shard", () => {
    expect(read("src/i18n/srd-en.ts")).not.toContain("srd/monsters.json");
  });

  it("the pack EN facts bundle never statically imports the lazy monster shard", () => {
    const rel = "content-pack/i18n/en.ts";
    if (!existsSync(join(REPO_ROOT, rel))) return; // SRD-only checkout: no pack
    expect(read(rel)).not.toContain("srd/monsters.json");
  });

  it("the eager beast catalogue does not import from data/monsters (D-5)", () => {
    expect(read("src/data/beasts/beasts.ts")).not.toContain("data/monsters");
  });

  it("the picker index never re-exports from the side-effectful specs barrel (D-2)", () => {
    // The cockpit add-modals import the concrete specs through this index; a
    // `from "./specs"` re-export would pull the barrel's monster-catalogue TLA
    // (and thus the lazy corpus) into their chunk graph.
    expect(read("src/features/compendium/picker/index.ts")).not.toMatch(
      /from\s+["']\.\/specs["']/
    );
  });
});
