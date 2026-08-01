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
import { itemsSpec } from "./items";
import { maneuverSpec } from "./maneuver";
import { metamagicSpec } from "./metamagic";
import { invocationSpec } from "./invocation";
import { weaponMasterySpec } from "./weapon-mastery";
import { monsterSpec } from "./monster";

// D-2: the load-before-render gate for the lazy `monster` catalogue lives at the
// TWO runtime consumers of this registry — the compendium route factory
// (`router.tsx`, awaited before the page renders) and the palette's specs
// `import()` effect (`CommandPalette.tsx`) — each `await ensureSrdKind("monster")`
// before it reads a monster name. It deliberately does NOT sit here as a module
// top-level `await`: a TLA turns this barrel into an async module, and Rolldown
// then refuses to inline the eager app-shell's ~60 shared modules into the entry
// chunk, fragmenting the eager closure ~14→76 chunks and blowing the P3 budget
// (fix(build), 2026-07-24 — see bundle-budget.guard.test.ts). Marking the kind
// resident on the first ensure carries it across later locale switches, so one
// call per consumer suffices. The concrete specs stay pure + side-effect-free
// (`monster.tsx` included); `picker/index.ts` re-exports each from its own module
// (NOT this barrel, which statically imports the corpus via `monsterSpec`), so the
// cockpit add-modals never evaluate this graph and the bestiary corpus stays lazy.

export {
  spellSpec,
  featureSpec,
  featSpec,
  // equipmentSpec + magicItemSpec stay exported: they carry the per-corpus logic
  // the unified `itemsSpec` DELEGATES to (row/detail/verdict/onAdd) and the add-
  // parity + filter-axes tests exercise directly. They are no longer in the
  // registry below — one "Items" entry replaces the two.
  equipmentSpec,
  magicItemSpec,
  itemsSpec,
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
  // ONE unified Items browser (mundane equipment + magic items) — replaces the
  // old separate `equipment` + `magic-item` ribbon entries.
  itemsSpec,
  maneuverSpec,
  metamagicSpec,
  invocationSpec,
  weaponMasterySpec,
  monsterSpec,
] as unknown as AnyCompendiumSpec[];
