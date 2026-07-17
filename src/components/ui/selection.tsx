/**
 * Selection controls — folio "Brass-pressed" atoms (§21), on Radix primitives.
 *
 * Switch / Checkbox / Radio all share the Button-A brass vocabulary at small
 * scale: empty = recessed brass frame, checked = gold-leaf gradient. Radix
 * supplies the a11y (roles, `aria-checked`, keyboard, label association); the
 * folio CSS (`.sw`/`.cb`/`.rb`) paints the visual via `[data-state="checked"]`
 * and `::after`, so we apply the class to the Radix Root and omit any Indicator.
 *
 * - Switch       — controlled on/off toggle (track + sliding brass disk).
 * - Checkbox     — square, ✓ when checked.
 * - RadioGroup/RadioGroupItem — round, filled dot when checked.
 */

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import * as RadixRadioGroup from "@radix-ui/react-radio-group";
import * as RadixSwitch from "@radix-ui/react-switch";
import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = ComponentPropsWithoutRef<typeof RadixSwitch.Root>;

export function Switch({ className, ...props }: SwitchProps) {
  return <RadixSwitch.Root className={cn("sw", className)} {...props} />;
}

export type CheckboxProps = ComponentPropsWithoutRef<typeof RadixCheckbox.Root>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return <RadixCheckbox.Root className={cn("cb", className)} {...props} />;
}

export interface CheckboxFieldProps {
  /** Controlled checked state. */
  checked: boolean;
  /** Fires with a clean boolean (the Radix `"indeterminate"` is coerced away). */
  onCheckedChange: (checked: boolean) => void;
  /** The visible, clickable label (becomes the control's accessible name). */
  label: ReactNode;
  /** Optional secondary line under the label. */
  hint?: ReactNode;
  disabled?: boolean;
  /** Extra classes on the row wrapper. */
  className?: string;
}

/**
 * CheckboxField — the ONE labelled checkbox row. Pairs the canonical brass `.cb`
 * `Checkbox` with a properly associated `<label htmlFor>` (so clicking the text
 * toggles it AND the text names the control for screen readers — the native
 * `<input type=checkbox>` rows it replaces relied on implicit label wrapping, which
 * a Radix `role="checkbox"` button does NOT get for free). The `onCheckedChange`
 * coercion to a real boolean lives here once, so no call site has to deal with
 * Radix's `boolean | "indeterminate"` under strict TS. Use this everywhere a
 * box-plus-label is wanted; reach for the bare `Checkbox` (with an `aria-label`)
 * only when a custom row layout truly needs it.
 */
export function CheckboxField({
  checked,
  onCheckedChange,
  label,
  hint,
  disabled,
  className,
}: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className={cn("cb-field", className)}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(c) => onCheckedChange(c === true)}
      />
      <label htmlFor={id} className="cb-field-label">
        <span>{label}</span>
        {hint ? <span className="cb-field-hint">{hint}</span> : null}
      </label>
    </div>
  );
}

export type RadioGroupProps = ComponentPropsWithoutRef<typeof RadixRadioGroup.Root>;

export function RadioGroup({ className, ...props }: RadioGroupProps) {
  return <RadixRadioGroup.Root className={className} {...props} />;
}

export type RadioGroupItemProps = ComponentPropsWithoutRef<typeof RadixRadioGroup.Item>;

export function RadioGroupItem({ className, ...props }: RadioGroupItemProps) {
  return <RadixRadioGroup.Item className={cn("rb", className)} {...props} />;
}
