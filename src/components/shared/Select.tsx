/**
 * Select — native <select> wrapped in the folio `.select` shell.
 *
 * The folio dropdown recipe is a `.select` wrapper (which paints the carved
 * channel + chevron affordance) around a native `<select>`. Callers kept
 * forgetting the wrapper and shipping bare selects with no chevron; this
 * primitive makes the shell impossible to omit.
 *
 * `className`, when passed, augments the WRAPPER (so layout utilities like
 * `block`/width sit on the carved frame). The `size="sm"` prop maps to the
 * compact `.sm` modifier. Children are the <option>s, passed straight through.
 *
 * Usage:
 *   <Select value={v} onChange={(e) => set(e.target.value)}>
 *     <option value="a">A</option>
 *   </Select>
 */

import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  /** Compact size — maps to the folio `.select.sm` modifier. */
  size?: "sm";
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size, className, children, ...props },
  ref
) {
  return (
    <div className={cn("select block", size === "sm" && "sm", className)}>
      <select {...props} ref={ref}>
        {children}
      </select>
    </div>
  );
});
