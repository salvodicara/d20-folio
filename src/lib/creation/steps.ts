/**
 * The creation journey's decision areas, in order — stable ids the draft's
 * requirements point at and every creation screen lays out.
 *
 * Pure module — no React, no locale reads.
 */

/** Every decision area of a new character, in journey order. */
export type CreationStep =
  | "class"
  | "race"
  | "background"
  | "languages"
  | "skills"
  | "spells"
  | "equipment"
  | "bg-asi"
  | "abilities"
  | "review";

export const CREATION_STEPS: readonly CreationStep[] = [
  "class",
  "race",
  "background",
  "languages",
  "skills",
  "spells",
  "equipment",
  "bg-asi",
  "abilities",
  "review",
];
