import type { Grant } from "@/lib/grants";
import { skillNameToId } from "@/lib/compute";
import type { SrdBackgroundData, SrdIndex, BackgroundEquipmentOption } from "./types";
import {
  STARTING_EQUIPMENT_BY_BG,
  resolveStartingEquipment,
  type ResolvedStartingEquipment,
} from "./background-equipment";
import { backgroundIdByName } from "./srd-names";
import { mergePack } from "@/lib/pack-merge";
import { packBackgroundsRaw } from "@pack";

const RAW_BACKGROUNDS: Omit<SrdBackgroundData, "grants">[] = [
  {
    id: "acolyte",
    skillProficiencies: ["Insight", "Religion"],
    toolProficiency: "Calligrapher's Supplies",
    feat: "magic-initiate-cleric",
    asiOptions: "+2/+1 or +1/+1/+1",
    abilityOptions: ["INT", "WIS", "CHA"],
    source: "SRD",
  },
  {
    id: "criminal",
    skillProficiencies: ["Sleight of Hand", "Stealth"],
    toolProficiency: "Thieves' Tools",
    feat: "alert",
    asiOptions: "+2/+1 or +1/+1/+1",
    abilityOptions: ["DEX", "CON", "INT"],
    source: "SRD",
  },
  {
    id: "sage",
    skillProficiencies: ["Arcana", "History"],
    toolProficiency: "Calligrapher's Supplies",
    feat: "magic-initiate-wizard",
    asiOptions: "+2/+1 or +1/+1/+1",
    abilityOptions: ["CON", "INT", "WIS"],
    source: "SRD",
  },
  {
    id: "soldier",
    skillProficiencies: ["Athletics", "Intimidation"],
    toolProficiency: "Gaming Set",
    feat: "savage-attacker",
    asiOptions: "+2/+1 or +1/+1/+1",
    abilityOptions: ["STR", "DEX", "CON"],
    source: "SRD",
  },
];

/**
 * A4 — derive the declarative SKILL `grants` for a background from its EXISTING
 * `skillProficiencies` field, so the grant pipeline is a faithful mirror of what
 * the creation-time snapshot already wrote.
 *
 * REGRESSION-SAFETY (the whole point of this seam): only the IDEMPOTENT,
 * set-union-safe SKILL benefits become grants here —
 *   - `skill-proficiency` (one per skill, mapped through the SAME `skillNameToId`
 *     the snapshot uses, so any non-skill entry — a tool name mistakenly written
 *     into a `skillProficiencies` array — would be dropped identically and never
 *     appear as a phantom skill).
 *
 * The TOOL grant lives in the ENGINE, not here. A background's `toolProficiency`
 * needs the SRD equipment catalogue (`@/i18n/srd-en`) to resolve a FIXED tool's
 * canonical EN name and to expand a "Choose one kind of <X>" UMBRELLA into its
 * concrete picker options. Reading `srd-en` from a `src/data/**` module drags the
 * whole EN SRD corpus into that module's bundle chunk (the `bundle-budget.guard`
 * fail #107 produced) — so the tool-grant construction is the engine's job:
 * `resolveGrantSourcesForBackground` (`lib/resolve-grant-sources.ts`, which already
 * imports `srd-en`) appends the background's tool grant via `backgroundToolGrant`.
 * This keeps the data layer dependency-light (no `@/i18n` import) while the grant
 * the consumer sees is identical (FIXED → `tool-proficiency`; UMBRELLA →
 * `choice-tool-proficiency` over the category's pickable ids).
 *
 * The background's ASI (`asiOptions` / `backgroundAsi`) and origin feat
 * (`feat`) are DELIBERATELY excluded: ability increases and a feat are
 * non-idempotent (re-applying would double-count), so they stay
 * creation-owned. Languages aren't modelled — 2024 backgrounds grant none
 * (verified across every 2024 background page: zero mention a
 * language; languages are a species / Origin-feat benefit in 2024).
 *
 * Because the grants are computed from the same fields the snapshot consumed
 * — and the merge functions (`mergeSkillProficiencies` no-downgrade union,
 * `mergeToolProficiencies` substring dedupe) never re-add an existing entry —
 * routing an existing character's background through this seam changes its
 * effective proficiencies by exactly nothing.
 */
function buildBackgroundGrants(
  raw: Omit<SrdBackgroundData, "grants">
): ReadonlyArray<Grant> {
  const grants: Grant[] = [];
  for (const skillName of raw.skillProficiencies) {
    const id = skillNameToId(skillName);
    if (id !== null) grants.push({ type: "skill-proficiency", skill: id });
  }
  return grants;
}

