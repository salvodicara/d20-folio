/**
 * H7 — subclass expanded-spell injection.
 *
 * Many subclasses grant "always-prepared" or "additional" spells at specific
 * character levels (Cleric domain spells, Paladin oath spells, Sorcerer
 * draconic spells, Warlock patron spells, etc.). This helper resolves which
 * spell IDs the subclass adds at a given level and produces the merge into
 * `character.spells[]` so callers (character creation + level-up wizard)
 * stay declarative.
 *
 * Pure — no store access.
 */

import { getClassTable } from "@/data/classes";
import type {
  SrdSpellRef,
  CustomSpell,
  CharacterData,
  SessionState,
} from "@/types/character";
import type { AbilityCode } from "@/data/types";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import { getClasses, totalLevel } from "@/lib/classes";

/**
 * Resolve the list of expanded-spell IDs a subclass grants at exactly the
 * given character level (does NOT cascade through earlier thresholds — the
 * caller is expected to inject incrementally on each level-up).
 *
 * Returns [] when the subclass has no expanded spells, doesn't grant any
 * at this exact level, or the class/subclass id is unknown.
 */
export function getExpandedSpellsAtLevel(
  classId: string,
  subclassId: string,
  level: number
): string[] {
  if (!classId || !subclassId) return [];
  const table = getClassTable(classId);
  const subclass = table?.subclasses.find((s) => s.id === subclassId);
  return subclass?.expandedSpells?.[level] ?? [];
}

/**
 * Resolve every expanded-spell ID a subclass grants AT OR BEFORE the given
 * level — useful at character creation when a player joins above level 1
 * with a subclass already selected.
 */
export function getExpandedSpellsThroughLevel(
  classId: string,
  subclassId: string,
  level: number
): string[] {
  if (!classId || !subclassId) return [];
  const table = getClassTable(classId);
  const map = table?.subclasses.find((s) => s.id === subclassId)?.expandedSpells;
  if (!map) return [];
  const collected: string[] = [];
  for (const [thresholdStr, ids] of Object.entries(map)) {
    if (Number(thresholdStr) <= level) collected.push(...ids);
  }
  return collected;
}

/**
 * Merge a list of expanded-spell IDs into an existing `character.spells[]`
 * array, skipping any IDs already present (SRD ref OR custom spell with a
 * matching name). New refs are flagged `prepared: true` AND `alwaysPrepared:
 * true` since expanded spells are always prepared per 2024 RAW and do NOT
 * count against the class's `preparedMax`.
 *
 * A2 — `alwaysPrepared` lets the prepared-count helper (in spells.tsx)
 * exclude subclass-granted spells from the running total so a Cleric L3 with
 * 4 Domain spells injected doesn't get flagged as "over the prepared limit".
 *
 * Returns the new array.
 */
/**
 * An always-prepared spell entry, either a bare id (backward-compat with
 * older callers like the subclass-expanded-spells path) or a richer
 * `{ spellId, spellAbility? | speciesSpellAbility? }` shape so feat grants can
 * pin the casting ability (heritage feats: "Intelligence is your
 * spellcasting ability for these spells") or defer it to the species "choose
 * INT/WIS/CHA" pick (2024 Tiefling). `spellAbility` and `speciesSpellAbility`
 * are mutually exclusive.
 */
export type AlwaysPreparedEntry =
  | string
  | { spellId: string; spellAbility?: AbilityCode; speciesSpellAbility?: boolean };

