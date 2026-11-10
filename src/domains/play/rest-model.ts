/**
 * Rests, for the new Play screen (headless: direction renders it).
 *
 * - `restSummary(kind, before, after, receipts)`: what the rest gave, as data (the
 *   classic RestModal's summary is the same read), so PlayRest can show it before
 *   closing or moving on to PlayPrepare.
 * - `grantBundleChoices(doc)`: the variants re-chosen at a rest (Circle of the Land's
 *   terrain…), one per choice, as the classic ResourceRail lists them. The data has
 *   no per-rest kind, and the classic sheet lets the player re-pick anytime, so the
 *   same list serves both rests.
 * - `pickGrantBundle(bundleKey, optionId, t)`: pick one through the store's own seam
 *   (it also swaps the variant's always-prepared spells), as one undo entry.
 */
import type { TFunction } from "i18next";

import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import type { GrantBundle } from "@/lib/grants";
import { restGrantBundles } from "@/lib/play/rest-bundles";
import { localizeText } from "@/lib/views/srd-i18n";
import type { Locale } from "@/lib/locale";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

export { restSummary, type RestReceipt, type RestSummary } from "@/lib/play/rest-summary";

export function grantBundleChoices(doc: CharacterDoc): GrantBundle[] {
  return restGrantBundles(
    aggregateCharacterGrants(doc.character, doc.session).grantBundles
  );
}

/** Pick a rest variant, undoably: the previous pick (or none) and the spells it had
 *  prepared come back on undo. */
export function pickGrantBundle(
  bundleKey: string,
  optionId: string,
  t: TFunction,
  locale: Locale = "en"
): void {
  const store = useCharacterStore.getState();
  const doc = store.character;
  if (!doc || store.readonly) return;
  const bundle = grantBundleChoices(doc).find((b) => b.bundleKey === bundleKey);
  const option = bundle?.options.find((o) => o.id === optionId);
  if (!bundle || !option || bundle.selected === optionId) return;
  registerUndoableToast(
    {
      message: t("combat.grantBundlePickedToast", {
        name: localizeText(bundle.label, locale),
        option: localizeText(option.label, locale),
      }),
    },
    () => {
      const live = useCharacterStore.getState().character;
      if (!live) return null;
      const spells = live.character.spells;
      const choices = live.session.grantBundleChoices;
      useCharacterStore.getState().setGrantBundleChoice(bundleKey, optionId);
      return () => {
        const now = useCharacterStore.getState().character;
        if (!now) return;
        useCharacterStore.setState({
          character: {
            ...now,
            character: { ...now.character, spells },
            session: {
              ...now.session,
              ...(choices
                ? { grantBundleChoices: choices }
                : { grantBundleChoices: undefined }),
            },
          },
        });
      };
    },
    { turnScoped: false }
  );
}
