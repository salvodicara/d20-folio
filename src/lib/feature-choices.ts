/**
 * L3 — the generic choice engine.
 *
 * Every "choose N of X" decision a feature can grant (skill, tool,
 * skill-or-tool, language, cantrip, spell) is declared as a `choice-*`
 * grant in the source's `grants[]`. The grants evaluator already collects
 * them into `pendingChoices`; this module turns ANY set of grant sources
 * — feats, class features, subclass features, species traits, backgrounds
 * — into render-ready picker slots, so the level-up wizard and the
 * creation wizard surface ONE unified set of pickers instead of scanning
 * the selected feat alone.
 *
 * It reuses the existing per-kind slot builders + appliers verbatim; the
 * only new thing it adds is **source+kind namespacing**: each builder emits
 * `slot-0, slot-1, …` restarting per kind, so we prefix every slot id with
 * `${sourceId}::${kind}-` (e.g. `${id}::skill-slot-0`), making ids globally
 * unique across the whole collected set. The per-kind appliers are agnostic
 * to the id shape (they flatten `Record<slotId, ids>`), so they keep working
 * unchanged; `applySpellChoicePicks` maps namespaced slot ids to their
 * pinned casting ability via the same namespaced slots list.
 *
 * Pure module — no React/store deps.
 */
import type { GrantBundle, GrantSource } from "@/lib/grants";
import { grantField, topGrantRef, bundleOptionRef } from "@/lib/grants";
import type { CharacterData } from "@/types/character";
import {
  pendingSkillSlotsForFeat,
  isSkillPicksComplete,
  applySkillPicks,
  type SkillChoiceSlot,
  type SkillChoicePicks,
} from "@/lib/feat-skill-choices";
import {
  pendingToolSlotsForFeat,
  isToolPicksComplete,
  applyToolPicks,
  type ToolChoiceSlot,
  type ToolChoicePicks,
} from "@/lib/feat-tool-choices";
import {
  pendingSkillOrToolSlotsForFeat,
  isSkillOrToolPicksComplete,
  applySkillOrToolPicks,
  type SkillOrToolSlot,
  type SkillOrToolPicks,
} from "@/lib/feat-skill-tool-choices";
import {
  pendingSpellChoicesForFeat,
  isSpellChoicesComplete,
  applySpellChoicePicks,
  type SpellChoiceSlot,
  type SpellChoicePicks,
  type SpellChoiceCtx,
} from "@/lib/feat-spell-choices";
import {
  pendingLanguageSlotsForFeat,
  isLanguagePicksComplete,
  applyLanguagePicks,
  type LanguageChoiceSlot,
  type LanguageChoicePicks,
} from "@/lib/feat-language-choices";
import {
  pendingExpertiseSlotsForFeat,
  isExpertisePicksComplete,
  applyExpertiseChoicePicks,
  type ExpertiseChoiceSlot,
  type ExpertiseChoicePicks,
} from "@/lib/feat-expertise-choices";
import {
  pendingFeatSlotsForFeat,
  isFeatPicksComplete,
  applyFeatChoicePicks,
  type FeatChoiceSlot,
  type FeatChoicePicks,
} from "@/lib/feat-feat-choices";

/** All pending choice slots from a set of sources, grouped by kind. */
export interface FeatureChoiceSlots {
  skill: SkillChoiceSlot[];
  tool: ToolChoiceSlot[];
  skillOrTool: SkillOrToolSlot[];
  language: LanguageChoiceSlot[];
  spell: SpellChoiceSlot[];
  expertise: ExpertiseChoiceSlot[];
  /** choice-feat (origin-feat grant): Lessons of the First Ones / Versatile. */
  feat: FeatChoiceSlot[];
}

/** The in-progress picks for every choice kind, keyed by namespaced slot id. */
export interface ChoicePicks {
  skill: SkillChoicePicks;
  tool: ToolChoicePicks;
  skillOrTool: SkillOrToolPicks;
  language: LanguageChoicePicks;
  spell: SpellChoicePicks;
  expertise: ExpertiseChoicePicks;
  feat: FeatChoicePicks;
}

/** A fresh empty picks object. */
export const EMPTY_CHOICE_PICKS: ChoicePicks = {
  skill: {},
  tool: {},
  skillOrTool: {},
  language: {},
  spell: {},
  expertise: {},
  feat: {},
};

/**
 * Prefix each slot's id with its source AND kind so ids are globally unique.
 * Source alone isn't enough: every per-kind builder restarts its index at
 * `slot-0`, so a source granting both a tool and a language choice would
 * emit `${id}::slot-0` twice. Including the kind (`${id}::tool-slot-0`,
 * `${id}::language-slot-0`) keeps every slot id distinct across the whole
 * collected set — safe if the slots are ever merged into one list.
 */
