/**
 * The Play screen's character header: name, identity line (each class with its level,
 * subclass, species, background), the six abilities with modifier, score and save
 * proficiency, the four header numbers exactly as the sheet derives them
 * (`sheetNumbers`), HP with temporary points, and what is going on (Concentration,
 * effects, conditions). In a form (Polymorph, Wild Shape) the sheet becomes the beast:
 * `sheetNumbers` already carries the form's numbers, and `form` names it (the source,
 * then the beast, as the breakdowns do). Pure: every label is localized here.
 */
import { effectiveConditions } from "@/lib/aggregate-character";
import { abilityModifier } from "@/lib/ability";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { currentForm, formNameKind, formSourceKind } from "@/lib/polymorph";
import { playEffectsView } from "@/domains/play/play-effects-view";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { localizeBreakdown } from "@/lib/views/combat-action-view";
import type { BreakdownLine } from "@/lib/value-breakdown";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import {
  localizeBackgroundName,
  localizeClassName,
  localizeRaceName,
  localizeSubclassName,
} from "@/lib/views/srd-i18n";
import { concentrationLabel } from "@/lib/views/concentration-label";
import { ABILITY_CODES, type AbilityCode } from "@/types/ability";
import type { CharacterDoc } from "@/types/character";

export interface PlayHeaderView {
  name: string;
  portraitUrl: string | null;
  identity: string[];
  /** The phone's line (prototype x-play-m): each class with its level, then the species. */
  identityShort: string[];
  abilities: {
    id: AbilityCode;
    mod: number;
    score: number;
    /** Proficient in this save. */
    save: boolean;
    /** The save as the sheet rolls it (override, Exhaustion and every bonus in). */
    saveTotal: number;
    /** The tile shows the total: always when proficient, and whenever something
     *  moves it off the modifier (an ally's aura, a cloak), as the classic tile does. */
    showSave: boolean;
    /** Where the total comes from, a line each (modifier, proficiency, «Aura di Bren
     *  +3»); empty under a hand-set override. */
    saveParts: BreakdownLine[];
  }[];
  numbers: { ac: number; initiative: number; speedFt: number; proficiency: number };
  hp: { current: number; max: number; temp: number };
  concentration: string | null;
  effects: number;
  conditions: number;
  /** The form the character is in, or null. */
  form: { source: string; beast: string } | null;
}

export function playHeaderView(doc: CharacterDoc, locale: Locale): PlayHeaderView {
  const c = doc.character;
  const n = sheetNumbers(doc);
  const saveRows = new Map(
    deriveSavesAndChecks(c, doc.session).saves.map((row) => [row.id, row])
  );
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
    identityShort: [
      ...c.classes.map(
        (entry) => `${localizeClassName(entry.classId, locale)} ${entry.level}`
      ),
      ...(c.race ? [localizeRaceName(c.race, locale)] : []),
    ],
    abilities: ABILITY_CODES.map((id) => {
      const score = n.abilities[id].total;
      const mod = abilityModifier(score);
      const row = saveRows.get(id);
      const save = row?.proficient ?? false;
      const saveTotal = row?.bonus ?? mod;
      return {
        id,
        mod,
        score,
        save,
        saveTotal,
        showSave: save || saveTotal !== mod,
        saveParts: row?.breakdownParts
          ? localizeBreakdown(row.breakdownParts, locale)
          : [],
      };
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
    effects: playEffectsView(doc, locale, () => "").count,
    conditions: effectiveConditions(doc).length,
    form: formNames(doc, locale),
  };
}

function formNames(doc: CharacterDoc, locale: Locale): PlayHeaderView["form"] {
  const form = currentForm(doc.session);
  if (!form) return null;
  return {
    source: localizeSrd(formSourceKind(form.sourceId), form.sourceId, "name", locale),
    beast: localizeSrd(formNameKind(form), form.beastId, "name", locale),
  };
}