export const SRD_BACKGROUNDS: SrdBackgroundData[] = mergePack(
  "background",
  RAW_BACKGROUNDS,
  packBackgroundsRaw
).map((raw) => ({
  ...raw,
  grants: buildBackgroundGrants(raw),
  // Starting-equipment packages ("Choose A or B") live in a dedicated module,
  // keyed by id, so the verbose item lists don't bloat each raw entry; merge
  // them in by id here. Every 2024 background prints an Equipment block, so the
  // catalog covers the whole set; an unkeyed background would stay `undefined`.
  startingEquipment: STARTING_EQUIPMENT_BY_BG[raw.id],
}));

export const BACKGROUNDS_BY_ID: SrdIndex<SrdBackgroundData> = new Map(
  SRD_BACKGROUNDS.map((bg) => [bg.id, bg])
);

/**
 * Match a free-text `character.background` value to a background row.
 * The field is inconsistent across creation paths — `create.tsx` writes the
 * English NAME (e.g. "Acolyte") while `mock.ts` / some imports use the ID
 * (e.g. "acolyte"). Name→id resolution (id passthrough + EN/IT name match) is
 * done by the SRD-free `backgroundIdByName` (its name table is pinned to the live
 * data), so this lookup never reads a background `name` BiText — after R3 those
 * strings live only in the i18n catalogues.
 */
export function findBackground(value: string): SrdBackgroundData | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const byId = BACKGROUNDS_BY_ID.get(trimmed);
  if (byId) return byId;
  return BACKGROUNDS_BY_ID.get(backgroundIdByName(trimmed));
}

export function getBackground(id: string): SrdBackgroundData | undefined {
  return BACKGROUNDS_BY_ID.get(id);
}

export function getAllBackgroundIds(): string[] {
  return SRD_BACKGROUNDS.map((bg) => bg.id);
}

/**
 * Resolve a background's EFFECTIVE Origin feat slug — the single seam every
 * consumer (creation wizard, `character-io` import, `bgFeatFromBackground`)
 * uses instead of reading `bg.feat` directly.
 *
 * OVERRIDE-FIRST, in priority order:
 *   1. an explicit `choice` that is one of the background's `featOptions`
 *      (the player picked it — e.g. Pact Seeker → "infernal-pact");
 *   2. otherwise the background's `feat` DEFAULT (every fixed-feat background,
 *      and the suggested default for a player-choice background before a pick).
 *
 * An invalid / unknown `choice` (not in `featOptions`, or a fixed-feat
 * background that has no options) is IGNORED — the default `feat` wins, so a
 * stale or malformed pick can never silently drop the origin feat. `value`
 * accepts the same id / EN-name / IT-name forms as `findBackground`. Returns
 * `""` for an unknown background (mirrors `bgFeatFromBackground`).
 */
export function getBackgroundOriginFeat(value: string, choice?: string): string {
  const bg = findBackground(value);
  if (!bg) return "";
  const picked = choice?.trim();
  if (picked && bg.featOptions?.includes(picked)) return picked;
  return bg.feat;
}

/**
 * The eligible Origin-feat options for a background, in declared order.
 * Fixed-feat backgrounds (no `featOptions`) collapse to their single `feat`, so
 * a picker can treat every background uniformly: render a chooser when the list
 * has >1 entry, auto-apply when it has exactly one.
 */
export function getBackgroundFeatOptions(value: string): string[] {
  const bg = findBackground(value);
  if (!bg) return [];
  return bg.featOptions ? [...bg.featOptions] : [bg.feat];
}

/**
 * The starting-equipment packages ("Choose A or B") for a background, in
 * declared order. Empty only for an unknown background (every 2024 background
 * prints an Equipment block), so a picker can treat every background uniformly:
 * render a chooser when there are >1 options, skip the step when the list is
 * empty.
 */
export function getBackgroundEquipmentOptions(
  value: string
): ReadonlyArray<BackgroundEquipmentOption> {
  const bg = findBackground(value);
  return bg?.startingEquipment ?? [];
}

/**
 * Resolve a background's CHOSEN starting-equipment option into character
 * weapons / equipment / gold — the single override-first creation seam (mirrors
 * `getBackgroundOriginFeat`). `value` accepts the id / EN-name / IT-name forms
 * `findBackground` does; `optionLabel` is the player's pick ("A" / "B"), falling
 * back to Option A (the suggested gear default). Returns an empty payload for an
 * unknown background — never throws.
 */
export function getBackgroundStartingEquipment(
  value: string,
  optionLabel?: string
): ResolvedStartingEquipment {
  return resolveStartingEquipment(getBackgroundEquipmentOptions(value), optionLabel);
}
