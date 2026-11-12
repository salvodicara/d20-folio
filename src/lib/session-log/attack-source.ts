/**
 * Whether an action line's name is a blow, read from the catalogue it names: a weapon
 * (an equipment entry with weapon damage), or a spell that deals damage, makes an
 * attack roll or forces a saving throw. Free text (a homebrew name) never counts.
 * Kept out of `infer-fights.ts` so the session log stays free of the catalogues: the
 * report passes it to `inferFights` (production, 2026-11-12: a player's attack is an
 * action line with no target and no result, so only its name says it was a blow).
 */
import { getEquipment } from "@/data/equipment";
import { spellIndex } from "@/data/spells";
import type { LocText } from "@/lib/loc-text";

export function isAttackSource(source: LocText | undefined): boolean {
  if (!source || !("srd" in source)) return false;
  const { kind, key } = source.srd;
  if (kind === "equipment") return getEquipment(key)?.damage !== undefined;
  if (kind === "spell") {
    const spell = spellIndex.get(key);
    return (
      spell !== undefined &&
      (spell.damageDice !== undefined ||
        spell.attackType !== undefined ||
        spell.saveAbility !== undefined)
    );
  }
  return false;
}
