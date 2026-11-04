/**
 * The damage tray's form, as the Play screen's tray fills it: one row per target (its
 * own choices, or the engine's opening row for it), the rolled total(s) typed at the
 * table, what each row will apply, and whether Apply is open. One shared total, or one
 * per target when the plan splits its instances (Magic Missile's darts), or one per
 * damage type when a hit deals several (a fire + radiant smite: each meets the
 * target's own defense). Pure: the screen keeps what was typed and tapped, this says
 * what it means.
 */
import {
  initialTrayRowFor,
  type TrayTarget,
} from "@/components/shared/damage-tray-target";
import {
  parseRolledTotal,
  rowAmount,
  applyDieFaceFloor,
  rowAmountByType,
  rowNeedsTotal,
  type DamageTrayPlan,
  type TrayRow,
} from "@/lib/play/damage-tray";
import { reviveEligibility, type ReviveEligibility } from "@/lib/play/revive";
import type { CharacterDoc } from "@/types/character";
import type { DamageType } from "@/types/damage";

export interface TrayFormInput {
  plan: DamageTrayPlan;
  targets: ReadonlyArray<TrayTarget>;
  /** The rows the player changed, by target id. */
  edited: ReadonlyMap<string, TrayRow>;
  /** The shared total as typed ("8+6+3"). */
  total: string;
  /** Each target's own total as typed, for a split plan. */
  rowTotals: ReadonlyMap<string, string>;
  /** Each damage type's total as typed, for a hit of several types. */
  typeTotals?: ReadonlyMap<DamageType, string>;
  /** The weapon's dice faces as typed ("1+5"), when the plan floors low faces
   *  (Great Weapon Fighting): they replace the total. */
  faces?: string;
}

/** The faces read under the floor: each counted face, the bonus, the total. */
export interface TrayFaces {
  terms: number[];
  bonus: number;
  total: number;
}

/** The hit deals several damage types and the tray takes a total for each. */
export function totalsByType(plan: DamageTrayPlan): DamageType[] {
  return plan.effect === "damage" &&
    !plan.perTarget &&
    (plan.damageTypes?.length ?? 0) > 1
    ? (plan.damageTypes ?? [])
    : [];
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
  /** The damage types whose field holds something that is not a sum. */
  typeInvalid: Partial<Record<DamageType, true>>;
  /** What each row applies, or null while it still needs a number. */
  amounts: (number | null)[];
  canApply: boolean;
  /** The dice faces typed, floored and summed with the bonus; null when none. */
  faces: TrayFaces | null;
  /** The faces field holds something that is not a list of faces. */
  facesInvalid: boolean;
}

/** The sum in words: «3 + 5 + 3», a negative bonus subtracted («3 + 5 − 1»). */
export function facesSum(faces: TrayFaces): string {
  const terms = faces.terms.join(" + ");
  if (faces.bonus === 0) return terms;
  return `${terms} ${faces.bonus > 0 ? "+" : "−"} ${String(Math.abs(faces.bonus))}`;
}

/** The faces as the floor counts them, or "invalid", or null when nothing typed or
 *  the plan names no weapon dice. */
function readFaces(
  plan: DamageTrayPlan,
  text: string | undefined
): TrayFaces | "invalid" | null {
  const floor = plan.dieFloor;
  if (!floor?.dice || !text?.trim()) return null;
  const parts = text
    .trim()
    .split(/[\s+,]+/)
    .filter(Boolean);
  if (parts.length === 0 || parts.some((p) => !/^\d+$/.test(p))) return "invalid";
  const terms = parts.map((p) => applyDieFaceFloor([Number(p)], floor));
  const bonus = floor.bonus ?? 0;
  return { terms, bonus, total: applyDieFaceFloor(parts.map(Number), floor) + bonus };
}

