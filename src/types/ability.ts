/** Canonical locale-free ability vocabulary shared by data and mechanics. */

export const ABILITY_CODES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export type AbilityCode = (typeof ABILITY_CODES)[number];
