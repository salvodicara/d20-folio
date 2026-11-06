/**
 * Find Familiar — the EAGER-SAFE constants (NO corpus import).
 *
 * The Find Familiar summon flow has an eager side (the SpellsTab affordance + the
 * rail-section shell key their behaviour off the spell id and the creature-type
 * union) and a lazy side (the form picker + statblock, which join the monster
 * corpus — that lives in {@link import("./familiar")}). This module holds ONLY the
 * ids/tokens the eager side needs, so importing it can never drag `@/data/monsters`
 * into the startup closure (the Polymorph spell-id precedent in
 * `lib/polymorph.ts`).
 */

/** The Find Familiar spell id — the affordance key + the `companionHp` key the
 *  familiar's current HP rides under (a spell id can't collide with a class-feature
 *  srdId, so the one HP home stays unambiguous — golden rule 6). */
export const FIND_FAMILIAR_SPELL_ID = "find-familiar";

/**
 * The 2024 Find Familiar type swap — the familiar "is a Celestial, Fey, or Fiend
 * (your choice) instead of a Beast" (SRD 5.2.1, Find Familiar). A subset of
 * {@link import("@/data/types").CreatureType}; stored on `session.familiar.creatureType`
 * and spread over the chosen form's stat block at render (`{ ...form, type }`).
 */
export type FamiliarCreatureType = "celestial" | "fey" | "fiend";

/** The three type-swap options in commit order (the picker's Segmented). */
export const FAMILIAR_CREATURE_TYPES: readonly FamiliarCreatureType[] = [
  "celestial",
  "fey",
  "fiend",
];

/** Where a creature is (edge-case M19): a plane, or inside an extradimensional space
 *  (a container's instanceId: a Bag of Holding, a Rope Trick), which is on no plane. */
export interface CreatureLocation {
  plane?: string;
  inside?: string;
}

const MAX_LOCATION_ID = 128;
const locationId = (raw: unknown): string | undefined =>
  typeof raw === "string" && raw && raw.length <= MAX_LOCATION_ID ? raw : undefined;

/** A stored location, bounded; absent when it names neither a plane nor a space. */
export function parseCreatureLocation(raw: unknown): CreatureLocation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const plane = locationId(r.plane);
  const inside = locationId(r.inside);
  return plane || inside
    ? { ...(plane ? { plane } : {}), ...(inside ? { inside } : {}) }
    : undefined;
}

/** Where the character is; absent when untagged (every plane check then says yes). */
export function locationOf(session: {
  location?: CreatureLocation;
}): CreatureLocation | undefined {
  return session.location;
}
