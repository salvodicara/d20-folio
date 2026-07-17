/**
 * Tracker — the resource-tracker molecule (folio §25, full row).
 *
 * One row per consumable feature resource (Bardic Inspiration, Channel Divinity,
 * Sorcery Points, Lay on Hands …). It auto-picks its representation:
 *  - max ≤ 5  → discrete pips (subitizing limit; reuses the Selection-A pip look)
 *  - max > 5  → numeric "remaining / total" + a Progress-A-style pool bar
 *
 * Each row carries a die badge (d8…), a recovery chip (SR/LR), and Spend/Restore
 * controls (the Button-A brass vocabulary at icon scale). Variable-cost trackers
 * (`variableCost`) open a popover with an amount stepper + a live after-preview
 * so the player commits an exact spend (Sorcery metamagic, Lay on Hands HP).
 *
 * Honest blanks: a passive tracker (`total ≤ 0`) shows the passive label only,
 * with no pips/controls; the die badge / recovery chip / source line omit when
 * absent; the variable popover never appears for single-step trackers.
 *
 * Pure presentation + state-binding: `onSpend(n)` / `onRestore(n)` are the
 * existing `useTracker` / `restoreTracker` store actions; this molecule never
 * touches engine semantics.
 */

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import type { TrackerUnit } from "@/data/types";
import { localizeTrackerUnit } from "@/lib/views/tracker-view";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { NumberStepper } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Accent colour key → the `data-color` the CSS keys off. */
export type TrackerColor = "verdigris" | "amethyst" | "lapis" | "vermilion";

/** Subitizing threshold: ≤5 uses pips, >5 uses a pool bar. */
export const TRACKER_PIP_MAX = 5;

export interface TrackerProps {
  /** Display name (bilingual copy injected by caller). */
  name: string;
  /** Resolved total uses (from the class table at the current level). */
  total: number;
  /** Uses already spent this rest. */
  used: number;
  /** Accent colour. Default "amethyst". */
  color?: TrackerColor;
  /** Die badge, e.g. "d8". Omitted when absent. */
  die?: string;
  /** Recovery timing — "SR" (short) or "LR" (long). Omitted when absent. */
  recovery?: "SR" | "LR";
  /** Recovery chip copy (bilingual). Defaults to the recovery code. */
  recoveryLabel?: ReactNode;
  /** Quiet source/sub line, e.g. "Bard 1 · CHA uses". Omitted when absent. */
  source?: ReactNode;
  /**
   * Treat as a pool (HP-like) resource — forces the pool-bar representation and
   * appends `unit` to the count. Trackers with total > 5 are pools implicitly.
   */
  isPool?: boolean;
  /** Stable unit TOKEN for pools (e.g. "hp") — localized at the render boundary. */
  unit?: TrackerUnit;
  /** Passive tracker copy when `total ≤ 0` (bilingual). Default "passive". */
  passiveLabel?: ReactNode;
  /** Pending spend (combat preview) — pips/segment shown as reserved. */
  pendingSpend?: number;
  /** Spend `n` uses (default 1). */
  onSpend?: (n: number) => void;
  /** Restore `n` uses (default 1). */
  onRestore?: (n: number) => void;
  /**
   * Variable-cost spend: opens a popover with an amount stepper + after-preview.
   * When set, the Spend control is replaced by the popover trigger.
   */
  variableCost?: boolean;
  /** Popover copy (bilingual). */
  spendLabel?: ReactNode;
  spendAmountLabel?: ReactNode;
  afterLabel?: ReactNode;
  confirmLabel?: ReactNode;
  /** Accessible labels for the icon controls (bilingual copy injected). */
  ariaSpend?: string;
  ariaRestore?: string;
  className?: string;
}

