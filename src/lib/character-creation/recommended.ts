/**
 * Recommended build through the guided-creation seam (P10).
 *
 * Replays one `QuickbuildPreset` (`src/data/quickbuild.ts`) onto a `CreationDraft`
 * using only the public seam: `selectCreationSource`, `answerCreationChoice` and
 * `previewCreation`. Every open choice the composition raises is answered by
 * preference: the ids the preset names when the resolved pool offers them, then
 * the first options of the pool. A preset id that never lands is reported in
 * `unmatched`, so preset drift is visible instead of silent.
 *
 * Pure: no i18n, no React, no store. The input draft is never mutated.
 */
import { QUICKBUILD_PRESETS, type QuickbuildPreset } from "@/data/quickbuild";
import type { AbilityCode } from "@/data/types";
import type { ResolvedPoolOption } from "../homebrew/choice-pools";
import type { ActiveOriginChoice } from "../homebrew/origin-build";
import type { Ability } from "../homebrew/origins";
import { STANDARD_SCORES, type CreationScores } from "./abilities";
import { catalogueSnapshot } from "./catalogue";
import { previewCreation, type CreationPreview } from "./compose";
import {
  answerCreationChoice,
  selectCreationSource,
  type CreationDraft,
  type CreationRole,
} from "./model";

export interface RecommendedBuildResult {
  draft: CreationDraft;
  preview: CreationPreview;
  /** Preset ids no resolved pool offered, in preset order. */
  unmatched: string[];
}

const MAX_ROUNDS = 60;
const ABILITY_BY_CODE: Readonly<Record<AbilityCode, Ability>> = {
  STR: "strength",
  DEX: "dexterity",
  CON: "constitution",
  INT: "intelligence",
  WIS: "wisdom",
  CHA: "charisma",
};
const CLASS_SPELL_SLOTS = ["prepared", "spellbook", "known"];

/** Every id the preset names, in declaration order, without duplicates. */
function inventory(preset: QuickbuildPreset): string[] {
  const ids = [
    ...preset.classSkills,
    ...(preset.cantrips ?? []),
    ...(preset.spells ?? []),
    ...Object.values(preset.choices ?? {}).flat(),
    ...Object.values(preset.lineage ?? {}),
    ...(preset.humanFeat ? [preset.humanFeat] : []),
  ];
  return [...new Set(ids)];
}

/** The preset ids that apply to one open choice, most wanted first. */
function preferences(preset: QuickbuildPreset, choice: ActiveOriginChoice): string[] {
  const role = choice.selectionId;
  const id = choice.choice.id;
  const picks = preset.choices ?? {};
  if (role === "class" && id === "skills") return [...preset.classSkills];
  if (role === "class" && id === "cantrips") return [...(preset.cantrips ?? [])];
  if (role === "class" && CLASS_SPELL_SLOTS.includes(id))
    return [...(preset.spells ?? [])];
  const query = choice.choice.pool?.query;
  if (!query)
    return [
      ...Object.values(preset.lineage ?? {}),
      ...preset.abilityOrder.map((code) => ABILITY_BY_CODE[code]),
    ];
  switch (query.kind) {
    case "proficiency":
      if (choice.choice.selectedGrant?.kind === "expertise")
        return [...(picks.expertise ?? [])];
      return query.categories.flatMap((category) =>
        category === "skill"
          ? [...(picks.skill ?? []), ...(picks.skillOrTool ?? [])]
          : category === "tool"
            ? [...(picks.tool ?? []), ...(picks.skillOrTool ?? [])]
            : [...(picks.language ?? [])]
      );
    case "spell":
      return [...(picks.spell ?? [])];
    case "feat":
      return [
        ...(role === "species" && preset.humanFeat ? [preset.humanFeat] : []),
        ...(picks.feat ?? []),
      ];
    default:
      return [];
  }
}

/** Preferred ids the pool offers first, then the pool's own order, up to `count`. */
function pick(
  options: readonly ResolvedPoolOption[],
  preferred: readonly string[],
  count: number
) {
  const offered = options.map((o) => o.option.id);
  const selected: string[] = [];
  for (const id of [...preferred, ...offered]) {
    if (selected.length === count) break;
    if (offered.includes(id) && !selected.includes(id)) selected.push(id);
  }
  return selected;
}

export function applyRecommendedBuild(
  draft: CreationDraft,
  classId: string,
  preset: QuickbuildPreset | undefined = QUICKBUILD_PRESETS[classId]
): RecommendedBuildResult {
  if (!preset) throw new Error("recommended-build-unknown-class");
  let next = selectCreationSource(draft, "class", catalogueSnapshot("class:" + classId));
  next = selectCreationSource(
    next,
    "species",
    catalogueSnapshot("species:" + preset.raceId)
  );
  next = selectCreationSource(
    next,
    "background",
    catalogueSnapshot("background:" + preset.backgroundId)
  );
  next.method = "standard";
  next.scores = Object.fromEntries(
    preset.abilityOrder.map((code, index) => [
      ABILITY_BY_CODE[code],
      STANDARD_SCORES[index] ?? null,
    ])
  ) as CreationScores;
  next.languages = [...preset.languages];
  next = answerCreationChoice(next, "background", "root/background-abilities", [
    ABILITY_BY_CODE[preset.boost[0]] + ":2",
    ABILITY_BY_CODE[preset.boost[1]] + ":1",
  ]);
  const wanted = inventory(preset);
  const matched = new Set<string>();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const preview = previewCreation(next);
    const choice = preview.composition.activeChoices.find(
      (c) => c.active && c.selected.length !== c.choice.count
    );
    if (!choice)
      return { draft: next, preview, unmatched: wanted.filter((id) => !matched.has(id)) };
    const options = preview.options(choice);
    const selected = pick(options, preferences(preset, choice), choice.choice.count);
    for (const id of selected) matched.add(id);
    // The composition binds snapshots by selected index, so keep the selected order.
    const snapshots = selected.flatMap((id) => {
      const snapshot = options.find((o) => o.option.id === id)?.snapshot;
      return snapshot ? [snapshot] : [];
    });
    next = answerCreationChoice(
      next,
      choice.selectionId as CreationRole,
      choice.path,
      selected,
      snapshots
    );
  }
  throw new Error("recommended-build-did-not-settle");
}
