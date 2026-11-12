/**
 * «Tira l'iniziativa» from the Play screen: the roll goes to the campaign's fight, and
 * the fight's first roll regains the trackers that top up on it (Bard Superior
 * Inspiration, Persistent Rage), with the standard undo, as the classic turn band does
 * (`applyFirstRollTopUps`). The sheet only offers the roll before this player has
 * rolled in the fight (`playRollOffer`), so every roll it sends is their first.
 */
import type { TFunction } from "i18next";
import { applyFirstRollTopUps } from "@/features/character/center/initiative-top-up";
import type { Locale } from "@/lib/locale";
import { paidAdvantageFor } from "./paid-advantage";
import type { CharacterDoc } from "@/types/character";

export function rollInitiativeFromSheet(args: {
  /** Sends the roll to the fight (the campaign move, with its own undo). */
  send: () => void;
  t: TFunction;
  locale: Locale;
}): void {
  args.send();
  applyFirstRollTopUps(args.t, args.locale);
}

/** The paid Advantage the sheet holds for its initiative roll (a Luck Point). */
export function initiativePaidAdvantage(doc: CharacterDoc, locale: Locale, t: TFunction) {
  return paidAdvantageFor(doc, locale, t, "initiative", "play.roll.paidAdvantage");
}
