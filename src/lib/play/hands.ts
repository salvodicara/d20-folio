/**
 * Free hands for a spell's components (edge-case M18). 2024: a Somatic component
 * needs a free hand; a Material one needs a hand to reach the components or focus,
 * which may be the same hand. Hands are derived from play, never stored: an
 * equipped Shield, and the weapon last attacked with this fight. The table's
 * override (a count of free hands) wins. Out of combat, both hands count as free.
 * It is a warning only: the player can always cast.
 */

export interface HandsFacts {
  /** The equipped Shield, if any; a holy symbol on it is a focus (Cleric, Paladin). */
  shield: "none" | "plain" | "holy-symbol";
  /** Hands taken by the weapon last attacked with this fight (`weaponHands`). */
  heldWeaponHands: 0 | 1 | 2;
  inCombat: boolean;
  /** The table's count of free hands, when it says otherwise. */
  override?: number;
}

export interface SpellComponents {
  v: boolean;
  s: boolean;
  m: boolean;
}

/** The cast warning: no hand for the components; `stow` when sheathing the held
 *  weapon (the turn's free object interaction) would free one. */
export type HandsWarning = { kind: "no-free-hand"; stow: boolean } | null;

/** Hands a weapon takes: two for Two-Handed, or Versatile gripped with both. */
export function weaponHands(
  properties: readonly string[],
  twoHandedGrip: boolean
): 1 | 2 {
  if (properties.includes("Two-Handed")) return 2;
  if (twoHandedGrip && properties.some((p) => p.startsWith("Versatile"))) return 2;
  return 1;
}

export function freeHands(facts: HandsFacts): number {
  if (facts.override !== undefined) return Math.max(0, facts.override);
  if (!facts.inCombat) return 2;
  const shield = facts.shield === "none" ? 0 : 1;
  return Math.max(0, 2 - shield - facts.heldWeaponHands);
}

export function castHandsWarning(
  components: SpellComponents,
  facts: HandsFacts,
  options: { warCaster?: boolean } = {}
): HandsWarning {
  const needsSomatic = components.s && !options.warCaster;
  if (!needsSomatic && !components.m) return null;
  // A holy symbol on the Shield is the focus: it covers the Material component and,
  // in the same hand, a Somatic one alongside it.
  if (components.m && facts.shield === "holy-symbol") return null;
  if (freeHands(facts) > 0) return null;
  return {
    kind: "no-free-hand",
    stow: facts.override === undefined && facts.heldWeaponHands > 0,
  };
}
