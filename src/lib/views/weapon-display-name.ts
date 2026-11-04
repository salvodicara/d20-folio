/**
 * A weapon's name as every surface shows it (the inventory, the actions, the tray):
 * a magic weapon is named by its enchant, the weapon after it, as D&D Beyond does
 * («Lingua di Fiamme (Spada Lunga)»), so the player sees at a glance which one is
 * magic. A plain weapon keeps its own name.
 */
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";

export function weaponDisplayName(
  weaponName: string,
  enchantItemId: string | null | undefined,
  locale: Locale
): string {
  if (!enchantItemId || !hasSrd("magic-item", enchantItemId, "name", locale)) {
    return weaponName;
  }
  return `${localizeSrd("magic-item", enchantItemId, "name", locale)} (${weaponName})`;
}
