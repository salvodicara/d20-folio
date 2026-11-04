/**
 * Free hands for a spell's components (edge-case M18). 2024: a Somatic component
 * needs a free hand; a Material one needs a hand to reach the components or focus,
 * which may be the same hand. Hands are a standing fact derived from play, never
 * stored: an equipped Shield, and the weapon last attacked with (`heldWeapon`).
 * The table's override (a count of free hands) wins. It is a warning only: the
 * player can always cast.
 */
import { WEAPONS_BY_ID } from "@/data/weapons";
import type { LogEntry } from "@/types/character";

export interface HandsFacts {
  /** An equipped Shield takes a hand. */
  shield: boolean;
  /** A holy symbol used as the focus (Cleric, Paladin): worn visibly, it covers the
   *  Material component with no hand; borne on the Shield, it covers the Material
   *  component and, in that same hand, the Somatic one. */
  focus: "none" | "worn" | "shield";
  /** Hands taken by the weapon last attacked with (`weaponHands`). */
  heldWeaponHands: 0 | 1 | 2;
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
  return Math.max(0, 2 - (facts.shield ? 1 : 0) - facts.heldWeaponHands);
}

export function castHandsWarning(
  components: SpellComponents,
  facts: HandsFacts,
  options: { warCaster?: boolean } = {}
): HandsWarning {
  if (components.m && facts.focus === "shield") return null;
  const needsSomatic = components.s && !options.warCaster;
  const needsMaterial = components.m && facts.focus !== "worn";
  if (!needsSomatic && !needsMaterial) return null;
  if (freeHands(facts) > 0) return null;
  return {
    kind: "no-free-hand",
    stow: facts.override === undefined && facts.heldWeaponHands > 0,
  };
}

/** What a weapon in hand is: its catalogue id and the hands it takes. */
export interface HeldWeapon {
  weaponId: string;
  hands: 1 | 2;
}

/**
 * The weapon last attacked with, read back from the log: held until a rest, time
 * passing, or an object interaction (stowing it, or anything else the hand did).
 * The log has no grip yet, so a Versatile weapon counts as one-handed.
 */
export function heldWeapon(entries: readonly LogEntry[]): HeldWeapon | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const event = entries[i]?.event;
    if (!event) continue;
    if (event.kind === "rest" || event.kind === "time-passes") return null;
    if (event.kind !== "action-use" && event.kind !== "reaction-use") continue;
    const ref = "srd" in event.action ? event.action.srd : null;
    if (!ref) continue;
    if (ref.kind === "rule" && ref.key === "action.object-interaction") return null;
    const weapon = ref.kind === "equipment" ? WEAPONS_BY_ID.get(ref.key) : undefined;
    if (weapon)
      return { weaponId: weapon.id, hands: weaponHands(weapon.properties ?? [], false) };
  }
  return null;
}
