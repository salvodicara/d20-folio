/**
 * The note that follows a cast whose material component has a coin cost: a consumed
 * component offers "−300 mo" from the purse in one tap (undoable, logged), a kept one
 * is only a reminder. Rides the toast lane, so it shows on whichever tab cast it.
 */
import type { TFunction } from "i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { coinPrice } from "@/lib/coin-price";
import {
  castMaterialCost,
  goldSpendDelta,
  materialCostLogEvent,
  negateCurrencyDelta,
  type MaterialCost,
} from "@/lib/play/material-cost";
import type { Locale } from "@/lib/locale";

const OFFER_MS = 10_000;

/** Show the cast's material note, when its spell has a priced component; returns
 *  the toast id so undoing the cast can withdraw it. */
export function offerMaterialCost(
  spellId: string | undefined,
  t: TFunction,
  locale: Locale
): string | null {
  const cost = castMaterialCost(spellId);
  const currency = useCharacterStore.getState().character?.session.currency;
  if (!cost || !currency) return null;
  const { amount, coin } = coinPrice(cost.gp);
  const params = {
    spell: grantSourceLabel(cost.spellId, locale),
    amount,
    coin: t(`equipment.currencyAbbr.${coin}`),
  };
  const canPay = cost.consumed && goldSpendDelta(currency, cost.gp) !== null;
  return useToastStore.getState().showToast({
    message: t(
      !cost.consumed
        ? "combat.materialKept"
        : canPay
          ? "combat.materialConsumed"
          : "combat.materialShort",
      params
    ),
    duration: OFFER_MS,
    ...(canPay
      ? {
          action: {
            label: t("combat.materialPay", params),
            run: () => payMaterialCost(cost, t("combat.materialPaidToast", params)),
          },
        }
      : {}),
  });
}

/** Take the gold from the purse and log it; the undo puts back exactly those coins. */
function payMaterialCost(cost: MaterialCost, message: string): void {
  registerUndoableToast(
    { message },
    () => {
      const store = useCharacterStore.getState();
      const currency = store.character?.session.currency;
      const delta = currency ? goldSpendDelta(currency, cost.gp) : null;
      if (!delta || !store.dispatch({ kind: "adjust-currency", delta })) return null;
      const logId = store.logEvent(materialCostLogEvent(cost));
      return () => {
        const current = useCharacterStore.getState();
        current.dispatch({ kind: "adjust-currency", delta: negateCurrencyDelta(delta) });
        current.removeLogEntry(logId);
      };
    },
    { turnScoped: false }
  );
}
