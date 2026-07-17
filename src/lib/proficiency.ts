/**
 * Proficiency bonus — pure, SRD-free.
 *
 * Lives in its own tiny module (not `compute.ts`) so the roster glance can import
 * it WITHOUT pulling `compute.ts`'s transitive SRD imports (classFeatureIndex /
 * magic-items / grants). `compute.ts` re-exports it, so every existing
 * `import { proficiencyBonus } from "@/lib/compute"` keeps working — one source.
 *
 * Levels 1-4: +2 · 5-8: +3 · 9-12: +4 · 13-16: +5 · 17-20: +6.
 */
export function proficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}
