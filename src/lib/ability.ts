/**
 * Ability modifier — pure, SRD-free.
 *
 * Lives in its own tiny module (sibling of `@/lib/proficiency`) so the eager
 * persistence layer (the character sanitizer) and other dependency-light callers
 * can import the `floor((score - 10) / 2)` formula WITHOUT pulling `compute.ts`'s
 * transitive SRD imports (classFeatureIndex / magic-items / grants). `compute.ts`
 * re-exports it, so every existing `import { abilityModifier } from "@/lib/compute"`
 * keeps resolving — one sole source of truth (golden rule 6).
 *
 * Formula: floor((score - 10) / 2). Score 10 → +0, 8 → −1, 20 → +5.
 */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
