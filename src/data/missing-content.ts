/**
 * The catalogue entries a character names that this composition does not hold.
 *
 * The private content pack reaches only allowlisted accounts (docs/ARCHITECTURE.md
 * → the content-pack seam). Anyone else opening a character built with it would
 * get a silently stripped sheet (a missing subclass, spells, Hit Point features),
 * and an edit could save that loss. The sheet routes ask this module first and
 * show "content not available" instead. Homebrew (`custom`) entries never count.
 */
import { packSpells } from "@pack";
import { findBackground } from "@/data/backgrounds";
import { getClassTable } from "@/data/classes";
import { getEquipment } from "@/data/equipment";
import { getFeat } from "@/data/feats";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { getMagicItem } from "@/data/magic-items";
import { SRD_MANEUVERS } from "@/data/maneuvers";
import { METAMAGIC_BY_ID } from "@/data/metamagic";
import { getRace } from "@/data/races";
import { getSpellById } from "@/data/spells";
import { getWeapon } from "@/data/weapons";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import type { CharacterData } from "@/types/character";

/** True when this composition carries the private pack (bundled or downloaded). */
export const packLoaded: boolean = packSpells.length > 0;

export interface MissingRef {
  kind:
    | "race"
    | "background"
    | "class"
    | "subclass"
    | "spell"
    | "feature"
    | "item"
    | "invocation"
    | "maneuver"
    | "metamagic";
  id: string;
}

const isCustom = (entry: object): boolean => "custom" in entry;

export function missingContent(character: CharacterData): MissingRef[] {
  const missing: MissingRef[] = [];
  const check = (kind: MissingRef["kind"], id: string | undefined, known: boolean) => {
    if (id && !known) missing.push({ kind, id });
  };

  check("race", character.race, !!getRace(character.race));
  check("background", character.background, !!findBackground(character.background));
  for (const entry of character.classes) {
    const table = getClassTable(entry.classId);
    check("class", entry.classId, !!table);
    check(
      "subclass",
      entry.subclassId,
      !!table?.subclasses.some((subclass) => subclass.id === entry.subclassId)
    );
    for (const id of entry.invocationChoices ?? []) {
      check(
        "invocation",
        id,
        SRD_INVOCATIONS.some((invocation) => invocation.id === id)
      );
    }
    for (const id of entry.maneuverChoices ?? []) {
      check(
        "maneuver",
        id,
        SRD_MANEUVERS.some((maneuver) => maneuver.id === id)
      );
    }
    for (const id of entry.metamagicChoices ?? []) {
      check("metamagic", id, METAMAGIC_BY_ID.has(id));
    }
  }
  for (const spell of character.spells) {
    if (!isCustom(spell) && "srdId" in spell) {
      check("spell", spell.srdId, !!getSpellById(spell.srdId));
    }
  }
  for (const feature of character.features) {
    if (!isCustom(feature) && "srdId" in feature) {
      check(
        "feature",
        feature.srdId,
        !!getSrdFeatureSource(feature.srdId) || !!getFeat(feature.srdId)
      );
    }
  }
  for (const item of [...character.weapons, ...character.equipment]) {
    if (!isCustom(item) && "srdId" in item) {
      check(
        "item",
        item.srdId,
        !!getWeapon(item.srdId) ||
          !!getEquipment(item.srdId) ||
          !!getMagicItem(item.srdId)
      );
    }
  }
  return missing;
}
