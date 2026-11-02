/**
 * The Play screen's character header: name, identity line (each class with its level,
 * subclass, species, background), the six abilities with modifier, score and save
 * proficiency, the four header numbers exactly as the sheet derives them
 * (`sheetNumbers`), HP with temporary points, and what is going on (Concentration,
 * effects, conditions). Pure: every label is localized here.
 */
import { abilityModifier } from "@/lib/ability";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import type { Locale } from "@/lib/locale";
import { effectChipsView } from "@/lib/views/effect-chips-view";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import {
  localizeBackgroundName,
  localizeClassName,
  localizeRaceName,
  localizeSubclassName,
} from "@/lib/views/srd-i18n";
import { concentrationLabel } from "@/lib/views/tracker-view";
import { ABILITY_CODES, type AbilityCode } from "@/types/ability";
import type { CharacterDoc } from "@/types/character";

export interface PlayHeaderView {
  name: string;
  portraitUrl: string | null;
  identity: string[];
  abilities: { id: AbilityCode; mod: number; score: number; save: boolean }[];
  numbers: { ac: number; initiative: number; speedFt: number; proficiency: number };
  hp: { current: number; max: number; temp: number };
  concentration: string | null;
  effects: number;
  conditions: number;
}

export function playHeaderView(doc: CharacterDoc, locale: Locale): PlayHeaderView {
  const c = doc.character;
  const n = sheetNumbers(doc);
  const saves = new Set(c.savingThrows);
  const concentration = doc.session.concentration;
  return {
    name: c.name,
    portraitUrl: doc.portraitUrl,
    identity: [
      ...c.classes.flatMap((entry) => [
        `${localizeClassName(entry.classId, locale)} ${entry.level}`,
        ...(entry.subclassId ? [localizeSubclassName(entry.subclassId, locale)] : []),
      ]),
      ...(c.race ? [localizeRaceName(c.race, locale)] : []),
      ...(c.background ? [localizeBackgroundName(c.background, locale)] : []),
    ],
    abilities: ABILITY_CODES.map((id) => {
      const score = n.abilities[id].total;
      return { id, mod: abilityModifier(score), score, save: saves.has(id) };
    }),
    numbers: {
      ac: n.ac.total,
      initiative: n.initiative.total,
      speedFt: n.speed.total,
      proficiency: n.proficiencyBonus.total,
    },
    hp: {
      current: doc.session.hp.current,
      max: n.maxHp.total,
      temp: doc.session.hp.temp,
    },
    concentration: concentration ? concentrationLabel(concentration, locale) : null,
    effects: effectChipsView(doc, locale).length,
    conditions: effectiveSessionConditions(doc.session).length,
  };
}
