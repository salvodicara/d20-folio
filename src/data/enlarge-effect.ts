import type { Grant } from "@/lib/grants";

/**
 * The "enlarge" effect of Enlarge/Reduce (SRD 5.2.1): Advantage on Strength checks
 * and Strength saving throws, +1d4 on hits with enlarged weapons or Unarmed Strikes,
 * and the size step as a note. Shared by the spell's Enlarge option and the Potion of
 * Growth ("you gain the 'enlarge' effect of the Enlarge/Reduce spell"), so both read
 * one declaration.
 */
export const ENLARGE_EFFECT_GRANTS: ReadonlyArray<Grant> = [
  { type: "advantage-on", rollType: "check", vs: "str" },
  { type: "advantage-on", rollType: "save", vs: "str" },
  {
    type: "damage-rider",
    dice: "1d4",
    damageType: "same-as-weapon",
    appliesTo: "weapon-or-unarmed",
  },
  { type: "defense-note" },
];
