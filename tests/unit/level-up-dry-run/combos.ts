/**
 * The combinations the dry run levels up, as the production survey prints them
 * (`scripts/survey-level-up-combos.ts`): `<class>[/<subclass>]:<level>` joined by
 * " + ". SRD ids only — a pack subclass's combinations live in the pack's tests.
 */
import { SRD_CLASSES, SRD_SUBCLASS } from "./_srd";

/** The live SRD combinations (survey of 2026-11-26), first in line. */
export const LIVE_COMBOS: readonly string[] = [
  "bard/college-of-lore:3",
  "bard/college-of-lore:4",
  "bard/college-of-lore:5",
  "bard/college-of-lore:9",
  "rogue:6",
];

/** The broad seed: every SRD class with its SRD subclass at 1–8, and a few multiclasses. */
export const SRD_MATRIX: readonly string[] = [
  ...Object.keys(SRD_CLASSES).flatMap((classId) =>
    [1, 2, 3, 4, 5, 6, 7, 8].map((level) =>
      level >= 3 ? `${classId}/${SRD_SUBCLASS[classId]}:${level}` : `${classId}:${level}`
    )
  ),
  "fighter/champion:3 + wizard:1",
  "paladin/oath-of-devotion:2 + warlock:1",
  "paladin:2 + warlock:1",
  "rogue/thief:3 + ranger:1",
  "cleric/life-domain:4 + sorcerer:2",
];
