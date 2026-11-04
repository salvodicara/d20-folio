/**
 * attunement-guard — may this character attune to that item right now?
 *
 * SRD 5.2.1 (Magic Items → Attunement): "A creature can't be attuned to more than
 * three magic items at a time. Any attempt to attune to a fourth item fails; the
 * creature must end its Attunement to an item first. Additionally, a creature can't
 * attune to more than one copy of an item."
 *
 * The three is the rule's own number ({@link ATTUNEMENT_LIMIT}); a feature that
 * raises it declares an `attunement-slots` grant (Thief's Use Magic Device: four),
 * read the same way the inventory's "Attuned 2 / 3" count reads it.
 *
 * Pure. The guard answers with the reason; the caller decides. Overrides are always
 * possible: {@link attuneItem} with `force` attunes anyway, and no transition here
 * ever ends another item's attunement on its own.
 */
import type { AttunementPrerequisite } from "@/data/types";
import { getMagicItem } from "@/data/magic-items";
import {
  attunementSatisfied,
  requiresAttunement,
  weaponAttunementSatisfied,
  weaponRequiresAttunement,
} from "@/lib/attunement";
import { highestSpellSlotLevel } from "@/lib/multiclass-slots";
import { evaluateGrants } from "@/lib/grants";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import type { CharacterData, CharacterDoc } from "@/types/character";

/** The rule's limit: no more than three attuned magic items at a time. */
export const ATTUNEMENT_LIMIT = 3;

type Equipment = CharacterData["equipment"];
type Weapons = CharacterData["weapons"];

/** Why the guard says no. `attuned` lists the item keys standing in the way. */
export type AttunementRefusal =
  | { ok: false; reason: "attunement-limit"; limit: number; attuned: string[] }
  | { ok: false; reason: "duplicate-copy"; attuned: string[] }
  | { ok: false; reason: "no-attunement" }
  | { ok: false; reason: "prerequisite"; requires: AttunementPrerequisite }
  | { ok: false; reason: "unknown-item" }
  | { ok: false; reason: "cursed" };

export type CanAttune = { ok: true } | AttunementRefusal;

/** The new equipment and weapons lists, or the refusal (nothing changed). `forced`:
 *  over a limit. */
export type AttuneResult =
  | { ok: true; forced: boolean; equipment: Equipment; weapons: Weapons }
  | AttunementRefusal;

/** How many magic items this character can be attuned to at once. */
export function attunementLimit(doc: CharacterDoc): number {
  const aggregate = evaluateGrants(
    resolveGrantSourcesForFeatures(doc.character.features),
    new Set(doc.session.activeFeatures ?? [])
  );
  return Math.max(ATTUNEMENT_LIMIT, aggregate.attunementSlots);
}

/**
 * One magic item that takes attunement, wherever it is kept: an item of equipment,
 * a homebrew weapon, or a catalogue weapon's bound enchant (a Flame Tongue). Its
 * `key` addresses it in {@link attuneItem}: the instance id, or `weapon:<index>` for
 * a catalogue weapon (which has none).
 */
export interface Attunable {
  key: string;
  /** The catalogue item it is a copy of (one attuned copy at a time); absent for
   *  homebrew, which is its own thing. */
  itemId?: string;
  attuned: boolean;
  requires?: AttunementPrerequisite;
}

/** Every item the character has that takes attunement, equipment and weapons. */
export function attunables(doc: Pick<CharacterDoc, "character">): Attunable[] {
  const { equipment, weapons } = doc.character;
  const fromEquipment = equipment.flatMap((ref, index): Attunable[] => {
    if (!requiresAttunement(ref)) return [];
    const itemId = "custom" in ref ? undefined : ref.srdId;
    const requires = itemId ? getMagicItem(itemId)?.attunementBy : undefined;
    return [
      {
        key: ref.instanceId ?? equipmentAttunementKey(index),
        ...(itemId ? { itemId } : {}),
        attuned: attunementSatisfied(ref),
        ...(requires ? { requires } : {}),
      },
    ];
  });
  const fromWeapons = weapons.flatMap((ref, index): Attunable[] => {
    if ("custom" in ref) {
      return requiresAttunement(ref)
        ? [{ key: ref.instanceId, attuned: attunementSatisfied(ref) }]
        : [];
    }
    if (!weaponRequiresAttunement(ref) || !ref.enchantItemId) return [];
    const requires = getMagicItem(ref.enchantItemId)?.attunementBy;
    return [
      {
        key: weaponAttunementKey(index),
        itemId: ref.enchantItemId,
        attuned: weaponAttunementSatisfied(ref),
        ...(requires ? { requires } : {}),
      },
    ];
  });
  return [...fromEquipment, ...fromWeapons];
}

/** The key an item of equipment without an instance id is addressed by. */
function equipmentAttunementKey(index: number): string {
  return `equipment:${String(index)}`;
}

/** The key a catalogue weapon's attunement is addressed by. */
export function weaponAttunementKey(index: number): string {
  return `weapon:${String(index)}`;
}

