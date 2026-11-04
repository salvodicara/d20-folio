/**
 * Whether a species asks for the spellcasting ability its lineage spells use —
 * the 2024 «Intelligence, Wisdom, or Charisma is your spellcasting ability for
 * the spells you cast with this trait (choose when you select the lineage)».
 * Read from the grants themselves: any spell grant anywhere under the species'
 * traits (lineage bundle options included) that defers its casting ability to
 * the species pick (`spellAbilitySource: "species"`).
 *
 * Pure module — no React, no locale reads.
 */
import { SRD_RACES } from "@/data/races";

/** True when a value anywhere below `node` carries `spellAbilitySource: "species"`. */
function defersToSpecies(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(defersToSpecies);
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.spellAbilitySource === "species") return true;
    return Object.values(record).some(defersToSpecies);
  }
  return false;
}

export function speciesNeedsSpellAbility(raceId: string): boolean {
  const race = SRD_RACES.find((r) => r.id === raceId);
  return !!race && defersToSpecies(race.traits);
}
