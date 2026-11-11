/**
 * Expertise picked at each Long Rest (`rest-expertise`, a pack feat's Versatile
 * Merc): one skill the character is proficient in gains Expertise until the next
 * Long Rest. The pick lives in the session's option choices (`grantBundleChoices`)
 * under the grant's key, so nothing new is stored; a Long Rest clears it so it is
 * picked again. Headless.
 */
import type { AggregatedGrants } from "@/lib/grants";

type Choices = Readonly<Record<string, string>>;

/** The skills the current picks give Expertise: proficient ones only. */
export function restExpertiseSkills(
  grants: AggregatedGrants["restExpertise"],
  choices: Choices | undefined,
  skills: Readonly<Record<string, string>>
): string[] {
  return grants.flatMap(({ choiceKey }) => {
    const skill = choices?.[choiceKey];
    return skill && skills[skill] === "proficient" ? [skill] : [];
  });
}

/** The option choices after a Long Rest: every rest-expertise pick cleared. */
export function clearRestExpertise(
  grants: AggregatedGrants["restExpertise"],
  choices: Choices
): Record<string, string> {
  const keys = new Set(grants.map((g) => g.choiceKey));
  return Object.fromEntries(Object.entries(choices).filter(([key]) => !keys.has(key)));
}
