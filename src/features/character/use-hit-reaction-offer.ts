/**
 * The offer after a hit as both banners draw it (the sheet's and the Play screen's):
 * the open offer for the open sheet, each choice with its localized name and a short
 * plain-words hint, and the three answers. Null when nothing is offered here (another
 * sheet's offer, a read-only view, no turn engine mounted to settle it).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/hooks/useLocale";
import type { HitReactionKind } from "@/lib/play/hit-reaction-offer";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import {
  closeHitReactionOffer,
  useHitReactionOfferStore,
  type HitReactionOffer,
} from "./hit-reaction-offer-store";

export interface HitReactionOfferView {
  offer: HitReactionOffer;
  /** The banner's line: the hit, or Shield's question with the new AC. */
  prompt: string;
  choices: Array<{ actionId: string; label: string; hint: string }>;
  react: (actionId: string) => void;
  attackMisses: () => void;
  close: () => void;
}

const HINT_KEY: Record<HitReactionKind, string> = {
  "halve-hit": "combat.hitReaction.halveHint",
  "raise-ac": "combat.hitReaction.raiseAcHint",
};

export function useHitReactionOffer(): HitReactionOfferView | null {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const readonly = useCharacterStore((s) => s.readonly);
  const offer = useHitReactionOfferStore((s) => s.offer);
  const settle = useHitReactionOfferStore((s) => s.settle);
  const live = offer && character?.id === offer.characterId ? character : null;
  const names = useMemo(
    () =>
      live ? new Map(localizeActions(live, locale).map((a) => [a.id, a.name])) : null,
    [live, locale]
  );
  if (!offer || !live || !names || readonly || !settle) return null;
  return {
    offer,
    prompt: offer.shield
      ? t("combat.hitReaction.shieldAsk", { ac: offer.shield.ac })
      : t("combat.hitReaction.prompt", { amount: offer.amount }),
    choices: offer.choices.map((choice) => ({
      actionId: choice.actionId,
      label: names.get(choice.actionId) ?? choice.actionId,
      hint: t(HINT_KEY[choice.kind]),
    })),
    react: settle.react,
    attackMisses: settle.attackMisses,
    close: () => closeHitReactionOffer(offer.id),
  };
}
