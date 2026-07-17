/**
 * Fighter maneuver choice modelling (the maneuver subclass — content-pack).
 *
 * 2024 RAW (verified at http://dnd2024.wikidot.com/fighter:battle-master,
 * see the pack's sourcing doc):
 * - Fighter level 3: learn 3 maneuvers (Combat Superiority).
 * - Fighter levels 7, 10, 15: learn 2 additional maneuvers each.
 * - Whenever new maneuvers are learned, one known maneuver may be swapped.
 *
 * Totals known: L3→3, L7→5, L10→7, L15→9 (capped — no further picks).
 *
 * The `fighter-battle-master-combat-superiority` feature is the placeholder
 * that signals the maneuver track opens; the specific maneuvers live as
 * data in `src/data/maneuvers.ts`. This mirrors the Metamagic
 * (`metamagic-pick.ts`) and Eldritch Invocation (`invocation-pick.ts`)
 * pure-module pickers: placeholder detection + per-level scaling + the
 * eligible-option list, consumed by the level-up / creation wizard so the
 * picks surface in `pendingChoices`.
 *
 * Pure module — no React/store/Firebase deps.
 */

import { SRD_MANEUVERS } from "@/data/maneuvers";
import type { SrdManeuver } from "@/data/maneuvers";

const COMBAT_SUPERIORITY_FEATURE_ID = "fighter-battle-master-combat-superiority";

/** True when the feature id is the Combat Superiority (maneuver) placeholder. */
export function isManeuverPlaceholder(featureId: string): boolean {
  return featureId === COMBAT_SUPERIORITY_FEATURE_ID;
}

/**
 * Total maneuvers the subclass knows after gaining the given Fighter
 * level. Returns 0 below level 3 (the subclass / Combat Superiority isn't
 * gained yet). Caps at 9 (no maneuvers are learned after level 15).
 */
export function maneuversKnownAt(fighterLevel: number): number {
  if (fighterLevel < 3) return 0;
  if (fighterLevel < 7) return 3;
  if (fighterLevel < 10) return 5;
  if (fighterLevel < 15) return 7;
  return 9;
}

/**
 * How many NEW maneuver picks the subclass gains AT exactly this
 * Fighter level (the diff vs. the previous level). Returns 0 on any level
 * that is not a maneuver-grant level (3, 7, 10, 15).
 */
export function newManeuversAtLevel(fighterLevel: number): number {
  return maneuversKnownAt(fighterLevel) - maneuversKnownAt(fighterLevel - 1);
}

/** Every maneuver in the composed catalogue (PHB-only — content pack), sorted by id. */
export function listManeuvers(): SrdManeuver[] {
  return [...SRD_MANEUVERS].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The maneuvers the subclass at `fighterLevel` may still choose: all
 * maneuvers they don't already know. The maneuver list has no
 * inter-maneuver prerequisites and no per-maneuver level gates — every
 * maneuver is available from level 3 — so the only filter is "not already
 * known". Order follows {@link listManeuvers} (alphabetical by id).
 */
export function eligibleManeuvers(
  fighterLevel: number,
  alreadyKnown: ReadonlyArray<string>
): SrdManeuver[] {
  if (fighterLevel < 3) return [];
  const known = new Set(alreadyKnown);
  return listManeuvers().filter((m) => !known.has(m.id));
}
