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
 *   3. the class's ready-made picks still missing (`fillReadyMade`);
 *   4. the class's level-1 choices: each Order's first option, the first
 *      Fighting Style, masteries for the weapons it starts with first, the first
 *      invocation, Expertise in its first proficient skills.
 *
 * Every pick stays editable later from the sheet. Pure module.
 */
import { classTables, getFeaturesAtLevel } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { DEFAULT_QUICKBUILD_PRESET, QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { SRD_RACES } from "@/data/races";
import type { Grant } from "@/lib/grants";

import type { ClassChoicePicks } from "./class-choices";
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

  // ── The class's ready-made picks, then its level-1 choices ─────────────────
  draft = apply(draft, { type: "fillReadyMade" });
  facts = creationFacts(draft);
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
  facts = creationFacts(draft);
  // The weapons it starts with come first among the masteries.
  const kit =
    classTables
      .find((c) => c.id === classId)
      ?.startingEquipment.find((o) => o.label === facts.classEquipLabel)
      ?.items.flatMap((item) => (item.srdId ? [item.srdId] : [])) ?? [];
  const preferred: Record<keyof ClassChoicePicks, readonly string[]> = {
    fightingStyles: [],
    weaponMasteries: kit,
    invocations: [],
    expertise: draft.classSkills,
  };
  for (const kind of [
    "fightingStyles",
    "weaponMasteries",
    "invocations",
    "expertise",
  ] as const) {
    const count = facts.classNeeds[kind];
    if (count === 0 || draft.classPicks[kind].length === count) continue;
    const legal = facts.classOptions[kind];
    const ordered = [...preferred[kind].filter((id) => legal.includes(id)), ...legal];
    draft = apply(draft, {
      type: "setClassPick",
      kind,
      ids: [...new Set(ordered)].slice(0, count),
    });
  }
  return draft;
}
