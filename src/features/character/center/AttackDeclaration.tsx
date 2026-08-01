/**
 * AttackDeclaration — the in-encounter target + HIT/MISS capture (auto-narrated combat,
 * Phase 1). Shown ONLY when the player commits a WEAPON attack while their open sheet is
 * in a LIVE campaign encounter ({@link useSheetCombat} non-null). It never renders in
 * SOLO play — the gate lives entirely at the call site in {@link
 * import("./tabs/PlayTab").PlayTab}, and this component is only mounted with a non-null
 * `sheetCombat`.
 *
 * The flow (deterministic, never fabricated — golden rule 21): the player picks the
 * monster they swung at, rolls at the table, then taps HIT or MISS. That target + outcome
 * is written to their `combat/state` subdoc's `recentActions` ring
 * ({@link useCharacterStore.declareAttack}) — the budget-safe channel the DM's
 * correlation layer fuses with the observed HP delta into a confirmed chronicle line. No
 * result is ever inferred: nothing is written until the player taps HIT or MISS, and the
 * panel is freely dismissible (writes nothing).
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

/** One target chip — a monster the player can pick. Single-select for Phase 1. */
function TargetChip({
  label,
  selected,
  onClick,
  ariaLabel,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className="rounded-sm border border-border-medium bg-bg-tertiary px-2 py-0.5 text-2xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary aria-pressed:border-accent aria-pressed:bg-accent/15 aria-pressed:text-text-primary"
    >
      {label}
    </button>
  );
}

/**
 * The declaration banner. `sheetCombat` is the player's live encounter (its `view.rows`
 * carry the visible monsters — a non-DM view already filters hidden ambushers); `round`
 * stamps the declaration for the correlation window. Resolves via `onDone` after a
 * HIT/MISS write OR a dismiss.
 */
export function AttackDeclaration({
  sheetCombat,
  onDone,
}: {
  sheetCombat: GlobalCombat;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const declareAttack = useCharacterStore((s) => s.declareAttack);
  const [targetId, setTargetId] = useState<string | null>(null);

  // Phase 1 targets = the visible monster rows (the player's view already excludes hidden
  // ambushers), never-down. Ids only (golden rule 7) — the label is the row's typed name.
  const monsters = sheetCombat.view.rows.filter((r) => r.kind === "monster" && !r.down);

  const declare = (outcome: "hit" | "miss"): void => {
    if (!targetId) return;
    declareAttack({ targetIds: [targetId], outcome, round: sheetCombat.round });
    onDone();
  };

  return (
    <section
      data-testid="attack-declaration"
      className="mb-3 rounded-md border border-accent/40 bg-[var(--bg-recessed)] px-3 py-2 shadow-[var(--elev-recessed)]"
    >
      <div className="flex items-center gap-2">
        <Icon as={Swords} size="sm" className="text-accent" decorative />
        <span className="flex-1 text-2xs font-semibold text-text-primary">
          {t("combat.declareTitle")}
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
        {t("combat.declareHint")}
      </p>

      {monsters.length === 0 ? (
        <p className="mt-2 text-2xs italic text-text-faint">
          {t("combat.declareNoTargets")}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1">
          {monsters.map((m) => (
            <TargetChip
              key={m.id}
              label={m.name}
              ariaLabel={t("combat.declareTargetAria", { name: m.name })}
              selected={m.id === targetId}
              onClick={() => setTargetId(m.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => declare("hit")}
          disabled={!targetId}
          className="flex-1 rounded-sm border border-success/50 bg-success/10 px-2 py-1 text-2xs font-semibold text-success transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("combat.declareHit")}
        </button>
        <button
          type="button"
          onClick={() => declare("miss")}
          disabled={!targetId}
          className="flex-1 rounded-sm border border-border-medium bg-bg-tertiary px-2 py-1 text-2xs font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("combat.declareMiss")}
        </button>
      </div>
    </section>
  );
}
