/**
 * What a `detection` sense can sense, in display order (the i18n coverage guard
 * reads this list). Each id is a rules category, not a spell:
 *  - `magic`: magical effects (Detect Magic).
 *  - `evil-and-good`: Aberrations, Celestials, Elementals, Fey, Fiends and Undead,
 *    and hallowed ground (Detect Evil and Good).
 *  - `poison-and-disease`: poisons, poisonous or venomous creatures and magical
 *    contagions (Detect Poison and Disease).
 */
export const DETECTION_TARGETS = [
  "magic",
  "evil-and-good",
  "poison-and-disease",
] as const;
export type DetectionTarget = (typeof DETECTION_TARGETS)[number];
