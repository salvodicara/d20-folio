/**
 * The damage tray's form, as the Play screen's tray fills it: one row per target (its
 * own choices, or the engine's opening row for it), the rolled total(s) typed at the
 * table, what each row will apply, and whether Apply is open. One shared total, or one
 * per target when the plan splits its instances (Magic Missile's darts). Pure: the
 * screen keeps what was typed and tapped, this says what it means.
 */
import {
  initialTrayRowFor,
  type TrayTarget,
} from "@/components/shared/damage-tray-target";
import {
  parseRolledTotal,
  rowAmount,
  rowNeedsTotal,
  type DamageTrayPlan,
  type TrayRow,
} from "@/lib/play/damage-tray";

export interface TrayFormInput {
  plan: DamageTrayPlan;
  targets: ReadonlyArray<TrayTarget>;
  /** The rows the player changed, by target id. */
  edited: ReadonlyMap<string, TrayRow>;
  /** The shared total as typed ("8+6+3"). */
  total: string;
  /** Each target's own total as typed, for a split plan. */
  rowTotals: ReadonlyMap<string, string>;
}

export interface TrayForm {
  rows: TrayRow[];
  /** The shared total, or null when empty or not a sum. */
  total: number | null;
  /** The shared field holds something that is not a sum. */
  totalInvalid: boolean;
  /** Each row's total (the shared one unless the plan splits). */
  totals: (number | null)[];
  /** Each split row's own field holds something that is not a sum. */
  rowInvalid: boolean[];
  /** What each row applies, or null while it still needs a number. */
  amounts: (number | null)[];
  canApply: boolean;
}

export function trayForm(input: TrayFormInput): TrayForm {
  const { plan, targets, edited } = input;
  const rows = targets.map((t) => edited.get(t.id) ?? initialTrayRowFor(plan, t));
  const total = parseRolledTotal(input.total);
  const typed = (id: string) => input.rowTotals.get(id) ?? "";
  const totals = plan.perTarget
    ? targets.map((t) => parseRolledTotal(typed(t.id)))
    : targets.map(() => total);
  const rowInvalid = targets.map(
    (t, i) => Boolean(plan.perTarget) && typed(t.id).trim() !== "" && totals[i] === null
  );
  const amounts = rows.map((row, i) => {
    const value = totals[i] ?? null;
    return plan.effect && (value !== null || !rowNeedsTotal(row, plan))
      ? rowAmount(value ?? 0, row, plan)
      : null;
  });
  // A number is needed only while some row's amount hangs on it (a tray of misses
  // applies without one). Split, a row left empty gets nothing, but a typo blocks.
  const canApply =
    rows.length > 0 &&
    (plan.perTarget
      ? !rowInvalid.some(Boolean) &&
        rows.some((row, i) => !rowNeedsTotal(row, plan) || totals[i] !== null)
      : total !== null || rows.every((row) => !rowNeedsTotal(row, plan)));
  return {
    rows,
    total,
    totalInvalid: input.total.trim() !== "" && total === null,
    totals,
    rowInvalid,
    amounts,
    canApply,
  };
}
