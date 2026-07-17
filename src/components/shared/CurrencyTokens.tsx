/**
 * CurrencyTokens — the single coin-amount row (the `.cur-tok` metal tokens).
 *
 * One component for every place coins are shown: the inventory's personal currency
 * (editable in place), the campaign treasury totals (read-only), and the treasury
 * adjust picker (tap a coin to select which metal to move). Extracted so the
 * theme-aware metal vocabulary (`--cur-<metal>`, honest-blank zero dimming) is
 * defined once and reused — fixes propagate everywhere (D52).
 *
 * Modes (mutually exclusive):
 *  - default     — read-only display.
 *  - `editable`  — each amount is an InlineEditable number (commits on blur).
 *  - `selectable`— each token is a button; `selected` gets the gold ring.
 */

import { InlineEditable } from "@/components/shared/InlineEditable";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CURRENCY_METALS, type CurrencyMetal } from "@/components/shared/currency";

interface CurrencyTokensProps {
  values: Record<CurrencyMetal, number>;
  /** Order / subset of coins to show (defaults to all, high→low). */
  keys?: readonly CurrencyMetal[];
  editable?: boolean;
  onChange?: (key: CurrencyMetal, value: number) => void;
  selectable?: boolean;
  selected?: CurrencyMetal;
  onSelect?: (key: CurrencyMetal) => void;
  /** Show the metal labels only (a denomination picker, no balances). */
  hideAmounts?: boolean;
  className?: string;
}

export function CurrencyTokens({
  values,
  keys = CURRENCY_METALS,
  editable = false,
  onChange,
  selectable = false,
  selected,
  onSelect,
  hideAmounts = false,
  className,
}: CurrencyTokensProps) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {keys.map((key) => {
        const value = values[key];
        const label = t(`equipment.currencyAbbr.${key}`);
        const zero = value === 0 ? "true" : undefined;
        if (selectable) {
          return (
            <button
              key={key}
              type="button"
              className="cur-tok cur-tok-btn"
              data-metal={key}
              data-zero={hideAmounts ? undefined : zero}
              data-selected={selected === key ? "true" : undefined}
              aria-pressed={selected === key}
              onClick={() => onSelect?.(key)}
            >
              {!hideAmounts && <span className="cur-amt">{value}</span>}
              <span className={hideAmounts ? "cur-lbl cur-lbl-lg" : "cur-lbl"}>
                {label}
              </span>
            </button>
          );
        }
        return (
          <span key={key} className="cur-tok" data-metal={key} data-zero={zero}>
            {editable ? (
              <InlineEditable
                type="number"
                editable
                value={value}
                min={0}
                // A currency amount has no natural ceiling (B20) — InlineEditable's
                // generic 9999 default is a UI safety net for small stat fields, not
                // a hoard limit. Pass an explicit, effectively unbounded max so a
                // legitimate large hoard never gets silently truncated.
                max={Number.MAX_SAFE_INTEGER}
                onChange={(v) => onChange?.(key, Math.max(0, v))}
                ariaLabel={label}
                valueClassName="cur-amt"
              />
            ) : (
              <span className="cur-amt">{value}</span>
            )}
            <span className="cur-lbl">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
