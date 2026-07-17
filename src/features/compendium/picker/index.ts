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
  COMPENDIUM_SPECS,
  type AnyCompendiumSpec,
} from "./specs";
