/**
 * Item browse body — the embeddable "Items" tab of the unified `AddItemModal`.
 * A thin wrapper over the shared `CompendiumPicker` primitive driven by the
 * unified `itemsSpec` (mundane equipment + magic items in one searchable list,
 * one smart facet rail). Replaces the old separate `EquipmentAddBody` +
 * `MagicItemAddBody` bodies — the merge lives entirely in the spec.
 */

import { CompendiumPicker, itemsSpec } from "@/features/compendium/picker";

/** Props for the embeddable body used by AddItemModal (no own ModalShell). */
export interface ItemAddBodyProps {
  onClose: () => void;
  /** Localised name of the open item (null at the list) — drives the modal title. */
  onDetailTitle?: (title: string | null) => void;
}

export function ItemAddBody({ onClose, onDetailTitle }: ItemAddBodyProps) {
  return (
    <CompendiumPicker
      spec={itemsSpec}
      mode="add"
      onClose={onClose}
      onDetailTitle={onDetailTitle}
      autoFocus
    />
  );
}
