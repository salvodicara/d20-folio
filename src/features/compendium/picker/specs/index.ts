/**
 * The per-type compendium specs + the ordered registry the Compendium page
 * browses. The five modal wrappers import their concrete spec directly (keeping
 * full `T` type-safety); the page treats specs opaquely, so the registry erases
 * `T` — sound because every entry always flows back into the SAME spec's
 * accessors. Add a content type = add a spec here.
 */

import type { CompendiumPickerSpec } from "../types";
import { spellSpec } from "./spell";
import { featureSpec } from "./feature";
import { featSpec } from "./feat";
import { equipmentSpec } from "./equipment";
import { magicItemSpec } from "./magic-item";
import { maneuverSpec } from "./maneuver";
import { metamagicSpec } from "./metamagic";
import { invocationSpec } from "./invocation";
import { weaponMasterySpec } from "./weapon-mastery";

export {
  spellSpec,
  featureSpec,
  featSpec,
  equipmentSpec,
  magicItemSpec,
  maneuverSpec,
  metamagicSpec,
  invocationSpec,
  weaponMasterySpec,
};

/** A type-erased spec the page can hold heterogeneously (see note above). */
export type AnyCompendiumSpec = CompendiumPickerSpec<unknown>;

/** The ordered registry the Compendium page exposes as its type selector. */
export const COMPENDIUM_SPECS: readonly AnyCompendiumSpec[] = [
  spellSpec,
  featureSpec,
  featSpec,
  equipmentSpec,
  magicItemSpec,
  maneuverSpec,
  metamagicSpec,
  invocationSpec,
  weaponMasterySpec,
] as unknown as AnyCompendiumSpec[];
