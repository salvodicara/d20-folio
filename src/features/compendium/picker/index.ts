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
// barrel statically imports `monsterSpec` → the `@/data/monsters` corpus, so
// re-exporting the barrel here would drag that lazy corpus into their chunk graph
// (the eager-partition tripwire pins this). The barrel's aggregate
// (`COMPENDIUM_SPECS` / `AnyCompendiumSpec`) is reachable ONLY from `CompendiumPage`
// + the palette `import()` + tests, which import the barrel directly.
export { spellSpec } from "./specs/spell";
export { featureSpec } from "./specs/feature";
export { featSpec } from "./specs/feat";
export { equipmentSpec } from "./specs/equipment";
export { magicItemSpec } from "./specs/magic-item";
export { maneuverSpec } from "./specs/maneuver";
export { metamagicSpec } from "./specs/metamagic";
export { invocationSpec } from "./specs/invocation";
export { weaponMasterySpec } from "./specs/weapon-mastery";