export function injectExpandedSpells(
  existing: ReadonlyArray<SrdSpellRef | CustomSpell>,
  entries: ReadonlyArray<AlwaysPreparedEntry>
): (SrdSpellRef | CustomSpell)[] {
  if (entries.length === 0) return [...existing];
  // Index entries by id so a PRESENT-but-inferred stored ref is NORMALIZED to
  // `alwaysPrepared:true` rather than merely skipped. Legacy / v3 imports tag
  // Oath / Domain / Circle / grant spells as plain `prepared:true`; without this
  // upgrade the SAME always-prepared spell carries different flags depending on
  // whether it was stored or inferred — which (a) breaks the minimal round-trip
  // (drop a stored one, re-infer it, the tag flips) and (b) over-counts the
  // prepared total (an always-prepared spell must not count against preparedMax).
  // The upgrade is idempotent.
  const entryById = new Map<string, AlwaysPreparedEntry>();
  for (const e of entries) entryById.set(typeof e === "string" ? e : e.spellId, e);

  const haveIds = new Set<string>();
  const result: (SrdSpellRef | CustomSpell)[] = existing.map((s) => {
    if ("custom" in s) return s;
    haveIds.add(s.srdId);
    const entry = entryById.get(s.srdId);
    if (entry === undefined) return s;
    const ability = typeof entry === "string" ? undefined : entry.spellAbility;
    const speciesDeferred =
      typeof entry === "string" ? undefined : entry.speciesSpellAbility;
    const upgraded: SrdSpellRef = { ...s, prepared: true, alwaysPrepared: true };
    // Only fill an ability source the stored ref lacks (preserve a player pin).
    if (ability && upgraded.spellAbilityOverride == null) {
      upgraded.spellAbilityOverride = ability;
    } else if (speciesDeferred && upgraded.spellAbilityOverride == null) {
      upgraded.speciesSpellAbility = true;
    }
    return upgraded;
  });

  const added: SrdSpellRef[] = [];
  for (const entry of entries) {
    const id = typeof entry === "string" ? entry : entry.spellId;
    if (haveIds.has(id)) continue;
    const ability = typeof entry === "string" ? undefined : entry.spellAbility;
    const speciesDeferred =
      typeof entry === "string" ? undefined : entry.speciesSpellAbility;
    const ref: SrdSpellRef = { srdId: id, prepared: true, alwaysPrepared: true };
    // `spellAbility` (concrete pin) and `speciesSpellAbility` (deferred to the
    // character's species pick) are mutually exclusive; prefer the concrete pin.
    if (ability) ref.spellAbilityOverride = ability;
    else if (speciesDeferred) ref.speciesSpellAbility = true;
    added.push(ref);
    haveIds.add(id);
  }
  return [...result, ...added];
}

/**
 * Resolve every always-prepared spell ID granted by the character's current
 * features via the declarative `{ type: "always-prepared-spell", spellId }`
 * grant kind. Returns the deduped list, which the caller can pass through
 * `injectExpandedSpells` to merge into `character.spells[]`.
 *
 * This is the generic equivalent of `getExpandedSpellsThroughLevel`'s
 * subclass path — applies to feats (Magic Initiate's L1 spell, Fey-Touched
 * Misty Step, Shadow-Touched Invisibility, etc.) and class features that
 * carry an `always-prepared-spell` grant (Ranger Favored Enemy → Hunter's
 * Mark, etc.).
 */
import type { Grant } from "@/lib/grants";

/**
 * Options for `getAlwaysPreparedFromGrants`:
 *  - `level` — the character level, used to gate `always-prepared-spell`
 *    grants that carry a `minLevel` (Circle of the Land terrain Circle Spells
 *    unlock at druid 3/5/7/9). When omitted, `minLevel` is ignored (all apply).
 *  - `bundleChoices` — `bundleKey → selected optionId` for `choice-grant-bundle`
 *    grants; the selected option's spells are descended into. Unselected
 *    bundles contribute nothing.
 */
export interface AlwaysPreparedOptions {
  level?: number;
  bundleChoices?: ReadonlyMap<string, string>;
}

export function getAlwaysPreparedFromGrants(
  grantSources: ReadonlyArray<{ grants?: ReadonlyArray<Grant> }>,
  opts: AlwaysPreparedOptions = {}
): AlwaysPreparedEntry[] {
  const { level, bundleChoices } = opts;
  const out: AlwaysPreparedEntry[] = [];
  const seen = new Set<string>();

  const pushSpell = (g: Extract<Grant, { type: "always-prepared-spell" }>) => {
    if (seen.has(g.spellId)) return;
    // minLevel gate — skip spells the character hasn't reached yet.
    if (g.minLevel != null && level != null && level < g.minLevel) return;
    seen.add(g.spellId);
    if (g.spellAbility) {
      out.push({ spellId: g.spellId, spellAbility: g.spellAbility });
    } else if (g.spellAbilitySource === "species") {
      out.push({ spellId: g.spellId, speciesSpellAbility: true });
    } else {
      out.push(g.spellId);
    }
  };

  const walk = (grants: ReadonlyArray<Grant>) => {
    for (const g of grants) {
      if (g.type === "always-prepared-spell") {
        pushSpell(g);
      } else if (g.type === "choice-grant-bundle") {
        const selected = bundleChoices?.get(g.bundleKey);
        if (selected == null) continue;
        const chosen = g.options.find((o) => o.id === selected);
        // One level deep — descend only the selected option's grants.
        for (const inner of chosen?.grants ?? []) {
          if (inner.type === "always-prepared-spell") pushSpell(inner);
        }
      }
    }
  };

  for (const src of grantSources) walk(src.grants ?? []);
  return out;
}

