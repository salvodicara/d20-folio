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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");

/** Every `.ts`/`.tsx` under `rel`, recursively, as repo-relative POSIX paths. */
function sourceFilesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs)) {
      const child = join(abs, entry);
      if (statSync(child).isDirectory()) walk(child);
      else if (/\.(ts|tsx)$/.test(entry))
        out.push(relative(REPO_ROOT, child).split("\\").join("/"));
    }
  };
  walk(join(REPO_ROOT, rel));
  return out;
}

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

  it("the campaigns feature reaches the bestiary only through the lazy encounter-bestiary seam", () => {
    // DERIVED input (rule 13): sweep EVERY file in the campaigns dir — a moved/renamed
    // file can't slip past a hand-list. Only `encounter-bestiary.tsx` may statically
    // import the corpus/monster spec; every OTHER file must reach it via a dynamic
    // `import("./encounter-bestiary")`, and every such dynamic import must be paired
    // with the `ensureSrdKind("monster")` catalogue gate (both lazy doors).
    //
    // Blind spot (rule 13): this scans one directory's DIRECT import literals — it
    // cannot see a TRANSITIVE leak (a campaigns file importing a shared module that
    // itself imports the corpus) nor an alias-renamed path. The compendium-side D-2
    // tripwires and the precache ceiling remain the backstops. Mutation-proved by
    // temporarily adding `import { MONSTERS } from "@/data/monsters"` to Party.tsx.
    // The seam is TWO sibling files, both reachable only from the lazy chunk:
    // `encounter-bestiary.tsx` (the components) + `encounter-monster-spec.ts` (the
    // corpus-bearing spec factory, split out so the .tsx stays component-only for
    // react-refresh). Only these may statically reach the corpus / monster spec.
    const SEAM = new Set(["encounter-bestiary.tsx", "encounter-monster-spec.ts"]);
    const dir = join(REPO_ROOT, "src/features/campaigns");
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(10); // derived set non-empty (a moved dir can't empty it)
    for (const f of files) {
      const src = read(`src/features/campaigns/${f}`);
      if (!SEAM.has(f)) {
        expect(src, f).not.toMatch(/from\s+["']@\/data\/monsters/);
        expect(src, f).not.toMatch(/picker\/specs\/monster/);
        // Only `import("./encounter-bestiary")` (dynamic) is allowed elsewhere; a
        // static import of either seam file would pull the corpus into an eager path.
        expect(src, f).not.toMatch(/from\s+["']\.\/encounter-bestiary["']/);
        expect(src, f).not.toMatch(/from\s+["']\.\/encounter-monster-spec["']/);
      }
      // BOTH lazy factories must pair the dynamic import with the catalogue gate.
      if (/import\(["']\.\/encounter-bestiary["']\)/.test(src)) {
        expect(src, `${f}: dynamic import must gate on ensureSrdKind("monster")`).toMatch(
          /ensureSrdKind\(["']monster["']\)/
        );
      }
    }
  });

  it("the character feature + engine libs reach the corpus ONLY through the lazy familiar seam", () => {
    // DERIVED input (rule 13): sweep EVERY source file under src/lib and
    // src/features/character — a moved/renamed file can't slip past a hand-list.
    // Only the SEAM files (the lazy familiar leaf) may statically import the corpus
    // or the monster spec; every OTHER file in the cockpit/engine closure must not,
    // or the eager startup bundle grows the ~250 KB bestiary + both locale shards.
    //
    // Blind spot (rule 13): this scans DIRECT import literals only — it cannot see a
    // TRANSITIVE leak (a scanned file importing a shared module that itself imports
    // the corpus) nor an alias-renamed path; the bundle-budget BFS + PWA precache
    // ceiling are the backstops. Mutation-proved by temporarily adding
    // `import { MONSTERS } from "@/data/monsters"` to ResourceRail.tsx (watch it fail).
    const SEAM = new Set<string>([
      "src/lib/familiar.ts",
      "src/features/character/companions/familiar-picker.tsx",
      "src/features/character/companions/FamiliarPanel.tsx",
    ]);
    const files = [
      ...sourceFilesUnder("src/lib"),
      ...sourceFilesUnder("src/features/character"),
    ];
    expect(files.length).toBeGreaterThan(50); // derived set non-empty (a moved dir can't empty it)
    // Every SEAM file that EXISTS must actually import the corpus — a stale seam
    // entry (a renamed/removed leaf) can't quietly widen the allowlist.
    for (const seam of SEAM) {
      if (!existsSync(join(REPO_ROOT, seam))) continue;
      expect(read(seam), `${seam}: seam file must import the corpus`).toMatch(
        /from\s+["']@\/data\/monsters/
      );
    }
    for (const f of files) {
      if (SEAM.has(f)) continue;
      const src = read(f);
      expect(src, f).not.toMatch(/from\s+["']@\/data\/monsters/);
      expect(src, f).not.toMatch(/picker\/specs\/monster/);
    }
  });
});
