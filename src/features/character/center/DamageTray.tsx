/**
 * The damage tray (owner 2026-10-12): the intermediate screen right after a use with
 * targets. Copied from Foundry VTT dnd5e's damage-application tray — one rolled total,
 * one row per target with ×0 · ×½ · ×1 · ×2 and the target's resistances, one Apply —
 * plus Roll20 GroupCheck/ApplyDamage's per-target "Saved" toggle. A bottom sheet on a
 * phone, the same panel as a centered dialog on wider screens. The app never rolls: the
 * player types what the table rolled.
 *
 * An attack's row also says Colpito · Mancato · Critico (Foundry dnd5e's chat card):
 * Apply writes the shared result onto the use's own log line, the per-target result
 * onto each damage line, and one outcome receipt per target into the turn.
 *
 * Where an applied row lands:
 *  - me → the sheet's own store seams (heal / temp HP / damage / condition), tagged
 *    with the action as source; undoable as ONE step with the monsters' lines;
 *  - another PC in the live encounter → the same peer combat write the campaign PC card
 *    uses, then an `effect-given` log line (a remote write, not undone by Undo);
 *  - a monster → only the `effect-given` log line (players cannot write monster HP).
 * Skip (or closing) applies nothing: the use stays logged exactly as it was.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import { hpBand } from "@/features/character/molecules/hp-tier";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { useLocale } from "@/hooks/useLocale";
import type { DamageDefenses } from "@/lib/damage-intake";
import type { LocText } from "@/lib/loc-text";
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
  sharedAttackOutcome,
  toggleCondition,
  toggleDefense,
  toggleSaved,
  trayOutcomeReceipts,
  type AttackOutcome,
  type DamageTrayPlan,
  type TrayEffect,
  type TrayMultiplier,
  type TrayRow,
} from "@/lib/play/damage-tray";
import { conditionLabel } from "@/lib/views/tracker-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CombatEvent } from "@/types/combat-log";

import { useDamageTrayStore, type DamageTrayOffer } from "./damage-tray-store";

export function DamageTray() {
  const offer = useDamageTrayStore((s) => s.offer);
  const characterId = useCharacterStore((s) => s.character?.id);
  const open = offer !== null && offer.characterId === characterId;
  // Leaving the sheet (the provider unmounts) drops a tray nobody answered: it must
  // never reappear over another screen. Skipping is the default anyway.
  useEffect(() => () => useDamageTrayStore.getState().close(), []);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useDamageTrayStore.getState().close();
      }}
    >
      {open && <DamageTrayContent key={offer.castLogId ?? "tray"} offer={offer} />}
    </Dialog>
  );
}

/** One target as the tray shows it. */
interface TrayTarget {
  id: string;
  name: string;
  kind: "self" | "pc" | "monster";
  /** Exact HP when the viewer may see it. */
  hp?: { current: number; max: number; temp: number };
  /** The concealed band (a monster's HP the DM has not revealed). */
  band?: ReturnType<typeof hpBand>;
  defenses?: DamageDefenses;
  row?: EncounterCombatantView;
}

const MULTIPLIER_LABEL: Record<TrayMultiplier, string> = {
  "0": "0",
  "0.25": "¼",
  "0.5": "½",
  "1": "1",
  "2": "2",
};

