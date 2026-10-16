/**
 * The runtime `@pack` resolution — the production build's content pack.
 *
 * The public bundle carries no private content. This module waits (top-level
 * await) for the signed-in account's pack: allowlisted accounts (the `pack`
 * auth claim) get the JSON from protected Storage, everyone else gets the same
 * empty pack as `src/data/pack-empty.ts`. Every module that imports `@pack`
 * evaluates after this one, so the data layer composes exactly what it composes
 * in the bundled build. Same named exports as the other two resolutions; it also
 * serves the `@pack/monsters`, `@pack/monster-art` and `@pack/item-art`
 * sub-entries. See docs/ARCHITECTURE.md → "The content-pack seam".
 */
import * as empty from "@/data/pack-empty";
import type {
  PackLazySrdLoader,
  PackSrdLoader,
  SrdCataloguePatch,
} from "@/data/pack-types";
import type { SrdCatalogue } from "@/i18n/srd-en";
import { readPackFile, runtimePackCore } from "@/platform/pack-firebase";

const core = await runtimePackCore;
const pack = core ?? { ...empty, index: { srd: [], lazySrd: [] } };

export const packSpells = pack.packSpells;
export const packFeats = pack.packFeats;
export const packRaces = pack.packRaces;
export const packBackgroundsRaw = pack.packBackgroundsRaw;
export const packBackgroundEquipment = pack.packBackgroundEquipment;
export const packMagicItems = pack.packMagicItems;
export const packManeuvers = pack.packManeuvers;
export const packBeasts = pack.packBeasts;
export const packMonsters = pack.packMonsters;
export const packMonsterArt = pack.packMonsterArt;
export const packItemArt = pack.packItemArt;
export const packClassTables = pack.packClassTables;
export const packClassFeatures = pack.packClassFeatures;
export const packSubclasses = pack.packSubclasses;
export const packQuickbuildPresets = pack.packQuickbuildPresets;
export const packGrantExtensions = pack.packGrantExtensions;
export const packNameCatalogues = pack.packNameCatalogues;
export const packSrdEn = pack.packSrdEn;
export const srdOverlay = pack.srdOverlay;
export const uiOverlay = pack.uiOverlay;

/** The lazy prose has its own module (`pack-runtime-prose.ts`). */
export const packSrdEnProse = empty.packSrdEnProse;

export const loadPackSrdCatalogues: PackSrdLoader = async (locale) =>
  pack.index.srd.includes(locale)
    ? ((await readPackFile(`srd-${locale}.json`)) as SrdCataloguePatch)
    : {};

export const loadPackLazySrd: PackLazySrdLoader = async (locale, kind) =>
  pack.index.lazySrd.some((entry) => entry.join("/") === `${locale}/${kind}`)
    ? ((await readPackFile(`lazy-${kind}-${locale}.json`)) as SrdCatalogue)
    : undefined;

/** Dev-only: fixtures and scenarios stay with the local pack. */
export const packFixtures = empty.packFixtures;
export const packScenarios = empty.packScenarios;

/** Compile-time proof that this resolution exports what the other two do. */
type SameShapeAs<T extends typeof empty> = T;
export type RuntimePackShape = SameShapeAs<typeof import("./pack-runtime")>;
