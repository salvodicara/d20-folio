/**
 * The sheet collects what waits for its owner in the party chest (Tesoro): a share of
 * split loot, an item taken from the chest, loot kept "a me". Only the owner's own sheet,
 * open and editable, and only the character attached to that campaign; each pickup is
 * taken out of the campaign in its own transaction, so two open devices never collect it
 * twice, then lands on the sheet with a short toast. Nobody writes another player's sheet.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { pickupForSheet } from "@/features/campaigns/chest";
import { collectPickups, subscribeToMyPickups } from "@/features/campaigns/chest-io";
import { createAttachedCampaignTracker } from "@/features/campaigns/refresh-attached-sheets";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { Pickup } from "@/types/campaign";
import type { CustomEquipment, SrdEquipmentRef } from "@/types/character";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

/** A catalogue item's name: gear first, then magic items (a potion is one), else its id.
 *  Never throws: a missing name must not stop the collection. */
function catalogueName(srdId: string, locale: Locale): string {
  for (const kind of ["equipment", "magic-item"] as const) {
    try {
      return localizeSrd(kind, srdId, "name", locale);
    } catch {
      // not in this catalogue
    }
  }
  return srdId;
}

export function useCollectPickups(characterId: string | undefined): void {
  const uid = useAuthStore((s) => s.user?.uid);
  const { t } = useTranslation();
  const { language: locale } = useLocale();

  useEffect(() => {
    if (!uid || !characterId) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    let collecting = false;
    const onError = (error: unknown): void =>
      diagnosticsLog("warn", "chest.collect-failed", { message: String(error) });

    /** Put one collected pickup onto the sheet, if it is still this sheet; `parts`
     *  gathers what arrived, for one toast. */
    const deliver = (pickup: Pickup, parts: string[]): void => {
      const store = useCharacterStore.getState();
      if (store.readonly || store.character?.id !== characterId) return;
      const { coins, item } = pickupForSheet(pickup);
      if (coins) {
        store.dispatch({ kind: "adjust-currency", delta: coins });
        for (const unit of COINS) {
          const amount = coins[unit];
          if (amount) parts.push(t(`equipment.coinAmount.${unit}`, { amount }));
        }
      }
      if (item) {
        const ref: SrdEquipmentRef | CustomEquipment =
          "srdId" in item
            ? { srdId: item.srdId, quantity: item.quantity }
            : {
                custom: true,
                instanceId: crypto.randomUUID(),
                name: item.name,
                quantity: item.quantity,
              };
        store.dispatch({ kind: "receive-item", ref });
        const name = "srdId" in item ? catalogueName(item.srdId, locale) : item.name;
        parts.push(item.quantity > 1 ? `${item.quantity} × ${name}` : name);
      }
    };

    const tracker = createAttachedCampaignTracker(uid, characterId);
    void tracker
      .ensure()
      .then(([campaignId]) => {
        if (cancelled || campaignId === undefined) return;
        stop = subscribeToMyPickups(
          campaignId,
          uid,
          (waiting) => {
            const store = useCharacterStore.getState();
            if (collecting || waiting.length === 0) return;
            if (store.readonly || store.character?.id !== characterId) return;
            collecting = true;
            const parts: string[] = [];
            void collectPickups(campaignId, uid, waiting, (pickup) =>
              deliver(pickup, parts)
            )
              .then(() => {
                if (parts.length === 0) return;
                useToastStore.getState().showToast({
                  message: t("equipment.fromChest", { what: parts.join(", ") }),
                  duration: 5000,
                });
              })
              .catch(onError)
              .finally(() => {
                collecting = false;
              });
          },
          onError
        );
      })
      .catch(onError);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid, characterId, t, locale]);
}
