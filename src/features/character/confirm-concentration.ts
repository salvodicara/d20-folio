/**
 * The ONE concentration-conflict gate (golden rule 6) — every surface that can
 * START concentrating (the Combat tab's action commits, the Spells tab's cast
 * CTAs) routes through this shared guard, so casting a concentration spell
 * while already concentrating on a DIFFERENT one always asks first, in the same
 * branded warning dialog, on every surface.
 *
 * Resolves `true` when the commit should continue (not a concentration action,
 * nothing currently held, the SAME spell re-applied, or the player confirmed
 * the swap) and `false` when the player backed out. Uses the promise-based
 * folio confirm store (`tone: "warning"` — breaking concentration is a
 * deliberate, reversible choice, not a destructive one).
 */
import type { TFunction } from "i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { concentrationValue, customConcentrationValue } from "@/lib/concentration";
import { concentrationLabel } from "@/lib/views/tracker-view";
import type { Locale } from "@/lib/locale";

export async function confirmConcentrationSwap(
  incoming: {
    /** Whether the incoming cast/action requires concentration. */
    concentration: boolean;
    /** The SRD spell's stable id (omit for a custom/homebrew spell). */
    spellId?: string;
    /** Localized display name (custom spells: the user-authored name). */
    name: string;
  },
  t: TFunction,
  locale: Locale
): Promise<boolean> {
  if (!incoming.concentration) return true;
  const currentConc = useCharacterStore.getState().character?.session.concentration ?? "";
  if (!currentConc) return true;
  // The stored value is the spell's stable id (custom spells carry their name
  // behind the marker). Same spell → no conflict (re-applying is harmless);
  // compare against the SAME value the commit will store (golden rule 7).
  if (
    currentConc ===
    (incoming.spellId
      ? concentrationValue(incoming.spellId)
      : customConcentrationValue(incoming.name))
  )
    return true;
  return useConfirmStore.getState().confirm({
    title: t("combat.concentrationBreakTitle"),
    message: t("combat.concentrationWillEndWarning", {
      // Localize the stored id for display (custom names pass through).
      current: concentrationLabel(currentConc, locale),
      next: incoming.name,
    }),
    confirmLabel: t("combat.concentrationBreakConfirm"),
    tone: "warning",
  });
}
