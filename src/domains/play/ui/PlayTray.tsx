/**
 * The damage tray on the Play screen: right after a use with targets, what the table
 * rolled and what it does to each target. One rolled total (or one per target when the
 * darts are split), then a row per target with Colpito · Mancato · Critico for an
 * attack, the multiplier, «Salvato», the target's own defense and the failed-save
 * conditions, and what the row will do ("−14 → 8/22"). The app never rolls. The form's
 * meaning is `trayForm`; where an applied row lands is the shared `applyTray`.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { trayRubric, type TrayTarget } from "@/components/shared/damage-tray-target";
import { applyTray } from "@/features/character/center/apply-tray";
import {
  useDamageTrayStore,
  type DamageTrayOffer,
} from "@/features/character/center/damage-tray-store";
import { useTrayTargets } from "@/features/character/center/use-tray-targets";
import { trayForm } from "@/domains/play/tray-form";
import type { Locale } from "@/lib/locale";
import {
  ATTACK_OUTCOMES,
  TRAY_MULTIPLIERS,
  previewHp,
  rowConditions,
  setAttackOutcome,
  setMultiplier,
  toggleCondition,
  toggleDefense,
  toggleSaved,
  type DamageTrayPlan,
  type TrayMultiplier,
  type TrayRow,
} from "@/lib/play/damage-tray";
import { conditionLabel } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import { Button, Chip, Dialog, Field } from "@/ui";

const MULTIPLIER: Record<TrayMultiplier, string> = {
  "0": "×0",
  "0.25": "×¼",
  "0.5": "×½",
  "1": "×1",
  "2": "×2",
};

export function PlayTray({ locale }: { locale: Locale }) {
  const offer = useDamageTrayStore((s) => s.offer);
  const characterId = useCharacterStore((s) => s.character?.id);
  // Leaving the sheet drops a tray nobody answered: it never reappears elsewhere.
  useEffect(() => () => useDamageTrayStore.getState().close(), []);
  if (!offer || offer.characterId !== characterId) return null;
  return <TrayDialog key={offer.castLogId ?? "tray"} offer={offer} locale={locale} />;
}

function TrayDialog({ offer, locale }: { offer: DamageTrayOffer; locale: Locale }) {
  const { t } = useTranslation();
  const { plan } = offer;
  const targets = useTrayTargets(plan);
  const [edited, setEdited] = useState<ReadonlyMap<string, TrayRow>>(() => new Map());
  const [total, setTotal] = useState("");
  const [rowTotals, setRowTotals] = useState<ReadonlyMap<string, string>>(
    () => new Map()
  );
  const form = trayForm({ plan, targets, edited, total, rowTotals });
  const close = () => useDamageTrayStore.getState().close();
  const apply = () => {
    if (!form.canApply) return;
    applyTray(
      offer,
      targets,
      form.rows,
      form.totals.map((v) => v ?? 0),
      t
    );
    close();
  };
  const update = (row: TrayRow) => setEdited((m) => new Map(m).set(row.targetId, row));
  return (
    <Dialog
      open
      onClose={close}
      color="ini"
      title={offer.actionName}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={close}>
            {t("common.skip")}
          </Button>
          <Button kind="primary" disabled={!form.canApply} onClick={apply}>
            {t("combat.apply")}
          </Button>
        </>
      }
    >
      <p className="f-help f-ask">{trayRubric(plan, t, locale)}</p>
      {plan.effect !== null && !plan.perTarget && (
        <div className="f-ask">
          <Field
            label={t("combat.damageTray.total")}
            inputMode="tel"
            autoComplete="off"
            enterKeyHint="done"
            autoFocus
            value={total}
            {...(form.totalInvalid
              ? { error: t("play.trayTotalHint") }
              : { help: t("play.trayTotalHint") })}
            onChange={(e) => setTotal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
          />
        </div>
      )}
      <div className="f-tray-rows f-ask">
        {targets.map((target, i) => {
          const row = form.rows[i];
          if (!row) return null;
          return (
            <TrayTargetRow
              key={target.id}
              target={target}
              row={row}
              plan={plan}
              amount={form.amounts[i] ?? null}
              locale={locale}
              onChange={update}
              {...(plan.perTarget
                ? {
                    field: {
                      value: rowTotals.get(target.id) ?? "",
                      invalid: form.rowInvalid[i] ?? false,
                      onChange: (v: string) =>
                        setRowTotals((m) => new Map(m).set(target.id, v)),
                      onEnter: apply,
                    },
                  }
                : {})}
            />
          );
        })}
      </div>
    </Dialog>
  );
}

function TrayTargetRow({
  target,
  row,
  plan,
  amount,
  locale,
  onChange,
  field,
}: {
  target: TrayTarget;
  row: TrayRow;
  plan: DamageTrayPlan;
  amount: number | null;
  locale: Locale;
  onChange: (row: TrayRow) => void;
  field?: {
    value: string;
    invalid: boolean;
    onChange: (v: string) => void;
    onEnter: () => void;
  };
}) {
  const { t } = useTranslation();
  const conditions = rowConditions(row);
  return (
    <section className="f-tray-row" aria-label={target.name}>
      <div className="f-tray-head">
        <span className="f-row-t">{target.name}</span>
        <span className="f-choice-n">
          {target.hp
            ? `${String(target.hp.current)}/${String(target.hp.max)} ${t("character.health.hpAbbr")}`
            : target.band
              ? bandLabel(target.band, t)
              : ""}
        </span>
        <Preview plan={plan} amount={amount} hp={target.hp} conditions={conditions} />
      </div>
      {field && (
        <Field
          label={t("combat.damageTray.rowTotal", { name: target.name })}
          inputMode="tel"
          autoComplete="off"
          enterKeyHint="done"
          value={field.value}
          {...(field.invalid ? { error: t("play.trayTotalHint") } : {})}
          onChange={(e) => field.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") field.onEnter();
          }}
        />
      )}
      {row.attack && (
        <div
          className="f-chips"
          role="group"
          aria-label={t("combat.damageTray.outcomeGroup", { name: target.name })}
        >
          {ATTACK_OUTCOMES.map((o) => (
            <Chip
              key={o}
              pressed={row.attack === o}
              onClick={() => onChange(setAttackOutcome(row, o, plan))}
            >
              {t(`combat.damageTray.outcome.${o}`)}
            </Chip>
          ))}
        </div>
      )}
      {row.attack === "critical" && plan.effect === "damage" && (
        <p className="f-help">{t("combat.damageTray.critHint")}</p>
      )}
      {plan.effect === "damage" && (
        <div
          className="f-chips"
          role="group"
          aria-label={t("combat.damageTray.multiplier", { name: target.name })}
        >
          {TRAY_MULTIPLIERS.map((m) => (
            <Chip
              key={m}
              pressed={row.multiplier === m}
              onClick={() => onChange(setMultiplier(row, m))}
            >
              {MULTIPLIER[m]}
            </Chip>
          ))}
        </div>
      )}
      {(plan.save || row.defense || plan.conditions) && (
        <div className="f-chips">
          {plan.save && (
            <Chip pressed={row.saved} onClick={() => onChange(toggleSaved(row, plan))}>
              {t("combat.damageTray.saved")}
            </Chip>
          )}
          {row.defense && (
            <Chip
              pressed={row.defenseOn}
              onClick={() => onChange(toggleDefense(row, plan))}
            >
              {t(`combat.damageTray.${row.defense}`)}
            </Chip>
          )}
          {plan.conditions?.options.map((id) => (
            <Chip
              key={id}
              pressed={row.conditions.includes(id) && !row.saved}
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
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}

/** What the row will do: "−14 → 8/22", "+7", or that it does nothing. */
function Preview({
  plan,
  amount,
  hp,
  conditions,
}: {
  plan: DamageTrayPlan;
  amount: number | null;
  hp?: { current: number; max: number; temp: number };
  conditions: string[];
}) {
  const { t } = useTranslation();
  const { effect } = plan;
  if (effect === null)
    return conditions.length > 0 ? null : (
      <span className="f-tray-amt">{t("combat.damageTray.noEffect")}</span>
    );
  if (amount === null) return <span className="f-tray-amt">—</span>;
  if (amount === 0 && conditions.length === 0)
    return <span className="f-tray-amt">{t("combat.damageTray.noEffect")}</span>;
  const after = hp && effect !== "temp-hp" ? previewHp(effect, amount, hp) : null;
  return (
    <span className="f-tray-amt" data-effect={effect}>
      <b>{(effect === "damage" ? "−" : "+") + String(amount)}</b>
      {after && ` → ${String(after.current)}/${String(after.max)}`}
    </span>
  );
}

type T = ReturnType<typeof useTranslation>["t"];
function bandLabel(band: NonNullable<TrayTarget["band"]>, t: T): string {
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
