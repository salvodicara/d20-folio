/**
 * The damage tray's panel (owner 2026-10-12), shared by the player's sheet and the DM's
 * monster card: one rolled total, one row per target with Hit · Miss · Critical for an
 * attack, ×0 · ¼ · ½ · ×1 · ×2, "Saved", the target's known defense and the failed-save
 * conditions, then Skip or Apply. Copied from Foundry VTT dnd5e's damage-application
 * tray. A bottom sheet on a phone, a centered dialog on wider screens (it renders the
 * `DialogContent`; the caller owns the `Dialog`). What Apply writes is the caller's:
 * the panel hands back the rows and each row's total (one shared total, or one per row
 * when the plan splits across targets: Magic Missile's darts on two goblins).
 *
 * `picker`, when given, sits above the rows ("On whom?" chips on the DM's tray); the
 * rows follow `targets`, keeping each target's choices while it stays picked.
 */
import { useRef, useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { hpBand } from "@/features/character/molecules/hp-tier";
import { useLocale } from "@/hooks/useLocale";
import type { Locale } from "@/lib/locale";
import {
  ATTACK_OUTCOMES,
  TRAY_MULTIPLIERS,
  initialTrayRow,
  parseRolledTotal,
  previewHp,
  rowAmount,
  rowConditions,
  rowNeedsTotal,
  setAttackOutcome,
  setMultiplier,
  toggleCondition,
  toggleDefense,
  toggleSaved,
  type AttackOutcome,
  type DamageTrayPlan,
  type TrayEffect,
  type TrayMultiplier,
  type TrayRow,
} from "@/lib/play/damage-tray";
import { conditionLabel } from "@/lib/views/tracker-view";

import { trayRubric, type TrayTarget } from "./damage-tray-target";

const MULTIPLIER_LABEL: Record<TrayMultiplier, string> = {
  "0": "0",
  "0.25": "¼",
  "0.5": "½",
  "1": "1",
  "2": "2",
};

type T = ReturnType<typeof useTranslation>["t"];

export function DamageTrayPanel({
  title,
  rubric,
  plan,
  targets,
  picker,
  totalHint,
  onApply,
  onSkip,
}: {
  title: string;
  /** The line under the title; defaults to what the plan deals and its save. */
  rubric?: string;
  plan: DamageTrayPlan;
  targets: ReadonlyArray<TrayTarget>;
  picker?: ReactNode;
  /** The line under the total; defaults to "what you rolled at the table". */
  totalHint?: string;
  /** `totals[i]` is row i's rolled total (the shared one unless the plan splits). */
  onApply: (rows: TrayRow[], totals: number[]) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [text, setText] = useState("");
  const [byId, setById] = useState<ReadonlyMap<string, TrayRow>>(() => new Map());
  // Split instances (Magic Missile on two goblins): one typed total per target.
  const [rowTexts, setRowTexts] = useState<ReadonlyMap<string, string>>(() => new Map());
  const fieldRef = useRef<HTMLInputElement>(null);
  const firstRowFieldRef = useRef<HTMLInputElement>(null);
  const rows = targets.map(
    (target) => byId.get(target.id) ?? initialTrayRow(plan, target.id, target.defenses)
  );
  const rowText = (id: string) => rowTexts.get(id) ?? "";
  const total = parseRolledTotal(text);
  const invalid = text.trim() !== "" && total === null;
  const totals = plan.perTarget
    ? targets.map((target) => parseRolledTotal(rowText(target.id)))
    : targets.map(() => total);
  // A number is needed only while some row's amount depends on it (a tray of misses
  // applies without one); a tray with no target yet has nothing to apply. Split, a
  // row left empty gets nothing, but a typo blocks.
  const canApply =
    rows.length > 0 &&
    (plan.perTarget
      ? targets.every(
          (target, i) => rowText(target.id).trim() === "" || totals[i] !== null
        ) && rows.some((row, i) => !rowNeedsTotal(row, plan) || totals[i] !== null)
      : total !== null || rows.every((row) => !rowNeedsTotal(row, plan)));

  const update = (next: TrayRow) =>
    setById((current) => new Map(current).set(next.targetId, next));

  const line = rubric ?? trayRubric(plan, t, locale);

  const apply = () => {
    if (!canApply) return;
    onApply(
      rows,
      totals.map((value) => value ?? 0)
    );
  };

  return (
    <DialogContent
      size="md"
      overlayClassName="scrim-sheet"
      rubric={line}
      title={title}
      description={line}
      closeLabel={t("common.close")}
      data-testid="damage-tray"
      onOpenAutoFocus={(event) => {
        const field = fieldRef.current ?? firstRowFieldRef.current;
        if (!field) return;
        event.preventDefault();
        field.focus();
      }}
    >
      {plan.effect !== null && !plan.perTarget && (
        <div className="flex flex-col gap-1 px-[var(--sp-6)] pt-[var(--sp-4)]">
          <label
            htmlFor="damage-tray-total"
            className="font-mono text-[length:var(--text-micro)] font-bold uppercase tracking-[0.12em] text-text-muted"
          >
            {t("combat.damageTray.total")}
          </label>
          <Input
            ref={fieldRef}
            id="damage-tray-total"
            center
            // `.input` is unlayered and resets utilities: the one big number the
            // whole tray hangs on is sized inline, on the type-scale token.
            style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}
            // `tel` keeps a numeric keypad on phones while still offering "+".
            inputMode="tel"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="—"
            value={text}
            error={invalid}
            aria-describedby="damage-tray-total-hint"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
          />
          <span id="damage-tray-total-hint" className="text-xs text-text-muted">
            {totalHint ?? t("combat.damageTray.totalHint")}
          </span>
        </div>
      )}

      <DialogBody>
        {picker}
        <ul
          className="flex flex-col gap-2"
          aria-label={t("combat.targetStepTitle", { name: title })}
        >
          {targets.map((target, index) => {
            const row = rows[index];
            if (!row) return null;
            return (
              <TrayTargetRow
                key={target.id}
                target={target}
                row={row}
                plan={plan}
                total={totals[index] ?? null}
                locale={locale}
                onChange={update}
                {...(plan.perTarget && index === 0 ? { totalRef: firstRowFieldRef } : {})}
                {...(plan.perTarget
                  ? {
                      field: {
                        value: rowText(target.id),
                        invalid:
                          rowText(target.id).trim() !== "" && totals[index] === null,
                        onChange: (value: string) =>
                          setRowTexts((current) =>
                            new Map(current).set(target.id, value)
                          ),
                        onEnter: apply,
                      },
                    }
                  : {})}
              />
            );
          })}
        </ul>
      </DialogBody>

      <DialogFooter>
        <Button variant="secondary" block onClick={onSkip}>
          {t("common.skip")}
        </Button>
        <Button variant="primary" block disabled={!canApply} onClick={apply}>
          {t("combat.apply")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** A split tray's own rolled-total field on a row (Magic Missile's darts on it). */
interface RowTotalField {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onEnter: () => void;
}

function TrayTargetRow({
  target,
  row,
  plan,
  total,
  locale,
  onChange,
  field,
  totalRef,
}: {
  target: TrayTarget;
  row: TrayRow;
  plan: DamageTrayPlan;
  total: number | null;
  locale: Locale;
  onChange: (row: TrayRow) => void;
  field?: RowTotalField;
  /** The first split row's field takes the tray's opening focus. */
  totalRef?: Ref<HTMLInputElement>;
}) {
  const { t } = useTranslation();
  const amount =
    plan.effect && (total !== null || !rowNeedsTotal(row, plan))
      ? rowAmount(total ?? 0, row, plan)
      : null;
  const conditions = rowConditions(row);
  const hpLabel = t("character.health.hpAbbr");

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-border-medium bg-surface-1 px-3 py-2"
      data-testid="damage-tray-row"
      data-target={target.id}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span
          className="min-w-0 flex-1 truncate font-semibold text-text-primary"
          title={target.name}
        >
          {target.name}
        </span>
        {target.hp ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
            {target.hp.current}/{target.hp.max} {hpLabel}
          </span>
        ) : target.band ? (
          <span className="shrink-0 text-xs text-text-muted">
            {bandLabel(target.band, t)}
          </span>
        ) : null}
        <span
          className="ml-auto shrink-0 font-mono text-sm font-semibold tabular-nums"
          data-testid="damage-tray-preview"
        >
          <Preview
            effect={plan.effect}
            amount={amount}
            hp={target.hp}
            conditions={conditions}
          />
        </span>
      </div>

      {field && (
        <Input
          ref={totalRef}
          center
          inputMode="tel"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="—"
          aria-label={t("combat.damageTray.rowTotal", { name: target.name })}
          title={t("combat.damageTray.totalHint")}
          value={field.value}
          error={field.invalid}
          onChange={(event) => field.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") field.onEnter();
          }}
        />
      )}

      {row.attack && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={ATTACK_OUTCOMES.map((value) => ({
              value,
              label: t(`combat.damageTray.outcome.${value}`),
            }))}
            value={row.attack}
            onChange={(outcome: AttackOutcome) =>
              onChange(setAttackOutcome(row, outcome, plan))
            }
            aria-label={t("combat.damageTray.outcomeGroup", { name: target.name })}
          />
          {row.attack === "critical" && plan.effect === "damage" && (
            <span className="text-xs text-text-muted" data-testid="damage-tray-crit-hint">
              {t("combat.damageTray.critHint")}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {plan.effect === "damage" && (
          <Segmented
            options={TRAY_MULTIPLIERS.map((value) => ({
              value,
              label: MULTIPLIER_LABEL[value],
              ariaLabel: `×${MULTIPLIER_LABEL[value]}`,
            }))}
            value={row.multiplier}
            onChange={(multiplier) => onChange(setMultiplier(row, multiplier))}
            aria-label={t("combat.damageTray.multiplier", { name: target.name })}
          />
        )}
        {plan.save && (
          <button
            type="button"
            className="fchip"
            aria-pressed={row.saved}
            aria-label={t("combat.damageTray.savedAria", { name: target.name })}
            onClick={() => onChange(toggleSaved(row, plan))}
          >
            {t("combat.damageTray.saved")}
          </button>
        )}
        {row.defense && (
          <button
            type="button"
            className="fchip"
            aria-pressed={row.defenseOn}
            onClick={() => onChange(toggleDefense(row, plan))}
          >
            {t(`combat.damageTray.${row.defense}`)}
          </button>
        )}
        {plan.conditions?.options.map((id) => (
          <button
            key={id}
            type="button"
            className="fchip"
            aria-pressed={row.conditions.includes(id) && !row.saved}
            disabled={row.saved}
            onClick={() => onChange(toggleCondition(row, id, plan))}
          >
            {plan.conditions?.save
              ? t("combat.damageTray.conditionSave", {
                  condition: conditionLabel(id, locale),
                  ability: t(`abilities.${plan.conditions.save.ability}_short`),
                  dc: plan.conditions.save.dc,
                })
              : conditionLabel(id, locale)}
          </button>
        ))}
      </div>
    </li>
  );
}

function Preview({
  effect,
  amount,
  hp,
  conditions,
}: {
  effect: TrayEffect | null;
  amount: number | null;
  hp?: { current: number; max: number; temp: number };
  conditions: string[];
}) {
  const { t } = useTranslation();
  if (effect === null)
    return conditions.length > 0 ? null : (
      <span className="text-text-muted">{t("combat.damageTray.noEffect")}</span>
    );
  if (amount === null) return <span className="text-text-muted">—</span>;
  if (amount === 0 && conditions.length === 0)
    return <span className="text-text-muted">{t("combat.damageTray.noEffect")}</span>;
  const sign = effect === "damage" ? "−" : "+";
  const tone = effect === "damage" ? "text-danger" : "text-success";
  const after = hp && effect !== "temp-hp" ? previewHp(effect, amount, hp) : null;
  return (
    <>
      <span className={tone}>
        {sign}
        {amount}
      </span>
      {after && (
        <span className="text-text-secondary">
          {" "}
          → {after.current}/{after.max}
        </span>
      )}
    </>
  );
}

function bandLabel(band: ReturnType<typeof hpBand>, t: T): string {
  switch (band) {
    case "healthy":
      return t("campaignHub.hpBand.healthy");
    case "bloodied":
      return t("character.health.bloodied");
    case "nearDeath":
      return t("campaignHub.hpBand.nearDeath");
    default:
      return t("campaignHub.encounterDefeated");
  }
}
