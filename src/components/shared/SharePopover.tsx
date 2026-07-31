/**
 * SharePopover — the ONE share surface (golden rule 3): a small popover hung off
 * whatever chrome opened it, holding the whole sharing decision in one place.
 *
 * The shape is the one every reader already knows from Docs / Notion / Drive:
 *
 *   [ Anyone with the link can view          (•—) ]   ← the visibility SWITCH
 *     one quiet line of what that actually means
 *   https://…/view/uid/charId                        ← the link, only while it is live
 *   [ Copy link ]  [ Share ]                         ← clipboard + the native sheet
 *
 * The SWITCH IS the control: flipping it on shares, flipping it off revokes, both
 * instantly and with no confirm — the popover's own state (the link appearing and
 * disappearing) is the feedback, and the act is reversible in the same gesture that
 * did it. There is no separate "shared / not shared" signal to keep in step.
 *
 * A link that is a functional JOIN rather than a visibility state (a campaign invite)
 * omits `visibility` entirely: the same popover, just link + actions.
 *
 * i18n-AGNOSTIC like the `CopyButton` / `ShareButton` atoms it composes — every
 * string arrives already localized (rule 7), so the one component serves the sheet's
 * "Anyone with the link can view" and the invite's own wording without a `t` call.
 * The native-share button is feature-detected away where the platform has no share
 * sheet (most desktops), because there it would only be a second Copy.
 */

import { useId, type ReactNode } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  type PopoverContentProps,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/selection";
import { CopyButton } from "@/components/shared/CopyButton";
import { ShareButton } from "@/components/shared/ShareButton";

/** The visibility switch — present only where the link IS a visibility state. */
export interface ShareVisibility {
  /** Switch label, already localized ("Anyone with the link can view"). */
  label: string;
  /** One quiet line under it saying what being on means. */
  hint: string;
  /** Current state — `true` while the link is live. */
  on: boolean;
  /** Flip it. Persisting (and failing loudly) is the caller's job. */
  onChange: (next: boolean) => void;
}

export interface SharePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The chrome the popover hangs off (the ⋯ coin / kebab) — the Radix anchor. */
  children: ReactNode;
  /** The URL being handed out. */
  link: string;
  /** Popover rubric, already localized. */
  rubric: string;
  /** Copy button label + its quiet toast, already localized. */
  copyLabel: string;
  copiedToast: string;
  /** Native-share button label + the sheet's own title/body, already localized. */
  shareLabel: string;
  shareTitle: string;
  shareText: string;
  /** Omit where the link is a functional join rather than a visibility state. */
  visibility?: ShareVisibility;
  side?: PopoverContentProps["side"];
  align?: PopoverContentProps["align"];
}

/** True only where the platform really has a share sheet (phones, installed PWAs). */
function hasNativeShare(): boolean {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  return typeof nav.share === "function";
}

export function SharePopover({
  open,
  onOpenChange,
  children,
  link,
  rubric,
  copyLabel,
  copiedToast,
  shareLabel,
  shareTitle,
  shareText,
  visibility,
  side = "left",
  // Bottom-aligned by default: the coin this hangs off sits low in the chrome, so
  // the panel grows UPWARD instead of off the bottom of a short viewport.
  align = "end",
}: SharePopoverProps) {
  const switchId = useId();
  // No switch ⇒ the link is always live (an invite code is not a visibility flag).
  const live = visibility ? visibility.on : true;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="inline-flex">{children}</span>
      </PopoverAnchor>
      <PopoverContent
        className="share-pop"
        rubric={rubric}
        side={side}
        align={align}
        // This popover is opened FROM a menu, and a closing menu returns focus to the
        // trigger — a focus event OUTSIDE this layer, which Radix would treat as a
        // dismissal and close the popover the instant it appeared. Outside CLICK and
        // Escape still dismiss (the Radix defaults); only the focus bounce is ignored.
        onFocusOutside={(e) => e.preventDefault()}
      >
        {visibility ? (
          <div className="share-pop-visibility">
            <div className="share-pop-row">
              <label htmlFor={switchId} className="text-sm text-text-secondary">
                {visibility.label}
              </label>
              <Switch
                id={switchId}
                checked={visibility.on}
                onCheckedChange={visibility.onChange}
              />
            </div>
            <p className="text-xs text-text-muted">{visibility.hint}</p>
          </div>
        ) : null}
        {live ? (
          <>
            {/* The link itself, shown but not editable — there is nothing to type. */}
            <p className="share-pop-link" title={link}>
              {link}
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyButton
                value={link}
                toastMessage={copiedToast}
                label={copyLabel}
                ariaLabel={copyLabel}
                variant="secondary"
              />
              {hasNativeShare() ? (
                <ShareButton
                  value={link}
                  title={shareTitle}
                  text={shareText}
                  copiedToast={copiedToast}
                  label={shareLabel}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
