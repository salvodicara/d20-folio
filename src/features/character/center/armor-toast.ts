/**
 * The armor reason line: ONE toast per tap with the SRD time. Putting body armor on
 * over worn armor reads as one change ("Changing armor: doff Leather Armor (1 min)
 * and don Chain Mail (10 min)"); otherwise the single don or doff time. In a fight it
 * adds that the change does not fit in one action. A new line replaces the last one
 * on screen. Never blocks.
 */
import type { TFunction } from "i18next";
import type { ArmorTime } from "@/data/armor";
import type { ArmorCategory } from "@/data/types";
import { armorChange, armorSwap } from "@/lib/play/armor-donning";
import { useToastStore } from "@/stores/toastStore";
import { sheetInEncounter } from "./sheet-in-encounter";

const TOAST_MS = 6_000;
/** The armor line on screen: a newer one replaces it, so armor lines never stack. */
let shownId: string | null = null;

interface ArmorSide {
  name: string;
  category: ArmorCategory;
}

export function showArmorToast(
  t: TFunction,
  armor: ArmorSide & { equipping: boolean },
  off?: ArmorSide
): void {
  const inFight = sheetInEncounter();
  const time = (value: ArmorTime) =>
    value === "utilize"
      ? t("equipment.armorTimeUtilize")
      : t("equipment.armorTimeMinutes", { count: value });
  let message: string | null = null;
  if (off && armor.equipping) {
    const swap = armorSwap(off.category, armor.category, inFight);
    message = t(
      swap.tooSlowForFight ? "equipment.swapFightToast" : "equipment.swapToast",
      {
        off: off.name,
        offTime: t("equipment.donDoffShort", { count: swap.doff }),
        on: armor.name,
        onTime: t("equipment.donDoffShort", { count: swap.don }),
      }
    );
  } else {
    const change = armorChange(armor.category, armor.equipping, inFight);
    if (change) {
      const key = `equipment.${change.verb}${change.tooSlowForFight ? "Fight" : ""}Toast`;
      message = t(key, { name: armor.name, time: time(change.time) });
    }
  }
  if (!message) return;
  const toasts = useToastStore.getState();
  if (shownId) toasts.dismissToast(shownId);
  shownId = toasts.showToast({ message, duration: TOAST_MS });
}
