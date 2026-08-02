/**
 * AttackDeclaration — the in-encounter target + HIT/MISS capture (auto-narrated combat,
 * Phase 1 + Phase 2). Shown ONLY when the player commits an attack while their open
 * sheet is in a LIVE campaign encounter ({@link useSheetCombat} non-null). It never
 * renders in SOLO play — the gate lives entirely at the call site in {@link
 * import("./tabs/PlayTab").PlayTab}, and this component is only mounted with a non-null
 * `sheetCombat`.
 *
 * The flow (deterministic, never fabricated — golden rule 21): the player picks the
 * monster(s) they swung at, rolls at the table, then taps HIT or MISS. That target
 * SET + outcome is written to their `combat/state` subdoc's `recentActions` ring
 * ({@link useCharacterStore.declareAttack}) — the budget-safe channel the DM's
 * correlation layer fuses with the observed HP delta(s) into a confirmed chronicle
 * line. No result is ever inferred: nothing is written until the player taps HIT or
 * MISS, and the panel is freely dismissible (writes nothing).
 *
 * SINGLE- vs MULTI-select is driven by the committed action's OWN shape (`maxTargets`,
 * from {@link import("./attack-scope").attackTargetCap}): a single-target swing keeps
 * the Phase-1 single-select chip; a multi-target action (Magic Missile's darts,
 * Scorching Ray's rays — `> 1`) becomes a MULTI-select, capped at that instance count.
 * The per-target damage is whatever the DM applies (never captured here).
 *
 * Never interrupts the fight: it is a compact, non-modal, dismissible banner — no confirm
 * prompt, no blocking overlay.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Swords, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { useCharacterStore } from "@/stores/characterStore";
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

/**
 * The declaration banner. `sheetCombat` is the player's live encounter (its `view.rows`
 * carry the visible monsters — a non-DM view already filters hidden ambushers); `round`
 * stamps the declaration for the correlation window. `maxTargets` is the committed
 * action's target cap (1 = single-select Phase-1; `> 1` = multi-select, capped).
 * Resolves via `onDone` after a HIT/MISS write OR a dismiss.
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
  /** S13 — an AREA save-for-half spell (Fireball class): the picker is unbounded and
   *  the commit is a single "Resolve" (no HIT/MISS — the DM's per-target HP delta decides
   *  each outcome). */
  save?: boolean;
  /** S13 — the action's applied-condition RIDER ids (Topple → prone): carried on the
   *  declaration so the DM-side correlation credits a matching condition to this caster. */
  riders?: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const declareAttack = useCharacterStore((s) => s.declareAttack);
  const [selected, setSelected] = useState<string[]>([]);
  // A multi-select picker for a multi-instance attack (Magic Missile) OR an area save
  // burst (unbounded, `maxTargets === Infinity`); a single swing stays single-select.
  const multi = maxTargets > 1;

  // Phase-1 targets = the visible monster rows (the player's view already excludes hidden
  // ambushers), never-down. Ids only (golden rule 7) — the label is the row's typed name.
  const monsters = sheetCombat.view.rows.filter((r) => r.kind === "monster" && !r.down);

  const toggle = (id: string): void =>
    setSelected((prev) => {
      if (!multi) return [id]; // single-select: replace
      if (prev.includes(id)) return prev.filter((x) => x !== id); // deselect
      if (prev.length >= maxTargets) return prev; // at cap: never over-pick
      return [...prev, id];
    });

  const declare = (outcome: "hit" | "miss"): void => {
    if (selected.length === 0) return;
    declareAttack({
      targetIds: selected,
      // A save declaration has no attack roll — it commits as "hit" (cast/resolved) and
      // the DM's per-target HP delta decides damaged vs resisted.
      outcome: save ? "hit" : outcome,
      round: sheetCombat.round,
      // A save declaration binds every target (no instance cap), so it carries no
      // `instances`; a multi-instance ATTACK carries its drop bound; a single swing none.
      ...(save ? { save: true } : multi ? { instances: maxTargets } : {}),
      // The applied-condition rider ids (Topple → prone) ride every declaration that has one.
      ...(riders.length > 0 ? { riders } : {}),
    });
    onDone();
  };

  // A save burst is unbounded (Infinity cap); a multi-instance attack caps at its count.
  const atCap = !save && multi && selected.length >= maxTargets;

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

      <div className="mt-2 flex gap-2">
        {save ? (
          // An area save spell has no attack roll — ONE commit; the DM's per-target HP
          // delta decides who took the number and who resisted.
          <button
            type="button"
            onClick={() => declare("hit")}
            disabled={selected.length === 0}
            className="flex-1 rounded-sm border border-accent/50 bg-accent/10 px-2 py-1 text-2xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("combat.declareResolve")}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => declare("hit")}
              disabled={selected.length === 0}
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
