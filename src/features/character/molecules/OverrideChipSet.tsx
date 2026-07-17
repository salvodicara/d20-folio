/**
 * OverrideChipSet — a reusable add/remove chip editor for the #68 set-valued
 * overrides (damage resistances / immunities / vulnerabilities, condition
 * immunities, armor / weapon proficiencies).
 *
 * It reuses the on-brand `.co-*` chip recipe the conditions strip established
 * (chip + `×` remove + an `Add` popover listbox), so it introduces NO new CSS.
 * The parent computes the EFFECTIVE id set (via `applySetOverride`) and supplies
 * add/remove/reset handlers that patch the character's `*Overrides` map — this
 * component is pure presentation + local popover state (override-first per
 * Constitution #1; the seam stays in the store, not here).
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, RotateCcw } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { cn } from "@/lib/utils";

export interface OverrideChipOption {
  id: string;
  label: string;
}

export interface OverrideChipSetProps {
  /** Effective ids to render as chips (already merged through applySetOverride). */
  ids: string[];
  /** Localize an id for display. */
  renderLabel: (id: string) => string;
  /** Optional per-chip color + ink (CSS color strings) — e.g. damage / condition hue. */
  colorFor?: (id: string) => { color: string; ink: string } | undefined;
  /** Add-picker options; the parent should already drop ids that are present. */
  addOptions: OverrideChipOption[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  /** Clear the whole override map; the control shows only when `dirty`. */
  onReset?: () => void;
  /** True when the backing override map has any entries (enables Reset). */
  dirty?: boolean;
  /** Label for the add affordance + its popover (e.g. "Add resistance"). */
  addLabel: string;
}

export function OverrideChipSet({
  ids,
  renderLabel,
  colorFor,
  addOptions,
  onAdd,
  onRemove,
  onReset,
  dirty,
  addLabel,
}: OverrideChipSetProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Close the add picker on outside pointerdown / Escape (shared, capture-phase).
  useDismissOnOutside(pickerOpen, wrapRef, () => setPickerOpen(false));

  return (
    <div>
      <div className="co-strip">
        {ids.length === 0 ? (
          <span className="cond-empty" aria-hidden>
            —
          </span>
        ) : (
          ids.map((id) => {
            const c = colorFor?.(id);
            const label = renderLabel(id);
            return (
              <span
                key={id}
                className="co-chip"
                // Always pin an explicit ink: the `.co-chip` default ink is muted,
                // which can dip below AA on its own tint. Colored sets (damage /
                // condition) pass an AA-safe hue+ink; uncolored sets (proficiencies)
                // get a neutral strong edge with secondary ink (legible on the tint).
                style={
                  {
                    ["--co"]: c?.color ?? "var(--border-strong)",
                    ["--co-ink"]: c?.ink ?? "var(--text-secondary)",
                  } as React.CSSProperties
                }
              >
                {label}
                <button
                  type="button"
                  className="co-x"
                  aria-label={`${t("common.remove")} ${label}`}
                  onClick={() => onRemove(id)}
                >
                  <Icon as={X} size="sm" decorative />
                </button>
              </span>
            );
          })
        )}
      </div>

      <div
        className="co-add-wrap"
        ref={wrapRef}
        style={{
          position: "relative",
          marginTop: "var(--sp-2)",
          display: "flex",
          gap: "var(--sp-2)",
        }}
      >
        {addOptions.length > 0 && (
          <button
            type="button"
            className="co-add"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
          >
            <Icon as={Plus} size="xs" decorative />
            {addLabel}
          </button>
        )}
        {dirty && onReset && (
          <button
            type="button"
            className="co-add"
            aria-label={t("common.reset")}
            onClick={() => {
              onReset();
              setPickerOpen(false);
            }}
          >
            <Icon as={RotateCcw} size="xs" decorative />
            {t("common.reset")}
          </button>
        )}

        {pickerOpen && (
          <div className="co-picker" role="listbox" aria-label={addLabel}>
            {addOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={false}
                className={cn("co-pick-item")}
                onClick={() => {
                  onAdd(opt.id);
                  setPickerOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
