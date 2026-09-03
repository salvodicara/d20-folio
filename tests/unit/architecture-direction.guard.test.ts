/// <reference types="node" />
/**
 * Guard: the dependency direction is ONE-WAY. The UI layer (`features/**`,
 * `app/**`, `components/**`, `hooks/**`) depends on the engine (`lib/**`,
 * `stores/**`, `data/**`, `types/**`), **never the reverse**. An engine module
 * importing any UI dir would invert the architecture — and could drag React/UI
 * (or Firebase, via an app-layer subscription) into the CI-pure engine tree, the
 * exact failure the pure-modules guard exists to prevent. Even a type-only
 * upward import is rejected: a domain type the engine produces belongs IN the
 * engine, with the UI importing it downward (see `lib/cast-options.ts →
 * CastLevelOption`, consumed by `components/sheet/CastLevelModal`).
 *
 * **Why this resolves imports instead of regex-matching `@/features`:** the
 * earlier version only caught the `@/`-alias spelling. A relative escape
 * (`../features/x`, `../../app/y`) would have slipped straight through. This
 * version resolves EVERY import spec to an absolute path (mirroring
 * `pure-modules-guard`) and flags any that land inside `src/features` or
 * `src/app`, regardless of how it was written — alias, relative, or deep. The
 * direction can't be inverted by spelling around the guard.
 *
 * To clear a violation, move the shared code DOWN into the engine, or invert the
 * call so the UI passes data in (see `features/roster/delete-character.ts` for the
 * canonical fix) — never import upward.
 *
 * **R2 — the localization line (docs/ARCHITECTURE.md).** This guard now
 * also locks the presenter seam:
 *   1. **engine-core never imports i18n** — `lib/**` (EXCEPT `lib/views/**`),
 *      `stores/**`, `data/**`, `types/**` must not import `@/i18n`, `i18next`, or
 *      `react-i18next`. Localization is the presenter's job; this REVERSES the old
 *      "a store may read the active locale" exemption (§8). It removes the whole
 *      "engine emits the wrong language" bug class and makes the engine testable
 *      with no i18n runtime.
 *   2. **engine-core never imports `lib/views`** — views depend on engine, never
 *      the reverse. `lib/views/**` is the ONLY engine-side layer permitted to
 *      localize (it may take a `locale` param + call `localizeSrd`); the UI may
 *      import it. The pure-modules guard separately pins `lib/views` React/store/
 *      Firebase-free.
 * Both checks resolve every import (alias OR relative) so they can't be spelled around.
 */