function namespaceSlots<T extends { slotId: string }>(
  sourceId: string,
  kind: string,
  slots: T[]
): T[] {
  return slots.map((s) => ({ ...s, slotId: `${sourceId}::${kind}-${s.slotId}` }));
}

/**
 * Collect every pending choice slot from a list of grant sources, grouped
 * by kind, with source-namespaced slot ids. A source with no `choice-*`
 * grants contributes nothing. Order follows the sources array.
 */
/**
 * Collect the `choice-grant-bundle` single-select build choices a set of grant
 * sources confer — the subclass / feature picks (Cleric Divine Order, Ranger
 * Hunter's Prey, Druid Land terrain, Sorcerer Elemental Affinity, …). UNLIKE the
 * character-state `choice-*` slots above, a bundle pick is SESSION state
 * (`session.grantBundleChoices[bundleKey]`), so the caller writes it back to the
 * session; once chosen, every effect (proficiencies, features, always-prepared
 * spells) is applied at render by `evaluateGrants` / `resolveEffectiveSpells`.
 *
 * `choiceFrequency: "creation"` bundles (the 2 race lineages) are EXCLUDED — those
 * are surfaced at character creation. `selected` reflects the current session pick
 * (null = unchosen), so callers can filter to the ones still needing a decision.
 * Deduped by `bundleKey` (two features can share one). Pure.
 */
export function collectGrantBundles(
  sources: ReadonlyArray<GrantSource>,
  bundleChoices: ReadonlyMap<string, string>
): GrantBundle[] {
  const out: GrantBundle[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    const grants = src.grants ?? [];
    for (let i = 0; i < grants.length; i++) {
      const g = grants[i];
      if (!g || g.type !== "choice-grant-bundle") continue;
      if ((g.choiceFrequency ?? "rest") === "creation") continue;
      if (seen.has(g.bundleKey)) continue;
      seen.add(g.bundleKey);
      // Key the labels under the SAME catalogue path the aggregate uses, so the
      // two collectors never drift (golden rule 6).
      const gref = topGrantRef(src, g, i);
      out.push({
        bundleKey: g.bundleKey,
        sourceId: src.id,
        label: grantField(gref, "label", g.label),
        options: g.options.map((o) => ({
          id: o.id,
          label: grantField(bundleOptionRef(gref, o.id), "label", o.label),
        })),
        selected: bundleChoices.get(g.bundleKey) ?? null,
        choiceFrequency: g.choiceFrequency ?? "rest",
      });
    }
  }
  return out;
}

export function collectChoiceSlots(
  sources: ReadonlyArray<GrantSource>,
  ctx?: SpellChoiceCtx
): FeatureChoiceSlots {
  const out: FeatureChoiceSlots = {
    skill: [],
    tool: [],
    skillOrTool: [],
    language: [],
    spell: [],
    expertise: [],
    feat: [],
  };
  for (const src of sources) {
    const obj = { grants: src.grants };
    out.skill.push(...namespaceSlots(src.id, "skill", pendingSkillSlotsForFeat(obj)));
    out.tool.push(...namespaceSlots(src.id, "tool", pendingToolSlotsForFeat(obj)));
    out.skillOrTool.push(
      ...namespaceSlots(src.id, "skilltool", pendingSkillOrToolSlotsForFeat(obj))
    );
    out.language.push(
      ...namespaceSlots(src.id, "lang", pendingLanguageSlotsForFeat(obj))
    );
    out.spell.push(
      ...namespaceSlots(src.id, "spell", pendingSpellChoicesForFeat(obj, ctx)).map(
        // Stamp the granting source's id so the picker can SAY where each spell
        // slot comes from (the level-up modal renders slots from many sources).
        (slot) => ({ ...slot, sourceId: src.id })
      )
    );
    out.expertise.push(
      ...namespaceSlots(src.id, "expertise", pendingExpertiseSlotsForFeat(obj))
    );
    out.feat.push(...namespaceSlots(src.id, "feat", pendingFeatSlotsForFeat(obj)));
  }
  return out;
}

