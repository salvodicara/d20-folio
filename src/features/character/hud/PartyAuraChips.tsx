/**
 * The party paladins' Aura of Protection on this sheet's saves, one chip each:
 * pressed while it counts (the default: the paladin is in play tonight), tapped off
 * when the character stands outside it, until tapped again or the next rest. The
 * same toggle style as the Surprise and situation chips.
 */
import { useTranslation } from "react-i18next";

import { usePartyAuraOffers } from "@/features/campaigns/use-party-aura";
import { outOfAuraKey } from "@/lib/play/aura-of-protection";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";

export function PartyAuraChips() {
  const { t } = useTranslation();
  const offers = usePartyAuraOffers((s) => s.offers);
  const readonly = useCharacterStore((s) => s.readonly);
  if (offers.length === 0) return null;
  const toggle = (characterId: string, name: string, on: boolean) => {
    registerUndoableToast(
      { message: t(on ? "play.aura.outToast" : "play.aura.inToast", { name }) },
      () => {
        const key = outOfAuraKey(characterId);
        useCharacterStore.getState().setActiveFeature(key, on);
        return () => useCharacterStore.getState().setActiveFeature(key, !on);
      },
      { turnScoped: false }
    );
  };
  return (
    <div
      className="flex flex-wrap gap-1 pt-1"
      role="group"
      aria-label={t("play.aura.group")}
    >
      {offers.map((offer) => (
        <button
          key={offer.characterId}
          type="button"
          className="status-badge sb-toggle"
          data-kind={offer.on ? "active" : undefined}
          aria-pressed={offer.on}
          disabled={readonly}
          title={t(offer.on ? "play.aura.onHint" : "play.aura.offHint", {
            name: offer.name,
          })}
          onClick={() => toggle(offer.characterId, offer.name, offer.on)}
        >
          <span className="sb-label">
            {t("play.aura.chip", { name: offer.name, bonus: offer.bonus })}
          </span>
        </button>
      ))}
    </div>
  );
}
