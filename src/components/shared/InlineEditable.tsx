/**
 * InlineEditable
 *
 * A reusable inline-editing primitive for the override-first design pattern.
 * Renders as read-only text in play mode; becomes an input on click in edit mode.
 *
 * Variants:
 *  - text: single-line text input (names, notes)
 *  - number: numeric input with optional min/max
 *  - select: dropdown from a fixed list of options
 *
 * Commit on blur/Enter, cancel on Escape. Local state during editing — never
 * writes to the store on every keystroke.
 *
 * Optional override indicator: when `computedValue` is provided and differs from
 * the current value, shows a visual hint (warning border) + reset-to-auto button.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { cn, clampNumber } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BaseProps {
  /** Whether the field is editable (typically `sheetMode === "edit"`) */
  editable?: boolean;
  /** CSS class for the outer wrapper */
  className?: string;
  /** CSS class for the displayed value text */
  valueClassName?: string;
  /** Tooltip text shown on hover (beginner-friendly hints) */
  tooltip?: string;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Placeholder text when value is empty */
  placeholder?: string;
  /**
   * At-rest appearance of the editable value (#86 edit-in-place). `"quiet"`
   * (default) reads as clean display text marked only by a faint edit underline,
   * revealing the carved input frame on hover/focus/activation — so edit mode is
   * the clean sheet with subtle hot-spots, never a wall of input boxes. `"box"`
   * keeps the always-carved chip for genuine form contexts that want it.
   */
  affordance?: "box" | "quiet";
}

interface TextProps extends BaseProps {
  type: "text";
  value: string;
  onChange: (value: string) => void;
  computedValue?: string | null;
  onReset?: () => void;
  /**
   * Commit-time length cap (#30). A generous safety default keeps single-line
   * inline fields bounded without biting real input; callers pass a tighter cap
   * (e.g. a short name) where the field warrants it. Never keystroke-blocks —
   * enforced as a soft `maxLength` attr + a commit-time slice.
   */
  maxLength?: number;
  /**
   * The field has a NON-EMPTY domain (golden rule 20 — constrain inputs). When set,
   * a commit that trims to "" REVERTS to the prior value instead of persisting an
   * empty string — so the field can't be cleared (e.g. a character's name, which
   * the creation wizard already requires; the edit path must match). The user still
   * freely edits to any non-empty value; only the empty state is unreachable.
   */
  required?: boolean;
}

