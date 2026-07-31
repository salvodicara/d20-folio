/**
 * ShareButton — the ONE native-share affordance (golden rule 3), the twin of
 * {@link CopyButton}.
 *
 * Every surface that hands a link to another human offers the SAME thing: the Web
 * Share API sheet where the platform has one (WhatsApp / Telegram / Messages for
 * free on a phone), the clipboard everywhere else. That branch lives once, in
 * `shareOrCopy`; this is its button shape, so the campaign invite panel and the
 * create-campaign success screen cannot drift into two different share buttons.
 *
 * i18n-AGNOSTIC like `CopyButton`: the caller passes already-localized strings and
 * the component never touches `t`. A MENU-driven share (the sheet's ⋯ overflow, the
 * campaign card's ⋯ overflow) reuses the bare `shareOrCopy` helper directly — a menu
 * item is not a button.
 */

import { Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { shareOrCopy } from "@/components/shared/copy-to-clipboard";

export interface ShareButtonProps {
  /** The URL handed to the share sheet / clipboard. */
  value: string;
  /** Already-localized share-sheet title. */
  title: string;
  /** Already-localized share-sheet body text. */
  text: string;
  /** Already-localized toast shown on the clipboard fallback. */
  copiedToast: string;
  /** Optional already-localized button label; omit for an icon-only button. */
  label?: ReactNode;
  /** Accessible label — REQUIRED when `label` is omitted (icon-only). */
  ariaLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Disable sharing (e.g. a revoked invite link) — visible but inert. */
  disabled?: boolean;
}

export function ShareButton({
  value,
  title,
  text,
  copiedToast,
  label,
  ariaLabel,
  variant = "primary",
  size,
  className,
  disabled,
}: ShareButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => void shareOrCopy(value, { title, text, copiedToast })}
    >
      <Share2 aria-hidden className="h-4 w-4" />
      {label}
    </Button>
  );
}
