/**
 * What the deployed Firestore rules accept, for writers that must wait for a rules
 * deploy (the build sets the flag once the rules ship). Off, such a writer leaves the
 * new shape out instead of having its whole write refused.
 */

/**
 * The v0.26.0 combat-effect rules: a feature's state on its target (Stunning Strike),
 * a zone a cast leaves, and a condition's save DC (`bindings.saveDc`).
 */
export function combatEffectsV26On(): boolean {
  return import.meta.env.VITE_COMBAT_EFFECTS_V26 === "true";
}