/** Drop picks whose slot id is no longer present in `valid`. */
function pruneToSlots(
  slots: ReadonlyArray<{ slotId: string }>,
  picks: Record<string, ReadonlyArray<string>>
): Record<string, ReadonlyArray<string>> {
  const valid = new Set(slots.map((s) => s.slotId));
  const out: Record<string, ReadonlyArray<string>> = {};
  for (const [k, v] of Object.entries(picks)) {
    if (valid.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Restrict picks to slot ids that still exist in `slots`. Switching the
 * selected feat (or subclass) mid-flow changes the namespaced slot set, so
 * the wizard prunes stale entries at render rather than via a reset effect —
 * the same pattern the per-feat pickers used, generalised across all kinds.
 */
export function pruneChoicePicks(
  slots: FeatureChoiceSlots,
  picks: ChoicePicks
): ChoicePicks {
  return {
    skill: pruneToSlots(slots.skill, picks.skill),
    tool: pruneToSlots(slots.tool, picks.tool),
    skillOrTool: pruneToSlots(slots.skillOrTool, picks.skillOrTool),
    language: pruneToSlots(slots.language, picks.language),
    spell: pruneToSlots(slots.spell, picks.spell),
    expertise: pruneToSlots(slots.expertise, picks.expertise),
    feat: pruneToSlots(slots.feat, picks.feat),
  };
}

/**
 * Split collected slots into the ones CAUSED by `sourceId` (slot ids are
 * namespaced `${sourceId}::…`) and the rest. The wizards render a just-picked
 * feat's nested choices INLINE under its picker — visibly attributed to the
 * feat that caused them — while every other source's slots stay in the shared
 * feature-choices section. Render-only: picks state and completeness checks
 * keep operating on the FULL slot set.
 */
export function partitionChoiceSlotsBySource(
  slots: FeatureChoiceSlots,
  sourceId: string | null | undefined
): { caused: FeatureChoiceSlots; rest: FeatureChoiceSlots } {
  const prefix = sourceId ? `${sourceId}::` : null;
  const split = <T extends { slotId: string }>(list: T[]): [T[], T[]] => {
    if (!prefix) return [[], list];
    const caused: T[] = [];
    const rest: T[] = [];
    for (const s of list) (s.slotId.startsWith(prefix) ? caused : rest).push(s);
    return [caused, rest];
  };
  const [skillC, skillR] = split(slots.skill);
  const [toolC, toolR] = split(slots.tool);
  const [skillOrToolC, skillOrToolR] = split(slots.skillOrTool);
  const [languageC, languageR] = split(slots.language);
  const [spellC, spellR] = split(slots.spell);
  const [expertiseC, expertiseR] = split(slots.expertise);
  const [featC, featR] = split(slots.feat);
  return {
    caused: {
      skill: skillC,
      tool: toolC,
      skillOrTool: skillOrToolC,
      language: languageC,
      spell: spellC,
      expertise: expertiseC,
      feat: featC,
    },
    rest: {
      skill: skillR,
      tool: toolR,
      skillOrTool: skillOrToolR,
      language: languageR,
      spell: spellR,
      expertise: expertiseR,
      feat: featR,
    },
  };
}

/** True when at least one slot of any kind exists. */
export function hasAnyChoiceSlots(slots: FeatureChoiceSlots): boolean {
  return (
    slots.skill.length > 0 ||
    slots.tool.length > 0 ||
    slots.skillOrTool.length > 0 ||
    slots.language.length > 0 ||
    slots.spell.length > 0 ||
    slots.expertise.length > 0 ||
    slots.feat.length > 0
  );
}

/** Every slot of every kind is filled to its required amount. */
export function isAllChoicesComplete(
  slots: FeatureChoiceSlots,
  picks: ChoicePicks
): boolean {
  return (
    isSkillPicksComplete(slots.skill, picks.skill) &&
    isToolPicksComplete(slots.tool, picks.tool) &&
    isSkillOrToolPicksComplete(slots.skillOrTool, picks.skillOrTool) &&
    isLanguagePicksComplete(slots.language, picks.language) &&
    isSpellChoicesComplete(slots.spell, picks.spell) &&
    isExpertisePicksComplete(slots.expertise, picks.expertise) &&
    isFeatPicksComplete(slots.feat, picks.feat)
  );
}

/**
 * Apply every kind of pick to a character. Each delegated applier is
 * idempotent and non-destructive (never downgrades expertise, never
 * duplicates a known tool/language/spell). `slots.spell` is threaded into
 * the spell applier so per-slot casting-ability overrides survive.
 */
export function applyChoicePicks(
  character: CharacterData,
  slots: FeatureChoiceSlots,
  picks: ChoicePicks
): CharacterData {
  let c = character;
  c = applySkillPicks(c, picks.skill);
  c = applySkillOrToolPicks(c, picks.skillOrTool);
  // Expertise after skill/skill-or-tool picks, so a proficiency gained in the
  // same step can be upgraded if chosen.
  c = applyExpertiseChoicePicks(c, picks.expertise);
  c = applyToolPicks(c, picks.tool);
  c = applyLanguagePicks(c, picks.language);
  c = {
    ...c,
    spells: applySpellChoicePicks(c.spells, picks.spell, slots.spell, c.abilityScores),
  };
  // choice-feat (origin-feat grant): append the chosen feat(s) as ordinary
  // feature refs so the feat pipeline resolves their grants/tracker/actions.
  // Applied last so the added feat ref doesn't perturb the other appliers'
  // reads of the character above.
  c = applyFeatChoicePicks(c, picks.feat);
  return c;
}