export function trayForm(input: TrayFormInput): TrayForm {
  const { plan, targets, edited } = input;
  const rows = targets.map((t) => edited.get(t.id) ?? initialTrayRowFor(plan, t));
  const read = readFaces(plan, input.faces);
  const faces = read === "invalid" ? null : read;
  const facesInvalid = read === "invalid";
  const total = faces ? faces.total : parseRolledTotal(input.total);
  const typed = (id: string) => input.rowTotals.get(id) ?? "";
  const totals = plan.perTarget
    ? targets.map((t) => parseRolledTotal(typed(t.id)))
    : targets.map(() => total);
  const rowInvalid = targets.map(
    (t, i) => Boolean(plan.perTarget) && typed(t.id).trim() !== "" && totals[i] === null
  );
  const types = totalsByType(plan);
  const byType: Partial<Record<DamageType, number>> = {};
  const typeInvalid: Partial<Record<DamageType, true>> = {};
  for (const type of types) {
    const text = input.typeTotals?.get(type) ?? "";
    const value = parseRolledTotal(text);
    if (value !== null) byType[type] = value;
    else if (text.trim() !== "") typeInvalid[type] = true;
  }
  const anyType = Object.keys(byType).length > 0;
  if (types.length > 0) {
    const amounts = rows.map((row) =>
      !rowNeedsTotal(row, plan)
        ? rowAmount(0, row, plan)
        : anyType
          ? rowAmountByType(byType, row, plan)
          : null
    );
    return {
      rows,
      total: null,
      totalInvalid: false,
      totals: rows.map(() => null),
      rowInvalid: rows.map(() => false),
      typeInvalid,
      amounts,
      canApply:
        rows.length > 0 &&
        Object.keys(typeInvalid).length === 0 &&
        (anyType || rows.every((row) => !rowNeedsTotal(row, plan))),
      faces: null,
      facesInvalid: false,
    };
  }
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
    !facesInvalid &&
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
    typeInvalid,
    amounts,
    canApply,
    faces,
    facesInvalid,
  };
}

/** What a spell does to one target from its Hit Points (prototypes cast-pw,
 *  cast-revive): Power Word asks the DM when the creature's Hit Points are hidden and
 *  keeps the answer; a revival says the Hit Points it comes back with and whether the
 *  target has been dead too long (`reviveEligibility`; null `targetDoc` when the tray
 *  can't read the target: the table decides). */
export type TrayOutcomeView =
  | {
      kind: "threshold";
      max: number;
      atOrBelow: "dies" | "condition";
      otherwise: "otherwise" | "speed-zero";
      /** The viewer can't see the Hit Points: the DM answers. */
      ask: boolean;
      /** At or below the threshold; null until answered. */
      answer: boolean | null;
    }
  | { kind: "revive"; hitPoints: number | null; eligibility: ReviveEligibility }
  | null;

export function trayOutcomeView(
  row: TrayRow,
  plan: DamageTrayPlan,
  /** The viewer sees the target's Hit Points. */
  seen: boolean,
  targetDoc: CharacterDoc | null
): TrayOutcomeView {
  const outcome = row.outcome;
  if (outcome?.kind === "revive")
    return {
      kind: "revive",
      // a fixed number (Revivify's 1) needs no maximum to know
      hitPoints:
        outcome.hitPoints ??
        (typeof plan.revive?.hitPoints === "number" ? plan.revive.hitPoints : null),
      eligibility: targetDoc
        ? reviveEligibility(
            targetDoc,
            plan.revive?.withinMinutes,
            plan.revive?.fromDust === true
          )
        : { kind: "dead", within: null },
    };
  const threshold = plan.hitPointThreshold;
  if (outcome?.kind !== "threshold" || !threshold) return null;
  const otherwise = threshold.otherwise ?? "otherwise";
  return {
    kind: "threshold",
    max: threshold.max,
    atOrBelow: threshold.atOrBelow,
    otherwise,
    ask: !seen,
    answer: outcome.branch === null ? null : outcome.branch === threshold.atOrBelow,
  };
}
