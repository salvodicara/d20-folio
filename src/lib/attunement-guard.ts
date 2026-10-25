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
import { attunementSatisfied, requiresAttunement } from "@/lib/attunement";
import { evaluateGrants } from "@/lib/grants";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import type { CharacterData, CharacterDoc } from "@/types/character";

/** The rule's limit: no more than three attuned magic items at a time. */
export const ATTUNEMENT_LIMIT = 3;

type Equipment = CharacterData["equipment"];
type EquipmentRef = Equipment[number];

/** Why the guard says no. `attuned` lists the instance ids standing in the way. */
export type AttunementRefusal =
  | { ok: false; reason: "attunement-limit"; limit: number; attuned: string[] }
  | { ok: false; reason: "duplicate-copy"; attuned: string[] }
  | { ok: false; reason: "no-attunement" }
  | { ok: false; reason: "unknown-item" };

export type CanAttune = { ok: true } | AttunementRefusal;

/** The new equipment list, or the refusal (nothing changed). `forced`: over a limit. */
export type AttuneResult =
  | { ok: true; forced: boolean; equipment: Equipment }
  | AttunementRefusal;

/** How many magic items this character can be attuned to at once. */
export function attunementLimit(doc: CharacterDoc): number {
  const aggregate = evaluateGrants(
    resolveGrantSourcesForFeatures(doc.character.features),
    new Set(doc.session.activeFeatures ?? [])
  );
  return Math.max(ATTUNEMENT_LIMIT, aggregate.attunementSlots);
}

const isAttuned = (ref: EquipmentRef): boolean =>
  requiresAttunement(ref) && attunementSatisfied(ref);

const idOf = (ref: EquipmentRef): string | undefined => ref.instanceId;

/** Whether the item `itemInstanceId` names can be attuned now, and if not, why. */
export function canAttune(doc: CharacterDoc, itemInstanceId: string): CanAttune {
  const equipment = doc.character.equipment;
  const target = equipment.find((ref) => idOf(ref) === itemInstanceId);
  if (!target) return { ok: false, reason: "unknown-item" };
  if (!requiresAttunement(target)) return { ok: false, reason: "no-attunement" };
  if (isAttuned(target)) return { ok: true };

  const attuned = equipment.filter(isAttuned);
  // One copy of an item: a homebrew item is its own thing, never a copy.
  if (!("custom" in target)) {
    const copies = attuned.filter(
      (ref) => !("custom" in ref) && ref.srdId === target.srdId
    );
    if (copies.length > 0) {
      return { ok: false, reason: "duplicate-copy", attuned: copies.flatMap(ids) };
    }
  }
  const limit = attunementLimit(doc);
  if (attuned.length >= limit) {
    return {
      ok: false,
      reason: "attunement-limit",
      limit,
      attuned: attuned.flatMap(ids),
    };
  }
  return { ok: true };
}

const ids = (ref: EquipmentRef): string[] => {
  const id = idOf(ref);
  return id === undefined ? [] : [id];
};

const setAttuned = (equipment: Equipment, itemInstanceId: string, attuned: boolean) =>
  equipment.map((ref) => (idOf(ref) === itemInstanceId ? { ...ref, attuned } : ref));

/**
 * Attune to the item. Refused with the guard's reason unless `force` (the player's
 * override) and the item takes attunement at all; forced, the other attunements stay.
 */
export function attuneItem(
  doc: CharacterDoc,
  itemInstanceId: string,
  options: { force?: boolean } = {}
): AttuneResult {
  const verdict = canAttune(doc, itemInstanceId);
  if (!verdict.ok) {
    const forceable =
      verdict.reason === "attunement-limit" || verdict.reason === "duplicate-copy";
    if (!(forceable && options.force)) return verdict;
  }
  return {
    ok: true,
    forced: !verdict.ok,
    equipment: setAttuned(doc.character.equipment, itemInstanceId, true),
  };
}

/** End the attunement to the item (always allowed); its other fields stay. */
export function unattuneItem(doc: CharacterDoc, itemInstanceId: string): AttuneResult {
  const target = doc.character.equipment.find((ref) => idOf(ref) === itemInstanceId);
  if (!target) return { ok: false, reason: "unknown-item" };
  if (!requiresAttunement(target)) return { ok: false, reason: "no-attunement" };
  return {
    ok: true,
    forced: false,
    equipment: setAttuned(doc.character.equipment, itemInstanceId, false),
  };
}
