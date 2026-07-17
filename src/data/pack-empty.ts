/**
 * The SRD-only `@pack` resolution — a typed-empty content pack.
 *
 * When the private `content-pack/` is absent (the public repo snapshot) or
 * disabled (`VITE_CONTENT_PACK=0`), the `@pack` alias resolves here and every
 * merge point composes exactly the public SRD 5.2.1 catalogue: empty entry
 * arrays, an identity overlay, no fixtures, no scenarios. Same named exports
 * (and shapes — `src/data/pack-types.ts`) as `content-pack/index.ts`.
 * See docs/ARCHITECTURE.md → "The content-pack seam".
 */
import type {
  BackgroundEquipmentOption,
  BeastStatBlock,
  BiText,
  SrdBackgroundData,
  SrdClassFeatureData,
  SrdClassTable,
  SrdFeatData,
  SrdMagicItemData,
  SrdRaceData,
  SrdSpellData,
  SrdSubclassInfo,
} from "@/data/types";
import type { SrdManeuver } from "@/data/maneuvers";
import type { NamedEntry } from "@/data/srd-names";
import type { ScenarioSpec } from "@/lib/dev-scenarios";
import type {
  PackFixtureLoaders,
  PackSrdLoader,
  PackSrdOverlay,
  PackUiOverlay,
  SrdCataloguePatch,
} from "@/data/pack-types";

export const packSpells: SrdSpellData[] = [];
export const packFeats: SrdFeatData[] = [];
export const packRaces: SrdRaceData[] = [];
export const packBackgroundsRaw: Omit<SrdBackgroundData, "grants">[] = [];
export const packBackgroundEquipment: Readonly<
  Record<string, ReadonlyArray<BackgroundEquipmentOption>>
> = {};
export const packMagicItems: SrdMagicItemData[] = [];
export const packManeuvers: SrdManeuver[] = [];
export const packBeasts: BeastStatBlock[] = [];
export const packClassTables: SrdClassTable[] = [];
export const packClassFeatures: SrdClassFeatureData[] = [];
export const packSubclasses: Readonly<Record<string, readonly SrdSubclassInfo[]>> = {};

export const packClassNames: readonly BiText[] = [];
export const packSubclassNames: readonly NamedEntry[] = [];
export const packRaceNames: readonly NamedEntry[] = [];
export const packBackgroundNames: readonly NamedEntry[] = [];

/** EN SRD catalogue additions for pack entries (statically bundled, like EN). */
export const packSrdEn: SrdCataloguePatch = {};

/** Lazy non-EN SRD catalogue additions for pack entries. */
export const loadPackSrdCatalogues: PackSrdLoader = () => Promise.resolve({});

/** Field-level i18n restores over public entries (identity when no pack). */
export const srdOverlay: PackSrdOverlay = {};

/** UI-chrome label restores (identity when no pack). */
export const uiOverlay: PackUiOverlay = {};

/** Team-fixture loaders (none without the pack). */
export const packFixtures: PackFixtureLoaders = {};

/** Dev-scenario specs exercising pack content (none without the pack). */
export const packScenarios: Readonly<Record<string, ScenarioSpec>> = {};
