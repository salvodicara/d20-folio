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
 */
import { useTranslation } from "react-i18next";
import type { ActivatableToggleVM } from "@/lib/views/tracker-view";
import { X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { FocusMark } from "@/components/ui/folio-marks";

interface ActivatableFeaturesBarProps {
  /**
   * Render-ready toggles from the tracker presenter (`activatableToggles`) —
   * already deduped by key and label-localized, so this bar makes no locale read.
   */
  toggles: ReadonlyArray<ActivatableToggleVM>;
  onToggle: (key: string) => void;
  /** The spell held in Concentration, shown first as the gold chip with its end ×. */
  held?: { label: string; roundsLeft?: number; onEnd: () => void };
}

/**
 * The chips speak the status-badge recipe of the turn ledge (one family for every
 * held or active state): lit in gold when on, quiet when off.
 */
export function ActivatableFeaturesBar({
  toggles,
  onToggle,
  held,
}: ActivatableFeaturesBarProps) {
  const { t } = useTranslation();
  if (toggles.length === 0 && !held) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="activatable-bar">
      {held && (
        <span className="status-badge" data-kind="concentration">
          <span className="sb-disc" aria-hidden>
            <FocusMark />
          </span>
          <span className="sb-label">{held.label}</span>
          {held.roundsLeft !== undefined && (
            <span className="sb-count">{held.roundsLeft}</span>
          )}
          <button
            type="button"
            className="sb-end"
            aria-label={t("combat.clearConcentration")}
            onClick={held.onEnd}
          >
            <Icon as={X} size="xs" decorative />
          </button>
        </span>
      )}
      {toggles.map((g) => (
        <button
          key={g.key}
          type="button"
          className="status-badge sb-toggle"
          data-kind={g.active ? "active" : undefined}
          data-gate={g.bloodiedGateUnmet ? "unmet" : undefined}
          aria-pressed={g.active}
          onClick={() => onToggle(g.key)}
          // S5 — a Bloodied-gated boon whose gate is UNMET surfaces its precondition
          // in the hover/SR title; the toggle is NEVER hard-disabled (override-first).
          title={
            g.bloodiedGateUnmet
              ? t("character.health.bloodiedRequired")
              : t("character.activeFeaturesHint")
          }
        >
          <span className="sb-label">{g.label}</span>
          {g.roundsLeft !== undefined && <span className="sb-count">{g.roundsLeft}</span>}
          {g.bloodiedGateUnmet && (
            <span className="sb-count">· {t("character.health.bloodied")}</span>
          )}
        </button>
      ))}
    </div>
  );
}