import { describe, expect, it } from "vitest";
import { statSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";
const ENGINE_DIRS = ["lib", "stores", "data", "types"] as const;
const UI_DIRS = ["features", "app", "components", "hooks"] as const;
const UI_ROOTS = UI_DIRS.map((d) => join(SRC, d));

// The presenter sub-layers. They live under `lib/` but are NOT engine-core: they
// may localize/format (take a `locale` + a bound `t`, read a `BiText`, call the
// unit formatters). Engine-core = the engine dirs MINUS these directories.
//   - `lib/views/**` — the canonical (locale, engine-output) → view-model seam.
//   - `lib/pdf/**`   — the character-sheet PDF presenter (the export analog of a
//     UI feature): it consumes `lib/views` + the engine and produces a localized,
//     render-ready PDF view-model, so it localizes exactly like a view. It is a
//     CONSUMER of the engine, never imported BY engine-core (pinned below).
const VIEWS_ROOT = join(SRC, "lib", "views");
const PDF_ROOT = join(SRC, "lib", "pdf");
const I18N_ROOT = join(SRC, "i18n");

// The ONE i18n module engine-core MAY import: the pure, English-only canonical-
// SRD-fact accessor (docs/ARCHITECTURE.md). It is locale-INDEPENDENT
// ("SRD facts as data", not localization — adding an app language never touches
// it), so the engine reading it never reads the active locale. The exemption is
// NARROW (exactly this file) and TRACKED+SHRINKING (every srdEn call site is
// enumerated in docs/AUTOMATION_BACKLOG.md → "srdEn shrink-list", each a candidate
// to replace the parsed-from-English fact with a structured data field). The
// resolver (localizeSrd) is NOT exempt — it stays UI/views-only.
const SRD_EN_MODULE = join(SRC, "i18n", "srd-en.ts");

// The companion to `srd-en.ts`: pure, locale-INDEPENDENT key-path math that
// reproduces the R3 codemod's stable catalogue keys (docs/ARCHITECTURE.md).
// Like `srd-en.ts` it never reads the active locale and carries no strings — it
// only computes the stable key the engine threads WITH the data (golden rule 7).
// Whitelisted on the same narrow grounds; the resolver stays UI/views-only.
const SRD_KEY_MODULE = join(SRC, "i18n", "srd-key.ts");

/** Is `absPath` inside a presenter sub-layer (`lib/views/` or `lib/pdf/`)? Those
 *  files MAY localize and MAY import the engine + other presenters. */
function isUnderViews(absPath: string): boolean {
  return (
    absPath === VIEWS_ROOT ||
    absPath.startsWith(VIEWS_ROOT + "/") ||
    absPath === PDF_ROOT ||
    absPath.startsWith(PDF_ROOT + "/")
  );
}

/** Does an import spec resolve to i18n infra (`@/i18n`, `i18next`, `react-i18next`)? */
function isI18nImport(spec: string, resolved: string | null): boolean {
  if (spec === "i18next" || spec === "react-i18next") return true;
  // The canonical-EN-facts accessor + the pure key-path helper are the
  // whitelisted exemptions (see above) — both locale-independent, no strings.
  if (resolved === SRD_EN_MODULE || resolved === SRD_KEY_MODULE) return false;
  if (resolved && (resolved === I18N_ROOT || resolved.startsWith(I18N_ROOT + "/")))
    return true;
  return false;
}

/** Every `from "…"` / `import("…")` specifier in a source file. */
function importSpecs(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[1]) specs.push(m[1]);
  }
  return specs;
}

/**
 * Resolve an import spec from `fromFile` to an absolute source path, or null when
 * it points outside /src (a bare node_modules specifier). Mirrors the resolver in
 * `pure-modules-guard`: `@/x` → `src/x`, `./` / `../` relative to the file.
 */
function resolveImport(fromFile: string, spec: string): string | null {
  let target: string;
  if (spec.startsWith("@/")) target = join(SRC, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../"))
    target = resolve(dirname(fromFile), spec);
  else return null; // bare specifier — node_modules
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(target + ext) && statSync(target + ext).isFile()) return target + ext;
  }
  // Unresolved (e.g. a directory without a barrel) — keep the bare target so the
  // under-UI check below still fires on the path it would have reached.
  return target;
}

function isUnderUi(absPath: string): boolean {
  return UI_ROOTS.some((root) => absPath === root || absPath.startsWith(root + "/"));
}

/** Every `.ts`/`.tsx` file under `src/<dir>`, from the shared (memoized) crawl. */
function collectTs(dir: string, out: string[]): void {
  out.push(...srcFiles({ under: dir, exts: [".ts", ".tsx"] }));
}

describe("architecture direction — the engine never imports the UI", () => {
  for (const dir of ENGINE_DIRS) {
    it(`src/${dir} has no imports into the UI layer (${UI_DIRS.join(" · ")}; any spelling)`, () => {
      const files: string[] = [];
      collectTs(resolve(SRC, dir), files);
      const offenders: string[] = [];
      for (const file of files) {
        const source = readSrc(file);
        for (const spec of importSpecs(source)) {
          const resolved = resolveImport(file, spec);
          if (resolved && isUnderUi(resolved)) {
            offenders.push(`${file.replace(SRC + "/", "src/")}: import "${spec}"`);
          }
        }
      }
      expect(
        offenders,
        `engine layer src/${dir} must not import the UI layer (${UI_DIRS.join(" · ")}). ` +
          `Move the shared code down into the engine, or invert the call so the UI ` +
          `passes data in — never import upward.`
      ).toEqual([]);
    });
  }
});