export function Tracker({
  name,
  total,
  used,
  color = "amethyst",
  die,
  recovery,
  recoveryLabel,
  source,
  isPool,
  unit,
  passiveLabel = "passive",
  pendingSpend = 0,
  onSpend,
  onRestore,
  variableCost,
  spendLabel = "Spend",
  spendAmountLabel = "Amount",
  afterLabel = "After",
  confirmLabel = "Spend",
  ariaSpend,
  ariaRestore,
  className,
}: TrackerProps) {
  const { t } = useTranslation();
  const available = Math.max(0, total - used);
  const reserved = Math.min(Math.max(0, pendingSpend), available);
  const usePips = total <= TRACKER_PIP_MAX && !isPool;
  const isPassive = total <= 0;
  // Localize the pool unit TOKEN once at the render boundary (golden rule 7):
  // the IT player sees "PF"/"punti", never the raw "hp"/"points" token.
  const unitLabel = localizeTrackerUnit(unit, t);

  return (
    <div className={cn("tr-row", className)} data-color={color}>
      <div className="tr-head">
        <div className="tr-name-row">
          <span className="tr-name">{name}</span>
          {die && <span className="tr-die">{die}</span>}
          {recovery && (
            <span className="tr-recovery" data-r={recovery}>
              {recoveryLabel ?? recovery}
            </span>
          )}
        </div>
        {/* Honest blank: source line only when provided. */}
        {source != null && source !== "" && <span className="tr-source">{source}</span>}
      </div>

      <div className="tr-body">
        {isPassive ? (
          <span className="tr-numeric">{passiveLabel}</span>
        ) : usePips ? (
          <>
            <span className="tr-pips" aria-hidden>
              {Array.from({ length: total }).map((_, i) => {
                const on = i < available - reserved;
                const pending = i >= available - reserved && i < available;
                return (
                  <span
                    key={i}
                    className={cn("tr-pip", on && "on", pending && "pending")}
                  />
                );
              })}
            </span>
            <span className="tr-numeric">
              <b>{available}</b> / {total}
            </span>
          </>
        ) : (
          <>
            <span className="tr-numeric">
              <b>{available}</b> / {total}
              {unitLabel ? ` ${unitLabel}` : ""}
            </span>
            <span className="tr-pool" aria-hidden>
              <span
                className="tr-pool-fill"
                style={{
                  ["--w" as string]: `${total > 0 ? (available / total) * 100 : 0}%`,
                }}
              />
            </span>
          </>
        )}

        {/* Spend / Restore controls — hidden for passive trackers. */}
        {!isPassive && (
          <div className="tr-ctrl">
            {variableCost ? (
              <VariableSpend
                max={available}
                onSpend={(n) => onSpend?.(n)}
                unitLabel={unitLabel}
                spendLabel={spendLabel}
                spendAmountLabel={spendAmountLabel}
                afterLabel={afterLabel}
                confirmLabel={confirmLabel}
                ariaSpend={ariaSpend ?? name}
              />
            ) : (
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                aria-label={ariaSpend ?? name}
                disabled={available <= 0 || !onSpend}
                onClick={() => onSpend?.(1)}
              >
                <Icon as={Minus} size="sm" decorative />
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              aria-label={ariaRestore ?? name}
              disabled={used <= 0 || !onRestore}
              onClick={() => onRestore?.(1)}
            >
              <Icon as={Plus} size="sm" decorative />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Variable-cost spend popover: amount stepper + live after-preview. */
function VariableSpend({
  max,
  onSpend,
  unitLabel,
  spendLabel,
  spendAmountLabel,
  afterLabel,
  confirmLabel,
  ariaSpend,
}: {
  max: number;
  onSpend: (n: number) => void;
  /** Already-localized unit display string ("" when none). */
  unitLabel: string;
  spendLabel: ReactNode;
  spendAmountLabel: ReactNode;
  afterLabel: ReactNode;
  confirmLabel: ReactNode;
  ariaSpend: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1);
  const clamped = Math.max(1, Math.min(amount, Math.max(1, max)));
  const after = Math.max(0, max - clamped);

  function confirm() {
    onSpend(clamped);
    setOpen(false);
    setAmount(1);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setAmount(1);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={ariaSpend}
          disabled={max <= 0}
        >
          <Icon as={Minus} size="sm" decorative />
        </Button>
      </PopoverTrigger>
      <PopoverContent rubric={spendLabel}>
        <div className="tr-spend">
          <div className="tr-spend-row">
            <span className="tr-spend-lbl">{spendAmountLabel}</span>
            <NumberStepper
              value={clamped}
              min={1}
              max={Math.max(1, max)}
              onChange={setAmount}
              ariaLabel={
                typeof spendAmountLabel === "string" ? spendAmountLabel : undefined
              }
            />
          </div>
          <div className="tr-spend-row">
            <span className="tr-spend-lbl">{afterLabel}</span>
            <span className="tr-spend-after">
              <b>{after}</b>
              {unitLabel ? ` ${unitLabel}` : ""}
            </span>
          </div>
          <div className="tr-spend-actions">
            <PopoverClose asChild>
              <Button variant="primary" size="sm" onClick={confirm} disabled={max <= 0}>
                {confirmLabel}
              </Button>
            </PopoverClose>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
