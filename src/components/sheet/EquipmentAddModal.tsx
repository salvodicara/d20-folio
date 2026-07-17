/**
 * SRD Equipment browse body — now a thin wrapper over the shared
 * `CompendiumPicker` primitive (Phase 5). All the per-type facts (the category
 * facet, the cost/weight/damage/AC row + detail, the dual weapon/gear commit,
 * already-added dedup across equipment AND weapons) live in `equipmentSpec`
 * (`features/compendium/picker/specs/equipment`); this file only mounts it as
 * the Equipment tab of the unified `AddItemModal`. Behavior is unchanged.
 */

import { CompendiumPicker, equipmentSpec } from "@/features/compendium/picker";

/** Props for the embeddable body used by AddItemModal (no own ModalShell). */
export interface EquipmentAddBodyProps {
  onClose: () => void;
  /** Localised name of the open item (null at the list) — drives the modal title. */
  onDetailTitle?: (title: string | null) => void;
}

export function EquipmentAddBody({ onClose, onDetailTitle }: EquipmentAddBodyProps) {
  return (
    <CompendiumPicker
      spec={equipmentSpec}
      mode="add"
      onClose={onClose}
      onDetailTitle={onDetailTitle}
      autoFocus
    />
  );
}
