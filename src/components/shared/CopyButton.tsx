/**
 * CopyButton — the ONE copy-to-clipboard affordance (golden rule 3).
 *
 * Every invite surface (DM Tools, the create-campaign success screen) shares this
 * single primitive so the clipboard + toast behaviour lives in exactly one place.
 * It is i18n-AGNOSTIC: the caller passes an already-localized `toastMessage` (and
 * `label`) — the component never touches `t` (rule 7). Menu-driven copies reuse
 * the bare `copyWithToast` helper directly.
 */

import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { copyWithToast } from "@/components/shared/copy-to-clipboard";

export interface CopyButtonProps {
  /** The string copied to the clipboard. */
  value: string;
  /** Already-localized toast shown on copy (the component stays i18n-agnostic). */
  toastMessage: string;
  /** Optional already-localized button label; omit for an icon-only button. */
  label?: ReactNode;
  /** Accessible label — REQUIRED when `label` is omitted (icon-only). */
  ariaLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Disable copying (e.g. a revoked invite link) — the affordance stays visible but inert. */
  disabled?: boolean;
}

export function CopyButton({
  value,
  toastMessage,
  label,
  ariaLabel,
  variant = "secondary",
  size,
  className,
  disabled,
}: CopyButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => copyWithToast(value, toastMessage)}
    >
      <Copy aria-hidden className="h-4 w-4" />
      {label}
    </Button>
  );
}
