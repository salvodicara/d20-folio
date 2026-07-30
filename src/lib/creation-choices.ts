/**
 * The creation-time CHOICE MODEL — the one place that says which decisions a
 * brand-new character still owes, independent of any UI.
 *
 * Two facts live here:
 *   1. **The 2024 origin languages** (RA-28) — "Common plus two languages of
 *      your choice from the standard languages table". ONE hand-built
 *      `choice-language` slot; the seed already grants Common, so Common is
 *      EXCLUDED from the pool (`applyLanguagePicks` dedupes against the
 *      `["common"]` seed, so offering Common would let a "2 of 2" slot yield
 *      only 1 new language).
 *   2. **{@link creationChoiceSlots}** — every pending `choice-*` slot the new
 *      character's sources confer: the origin feats (Human Versatile + the
 *      background feat) PLUS the class/subclass features gained THROUGH the
 *      starting level, PLUS the class's and background's own grants (the
 *      Monk/Bard tool pick, a "Choose one kind of <X>" background). Slot ids are
 *      namespaced per source by {@link collectChoiceSlots}.
 *
 * The creation wizard renders these slots and the quickbuild preset applicator
 * FILLS them (`lib/quickbuild.ts`) — one seam, so a preset can never satisfy a
 * different set of decisions than the wizard gates on (golden rule 6).
 *
 * Pure module — no React, no locale reads.
 */
import { classTables, getFeaturesAtLevel } from "@/data/classes";
import { collectChoiceSlots, type FeatureChoiceSlots } from "@/lib/feature-choices";
import {
  STANDARD_LANGUAGE_IDS,
  type LanguageChoiceSlot,
} from "@/lib/feat-language-choices";
import {
  resolveGrantSourcesForBackground,
  resolveGrantSourcesForClass,
  resolveGrantSourcesForFeatures,
} from "@/lib/resolve-grant-sources";

/** The slot id of the 2024 origin-language pick. */
export const ORIGIN_LANGUAGE_SLOT_ID = "origin";

/** The origin-language slot: two standard languages, Common excluded (seeded). */
export const ORIGIN_LANGUAGE_SLOTS: readonly LanguageChoiceSlot[] = [
  {
    slotId: ORIGIN_LANGUAGE_SLOT_ID,
    amount: 2,
    options: STANDARD_LANGUAGE_IDS.filter((id) => id !== "common"),
  },
];

/** The build a character is being created with — everything the slots depend on. */
export interface CreationChoiceInput {
  classId: string;
  /** Starting level (features through this level confer their choices). */
  level: number;
  /** The chosen subclass id, or "" when none is due yet. */
  subclassId: string;
  backgroundId: string;
  /** The Human Versatile origin feat ("" when not Human / not yet picked). */
  humanFeat: string;
  /** The background's granted origin feat slug ("" when none). */
  bgFeat: string;
}

/**
 * Every pending `choice-*` slot a new character owes, grouped by kind.
 *
 * A2 — the class's spell-slot row at the starting level feeds `SpellChoiceCtx`
 * so a RECURRING entitlement (Wizard School Savant) offers its full
 * level-scaled pick count (2 at L3 → 3 at L5 → … → 9 at L17).
 */
export function creationChoiceSlots(input: CreationChoiceInput): FeatureChoiceSlots {
  const refs = [input.humanFeat, input.bgFeat]
    .filter((slug) => !!slug)
    .map((srdId) => ({ srdId }));
  const subclassSlug = input.subclassId.toLowerCase();
  for (let lvl = 1; lvl <= input.level; lvl++) {
    for (const f of getFeaturesAtLevel(input.classId, lvl)) {
      if (f.subclass && f.subclass.toLowerCase() !== subclassSlug) continue;
      refs.push({ srdId: f.id });
    }
  }
  const slotRow =
    classTables.find((c) => c.id === input.classId)?.levels[input.level - 1]
      ?.spellSlots ?? [];
  // Class-level grants (the Monk/Bard level-1 tool-proficiency choice) AND the
  // background's own grants ("Choose one kind of <Musical Instrument / Gaming
  // Set / Artisan's Tools>" — Entertainer, Artisan, Guard, …) join the feature
  // sources so every pick surfaces in ONE collected set.
  const sources = [
    ...resolveGrantSourcesForClass(input.classId),
    ...resolveGrantSourcesForBackground(input.backgroundId),
    ...resolveGrantSourcesForFeatures(refs),
  ];
  return collectChoiceSlots(sources, {
    spellSlotsByClass: { [input.classId]: slotRow },
  });
}
