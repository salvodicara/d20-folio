/**
 * «Creazione rapida»: the player picks a class and a species; Folio picks the
 * rest with the same pieces the guided path uses, so the result is a character
 * the guided path would accept as complete:
 *
 *   1. the class's quickbuild preset (background, scores, +2/+1, class skills,
 *      spells, its choice picks), the name kept;
 *   2. the chosen species, then its own choices: the preset's when it is the
 *      preset's species, otherwise each bundle's first option, the spellcasting
 *      ability its priority puts first, the Versatile feat (first origin feat
 *      the background doesn't grant), and every trait pick from the legal options;
 *   3. each of the class's level-1 Orders: its first option;
 *   4. the class's ready-made picks still missing (`fillReadyMade`), its own
 *      Weapon Mastery, Fighting Style, invocations and Expertise among them.
 *
 * Every pick stays editable later from the sheet. Pure module.
 */
import { getFeaturesAtLevel } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { DEFAULT_QUICKBUILD_PRESET, QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { SRD_RACES } from "@/data/races";
import type { Grant } from "@/lib/grants";

import {
  creationDraftReducer,
  creationFacts,
  type CreationDraft,
  type CreationDraftAction,
} from "./draft";
import { fillChoiceSlots } from "./ready-made";

const apply = (draft: CreationDraft, ...actions: CreationDraftAction[]) =>
  actions.reduce(creationDraftReducer, draft);

/** The first option of every bundle a species' traits or a class's features carry. */
function firstOptions(grants: ReadonlyArray<Grant>): Array<[string, string]> {
  return grants.flatMap((g) =>
    g.type === "choice-grant-bundle" && g.options[0]
      ? [[g.bundleKey, g.options[0].id] as [string, string]]
      : []
  );
}

export function rapidDraft(
  base: CreationDraft,
  classId: string,
  raceId: string
): CreationDraft {
  const preset = QUICKBUILD_PRESETS[classId] ?? DEFAULT_QUICKBUILD_PRESET;
  let draft = apply(base, { type: "applyQuickbuild", classId, preset });
  draft = { ...draft, name: base.name };

  // ── The species and its own choices ───────────────────────────────────────
  if (raceId !== draft.raceId) {
    draft = apply(draft, { type: "selectRace", raceId });
    const race = SRD_RACES.find((r) => r.id === raceId);
    for (const [bundleKey, optionId] of firstOptions(
      race?.traits.flatMap((t) => t.grants ?? []) ?? []
    )) {
      draft = apply(draft, { type: "setLineageChoice", bundleKey, optionId });
    }
  }
  let facts = creationFacts(draft);
  if (facts.needsSpeciesSpellAbility && !draft.speciesSpellAbility) {
    const ability =
      preset.speciesSpellAbility ??
      preset.abilityOrder.find((c) => c === "INT" || c === "WIS" || c === "CHA") ??
      "CHA";
    draft = apply(draft, { type: "setSpeciesSpellAbility", ability });
  }
  if (facts.isHuman && !draft.humanFeat) {
    const feat = SRD_FEATS.find(
      (f) => f.category === "origin" && f.id !== facts.backgroundFeat
    );
    if (feat) draft = apply(draft, { type: "setHumanFeat", featId: feat.id });
  }
  facts = creationFacts(draft);
  for (const slots of [facts.speciesChoiceSlots, facts.humanFeatSlots]) {
    draft = { ...draft, choicePicks: fillChoiceSlots(draft, facts, slots) };
    facts = creationFacts(draft);
  }

  // ── The class's level-1 bundles, then its ready-made picks ─────────────────
  // The bundles come first: a chosen option can owe a pick of its own (Divine
  // Order's Thaumaturge: one extra cantrip), which the ready-made fill then makes.
  const features = getFeaturesAtLevel(classId, 1);
  for (const [bundleKey, optionId] of firstOptions(
    features.flatMap((f) => f.grants ?? [])
  )) {
    if (
      facts.classNeeds.bundleKeys.includes(bundleKey) &&
      !draft.lineageChoices[bundleKey]
    ) {
      draft = apply(draft, { type: "setLineageChoice", bundleKey, optionId });
    }
  }
  // The ready-made picks, the class's own among them (masteries for the weapons it
  // starts with first, Defense, the first invocations, Expertise in its skills).
  return apply(draft, { type: "fillReadyMade" });
}
