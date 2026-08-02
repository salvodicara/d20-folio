/**
 * AttackDeclaration — the in-encounter target + DAMAGE capture (auto-narrated combat).
 * Shown ONLY when the player commits an attack while their open sheet is in a LIVE
 * campaign encounter ({@link useSheetCombat} non-null). It never renders in SOLO play —
 * the gate lives entirely at the call site in {@link
 * import("./tabs/PlayTab").PlayTab}, and this component is only mounted with a non-null
 * `sheetCombat`.
 *
 * THE FLOW (owner 2026-08-02 — the source-of-truth flip). The player picks the monster(s)
 * they swung at, then — on a HIT — TYPES the damage they rolled and confirms, and that
 * damage AUTO-APPLIES to the target monster's HP right away (the drop is written to the
 * shared encounter through {@link import("./apply-damage").applyDeclaredDamage}). The
 * number the chronicle narrates is now the PLAYER's (previously it was the DM's manual HP
 * delta). A MISS applies nothing (a logged miss). Nothing is written until the player
 * confirms, and the panel is freely dismissible (writes nothing). Every applied number
 * stays fully DM-remediable — the DM freely re-adjusts monster HP and edits / undoes any
 * chronicle line — so a mistake is always correctable.
 *
 * In parallel the player's declaration (target SET + outcome + round, plus the
 * multi-instance bound / save flag / condition riders) is written to their `combat/state`
 * `recentActions` ring ({@link useCharacterStore.declareAttack}) — the budget-safe channel
 * the DM's reconcile layer fuses with the applied HP drops into the confirmed chronicle
 * line. The declaration carries NO amount: the amount lives on the applied `hp-damage`
 * event, so the reconcile pipeline is unchanged.
 *
 * SINGLE- vs MULTI- vs SAVE is driven by the committed action's OWN shape (`maxTargets`
 * from {@link import("./attack-scope").attackTargetCap}, `save` from {@link
 * import("./attack-scope").isSaveDeclaration}):
 *  - a single-target swing: one target + one damage field;
 *  - a multi-instance action (Magic Missile's darts, Scorching Ray's rays — `> 1`): a
 *    capped multi-select with a PER-TARGET damage field;
 *  - an AREA save spell (Fireball class): the picker is unbounded and the player enters
 *    the ONE rolled damage, applied in FULL to every target — saves are a table/DM call,
 *    so the DM then trims the savers' HP (no per-target save UI is forced on the player).
 *
 * Never interrupts the fight: a compact, non-modal, dismissible banner — no confirm
 * prompt, no blocking overlay.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Swords, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { NumberStepper } from "@/components/ui/input";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { applyDeclaredDamage } from "./apply-damage";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";

/** One target chip — a monster the player can pick. Toggles in the multi-target set;
 *  a single-target picker replaces the selection. Disabled only when the multi cap is
 *  reached and this chip is not already in the set (never lets the player over-pick). */
