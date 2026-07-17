/**
 * Input family — folio "Deep Carved" atoms (§17).
 *
 * Inputs invert the pressed-brass button: they push INTO the page (deep inset
 * shadow) and stack a gold halo on focus. Native number-stepper + search-clear
 * chrome are hidden by folio.css so the carved look never leaks browser UI.
 *
 * - Input        — text/number/search, `.input` shell, `error` + `center`/`num`.
 * - Textarea     — multi-line, body font, vertical resize.
 * - SearchInput  — carved input with leading search glyph + clearable affordance.
 * - NumberStepper — −/value/+ carved control (no dice; just numeric stepping).
 * - Field        — label + control + help/error wrapper.
 */

import { Search, X } from "lucide-react";
import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useId,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  /** center text (e.g. numeric fields). */
  center?: boolean;
  /** narrow numeric width. */
  numeric?: boolean;
  /** Forwarded to the underlying `<input>` (React 19 ref-as-prop). */
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  className,
  error,
  center,
  numeric,
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "input",
        error && "error",
        center && "center",
        numeric && "num",
        className
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  /** Forwarded to the underlying `<textarea>` (React 19 ref-as-prop). */
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, error, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn("input", error && "error", className)}
      aria-invalid={error || undefined}
      {...props}
    />
  );
}

export interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  /** Current value (controlled). When non-empty a clear button appears. */
  value: string;
  onClear?: () => void;
  /** Accessible label for the clear button. */
  clearLabel?: string;
}

export function SearchInput({
  className,
  value,
  onClear,
  clearLabel = "Clear search",
  ...props
}: SearchInputProps) {
  return (
    <div className={cn("search", className)}>
      <Search className="search-icon" aria-hidden="true" />
      <input type="search" className="input" value={value} {...props} />
      {value.length > 0 && onClear ? (
        <button
          type="button"
          className="clear-btn"
          onClick={onClear}
          aria-label={clearLabel}
        >
          <Icon as={X} size="sm" decorative />
        </button>
      ) : null}
    </div>
  );
}

export interface NumberStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  /** Accessible labels for the −/+ buttons (bilingual copy injected by caller). */
  decrementLabel?: string;
  incrementLabel?: string;
  /** Accessible label for the value field. */
  ariaLabel?: string;
  /**
   * Opt-in CONTENT-SIZING (CARD-7): the max number of DIGITS the value field needs.
   * When set, the field is capped to its content width (promoting the point-buy
   * width-cap) so a 2-digit stepper stops stretching to fill its grid cell. Omitted →
   * the default `min-width: 56px` flexible field (every existing call-site unchanged).
   */
  digits?: number;
  /** COMPACT density — 24px buttons (vs 28px) for dense label-left rows. */
  compact?: boolean;
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  className,
  decrementLabel = "Decrease",
  incrementLabel = "Increase",
  ariaLabel,
  digits,
  compact,
}: NumberStepperProps) {
  const clamp = (n: number): number => {
    let next = n;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    return next;
  };
  // While the field is focused it's driven by a local DRAFT string, so the value can
  // be cleared / backspaced / partially typed without the controlled `value` snapping
  // it back to a number every keystroke. `null` = not editing → the field shows the
  // committed `value`. A valid draft commits live (the rest of the UI follows your
  // typing); an empty or non-numeric field reverts to the committed value on blur, so
  // it can never be LEFT invalid — but you can always clear-and-retype (owner 2026-06-08).
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (n: number): void => {
    setDraft(null);
    onChange(n);
  };
  const atMin = typeof min === "number" && value <= min;
  const atMax = typeof max === "number" && value >= max;
  // Content-size the field to its digit count so it never stretches to fill a grid
  // cell; `ch` tracks the (monospace) digit width. The field is `box-sizing: border-box`,
  // so the cap MUST add the input's OWN horizontal padding (12px×2 = 1.5rem) ON TOP of
  // the glyphs — otherwise the padding eats into the glyph box and a value that exactly
  // fills its budget (a 2-digit "10"/"12" in a `digits={2}` field) is clipped at the
  // right edge. The extra `0.5ch` is comfort so the centred value never kisses the edge.
  // Inline width wins over the stylesheet `min-width`. Opt-in — undefined leaves the
  // flexible default.
  const cap = digits != null ? `calc(${digits}ch + 0.5ch + 1.5rem)` : undefined;
  const fieldStyle = cap ? { minWidth: cap, maxWidth: cap } : undefined;
  return (
    <div className={cn("num-stepper", compact && "compact", className)}>
      <button
        type="button"
        onClick={() => commit(clamp(value - step))}
        disabled={disabled || atMin}
        aria-label={decrementLabel}
      >
        −
      </button>
      {/* `type=text` + `inputMode=numeric` (not `type=number`): a number input fights
          a controlled empty/partial value (you couldn't backspace it clear), so we
          drive a text field and FILTER to digits ourselves — no decimals, minus, or
          letters can ever be entered. `role=spinbutton` + aria-value* restore the
          numeric-field semantics for assistive tech. */}
      <input
        type="text"
        inputMode="numeric"
        className="input num"
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft ?? String(value)}
        disabled={disabled}
        aria-label={ariaLabel}
        style={fieldStyle}
        onFocus={(e) => {
          setDraft(String(value));
          e.target.select();
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D+/g, "");
          setDraft(digits);
          // Commit live for a non-empty (digits-only) value, bounded to [min, max]; an
          // empty draft is allowed to sit (clear + retype) and resolves on blur.
          if (digits !== "") onChange(clamp(Number(digits)));
        }}
        onBlur={(e) => {
          const digits = e.target.value.replace(/\D+/g, "");
          commit(digits === "" ? value : clamp(Number(digits)));
        }}
      />
      <button
        type="button"
        onClick={() => commit(clamp(value + step))}
        disabled={disabled || atMax}
        aria-label={incrementLabel}
      >
        +
      </button>
    </div>
  );
}

export interface FieldProps {
  label?: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  /** Render-prop receives the id to wire `htmlFor`/`id` for a11y. */
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
  className?: string;
}

export function Field({ label, help, error, children, className }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : help ? helpId : undefined;
  return (
    <div className={cn("field", className)}>
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      ) : help ? (
        <span className="field-help" id={helpId}>
          {help}
        </span>
      ) : null}
    </div>
  );
}