function DamageTrayContent({ offer }: { offer: DamageTrayOffer }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const { plan } = offer;
  const hp = useHpControls();
  const selfName = useCharacterStore((s) => s.character?.character.name ?? "");
  const status = useCombatStatusStore((s) => s.status);
  const uid = useAuthStore((s) => s.user?.uid);
  // The same "me" the commit used (TurnEconomyProvider.selfCombatantId).
  const selfId = status?.myId ?? (uid ? `pc-${uid}` : "self");

  const targets = useMemo<TrayTarget[]>(
    () =>
      plan.targets.map((id): TrayTarget => {
        if (id === selfId)
          return {
            id,
            name: selfName,
            kind: "self",
            hp: { current: hp.current, max: hp.max, temp: hp.temp },
            defenses: hp.defenses,
          };
        const row = status?.view.rows.find((r) => r.id === id);
        const exact = row?.kind === "pc" || row?.side === "ally";
        return {
          id,
          name: row?.name ?? id,
          kind: row?.kind === "pc" ? "pc" : "monster",
          ...(row && exact
            ? { hp: { current: row.currentHp, max: row.maxHp, temp: row.tempHp } }
            : row
              ? { band: hpBand(row.currentHp, row.maxHp) }
              : {}),
          ...(row?.defenses ? { defenses: row.defenses } : {}),
          ...(row ? { row } : {}),
        };
      }),
    // The rows are fixed for the tray's life: the targets were picked already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [text, setText] = useState("");
  const [rows, setRows] = useState<TrayRow[]>(() =>
    targets.map((target) => initialTrayRow(plan, target.id, target.defenses))
  );
  const fieldRef = useRef<HTMLInputElement>(null);
  const total = parseRolledTotal(text);
  const invalid = text.trim() !== "" && total === null;
  // A number is needed only while some row's amount depends on it (a tray of misses
  // applies without one).
  const canApply = total !== null || rows.every((row) => !rowNeedsTotal(row, plan));

  const update = (index: number, next: TrayRow) =>
    setRows((current) => current.map((row, i) => (i === index ? next : row)));

  const rubric = [effectLabel(plan, t, locale), saveLabel(plan, t)]
    .filter(Boolean)
    .join(" · ");

  const apply = () => {
    if (!canApply) return;
    applyTray(offer, targets, rows, total ?? 0, t);
    useDamageTrayStore.getState().close();
  };

  return (
    <DialogContent
      size="md"
      overlayClassName="scrim-sheet"
      rubric={rubric}
      title={offer.actionName}
      description={rubric}
      closeLabel={t("common.close")}
      data-testid="damage-tray"
      onOpenAutoFocus={(event) => {
        if (!fieldRef.current) return;
        event.preventDefault();
        fieldRef.current.focus();
      }}
    >
      {plan.effect !== null && (
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
            {t("combat.damageTray.totalHint")}
          </span>
        </div>
      )}

      <DialogBody>
        <ul
          className="flex flex-col gap-2"
          aria-label={t("combat.targetStepTitle", { name: offer.actionName })}
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
                total={total}
                locale={locale}
                onChange={(next) => update(index, next)}
              />
            );
          })}
        </ul>
      </DialogBody>

      <DialogFooter>
        <Button
          variant="secondary"
          block
          onClick={() => useDamageTrayStore.getState().close()}
        >
          {t("common.skip")}
        </Button>
        <Button variant="primary" block disabled={!canApply} onClick={apply}>
          {t("combat.apply")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TrayTargetRow({
  target,
  row,
  plan,
  total,
  locale,
  onChange,
}: {
  target: TrayTarget;
  row: TrayRow;
  plan: DamageTrayPlan;
  total: number | null;
  locale: Locale;
  onChange: (row: TrayRow) => void;
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
            {conditionLabel(id, locale)}
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

type T = ReturnType<typeof useTranslation>["t"];

function effectLabel(plan: DamageTrayPlan, t: T, locale: Locale): string {
  switch (plan.effect) {
    case "damage":
      return plan.damageType
        ? t("combat.damageTray.rubricDamage", {
            type: t(`srd.damage_${plan.damageType}`),
          })
        : t("mechanics.cast.optionDamage");
    case "heal":
      return t("combat.heal");
    case "temp-hp":
      return t("combat.tempHpRollLabel");
    default:
      // A condition-only spell (Hold Person): what a failed save does.
      return (plan.conditions?.options ?? [])
        .map((id) => conditionLabel(id, locale))
        .join(" / ");
  }
}

function saveLabel(plan: DamageTrayPlan, t: T): string | null {
  const save = plan.save;
  if (!save?.ability || save.dc === undefined) return null;
  return t("combat.cunningStrikeSave", {
    ability: t(`abilities.${save.ability}_short`),
    dc: save.dc,
  });
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

// ── Apply ──────────────────────────────────────────────────────────────────────

type SelfKind = "hp-heal" | "hp-damage" | "temp-hp-gain" | "condition-gain";

function logIds(): Set<string> {
  return new Set(
    useCharacterStore.getState().character?.session.logEntries.map((e) => e.id) ?? []
  );
}

/** Tag the line a self seam just logged with the action that caused it, so the
 *  session gets ONE line carrying target, amount and source. */
function tagNewLine(before: ReadonlySet<string>, kind: SelfKind, source: LocText): void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.findLast(
    (e) => !before.has(e.id) && e.event.kind === kind
  );
  if (entry) store.amendLogEntry(entry.id, { ...entry.event, source } as CombatEvent);
}

interface AppliedRow {
  target: TrayTarget;
  amount: number;
  conditions: string[];
  outcome?: AttackOutcome;
}

/** Write the attack's one shared result onto the use's own log line; the returned
 *  undo puts the line back as it was. */
function stampOutcome(castLogId: string | null, outcome: AttackOutcome): () => void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.find((e) => e.id === castLogId);
  if (
    !entry ||
    (entry.event.kind !== "action-use" && entry.event.kind !== "reaction-use")
  )
    return () => {};
  return store.amendLogEntry(entry.id, { ...entry.event, outcome }) ?? (() => {});
}

function applyTray(
  offer: DamageTrayOffer,
  targets: ReadonlyArray<TrayTarget>,
  rows: ReadonlyArray<TrayRow>,
  total: number,
  t: T
): void {
  const { plan, source } = offer;
  const effect = plan.effect;
  const applied: AppliedRow[] = targets
    .map((target, index) => {
      const row = rows[index];
      return {
        target,
        amount: effect && row ? rowAmount(total, row, plan) : 0,
        conditions: row ? rowConditions(row) : [],
        ...(row?.attack ? { outcome: row.attack } : {}),
      };
    })
    .filter((row) => row.amount > 0 || row.conditions.length > 0);
  // Hit / Miss / Critical: the use's line says the shared result, and the turn keeps
  // one receipt per target (a miss applies nothing, yet it is still recorded).
  const shared = plan.attack ? sharedAttackOutcome(rows) : undefined;
  const receipts =
    plan.attack && offer.occurrenceId
      ? trayOutcomeReceipts(offer.occurrenceId, offer.actionId, rows)
      : [];
  const declares = shared !== undefined || receipts.length > 0;
  if (applied.length === 0 && !declares) return;

  const local = applied.filter((row) => row.target.kind !== "pc");
  const peers = applied.filter((row) => row.target.kind === "pc");
  const label = {
    message: t("combat.damageTray.appliedToast", { name: offer.actionName }),
  };

  if (local.length > 0 || declares) {
    registerUndoableToast(
      label,
      () => {
        const store = useCharacterStore.getState();
        if (store.readonly || !store.character) return null;
        const before = logIds();
        const reversals: Array<() => void> = [];
        if (shared) reversals.push(stampOutcome(offer.castLogId, shared));
        const receiptIds = useCombatStore.getState().recordOutcomes(receipts);
        reversals.push(() => useCombatStore.getState().withdrawOutcomes(receiptIds));
        for (const { target, amount, conditions, outcome } of local) {
          if (target.kind === "self") {
            if (effect && amount > 0) applySelf(effect, amount, source, reversals);
            for (const conditionId of conditions) {
              if (
                useCharacterStore
                  .getState()
                  .character?.session.conditions.includes(conditionId)
              )
                continue;
              const ids = logIds();
              useCharacterStore.getState().addCondition(conditionId);
              tagNewLine(ids, "condition-gain", source);
              reversals.push(() => {
                useCharacterStore.getState().removeConditionSilent(conditionId);
              });
            }
            continue;
          }
          // A monster: the line is the record (players cannot write monster HP).
          const given = { target: target.id, targetName: target.name, source };
          if (effect && amount > 0)
            store.logEvent({
              kind: "effect-given",
              effect,
              amount,
              ...given,
              ...(outcome && effect === "damage" ? { outcome } : {}),
            });
          for (const conditionId of conditions)
            store.logEvent({
              kind: "effect-given",
              effect: "condition",
              conditionId,
              ...given,
            });
        }
        return () => {
          for (const reverse of reversals.reverse()) reverse();
          // Every line this apply wrote (and any its reversal wrote) goes with it.
          const live = useCharacterStore.getState();
          for (const entry of live.character?.session.logEntries ?? [])
            if (!before.has(entry.id)) live.removeLogEntry(entry.id);
        };
      },
      { turnScoped: false }
    );
  } else {
    useToastStore.getState().showToast({ ...label, duration: 4000 });
  }

  for (const { target, amount, conditions, outcome } of peers) {
    if (effect && amount > 0)
      givePeer(target, effect, amount, undefined, source, t, outcome);
    for (const conditionId of conditions)
      givePeer(target, "condition", 0, conditionId, source, t);
  }
}

/** Me: the store's own heal / temp-HP / damage seams, the line they log tagged. */
function applySelf(
  effect: TrayEffect,
  amount: number,
  source: LocText,
  reversals: Array<() => void>
): void {
  const store = useCharacterStore.getState();
  const character = store.character;
  if (!character) return;
  const ids = logIds();
  if (effect === "heal") {
    const { hp, deathSucc, deathFail, conditions } = character.session;
    const snapshot = {
      current: hp.current,
      temp: hp.temp,
      deathSucc,
      deathFail,
      conditions: [...conditions],
    };
    store.applyHealing(amount);
    reversals.push(() => useCharacterStore.getState().restoreHpSnapshot(snapshot));
    tagNewLine(ids, "hp-heal", source);
  } else if (effect === "temp-hp") {
    const prevTemp = character.session.hp.temp;
    store.gainTempHp(amount);
    reversals.push(() => useCharacterStore.getState().setTempHP(prevTemp));
    tagNewLine(ids, "temp-hp-gain", source);
  } else {
    const undo = store.applyDamage(amount);
    if (undo) reversals.push(() => void undo());
    tagNewLine(ids, "hp-damage", source);
  }
}

/** Another PC in the live encounter: the campaign PC card's peer write, then a line. */
function givePeer(
  target: TrayTarget,
  effect: TrayEffect | "condition",
  amount: number,
  conditionId: string | undefined,
  source: LocText,
  t: T,
  outcome?: AttackOutcome
): void {
  const row = target.row;
  const memberUid = row?.memberUid;
  const characterId = row?.characterId;
  const log = () =>
    useCharacterStore.getState().logEvent({
      kind: "effect-given",
      effect,
      target: target.id,
      targetName: target.name,
      source,
      ...(effect === "condition" ? { conditionId } : { amount }),
      ...(outcome && effect === "damage" ? { outcome } : {}),
    });
  if (!row || !memberUid || !characterId) {
    log();
    return;
  }
  const mutation =
    effect === "condition"
      ? {
          kind: "condition" as const,
          operation: { kind: "add" as const, conditionId: conditionId ?? "" },
        }
      : effect === "temp-hp"
        ? { kind: "temp-hp" as const, value: Math.max(row.tempHp, amount) }
        : {
            kind: "hp" as const,
            operation: {
              kind: effect === "heal" ? ("heal" as const) : ("damage" as const),
              amount,
            },
          };
  void import("@/features/campaigns/campaign-io")
    .then(({ writeCampaignCombatEffect }) =>
      writeCampaignCombatEffect(memberUid, characterId, null, row.maxHp, mutation)
    )
    .then(log)
    .catch((error: unknown) => {
      console.error("Combat write failed", error);
      useToastStore
        .getState()
        .showToast({ message: t("campaignHub.combatWriteFailed"), duration: 6000 });
    });
}
