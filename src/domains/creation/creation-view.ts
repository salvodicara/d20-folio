/**
 * The new creation screen (approved prototypes create-1…6): every class as a card,
 * the «Personaggio» summary beside the steps, and every background with its two
 * skills and its origin feat. A card's art is data (`ClassArt`): a game-icons glyph
 * for every class until the full set of paintings exists, then all swap at once.
 */
import i18n from "i18next";

import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { DEFAULT_QUICKBUILD_PRESET, QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { SRD_RACES } from "@/data/races";
import { classTables } from "@/data/classes";
import { localizeSrd } from "@/i18n/resolver";
import {
  creationFacts,
  type CreationDraft,
  type CreationFacts,
} from "@/lib/creation/draft";
import type { Locale } from "@/lib/locale";
import { appliedQuickbuildState } from "@/lib/quickbuild";
import { raceTraitNameOfSlot, raceTraitNames } from "@/lib/views/creation-view";
import type { AbilityCode } from "@/types/ability";
import type { IconName } from "@/ui/icon-names";
import { ALL_SKILLS, skillNameToId } from "@/lib/skills";
import { SRD_TOOLS_2024 } from "@/lib/tools";
import { listAvailableForLanguageSlot } from "@/lib/feat-language-choices";
import { listAvailableForSlot } from "@/lib/feat-spell-choices";
import type { ChoicePicks, FeatureChoiceSlots } from "@/lib/feature-choices";
import { byLevelThenName, spellPickVM } from "@/lib/views/spell-pick-view";
import {
  equipmentName,
  featName,
  invocationName,
  spellName,
} from "@/lib/views/level-up-view";
import { getFeaturesAtLevel } from "@/data/classes";
import { collectGrantBundles } from "@/lib/feature-choices";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { localizeText } from "@/lib/views/srd-i18n";
import type { ClassChoicePicks } from "@/lib/creation/class-choices";
import { ORIGIN_LANGUAGE_SLOT_ID } from "@/lib/creation-choices";
import { formatSpeed } from "@/lib/utils";
import { rapidDraft } from "@/lib/creation/rapid";
import { lineageBundleVMs } from "@/lib/views/creation-view";
import { buildNewCharacter } from "@/lib/creation/build";

/** A class card's art: one kind for every class at a time. */
export type ClassArt = { kind: "glyph"; icon: IconName };

export interface ClassCard {
  id: string;
  name: string;
  art: ClassArt;
}

export function classCards(locale: Locale): ClassCard[] {
  return classTables
    .map((table) => ({
      id: table.id,
      name: localizeSrd("class", table.id, "name", locale),
      art: { kind: "glyph" as const, icon: `g-class-${table.id}` as IconName },
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

const ARMOR_ORDER: readonly string[] = [
  "light-armor",
  "medium-armor",
  "heavy-armor",
  "shields",
];

export interface CreationSummary {
  classId: string;
  className: string;
  level: number;
  hitDie: string;
  /** The class's main ability (or abilities), named. */
  primaryAbility: string;
  /** The armour the class trains with, in a few words («leggere, medie, scudi»). */
  armor: string;
  /** The background's name, once one is chosen. */
  background: string | null;
  /** The species' name. */
  species: string;
  /** The class's main ability with its score as built («Saggezza 17 (+3)»). */
  primaryScore: { code: AbilityCode; score: number; mod: number } | null;
}

export function creationSummary(
  draft: CreationDraft,
  facts: CreationFacts,
  locale: Locale
): CreationSummary {
  const t = i18n.getFixedT(locale);
  const table = facts.classTable;
  const or = new Intl.ListFormat(locale, { type: "disjunction" });
  return {
    classId: draft.classId,
    className: localizeSrd("class", draft.classId, "name", locale),
    level: draft.level,
    hitDie: `d${String(facts.hitDie)}`,
    primaryAbility: or.format(
      (table?.primaryAbility ?? []).map((a) => t(`abilities.${a}`))
    ),
    armor: (table?.armorProficiencies ?? [])
      .filter((id) => ARMOR_ORDER.includes(id))
      .sort((a, b) => ARMOR_ORDER.indexOf(a) - ARMOR_ORDER.indexOf(b))
      .map((id) => t(`create.screen.armorShort.${id}`))
      .join(", "),
    background: facts.backgroundData
      ? localizeSrd("background", facts.backgroundData.id, "name", locale)
      : null,
    species: localizeSrd("race", draft.raceId, "name", locale),
    primaryScore: primaryScoreOf(table?.primaryAbility ?? [], facts),
  };
}

export interface BackgroundRow {
  id: string;
  name: string;
  skills: string[];
  /** The origin feat's name. */
  feat: string;
}

export function backgroundRows(locale: Locale): BackgroundRow[] {
  const t = i18n.getFixedT(locale);
  return SRD_BACKGROUNDS.map((bg) => ({
    id: bg.id,
    name: localizeSrd("background", bg.id, "name", locale),
    skills: bg.skillProficiencies.map((skill) =>
      t(`skills.${skillNameToId(skill) ?? skill}`)
    ),
    feat: localizeSrd("feat", bg.feat, "name", locale),
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

export interface SpeciesRow {
  id: string;
  name: string;
  /** Up to three of its traits, named. */
  traits: string[];
}

export function speciesRows(locale: Locale): SpeciesRow[] {
  return SRD_RACES.map((race) => ({
    id: race.id,
    name: localizeSrd("race", race.id, "name", locale),
    traits: raceTraitNames(race.id, 3, locale),
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

const ABILITY_ORDER: readonly AbilityCode[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export interface AbilityTile {
  code: AbilityCode;
  /** The score chosen (suggested, bought or rolled). */
  base: number;
  /** The background's bonus on it (0, 1 or 2). */
  bonus: number;
  score: number;
  mod: number;
}

/** The six abilities as the step shows them: base, background bonus, score. */
export function abilityTiles(draft: CreationDraft, facts: CreationFacts): AbilityTile[] {
  return ABILITY_ORDER.map((code) => {
    const base = draft.abilityScores[code];
    const score = facts.effectiveScores[code];
    return { code, base, bonus: score - base, score, mod: Math.floor((score - 10) / 2) };
  });
}

/** The class's ready-made scores (its quickbuild): «Valori consigliati». */
export function suggestedScores(classId: string): Record<AbilityCode, number> {
  const preset = QUICKBUILD_PRESETS[classId] ?? DEFAULT_QUICKBUILD_PRESET;
  return { ...appliedQuickbuildState(classId, preset).abilityScores };
}

/**
 * Where the suggested build puts the background's +2/+1: the two eligible abilities
 * with the highest scores, the +2 first (ties keep the background's own order).
 */
export function suggestedBonus(
  scores: Record<AbilityCode, number>,
  eligible: ReadonlyArray<AbilityCode>
): AbilityCode[] {
  return [...eligible].sort((a, b) => scores[b] - scores[a]).slice(0, 2);
}

/** The best of the class's main abilities, as built. */
function primaryScoreOf(
  codes: ReadonlyArray<AbilityCode>,
  facts: CreationFacts
): CreationSummary["primaryScore"] {
  const best = [...codes].sort(
    (a, b) => facts.effectiveScores[b] - facts.effectiveScores[a]
  )[0];
  if (!best) return null;
  const score = facts.effectiveScores[best];
  return { code: best, score, mod: Math.floor((score - 10) / 2) };
}

/** A modifier as the sheet writes it: «+2», «−1» (a real minus sign). */
export const signed = (n: number): string =>
  n >= 0 ? `+${String(n)}` : `−${String(-n)}`;

/** One pick a species or its feat asks for, ready to draw as chips. */
export interface ChoiceSlotRow {
  kind: "skill" | "tool" | "skillOrTool" | "language" | "spell" | "expertise";
  slotId: string;
  /** The species trait that asks («Sensi Acuti»); "" when the slot is a feat's. */
  source: string;
  /** «Scegli 1 abilità», «Scegli 2 trucchetti da Mago». */
  title: string;
  amount: number;
  picked: readonly string[];
  options: ReadonlyArray<{ id: string; label: string }>;
}

/**
 * Every slot in `slots` as a row of options: the slot's own pool (an empty skill
 * pool is any skill), minus what the build already owns (`ownedSkills`,
 * `ownedSpells`) unless it is this slot's own pick.
 */
export function choiceSlotRows(
  slots: FeatureChoiceSlots,
  picks: ChoicePicks,
  owned: { skills: ReadonlySet<string>; spells: ReadonlySet<string> },
  locale: Locale
): ChoiceSlotRow[] {
  const t = i18n.getFixedT(locale);
  const skill = (id: string) => ({ id, label: t(`skills.${id}`) });
  const free = (picked: readonly string[], set: ReadonlySet<string>) => (id: string) =>
    picked.includes(id) || !set.has(id);
  const allSkills = ALL_SKILLS.map((s) => s.id);
  const rows: ChoiceSlotRow[] = [];
  for (const slot of slots.skill) {
    const picked = picks.skill[slot.slotId] ?? [];
    rows.push({
      kind: "skill",
      slotId: slot.slotId,
      source: raceTraitNameOfSlot(slot.slotId, locale),
      title: t("featChoices.pickSkills", { count: slot.amount }),
      amount: slot.amount,
      picked,
      options: (slot.options.length ? slot.options : allSkills)
        .filter(free(picked, owned.skills))
        .map(skill),
    });
  }
  for (const slot of slots.skillOrTool) {
    const picked = picks.skillOrTool[slot.slotId] ?? [];
    rows.push({
      kind: "skillOrTool",
      slotId: slot.slotId,
      source: raceTraitNameOfSlot(slot.slotId, locale),
      title: t("featChoices.pickSkillsOrTools", { count: slot.amount }),
      amount: slot.amount,
      picked,
      options: [
        ...allSkills.filter(free(picked, owned.skills)).map(skill),
        ...SRD_TOOLS_2024.map((tool) => ({
          id: tool.id,
          label: localizeSrd("equipment", tool.id, "name", locale),
        })),
      ],
    });
  }
  for (const slot of slots.expertise) {
    const picked = picks.expertise[slot.slotId] ?? [];
    rows.push({
      kind: "expertise",
      slotId: slot.slotId,
      source: raceTraitNameOfSlot(slot.slotId, locale),
      title: t("featChoices.pickExpertise", { count: slot.amount }),
      amount: slot.amount,
      picked,
      options: [...owned.skills].map(skill),
    });
  }
  for (const slot of slots.tool) {
    rows.push({
      kind: "tool",
      slotId: slot.slotId,
      source: raceTraitNameOfSlot(slot.slotId, locale),
      title: t("featChoices.pickTools", { count: slot.amount }),
      amount: slot.amount,
      picked: picks.tool[slot.slotId] ?? [],
      options: slot.options.map((id) => ({
        id,
        label: localizeSrd("equipment", id, "name", locale),
      })),
    });
  }
  for (const slot of slots.language) {
    rows.push({
      kind: "language",
      slotId: slot.slotId,
      source: raceTraitNameOfSlot(slot.slotId, locale),
      title: t("featChoices.pickLanguages", { count: slot.amount }),
      amount: slot.amount,
      picked: picks.language[slot.slotId] ?? [],
      options: listAvailableForLanguageSlot(slot).map((id) => ({
        id,
        label: localizeSrd("language", id, "name", locale),
      })),
    });
  }
  for (const slot of slots.spell) {
    const picked = picks.spell[slot.slotId] ?? [];
    const className = slot.classSpellList ? t(`srd.class_${slot.classSpellList}`) : "";
    const key = className
      ? slot.kind === "cantrip"
        ? "featChoices.pickClassCantrips"
        : "featChoices.pickClassSpells"
      : slot.kind === "cantrip"
        ? "featChoices.pickCantrips"
        : "featChoices.pickSpells";
    const excluded = new Set([...owned.spells].filter((id) => !picked.includes(id)));
    rows.push({
      kind: "spell",
      slotId: slot.slotId,
      source: raceTraitNameOfSlot(slot.slotId, locale),
      // The shared rubric marks the class with <c>…</c> for the old picker's emphasis.
      title: t(key, { count: slot.count, className }).replace(/<\/?c>/g, ""),
      amount: slot.count,
      picked,
      options: listAvailableForSlot(slot, excluded)
        .map((sp) => spellPickVM(sp, locale))
        .sort(byLevelThenName(locale))
        .map((vm) => ({ id: vm.id, label: vm.name })),
    });
  }
  return rows;
}

/** `picks` with `id` toggled in one slot: added up to the amount, then the oldest gives way. */
export function toggleChoicePick(
  picks: ChoicePicks,
  row: Pick<ChoiceSlotRow, "kind" | "slotId" | "amount" | "picked">,
  id: string
): ChoicePicks {
  const next = row.picked.includes(id)
    ? row.picked.filter((p) => p !== id)
    : row.picked.length < row.amount
      ? [...row.picked, id]
      : [...row.picked.slice(1), id];
  return { ...picks, [row.kind]: { ...picks[row.kind], [row.slotId]: next } };
}

/**
 * The Armor Class the new character will have: the build's own (its starting
 * armor worn, a shield, grants), read before it has a name.
 */
export function previewArmorClass(draft: CreationDraft, facts: CreationFacts): number {
  const built = buildNewCharacter(
    { ...draft, name: draft.name.trim() || "—" },
    { displayName: null }
  );
  return built.ok ? built.payload.character.ac : facts.armorClass;
}

/** The Riepilogo's rows: what the character is made of, every name localized. */
export interface CreationReview {
  hp: number;
  ac: number;
  /** «9 m» / «30 ft». */
  speed: string;
  /** The level its subclass arrives at, when not yet (null once due or never). */
  subclassLevel: number | null;
  cantrips: string[];
  spells: string[];
  /** Background, class and species skills, in table order. */
  skills: string[];
  /** Common plus the origin picks. */
  languages: string[];
}

export function creationReview(
  draft: CreationDraft,
  facts: CreationFacts,
  locale: Locale
): CreationReview {
  const t = i18n.getFixedT(locale);
  const picked = new Set([
    ...facts.backgroundSkillIds,
    ...draft.classSkills,
    ...Object.values(draft.choicePicks.skill).flat(),
    ...Object.values(draft.choicePicks.skillOrTool).flat(),
  ]);
  const languages = ["common", ...(draft.languagePicks[ORIGIN_LANGUAGE_SLOT_ID] ?? [])];
  const hasSubclasses = (facts.classTable?.subclasses.length ?? 0) > 0;
  return {
    hp: facts.maxHp,
    ac: previewArmorClass(draft, facts),
    speed: formatSpeed(String(facts.raceData?.speed ?? 30), locale),
    subclassLevel: hasSubclasses && !facts.subclassDue ? facts.subclassLevel : null,
    cantrips: draft.cantrips.map((id) => spellName(id, locale)),
    spells: draft.spells.map((id) => spellName(id, locale)),
    skills: ALL_SKILLS.filter((s) => picked.has(s.id)).map((s) => t(`skills.${s.id}`)),
    languages: languages.map((id) => localizeSrd("language", id, "name", locale)),
  };
}

/** One of the class's creation choices, ready to draw as chips. */
export type ClassChoiceSection =
  | {
      kind: "bundle";
      bundleKey: string;
      title: string;
      picked: string | null;
      options: ReadonlyArray<{ id: string; label: string }>;
    }
  | {
      kind: keyof ClassChoicePicks;
      title: string;
      count: number;
      picked: readonly string[];
      options: ReadonlyArray<{ id: string; label: string }>;
    };

/** What the class asks at creation (Divine Order, Fighting Style, …), named. */
export function classChoiceSections(
  draft: CreationDraft,
  facts: CreationFacts,
  locale: Locale
): ClassChoiceSection[] {
  const t = i18n.getFixedT(locale);
  const { classNeeds, classOptions } = facts;
  const refs = Array.from({ length: draft.level }, (_, i) =>
    getFeaturesAtLevel(draft.classId, i + 1)
  )
    .flat()
    .map((f) => ({ srdId: f.id }));
  const bundles = collectGrantBundles(resolveGrantSourcesForFeatures(refs), new Map())
    .filter((b) => classNeeds.bundleKeys.includes(b.bundleKey))
    .map(
      (b): ClassChoiceSection => ({
        kind: "bundle",
        bundleKey: b.bundleKey,
        title: localizeText(b.label, locale),
        picked: draft.lineageChoices[b.bundleKey] ?? null,
        options: b.options.map((o) => ({
          id: o.id,
          label: localizeText(o.label, locale),
        })),
      })
    );
  const named: Record<keyof ClassChoicePicks, (id: string) => string> = {
    fightingStyles: (id) => featName(id, locale),
    weaponMasteries: (id) => equipmentName(id, locale),
    invocations: (id) => invocationName(id, locale),
    expertise: (id) => t(`skills.${id}`),
  };
  const titles: Record<keyof ClassChoicePicks, string> = {
    fightingStyles: t("levelUp.chooseFightingStyle"),
    weaponMasteries: t("levelUp.chooseWeaponMastery", { n: classNeeds.weaponMasteries }),
    invocations: t("levelUp.chooseInvocations", { n: classNeeds.invocations }),
    expertise: t("levelUp.chooseExpertise", { n: classNeeds.expertise }),
  };
  const picks = (
    ["fightingStyles", "weaponMasteries", "invocations", "expertise"] as const
  )
    .filter((kind) => classNeeds[kind] > 0)
    .map(
      (kind): ClassChoiceSection => ({
        kind,
        title: titles[kind],
        count: classNeeds[kind],
        picked: draft.classPicks[kind],
        options: classOptions[kind].map((id) => ({ id, label: named[kind](id) })),
      })
    );
  return [...bundles, ...picks];
}

/** `picked` with `id` toggled, up to `count`; past it the oldest gives way. */
export function toggleCount(
  picked: readonly string[],
  id: string,
  count: number
): string[] {
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  return picked.length < count ? [...picked, id] : [...picked.slice(1), id];
}

/**
 * The identity-shaping picks «Creazione rapida» makes for a class and a species,
 * in one line («Lignaggio elfico: Alto Elfo · Ordine Divino: Protettore · Stile di
 * Combattimento: Difesa»): read from the very draft it will save, so the player
 * sees what Folio chose and can change it later from the sheet.
 */
export function rapidPicksLine(draft: CreationDraft, locale: Locale): string {
  const t = i18n.getFixedT(locale);
  const made = rapidDraft(draft, draft.classId, draft.raceId);
  const facts = creationFacts(made);
  const named = (label: string, value: string) => `${label}: ${value}`;
  const parts: string[] = [];
  for (const b of lineageBundleVMs(made.raceId, locale)) {
    const option = b.options.find((o) => o.id === made.lineageChoices[b.bundleKey]);
    if (option) parts.push(named(b.label, option.label));
  }
  if (made.speciesSpellAbility) {
    parts.push(
      named(t("create.screen.speciesAbility"), t(`abilities.${made.speciesSpellAbility}`))
    );
  }
  if (made.humanFeat)
    parts.push(named(t("create.humanVersatileLabel"), featName(made.humanFeat, locale)));
  for (const section of classChoiceSections(made, facts, locale)) {
    if (section.kind === "bundle") {
      const option = section.options.find((o) => o.id === section.picked);
      if (option) parts.push(named(section.title, option.label));
    }
  }
  const list = (ids: readonly string[], name: (id: string) => string) =>
    ids.map(name).join(", ");
  if (made.classPicks.fightingStyles.length > 0) {
    parts.push(
      named(
        t("feats.category_fighting-style"),
        list(made.classPicks.fightingStyles, (id) => featName(id, locale))
      )
    );
  }
  if (made.classPicks.invocations.length > 0) {
    parts.push(
      named(
        t("invocations.section"),
        list(made.classPicks.invocations, (id) => invocationName(id, locale))
      )
    );
  }
  if (made.classPicks.weaponMasteries.length > 0) {
    parts.push(
      named(
        t("character.weaponMastery"),
        list(made.classPicks.weaponMasteries, (id) => equipmentName(id, locale))
      )
    );
  }
  return parts.join(" · ");
}
