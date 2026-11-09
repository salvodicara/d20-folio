/**
 * The off-list reaction: a reaction resolved outside the list (an opportunity attack
 * called out loud), recorded so the round's Reaction reads as spent. Its label is a
 * chrome key, stored as a `ui` ref so the logged row re-localizes on a language switch.
 */
import type { TFunction } from "i18next";
import { uiText } from "@/lib/loc-text";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeText } from "@/lib/views/srd-i18n";

/** The Reaction occupant id when an off-list reaction spends it. */
export const OFF_LIST_REACTION_ID = "manual-reaction";

export function offListReactionAction(t: TFunction): ResolvedAction {
  const nameLoc = uiText("combat.otherReactionName");
  return {
    id: OFF_LIST_REACTION_ID,
    name: t("combat.otherReactionName"),
    nameEn: localizeText(nameLoc, "en"),
    nameLoc,
    type: "reaction",
    source: "feature",
    spellLevel: null,
    concentration: false,
    summary: {},
    costsSlot: false,
    pinned: false,
    defaultPinned: false,
  };
}
