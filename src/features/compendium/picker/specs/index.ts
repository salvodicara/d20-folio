/**
 * The per-type compendium specs + the ordered registry the Compendium page
 * browses. The five modal wrappers import their concrete spec directly (keeping
 * full `T` type-safety); the page treats specs opaquely, so the registry erases
 * `T` — sound because every entry always flows back into the SAME spec's
 * accessors. Add a content type = add a spec here.
 */

import { ensureSrdKind } from "@/i18n";
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
import { monsterSpec } from "./monster";

// D-2: the load-before-render seam. The barrel is only ever imported dynamically
// (CompendiumPage's `React.lazy` route chunk + the palette's `import()`), so this
// top-level `await` gates every registry consumer — the compendium route, the
// palette index, deep links — with the lazy `monster` catalogue resident for
// every currently-loaded locale, WITHOUT a single call-site change. The concrete
// specs stay pure + side-effect-free (`monster.tsx` included); `picker/index.ts`
// re-exports each from its own module (NOT from here), so the cockpit add-modals
// never evaluate this graph and the bestiary corpus stays out of their chunk.
await ensureSrdKind("monster");

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
  monsterSpec,
};

/** A type-erased spec the page can hold heterogeneously (see note above). */
export type AnyCompendiumSpec = CompendiumPickerSpec<unknown>;

/** The ordered registry the Compendium page exposes as its type selector.
 *  The Monsters wing appends LAST (D-7): existing `?type=` deep links + the ribbon
 *  muscle memory stay stable — the bestiary is a new wing, not a reordering. */
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
  monsterSpec,
] as unknown as AnyCompendiumSpec[];
