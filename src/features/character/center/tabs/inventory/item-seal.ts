/**
 * itemSeal — resolve the ONE lucide glyph for an equipment row from its row VM
 * identity, exactly as the pre-decomposition inventory did: a magic item picks by
 * its `type` (magic armor shares the mundane-armor glyph), an SRD gear/armor id
 * resolves via the shared `equipmentSealIconById`, and a custom item falls back to
 * the card's kind default (undefined → the `UniversalCard` chooses). Keeps seal
 * resolution in the component layer (the pure presenter never imports React glyphs)
 * while routing through the SAME `item-icons` source of truth as every other
 * surface (D35).
 */
import {
  equipmentSealIconById,
  magicItemSealIcon,
  type ItemGlyph,
} from "@/components/shared/item-icons";
import type { ItemRowVM } from "@/lib/views/inventory-view";

export function itemSeal(vm: ItemRowVM): ItemGlyph | undefined {
  if (vm.isCustom) return undefined;
  if (vm.magicItemType) return magicItemSealIcon(vm.magicItemType);
  return equipmentSealIconById(vm.id);
}
