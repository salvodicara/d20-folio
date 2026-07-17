import type { DamageType } from "../types";
import type { Grant } from "@/lib/grants";

// The damage types the resistance chooser offers. The chooser's label AND each
// per-type option label live in the SRD catalogue, keyed
// `<itemId>.grants.0.{label | options.<type>.label}` — the engine localizes them
// off the magic-item source's `ref` (R6+R3 SLICE 7d), so NO display text is
// declared here.
const RESISTANCE_TYPES: ReadonlyArray<DamageType> = [
  "acid",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "poison",
  "psychic",
  "radiant",
  "thunder",
];

/**
 * Builds the single-select "choose a damage type" bundle shared by the Ring of
 * Resistance and Armor of Resistance (the DM assigns the type at creation;
 * we model it as a re-selectable variant chooser the player picks once). Each
 * option resolves to a `damage-resistance` grant for that type. Display labels
 * are catalogue-resolved at the view edge — none are declared here.
 */
export function RESISTANCE_TYPE_BUNDLE(itemId: string): Grant {
  return {
    type: "choice-grant-bundle",
    bundleKey: `${itemId}-resistance`,
    options: RESISTANCE_TYPES.map((type) => ({
      id: type,
      grants: [{ type: "damage-resistance", damageType: type }],
    })),
  };
}