/** How many items the character is attuned to, equipment and weapons together. */
export function attunedCount(doc: Pick<CharacterDoc, "character">): number {
  return attunables(doc).filter((a) => a.attuned).length;
}

/** Whether the item `key` names can be attuned now, and if not, why. */
export function canAttune(doc: CharacterDoc, key: string): CanAttune {
  const all = attunables(doc);
  const target = all.find((a) => a.key === key);
  if (!target) return knownWithoutAttunement(doc, key);
  if (target.attuned) return { ok: true };
  if (target.requires && !meetsPrerequisite(doc, target.requires)) {
    return { ok: false, reason: "prerequisite", requires: target.requires };
  }
  const attuned = all.filter((a) => a.attuned);
  // One copy of an item: a homebrew item is its own thing, never a copy.
  if (target.itemId) {
    const copies = attuned.filter((a) => a.itemId === target.itemId);
    if (copies.length > 0) {
      return { ok: false, reason: "duplicate-copy", attuned: copies.map((a) => a.key) };
    }
  }
  const limit = attunementLimit(doc);
  if (attuned.length >= limit) {
    return {
      ok: false,
      reason: "attunement-limit",
      limit,
      attuned: attuned.map((a) => a.key),
    };
  }
  return { ok: true };
}

/** An item that exists but takes no attunement, or none at all. */
function knownWithoutAttunement(doc: CharacterDoc, key: string): AttunementRefusal {
  const { equipment, weapons } = doc.character;
  const exists =
    equipment.some(
      (ref, index) => (ref.instanceId ?? equipmentAttunementKey(index)) === key
    ) ||
    weapons.some(
      (ref, index) =>
        ("custom" in ref && ref.instanceId === key) || weaponAttunementKey(index) === key
    );
  return exists
    ? { ok: false, reason: "no-attunement" }
    : { ok: false, reason: "unknown-item" };
}

/**
 * Whether the character meets an attunement prerequisite. A spellcaster (2024 rules
 * glossary) can cast at least one spell through its own traits or features: spell
 * slots, or any spell on the sheet (a cantrip from a feat or a species counts).
 */
export function meetsPrerequisite(
  doc: CharacterDoc,
  requires: AttunementPrerequisite
): boolean {
  const character = doc.character;
  if (requires.spellcaster) {
    if (highestSpellSlotLevel(character.classes) > 0 || character.spells.length > 0) {
      return true;
    }
  }
  if (requires.classes?.some((id) => character.classes.some((c) => c.classId === id))) {
    return true;
  }
  if (requires.species?.includes(character.race)) return true;
  if (
    requires.attunedItem &&
    attunables(doc).some((a) => a.itemId === requires.attunedItem && a.attuned)
  ) {
    return true;
  }
  return false;
}

/** The lists with the item `key` names set attuned or not; its other fields stay. */
function setAttuned(
  doc: CharacterDoc,
  key: string,
  attuned: boolean
): { equipment: Equipment; weapons: Weapons } {
  const { equipment, weapons } = doc.character;
  return {
    equipment: equipment.map((ref, index) =>
      (ref.instanceId ?? equipmentAttunementKey(index)) === key
        ? { ...ref, attuned }
        : ref
    ),
    weapons: weapons.map((ref, index) =>
      ("custom" in ref ? ref.instanceId === key : weaponAttunementKey(index) === key)
        ? { ...ref, attuned }
        : ref
    ),
  };
}

/**
 * Attune to the item. Refused with the guard's reason unless `force` (the player's
 * override) and the item takes attunement at all; forced, the other attunements stay.
 */
export function attuneItem(
  doc: CharacterDoc,
  key: string,
  options: { force?: boolean } = {}
): AttuneResult {
  const verdict = canAttune(doc, key);
  if (!verdict.ok) {
    const forceable =
      verdict.reason === "attunement-limit" ||
      verdict.reason === "duplicate-copy" ||
      verdict.reason === "prerequisite";
    if (!(forceable && options.force)) return verdict;
  }
  return { ok: true, forced: !verdict.ok, ...setAttuned(doc, key, true) };
}

/**
 * End the attunement to the item; its other fields stay. A cursed item that binds its
 * attunement refuses ("Attuning to the armor curses you until you are targeted by a
 * Remove Curse spell"): attuning already revealed the curse, so this tells nothing new.
 * `force` (the table's override, Remove Curse) ends it anyway.
 */
export function unattuneItem(
  doc: CharacterDoc,
  key: string,
  options: { force?: boolean } = {}
): AttuneResult {
  const target = attunables(doc).find((a) => a.key === key);
  if (!target) return knownWithoutAttunement(doc, key);
  const binds = target.itemId
    ? getMagicItem(target.itemId)?.curse?.bindsAttunement === true
    : false;
  if (target.attuned && binds && !options.force) return { ok: false, reason: "cursed" };
  return { ok: true, forced: target.attuned && binds, ...setAttuned(doc, key, false) };
}
