/**
 * The coins side of the inventory. Buying: the Add-item detail offers "Buy for 75 gp"
 * beside Add (disabled, with the reason, when the purse is short); one tap puts the
 * item on the sheet and takes its price with change, as ONE undoable, logged act.
 * Selling one item returns half its price, undoable and logged. The rules live in
 * `lib/play/purchase`; this file only wires the store and the toast.
 */
import type { TFunction } from "i18next";
import type { SrdEquipmentData } from "@/data/types";
import { getEquipment } from "@/data/equipment";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { negateCurrencyDelta, type CurrencyDelta } from "@/lib/play/material-cost";
import {
  coinsText,
  itemTradeLogEvent,
  paymentDelta,
  purchasePriceCp,
  purseCp,
  sellOne,
  unsellOne,
} from "@/lib/play/purchase";
import type { CharacterDoc } from "@/types/character";

type Currency = CharacterDoc["session"]["currency"];

const COIN_ORDER = ["pp", "gp", "ep", "sp", "cp"] as const;

/** The coins that moved, largest first: "−3 pp, −45 gp" (every number explained). */
function deltaText(delta: CurrencyDelta, t: TFunction): string {
  return COIN_ORDER.flatMap((coin) => {
    const amount = delta[coin];
    if (!amount) return [];
    const sign = amount > 0 ? "+" : "−";
    return [`${sign}${Math.abs(amount)} ${t(`equipment.currencyAbbr.${coin}`)}`];
  }).join(", ");
}

/** The "Buy for 75 gp" offer for `units` of an item, blocked with the reason when
 *  the purse is worth less. */
export function purchaseOffer(
  item: SrdEquipmentData,
  units: number,
  currency: Currency,
  t: TFunction
): { label: string; blockedReason?: string } | undefined {
  const priceCp = purchasePriceCp(item, units);
  if (priceCp <= 0) return undefined;
  const label = t("equipment.buy", { price: coinsText(priceCp, t) });
  return paymentDelta(currency, priceCp)
    ? { label }
    : {
        label,
        blockedReason: t("equipment.buyShort", {
          purse: coinsText(purseCp(currency), t) || "0",
        }),
      };
}

/**
 * Buy: `add` puts the item on the sheet, then the price leaves the purse with change
 * and the log says it. The undo refunds those exact coins and takes the item back
 * off (when nothing changed the lists since).
 */
export function buyItem(
  item: SrdEquipmentData,
  units: number,
  name: string,
  t: TFunction,
  add: (item: SrdEquipmentData, units: number) => void
): void {
  const priceCp = purchasePriceCp(item, units);
  const currency = useCharacterStore.getState().character?.session.currency;
  const preview = currency ? paymentDelta(currency, priceCp) : null;
  if (!preview) return;
  const price = coinsText(priceCp, t);
  // One coin, no change: the price says it all; otherwise every coin that moved.
  const message =
    Object.keys(preview).length === 1
      ? t("equipment.boughtToastPlain", { name, price })
      : t("equipment.boughtToast", { name, price, coins: deltaText(preview, t) });
  registerUndoableToast(
    { message },
    () => {
      const before = useCharacterStore.getState().character;
      const delta = before ? paymentDelta(before.session.currency, priceCp) : null;
      if (!before || !delta) return null;
      add(item, units);
      const store = useCharacterStore.getState();
      const added = store.character?.character;
      if (!added || !store.dispatch({ kind: "adjust-currency", delta })) return null;
      const logId = store.logEvent(itemTradeLogEvent("buy", item.id, priceCp));
      return () => {
        const current = useCharacterStore.getState();
        current.removeLogEntry(logId);
        current.dispatch({ kind: "adjust-currency", delta: negateCurrencyDelta(delta) });
        const doc = useCharacterStore.getState().character;
        if (
          doc &&
          doc.character.weapons === added.weapons &&
          doc.character.equipment === added.equipment
        ) {
          current.setCharacter({
            ...doc,
            character: {
              ...doc.character,
              weapons: before.character.weapons,
              equipment: before.character.equipment,
            },
          });
        }
      };
    },
    { turnScoped: false }
  );
}

/** Sell one of the row at `idx` at half its price (undoable, logged). */
export function sellItem(
  list: "weapons" | "equipment",
  idx: number,
  name: string,
  t: TFunction
): void {
  const doc = useCharacterStore.getState().character;
  const preview = doc ? sellOne(doc, list, idx, getEquipment) : null;
  if (!preview) return;
  registerUndoableToast(
    { message: t("combatLog.itemSold", { name, price: coinsText(preview.cp, t) }) },
    () => {
      const store = useCharacterStore.getState();
      const live = store.character;
      const sale = live ? sellOne(live, list, idx, getEquipment) : null;
      if (!sale || sale.itemId !== preview.itemId) return null;
      store.setCharacter(sale.doc);
      const logId = store.logEvent(itemTradeLogEvent("sell", sale.itemId, sale.cp));
      return () => {
        const current = useCharacterStore.getState();
        current.removeLogEntry(logId);
        const latest = useCharacterStore.getState().character;
        if (latest) current.setCharacter(unsellOne(latest, sale));
      };
    },
    { turnScoped: false }
  );
}
