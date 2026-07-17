/**
 * Magic Item browse body — now a thin wrapper over the shared `CompendiumPicker`
 * primitive (Phase 5). The per-type facts (the combined rarity + type facet, the
 * rarity-tinted glyph row + detail, the verbatim `CustomEquipment` commit with
 * charges / attunement / potion flags, and close-on-add) live in `magicItemSpec`
 * (`features/compendium/picker/specs/magic-item`); this file only mounts it as
 * the Magic Items tab of the unified `AddItemModal`. Behavior is unchanged.
 */

import { CompendiumPicker, magicItemSpec } from "@/features/compendium/picker";

/** Props for the embeddable body used by AddItemModal (no own ModalShell). */
export interface MagicItemAddBodyProps {
  onClose: () => void;
  /** Selected item's name when detail opens, null at the list — drives the title. */
  onDetailTitle?: (title: string | null) => void;
}

export function MagicItemAddBody({ onClose, onDetailTitle }: MagicItemAddBodyProps) {
  return (
    <CompendiumPicker
      spec={magicItemSpec}
      mode="add"
      onClose={onClose}
      onDetailTitle={onDetailTitle}
      autoFocus
    />
  );
}
