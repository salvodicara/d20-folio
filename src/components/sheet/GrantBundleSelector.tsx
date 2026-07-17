/**
 * L12 — single-select variant chooser (`choice-grant-bundle`).
 *
 * Renders one selector per distinct `bundleKey` surfaced by `evaluateGrants`
 * (Circle of the Land's terrain). Picking an option flips the session
 * `grantBundleChoices[bundleKey]`, which (a) re-derives the grant pipeline so
 * the option's resistances/etc. light up in the header, and (b) reconciles the
 * always-prepared variant spells (the store action swaps Circle Spells).
 *
 * Override-first: the player chooses freely, anytime (terrain is re-chosen each
 * Long Rest per RAW). Functional (unstyled) — restyled from the design branch.
 */
import { useTranslation } from "react-i18next";
import type { BiText } from "@/data/types";
import type { GrantBundle } from "@/lib/grants";
import { localizeText } from "@/lib/views/srd-i18n";

interface GrantBundleSelectorProps {
  bundles: ReadonlyArray<GrantBundle>;
  locale: keyof BiText;
  onSelect: (bundleKey: string, optionId: string) => void;
}

export function GrantBundleSelector({
  bundles,
  locale,
  onSelect,
}: GrantBundleSelectorProps) {
  const { t } = useTranslation();
  if (bundles.length === 0) return null;

  // Two features can share a bundleKey (Circle Spells + Nature's Ward); show
  // one selector per key (first wins; its `selected` is authoritative).
  const seen = new Set<string>();
  const unique = bundles.filter((b) => {
    if (seen.has(b.bundleKey)) return false;
    seen.add(b.bundleKey);
    return true;
  });

  return (
    <div className="flex flex-col gap-1.5" data-testid="grant-bundle-selector">
      {unique.map((b) => (
        <div key={b.bundleKey} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-text-secondary">
            {localizeText(b.label, locale)}
          </span>
          {b.options.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={b.selected === o.id}
              onClick={() => onSelect(b.bundleKey, o.id)}
              title={t("character.landChoiceHint")}
              className="fchip fchip-sm"
            >
              {localizeText(o.label, locale)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
