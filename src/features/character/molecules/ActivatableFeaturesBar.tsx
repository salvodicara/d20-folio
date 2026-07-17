/**
 * L11 — Activatable Features toggle bar.
 *
 * Renders one toggle per `while-active` group surfaced by `evaluateGrants`
 * (Bladesong, Innate Sorcery, Rage, …). Toggling a feature flips its key in
 * the session `activeFeatures` set, which re-evaluates the grant pipeline so
 * the feature's conditional buffs (resistances, senses, AC, advantages)
 * appear/disappear in the sheet header automatically.
 *
 * Override-first: the player is always in control — nothing forces a toggle.
 * Functional (unstyled) — the design agent restyles from its branch.
 */
import { useTranslation } from "react-i18next";
import type { ActivatableToggleVM } from "@/lib/views/tracker-view";
import { cn } from "@/lib/utils";

interface ActivatableFeaturesBarProps {
  /**
   * Render-ready toggles from the tracker presenter (`activatableToggles`) —
   * already deduped by key and label-localized, so this bar makes no locale read.
   */
  toggles: ReadonlyArray<ActivatableToggleVM>;
  onToggle: (key: string) => void;
}

export function ActivatableFeaturesBar({
  toggles,
  onToggle,
}: ActivatableFeaturesBarProps) {
  const { t } = useTranslation();
  if (toggles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="activatable-bar">
      {toggles.map((g) => (
        <button
          key={g.key}
          type="button"
          aria-pressed={g.active}
          onClick={() => onToggle(g.key)}
          // S5 — a Bloodied-gated boon whose gate is UNMET surfaces its precondition
          // in the hover/SR title; the toggle is NEVER hard-disabled (override-first).
          title={
            g.bloodiedGateUnmet
              ? t("character.health.bloodiedRequired")
              : t("character.activeFeaturesHint")
          }
          className={cn(
            "rounded-md border px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wide transition-colors",
            g.active
              ? "border-accent bg-accent/15 text-accent-text shadow-[var(--elev-resting)]"
              : g.bloodiedGateUnmet
                ? "border-error/40 bg-bg-tertiary text-text-secondary opacity-70 hover:border-error/60 hover:text-text-primary"
                : "border-border-medium bg-bg-tertiary text-text-secondary hover:border-border-accent hover:text-text-primary"
          )}
        >
          {g.label}
          {g.roundsLeft !== undefined && (
            <span className="ml-1.5 font-normal normal-case opacity-80">
              {t("combat.effectTimerShort", { count: g.roundsLeft })}
            </span>
          )}
          {g.bloodiedGateUnmet && (
            <span className="ml-1.5 font-normal normal-case opacity-80">
              · {t("character.health.bloodied")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