/**
 * Every `always-prepared-spell` id declared across ALL options of a given
 * `choice-grant-bundle` (any source). Used when the player re-selects a bundle
 * option (Circle of the Land terrain) to strip the previously-injected variant
 * spells before injecting the new selection — so changing terrain swaps the
 * Circle Spells rather than accumulating every terrain ever chosen.
 */
export function allBundleSpellIds(
  grantSources: ReadonlyArray<{ grants?: ReadonlyArray<Grant> }>,
  bundleKey: string
): Set<string> {
  const ids = new Set<string>();
  for (const src of grantSources) {
    for (const g of src.grants ?? []) {
      if (g.type !== "choice-grant-bundle" || g.bundleKey !== bundleKey) continue;
      for (const opt of g.options) {
        for (const inner of opt.grants) {
          if (inner.type === "always-prepared-spell") ids.add(inner.spellId);
        }
      }
    }
  }
  return ids;
}

/**
 * The character's EFFECTIVE spell list for render: the stored `spells[]` plus
 * every always-prepared spell its GRANTS confer at this level — subclass
 * expanded spells (Cleric domain, Warlock patron…), species legacy spells
 * (Tiefling Fiendish Legacy → Fire Bolt at the chosen legacy), and any other
 * `always-prepared-spell` grant, including those inside a selected
 * `choice-grant-bundle` option. Inferred at READ time off `resolveAllGrantSources`
 * + the session's bundle choices, so a character need not STORE its always-prepared
 * spells (minimal representation) and an imported/legacy doc that never had them
 * injected still shows them. Deduped by srd id (a spell already in `spells[]`
 * wins). Pure — no store access.
 */
export function resolveEffectiveSpells(
  character: CharacterData,
  session: Pick<SessionState, "grantBundleChoices">
): (SrdSpellRef | CustomSpell)[] {
  return injectExpandedSpells(
    character.spells,
    effectiveAlwaysPreparedEntries(character, session.grantBundleChoices)
  );
}

/**
 * The COMPLETE always-prepared / expanded-spell entry set for a character — the
 * SINGLE source the render seam ({@link resolveEffectiveSpells}) and the minimizer
 * both read, so a spell counts as "inferred always-prepared" identically in both.
 * Unions two mechanisms:
 *   - `always-prepared-spell` grants (feats / class / subclass / species, and the
 *     selected option of a `choice-grant-bundle`), via `getAlwaysPreparedFromGrants`;
 *   - the subclass `expandedSpells` map (Oath / Domain / Circle / Patron spells),
 *     via `getExpandedSpellsThroughLevel` — historically these were injected into
 *     `spells[]` only at creation / level-up and NOT re-inferred at render, so they
 *     could not be dropped from the minimal model. Merging them here is what lets the
 *     minimizer drop them and the render re-infer them, losslessly.
 *
 * `bundleChoices` is optional: the render path threads the session's selections so
 * bundle-conditional spells resolve; the minimizer passes none (it has no session),
 * so it only ever treats the SESSION-INDEPENDENT set as inferred — bundle-conditional
 * spells are therefore always kept in the stored model.
 */
export function effectiveAlwaysPreparedEntries(
  character: CharacterData,
  bundleChoices?: Record<string, string>
): AlwaysPreparedEntry[] {
  const entries = getAlwaysPreparedFromGrants(resolveAllGrantSources(character), {
    level: totalLevel(character),
    bundleChoices: bundleChoices ? new Map(Object.entries(bundleChoices)) : undefined,
  });
  // R4 — expanded spells resolve PER class entry at that entry's class level (a
  // multiclass Cleric/Druid gets each subclass's expanded list at the right level).
  const seen = new Set(entries.map((e) => (typeof e === "string" ? e : e.spellId)));
  for (const entry of getClasses(character)) {
    if (!entry.subclassId) continue;
    for (const id of getExpandedSpellsThroughLevel(
      entry.classId,
      entry.subclassId,
      entry.level
    )) {
      if (!seen.has(id)) {
        entries.push(id);
        seen.add(id);
      }
    }
  }
  return entries;
}