interface NumberProps extends BaseProps {
  type: "number";
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  format?: (value: number) => string;
  computedValue?: number | null;
  onReset?: () => void;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends BaseProps {
  type: "select";
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

export type InlineEditableProps = TextProps | NumberProps | SelectProps;

// ── Sub-components ────────────────────────────────────────────────────────────

function InlineSelect({
  value,
  onChange,
  options,
  editable,
  className,
  valueClassName,
  tooltip,
  ariaLabel,
}: SelectProps) {
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  if (!editable) {
    return (
      <span
        className={cn("text-text-primary", valueClassName, className)}
        title={tooltip}
      >
        {selectedLabel}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("input inline-edit-input txt", className)}
      aria-label={ariaLabel}
      title={tooltip}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function InlineNumber({
  value,
  onChange,
  min,
  max,
  format,
  computedValue,
  onReset,
  editable,
  className,
  valueClassName,
  tooltip,
  ariaLabel,
  placeholder,
  affordance = "quiet",
}: NumberProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const isOverridden = computedValue != null && value !== computedValue;
  const displayValue = format ? format(value) : String(value);

  const startEdit = useCallback(() => {
    if (!editable) return;
    setLocalValue(String(value));
    setEditing(true);
  }, [editable, value]);

  const commit = useCallback(() => {
    setEditing(false);
    const num = parseFloat(localValue);
    if (isNaN(num)) return;
    // ONE shared commit-time validator (#30) — range-clamp via clampNumber.
    const clamped = clampNumber(num, min ?? -999, max ?? 9999);
    if (clamped !== value) onChange(clamped);
  }, [localValue, min, max, value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") setEditing(false);
    },
    [commit]
  );

  if (!editable) {
    return (
      <span
        className={cn("text-text-primary", valueClassName, className)}
        title={tooltip}
        aria-label={ariaLabel}
      >
        {displayValue}
      </span>
    );
  }

  if (editing) {
    return (
      <span className={cn("inline-edit", className)}>
        <input
          ref={inputRef}
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          min={min}
          max={max}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="input inline-edit-input num"
        />
      </span>
    );
  }

  return (
    <span className={cn("inline-edit", className)}>
      <button
        type="button"
        onClick={startEdit}
        className={cn("inline-edit-btn", valueClassName)}
        data-affordance={affordance}
        data-overridden={isOverridden ? "true" : undefined}
        title={tooltip ?? t("common.clickToOverride")}
        aria-label={ariaLabel}
      >
        {displayValue || <span className="ie-empty">{placeholder ?? "—"}</span>}
      </button>
      {isOverridden && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-edit-reset"
          title={t("common.resetToAuto")}
          aria-label={t("common.resetToAuto")}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function InlineText({
  value,
  onChange,
  computedValue,
  onReset,
  editable,
  className,
  valueClassName,
  tooltip,
  ariaLabel,
  placeholder,
  affordance = "quiet",
  maxLength = 500,
  required = false,
}: TextProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const isOverridden = computedValue != null && value !== computedValue;
  const displayValue = value || placeholder || "";

  const startEdit = useCallback(() => {
    if (!editable) return;
    setLocalValue(value);
    setEditing(true);
  }, [editable, value]);

  const commit = useCallback(() => {
    setEditing(false);
    // Commit-time validation (#30): trim + length-cap (soft, never keystroke-blocks).
    const trimmed = localValue.trim().slice(0, maxLength);
    // Required field (golden rule 20): an empty commit REVERTS to the prior value —
    // the field can't be cleared. The displayed value snaps back on the next render
    // because we never call onChange with "".
    if (required && trimmed === "") return;
    if (trimmed !== value) onChange(trimmed);
  }, [localValue, value, onChange, maxLength, required]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") setEditing(false);
    },
    [commit]
  );

  if (!editable) {
    return (
      <span
        className={cn("text-text-primary", valueClassName, className)}
        title={tooltip}
        aria-label={ariaLabel}
      >
        {displayValue}
      </span>
    );
  }

  if (editing) {
    return (
      <span className={cn("inline-edit", className)}>
        <input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          maxLength={maxLength}
          // True in-place editing (#86): the field sizes to its CONTENT so the edit
          // box mirrors the read-mode quiet-text button's footprint — same width, no
          // fixed-width box that LEFT-TRUNCATES a long value (the campaign-title bug:
          // a 36-char title clipped to the read-title's column width). The CSS
          // `field-sizing: content` does this exactly on supporting engines; this
          // `size` attr is the universal fallback (older Safari/Firefox) — a char-
          // count over-estimate is fine (room to spare, never clips) and it tracks
          // every keystroke via `localValue`.
          size={Math.max(localValue.length, placeholder?.length ?? 0, 2)}
          className="input inline-edit-input txt"
        />
      </span>
    );
  }

  return (
    <span className={cn("inline-edit", className)}>
      <button
        type="button"
        onClick={startEdit}
        className={cn("inline-edit-btn", valueClassName)}
        data-affordance={affordance}
        data-kind="text"
        data-overridden={isOverridden ? "true" : undefined}
        title={tooltip ?? t("common.clickToOverride")}
        aria-label={ariaLabel}
      >
        {value || <span className="ie-empty">{placeholder ?? "—"}</span>}
      </button>
      {isOverridden && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-edit-reset"
          title={t("common.resetToAuto")}
          aria-label={t("common.resetToAuto")}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

// ── Main export (dispatcher) ──────────────────────────────────────────────────

export function InlineEditable(props: InlineEditableProps) {
  switch (props.type) {
    case "select":
      return <InlineSelect {...props} />;
    case "number":
      return <InlineNumber {...props} />;
    case "text":
      return <InlineText {...props} />;
  }
}
