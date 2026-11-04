/**
 * The cast dialog's free-hands warning (edge-case M18), from the character as it
 * stands: an equipped Shield, a Cleric's or Paladin's holy symbol (borne on the
 * Shield when one is equipped, otherwise worn), War Caster, and the weapon last
 * attacked with. `null` when the hands are fine. A warning only.
 */
import { ARMOR_BY_ID } from "@/data/armor";
import { characterHasFeat } from "@/lib/compute";
import {
  castHandsWarning,
  heldWeapon,
  type HandsFacts,
  type SpellComponents,
} from "@/lib/play/hands";
import type { CharacterDoc } from "@/types/character";

const HOLY_SYMBOL_CLASSES = new Set(["cleric", "paladin"]);

export type CastHandsView = {
  kind: "no-free-hand";
  /** Sheathing the held weapon (the turn's object interaction) would free a hand. */
  stow: boolean;
  /** An equipped Shield takes the other hand. */
  shield: boolean;
  /** The weapon in hand, for «Riponi …». */
  weaponId?: string;
} | null;

export function castHandsView(
  doc: CharacterDoc,
  spell: { components: SpellComponents }
): CastHandsView {
  const character = doc.character;
  const shield = character.equipment.some(
    (item) =>
      item.equipped === true &&
      ("srdId" in item
        ? ARMOR_BY_ID.get(item.srdId)?.armorCategory === "shield"
        : item.armorCategory === "shield")
  );
  const symbol =
    character.classes.some((c) => HOLY_SYMBOL_CLASSES.has(c.classId)) &&
    character.equipment.some((item) => "srdId" in item && item.srdId === "holy-symbol");
  const held = heldWeapon(doc.session.logEntries);
  const facts: HandsFacts = {
    shield,
    focus: !symbol ? "none" : shield ? "shield" : "worn",
    heldWeaponHands: held?.hands ?? 0,
  };
  const warCaster = characterHasFeat("war-caster", character);
  const warning = castHandsWarning(spell.components, facts, { warCaster });
  if (!warning) return null;
  return held ? { ...warning, shield, weaponId: held.weaponId } : { ...warning, shield };
}