function TargetChip({
  label,
  selected,
  disabled,
  onClick,
  ariaLabel,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className="rounded-sm border border-border-medium bg-bg-tertiary px-2 py-0.5 text-2xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary aria-pressed:border-accent aria-pressed:bg-accent/15 aria-pressed:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

/** One damage-entry row: a label (with the explain-on-demand glossary tip on the FIRST
 *  row) + the shared {@link NumberStepper} — the SAME numeric control the HP popover
 *  uses, so entering damage reads identically to booking it. */
function DamageRow({
  label,
  ariaLabel,
  value,
  onChange,
  rubric,
  explain,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (n: number) => void;
  /** When set, the label carries the explain-on-demand glossary tip (first row only). */
  rubric?: string;
  explain?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 flex-1 truncate text-2xs text-text-secondary">
        {explain && rubric ? (
          <GlossaryTip term="damageDealt" rubric={rubric}>
            {label}
          </GlossaryTip>
        ) : (
          label
        )}
      </span>
      <NumberStepper
        compact
        digits={3}
        min={0}
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel}
        decrementLabel={t("common.decrease")}
        incrementLabel={t("common.increase")}
      />
    </div>
  );
}

/**
 * The declaration banner. `sheetCombat` is the player's live encounter (its `view.rows`
 * carry the visible monsters — a non-DM view already filters hidden ambushers;
 * `campaignId` + `round` scope the applied HP write). `maxTargets` is the committed
 * action's target cap (1 = single; `> 1` = multi-select, capped; `Infinity` = unbounded
 * area). Resolves via `onDone` after a confirm OR a dismiss.
 */
export function AttackDeclaration({
  sheetCombat,
  maxTargets = 1,
  save = false,
  riders = [],
  onDone,
}: {
  sheetCombat: GlobalCombat;
  maxTargets?: number;
  /** An AREA save-for-half spell (Fireball class): the picker is unbounded and the player
   *  enters the ONE rolled damage, applied in full to every target (the DM trims savers). */
  save?: boolean;
  /** The action's applied-condition RIDER ids (Topple → prone): carried on the
   *  declaration so the DM-side reconcile credits a matching condition to this caster. */
  riders?: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const declareAttack = useCharacterStore((s) => s.declareAttack);
  const showToast = useToastStore((s) => s.showToast);
  const [selected, setSelected] = useState<string[]>([]);
  // Per-target damage the player typed (monster id → rolled amount) for a single swing /
  // multi-instance action; a SAVE burst shares ONE rolled number across the area.
  const [damage, setDamage] = useState<Record<string, number>>({});
  const [saveDamage, setSaveDamage] = useState(0);
  const rubric = t("combat.damage");
  // A multi-select picker for a multi-instance attack (Magic Missile) OR an area save
  // burst (unbounded, `maxTargets === Infinity`); a single swing stays single-select.
  const multi = maxTargets > 1;

  // The visible monster rows (the player's view already excludes hidden ambushers),
  // never-down. Ids only (golden rule 7) — the label is the row's typed name.
  const monsters = sheetCombat.view.rows.filter((r) => r.kind === "monster" && !r.down);
  const nameById = useMemo(
    () => new Map(monsters.map((m) => [m.id, m.name] as const)),
    [monsters]
  );

  // Autofocus the damage field the moment a single-target swing has its one target, so
  // the fast path after a roll is: tap target → type number → Hit (no extra tap).
  const damageBoxRef = useRef<HTMLDivElement>(null);
  const singleTarget = !multi && !save ? selected[0] : undefined;
  useEffect(() => {
    if (singleTarget)
      damageBoxRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [singleTarget]);

  const toggle = (id: string): void =>
    setSelected((prev) => {
      if (!multi) return prev[0] === id ? [] : [id]; // single-select: replace / clear
      if (prev.includes(id)) return prev.filter((x) => x !== id); // deselect
      if (prev.length >= maxTargets) return prev; // at cap: never over-pick
      return [...prev, id];
    });

  const setTargetDamage = (id: string, n: number): void =>
    setDamage((prev) => ({ ...prev, [id]: n }));

  /** The per-target hits to apply on a confirm: the shared rolled number for a SAVE
   *  burst, else each target's own typed damage (defaulting to 0). */
  const hits = selected.map((id) => ({
    targetId: id,
    amount: save ? saveDamage : (damage[id] ?? 0),
  }));

  const finish = (entry: Parameters<typeof declareAttack>[0]): void => {
    declareAttack(entry);
    onDone();
  };

  const declare = (outcome: "hit" | "miss"): void => {
    if (selected.length === 0) return;
    // A HIT (or a resolved SAVE) auto-applies the typed damage to the target monster HP;
    // a MISS applies nothing. The apply is fire-and-forget — a denied / offline write
    // toasts, but the declaration still records the intent (the DM reconciles the truth).
    if (outcome === "hit") {
      void applyDeclaredDamage(sheetCombat.campaignId, hits).catch(() =>
        showToast({ message: t("combat.declareApplyFailed"), duration: 6000 })
      );
    }
    finish({
      // A save declaration has no attack roll — it commits as "hit" (cast/resolved).
      outcome: save ? "hit" : outcome,
      targetIds: selected,
      round: sheetCombat.round,
      // A save declaration binds every target (no instance cap), so it carries no
      // `instances`; a multi-instance ATTACK carries its drop bound; a single swing none.
      ...(save ? { save: true } : multi ? { instances: maxTargets } : {}),
      // The applied-condition rider ids (Topple → prone) ride every declaration that has one.
      ...(riders.length > 0 ? { riders } : {}),
    });
  };

  // A save burst is unbounded (Infinity cap); a multi-instance attack caps at its count.
  const atCap = !save && multi && selected.length >= maxTargets;
  // A landed hit deals damage: the confirm arms only once every struck target has a
  // positive number (a save shares the one rolled value). A miss needs only a target.
  const hitReady =
    selected.length > 0 && hits.every((h) => h.amount > 0) && (!save || saveDamage > 0);

  return (
    <section
      data-testid="attack-declaration"
      className="mb-3 rounded-md border border-accent/40 bg-[var(--bg-recessed)] px-3 py-2 shadow-[var(--elev-recessed)]"
    >
      <div className="flex items-center gap-2">
        <Icon as={Swords} size="sm" className="text-accent" decorative />
        <span className="flex-1 text-2xs font-semibold text-text-primary">
          {t(save ? "combat.declareTitleSave" : "combat.declareTitle")}
        </span>
        <button
          type="button"
          onClick={onDone}
          aria-label={t("combat.declareDismiss")}
          className="shrink-0 rounded p-1 text-text-faint transition-colors hover:text-text-primary"
        >
          <Icon as={X} size="xs" decorative />
        </button>
      </div>

      <p className="mt-0.5 text-[length:var(--text-micro)] text-text-secondary">
        {save
          ? t("combat.declareHintSave")
          : t(multi ? "combat.declareHintMulti" : "combat.declareHint", {
              count: maxTargets,
            })}
      </p>

      {monsters.length === 0 ? (
        <p className="mt-2 text-2xs italic text-text-faint">
          {t("combat.declareNoTargets")}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1">
          {monsters.map((m) => {
            const isSelected = selected.includes(m.id);
            return (
              <TargetChip
                key={m.id}
                label={m.name}
                ariaLabel={t("combat.declareTargetAria", { name: m.name })}
                selected={isSelected}
                disabled={atCap && !isSelected}
                onClick={() => toggle(m.id)}
              />
            );
          })}
        </div>
      )}

      {/* Damage entry — appears once a target is picked; the number auto-applies on a
          HIT / Resolve. A single swing has one field; a multi-instance action one field
          per struck target; a SAVE burst one shared rolled number (+ its DM-trims hint). */}
      {selected.length > 0 && (
        <div ref={damageBoxRef} className="mt-2 flex flex-col gap-1">
          {save ? (
            <>
              <DamageRow
                label={t("combat.declareDamageRolled")}
                ariaLabel={t("combat.declareDamageAria")}
                value={saveDamage}
                onChange={setSaveDamage}
                rubric={rubric}
                explain
              />
              <p className="text-[length:var(--text-micro)] italic text-text-faint">
                {t("combat.declareSaveApplyHint")}
              </p>
            </>
          ) : multi ? (
            selected.map((id, i) => (
              <DamageRow
                key={id}
                label={nameById.get(id) ?? id}
                ariaLabel={t("combat.declareDamageForAria", {
                  name: nameById.get(id) ?? id,
                })}
                value={damage[id] ?? 0}
                onChange={(n) => setTargetDamage(id, n)}
                rubric={rubric}
                explain={i === 0}
              />
            ))
          ) : (
            <DamageRow
              label={t("combat.damage")}
              ariaLabel={t("combat.declareDamageAria")}
              value={damage[selected[0] ?? ""] ?? 0}
              onChange={(n) => selected[0] && setTargetDamage(selected[0], n)}
              rubric={rubric}
              explain
            />
          )}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        {save ? (
          // An area save spell has no attack roll — ONE commit applies the rolled damage
          // to every target; the DM then trims the savers' HP.
          <button
            type="button"
            onClick={() => declare("hit")}
            disabled={!hitReady}
            className="flex-1 rounded-sm border border-accent/50 bg-accent/10 px-2 py-1 text-2xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("combat.declareResolve")}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => declare("hit")}
              disabled={!hitReady}
              className="flex-1 rounded-sm border border-success/50 bg-success/10 px-2 py-1 text-2xs font-semibold text-success transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t(multi ? "combat.declareLanded" : "combat.declareHit")}
            </button>
            <button
              type="button"
              onClick={() => declare("miss")}
              disabled={selected.length === 0}
              className="flex-1 rounded-sm border border-border-medium bg-bg-tertiary px-2 py-1 text-2xs font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("combat.declareMiss")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