describe("R2 — engine-core never localizes (no i18n import outside lib/views)", () => {
  for (const dir of ENGINE_DIRS) {
    it(`src/${dir} (minus lib/views) imports no i18n (@/i18n · i18next · react-i18next)`, () => {
      const files: string[] = [];
      collectTs(resolve(SRC, dir), files);
      const offenders: string[] = [];
      for (const file of files) {
        if (isUnderViews(file)) continue; // the presenter layer MAY localize
        const source = readSrc(file);
        for (const spec of importSpecs(source)) {
          const resolved = resolveImport(file, spec);
          if (isI18nImport(spec, resolved)) {
            offenders.push(`${file.replace(SRC + "/", "src/")}: import "${spec}"`);
          }
        }
      }
      expect(
        offenders,
        `engine-core (src/${dir} minus lib/views) must not import i18n. Localization is ` +
          `the presenter's job: emit ids + raw numbers + i18n keys/args, and localize ` +
          `in lib/views/ or a UI hook (toasts-as-data). docs/ARCHITECTURE.md`
      ).toEqual([]);
    });
  }
});

describe("R2 — engine-core never imports the presenter layer (lib/views)", () => {
  it("src/lib (minus lib/views), src/stores, src/data, src/types don't import lib/views", () => {
    const offenders: string[] = [];
    for (const dir of ENGINE_DIRS) {
      const files: string[] = [];
      collectTs(resolve(SRC, dir), files);
      for (const file of files) {
        if (isUnderViews(file)) continue; // views importing each other is fine
        const source = readSrc(file);
        for (const spec of importSpecs(source)) {
          const resolved = resolveImport(file, spec);
          if (resolved && isUnderViews(resolved)) {
            offenders.push(`${file.replace(SRC + "/", "src/")}: import "${spec}"`);
          }
        }
      }
    }
    expect(
      offenders,
      `engine-core must not import lib/views — views depend on the engine, never the ` +
        `reverse. If engine-core needs a presenter's value, the dependency is inverted: ` +
        `move the shared mechanics DOWN, or have the UI/view call the engine. §1.1.`
    ).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// `lib/tools.ts` stays DEPENDENCY-LIGHT — no `@/i18n/srd-en` (bundle-chunk root cause)
// ════════════════════════════════════════════════════════════════════════════
//
// `@/i18n/srd-en` statically bundles the WHOLE EN SRD corpus (~250 KB gz —
// spells + magic-items + class-features + …). `lib/tools.ts` is the tool CATALOGUE
// (ids + categories + derived id-lists, NO names): it is VALUE-imported by class
// DATA (`src/data/classes/{monk,bard}.ts`, the `srd-classes` bundle chunk) for its
// tool-id lists. When #107 made `tools.ts` `import { srdEn }`, Rolldown inlined the
// whole EN corpus INTO the `srd-classes` chunk (258 KB gz eager — `bundle-budget`
// guard red). The fix restored the contract: the srd-en-needing NAME resolvers
// live in `lib/tool-names.ts` (a CONSUMER-side module the class data never imports),
// and `tools.ts` carries NO `@/i18n` import. This guard pins that contract at source
// level — a cheap, precise companion to the dist-level `bundle-budget.guard` so the
// exact regression edge (`data/classes → lib/tools → srd-en`) can't silently return.
describe("lib/tools.ts is dependency-light — never imports @/i18n (bundle-chunk root cause)", () => {
  it("src/lib/tools.ts has no @/i18n import (it is VALUE-imported by the srd-classes data chunk)", () => {
    const text = readSrc(resolve(SRC, "lib", "tools.ts"));
    const offenders = importSpecs(text).filter((spec) => {
      const resolved = resolveImport(resolve(SRC, "lib", "tools.ts"), spec);
      // Any `@/i18n/**` import (srd-en included) is forbidden here — the catalogue
      // must stay corpus-free so importing it from class data costs nothing.
      return (
        spec.startsWith("@/i18n") ||
        (!!resolved && (resolved === I18N_ROOT || resolved.startsWith(I18N_ROOT + "/")))
      );
    });
    expect(
      offenders,
      `src/lib/tools.ts must NOT import @/i18n (found: ${offenders.join(", ")}). It is the ` +
        `dependency-light tool catalogue VALUE-imported by class data (the srd-classes chunk); ` +
        `importing @/i18n/srd-en inlines the whole EN SRD corpus into that chunk (#107 budget ` +
        `regression). The srd-en-needing NAME resolvers belong in lib/tool-names.ts, imported ` +
        `only by the proficiency/inventory CONSUMERS — never by src/data/classes/**.`
    ).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// R6 SLICE 6 — engine-core emits NO localized strings (the locale-READ ratchet)
// ════════════════════════════════════════════════════════════════════════════
//
// The destination (docs/ARCHITECTURE.md): engine-core reads NO active locale
// — a `BiText` is carried as DATA (`{ en, it }`) and resolved to a string ONLY in
// `lib/views/` or a UI hook. The unambiguous tell of a locale READ is a DYNAMIC
// `[locale]` index (`x[locale]`, `x.name[locale]`) — it picks the active
// language. (A static `.en` read is canonical-SRD-FACT access, not localization —
// `name.en` as a stable id/search key — so it is NOT what this guard chases.)
//
// SLICE 7 CLOSED THE FRONTIER: the allowlist is now EMPTY. The four grandfathered
// modules were resolved — `srd-i18n` + `spell-cast-sources` moved INTO `lib/views/`
// (they are pure presenters, consumed only by UI/views); `lore-utils`'s single
// active-locale read (`localizeSrdString`) moved into `lib/views/srd-i18n.ts`
// (`resolveSrdToken` is locale-AGNOSTIC and stays in engine-core); `data/equipment`'s
// `searchEquipment` (its only `[locale]` read, dead — no production caller) was
// deleted. So engine-core now makes ZERO dynamic `[locale]` reads, FULL STOP — any
// `[locale]` index anywhere under lib (minus views) / stores / data / types fails the
// guard. Comments/strings containing the token are stripped so a doc reference to
// `[locale]` never trips it.
describe("R6 — engine-core reads no active locale (the [locale]-index HARD PIN)", () => {
  // Every de-localized engine module MUST stay at zero dynamic [locale] reads. The
  // tracker/action + level-up emitters (SLICE 6) and the whole engine-core surface
  // (SLICE 7) are pinned together — the frontier is closed, the allowlist is empty.
  const PINNED_CLEAN = ["lib/smart-tracker.ts", "lib/level-up.ts"] as const;

  // The grandfathered frontier is EMPTY — SLICE 7 routed every active-locale read
  // into `lib/views/` (or deleted it). Re-adding a file here is the wrong direction;
  // the contract is now "zero engine-core [locale] reads", enforced absolutely below.
  const GRANDFATHERED: readonly string[] = [];

  /** Strip line- and block-comments + string literals so only CODE is scanned. */
  function stripCommentsAndStrings(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/`(?:\\.|[^`\\])*`/g, "``")
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''");
  }

  /** Engine-core files (lib minus views, stores, data, types) with a dynamic
   *  `[locale]` index in CODE — returned as `src/…`-relative paths. */
  function filesWithLocaleIndex(): string[] {
    const hits: string[] = [];
    for (const dir of ENGINE_DIRS) {
      const files: string[] = [];
      collectTs(resolve(SRC, dir), files);
      for (const file of files) {
        if (isUnderViews(file)) continue; // views MAY localize
        const code = stripCommentsAndStrings(readSrc(file));
        if (/\[locale\]/.test(code)) hits.push(file.replace(SRC + "/", "src/"));
      }
    }
    return hits.sort();
  }

  it("the de-localized modules make ZERO dynamic [locale] reads", () => {
    const offenders = filesWithLocaleIndex().filter((f) =>
      PINNED_CLEAN.some((p) => f === `src/${p}`)
    );
    expect(
      offenders,
      `These engine modules were de-localized in SLICE 6 and must emit BiText/ids ` +
        `only — a dynamic [locale] read regressed the contract. Carry the data and ` +
        `localize in lib/views/ (docs/ARCHITECTURE.md).`
    ).toEqual([]);
  });

  it("NO engine-core file indexes by [locale] (the frontier is closed)", () => {
    const allowed = new Set(GRANDFATHERED.map((f) => `src/${f}`));
    const unexpected = filesWithLocaleIndex().filter((f) => !allowed.has(f));
    expect(
      unexpected,
      `An engine-core [locale] read appeared. Engine-core reads NO active locale ` +
        `(SLICE 7 closed the frontier — the allowlist is empty): carry BiText as data ` +
        `+ localize in lib/views/ or a UI hook (docs/ARCHITECTURE.md).`
    ).toEqual([]);
  });
});
