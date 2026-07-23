/**
 * Per-locale lazy catalogue loaders (R6+R3 SLICE 8).
 *
 * The i18n catalogues are split into per-domain shards under
 * `src/i18n/<locale>/{ui,srd}/*.json`. This module exposes lazy `import()`
 * loaders for them via Vite's `import.meta.glob`, so the bundler CODE-SPLITS each
 * locale's catalogue into its own chunk and the app downloads ONLY the active
 * locale's strings at startup (the other locale is fetched on demand when the
 * user switches language).
 *
 * - `ui/*.json` — the chrome shards (split from the old `common.json`); merged
 *   back into the single runtime `common` namespace at bootstrap (zero call-site
 *   churn — every `t("group.key")` keeps working).
 * - `srd/*.json` — the lifted SRD content strings (display); registered into the
 *   `srd-en.ts` registry for the resolver. EN srd is NOT loaded here — it is
 *   statically bundled in `srd-en.ts` as the canonical FACTS source (always
 *   loaded). So this only ever lazy-loads the NON-EN srd catalogues.
 *
 * PURE infra: no React, no stores. Returns plain data the bootstrap assembles.
 */
import type { Locale } from "@/lib/locale";
import { mergeCatalogue } from "@/lib/pack-merge";
import { loadPackLazySrd, loadPackSrdCatalogues, srdOverlay, uiOverlay } from "@pack";
import {
  SRD_KINDS,
  type LazySrdKind,
  type SrdCatalogue,
  type SrdCatalogueSet,
  type SrdKind,
} from "./srd-en";

type JsonModule = { default: Record<string, unknown> };
type Loader = () => Promise<JsonModule>;

// Eager-glob the loader FUNCTIONS (not the modules) — Vite emits one lazy chunk
// per matched file, keyed by its path relative to THIS module.
const UI_GLOB = import.meta.glob<JsonModule>("./*/ui/*.json");
const SRD_GLOB = import.meta.glob<JsonModule>("./*/srd/*.json");

/** Pick the loaders whose path is under `./<locale>/<group>/`. */
function loadersFor(
  glob: Record<string, Loader>,
  locale: Locale,
  group: "ui" | "srd"
): Loader[] {
  const prefix = `./${locale}/${group}/`;
  return Object.entries(glob)
    .filter(([path]) => path.startsWith(prefix))
    .map(([, loader]) => loader);
}

/**
 * The on-disk shard file name for each catalogue kind (not all pluralize).
 * Exported so the content pack's loader (`content-pack/i18n/loader.ts`) derives
 * its inverse from the SAME map — one vocabulary, no drift pair.
 */
export const SRD_FILE: Record<SrdKind, string> = {
  spell: "spells",
  feat: "feats",
  race: "races",
  background: "backgrounds",
  condition: "conditions",
  equipment: "equipment",
  "magic-item": "magic-items",
  maneuver: "maneuvers",
  metamagic: "metamagic",
  invocation: "invocations",
  class: "classes",
  subclass: "subclasses",
  "class-feature": "class-features",
  "weapon-mastery": "weapon-masteries",
  language: "languages",
  proficiency: "proficiencies",
  "weapon-property": "weapon-properties",
  beasts: "beasts",
  monster: "monsters",
};

/**
 * Load + merge ALL of a locale's `ui/*.json` shards into one flat resource object
 * (the runtime `common` namespace). Each shard is `{ <group>: { … } }`, so a
 * plain object-assign reconstructs the original monolith shape.
 */
export async function loadUiResources(locale: Locale): Promise<Record<string, unknown>> {
  const mods = await Promise.all(loadersFor(UI_GLOB, locale, "ui").map((l) => l()));
  const merged: Record<string, unknown> = {};
  for (const m of mods) Object.assign(merged, m.default);
  // Content-pack chrome-label restores (group-level patches; identity when no
  // pack) — e.g. the composed wording of the "heritage" feat-category label.
  // A patch aimed at a group the shards don't ship THROWS, mirroring
  // mergeCatalogue's fail-loud contract (a drifted pack never half-merges).
  for (const [group, patch] of Object.entries(uiOverlay[locale] ?? {})) {
    const base = merged[group];
    if (base === undefined) {
      throw new Error(`[content-pack] uiOverlay patches missing ui group "${group}"`);
    }
    merged[group] = { ...(base as Record<string, unknown>), ...patch };
  }
  return merged;
}

/**
 * Load a NON-EN locale's `srd/*.json` shards and assemble them into a full
 * `SrdCatalogueSet` keyed by `SrdKind`. (EN is never passed here — it is the
 * statically-bundled facts source.) The shard file name is the catalogue kind
 * (`spells.json` → `spell`, `magic-items.json` → `magic-item`).
 */
export async function loadSrdCatalogues(locale: Locale): Promise<SrdCatalogueSet> {
  const prefix = `./${locale}/srd/`;
  const packCats = await loadPackSrdCatalogues(locale);
  const overlay = srdOverlay[locale];
  const entries = await Promise.all(
    SRD_KINDS.map(async (kind) => {
      const path = `${prefix}${SRD_FILE[kind]}.json`;
      const loader = SRD_GLOB[path];
      if (!loader) throw new Error(`[i18n] missing srd catalogue ${path}`);
      const mod = await loader();
      const base = mod.default as unknown as SrdCatalogue;
      // Compose public + the pack's additions + the pack's overlay patches
      // (PHB display-name/prose restores) — identity when no pack.
      return [kind, mergeCatalogue(kind, base, packCats[kind], overlay?.[kind])] as const;
    })
  );
  return Object.fromEntries(entries) as SrdCatalogueSet;
}

/**
 * Load + compose ONE lazy SRD kind's shard for ONE locale — the lazy-tier twin of
 * {@link loadSrdCatalogues}. Composes the public shard (SRD_GLOB already matches
 * `./en/srd/*.json`, so EN monster loads lazily HERE, never eagerly in srd-en) +
 * the pack's lazy shard (`loadPackLazySrd`) + the pack's overlay patches, via the
 * strict `mergeCatalogue`. Registered by `ensureSrdKind` (src/i18n/index.ts).
 */
export async function loadLazySrdKind(
  locale: Locale,
  kind: LazySrdKind
): Promise<SrdCatalogue> {
  const path = `./${locale}/srd/${SRD_FILE[kind]}.json`;
  const loader = SRD_GLOB[path];
  if (!loader) throw new Error(`[i18n] missing lazy srd catalogue ${path}`);
  const base = (await loader()).default as unknown as SrdCatalogue;
  const additions = await loadPackLazySrd(locale, kind);
  return mergeCatalogue(kind, base, additions, srdOverlay[locale]?.[kind]);
}
