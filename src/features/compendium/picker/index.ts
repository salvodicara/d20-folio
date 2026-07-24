/**
 * CompendiumPicker public surface — the ONE picker primitive both the Compendium
 * page and the five "Add-X" sheet modals import.
 */

export { CompendiumPicker } from "./CompendiumPicker";
export { CompendiumDetailBody } from "./detail";
export { CompendiumResultList } from "./ResultList";
export {
  useCompendiumPicker,
  type PickerMode,
  type CompendiumPickerApi,
} from "./useCompendiumPicker";
export type {
  CompendiumPickerSpec,
  PickerCtx,
  PickerRowView,
  PickerDetailView,
  FilterGroup,
  RowState,
} from "./types";
// D-2: the concrete specs re-export from their OWN modules, NOT the barrel
// (`./specs`) — the cockpit add-modals import them through this index, and the
// barrel carries the `await ensureSrdKind("monster")` side effect that would drag
// the lazy bestiary corpus into their chunk graph. The barrel's aggregate
// (`COMPENDIUM_SPECS` / `AnyCompendiumSpec`) is reachable ONLY from
// `CompendiumPage` + the palette `import()` + tests, which import `./specs` direct.
export { spellSpec } from "./specs/spell";
export { featureSpec } from "./specs/feature";
export { featSpec } from "./specs/feat";
export { equipmentSpec } from "./specs/equipment";
export { magicItemSpec } from "./specs/magic-item";
export { maneuverSpec } from "./specs/maneuver";
export { metamagicSpec } from "./specs/metamagic";
export { invocationSpec } from "./specs/invocation";
export { weaponMasterySpec } from "./specs/weapon-mastery";
