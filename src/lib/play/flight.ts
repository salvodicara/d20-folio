/**
 * Flying and Prone (rules glossary, "Flying"; edge-case family M14): a flyer that
 * can't hover falls when it is knocked Prone while aloft. The sheet has no
 * altitude, so whether the creature is aloft is the table's fact; this module only
 * says whether Prone would bring it down.
 */
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { formFacts } from "@/lib/polymorph";
import { ruleFlag } from "@/lib/rules";
import type { CharacterDoc } from "@/types/character";

/** Whether being knocked Prone makes the character fall if aloft: it can fly, and
 *  none of its fly speeds can hover. A form's own speeds replace the character's;
 *  a Beast form records no hover, so its fly speed never does. */
export function fallsIfProne(doc: CharacterDoc): boolean {
  const form = formFacts(doc.session, doc.character.abilityScores);
  if (form) return form.speeds.fly !== undefined;
  const agg = aggregateCharacterGrants(doc.character, doc.session);
  return agg.flySpeed !== null && !ruleFlag(agg.values, "speed:fly:hover");
}

/** Whether the character is Prone with a flight that can't hover: the table's cue
 *  that it falls if it is aloft. */
export function proneInFlight(doc: CharacterDoc): boolean {
  return doc.session.conditions.includes("prone") && fallsIfProne(doc);
}
