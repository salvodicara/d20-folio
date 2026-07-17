/**
 * CardOverflowMenu — the shared 3-dots row-actions menu for the `.ch-card` tiles
 * (roster characters AND campaign cards). Extracted from the roster card so both
 * surfaces share ONE kebab + popover + keyboard model — consistency by design,
 * a fix in one place propagates to every card.
 *
 * Built on the shipped Radix Popover: it PORTALS the menu out of the card's
 * `overflow:hidden` clip (the `.popover.ch-menu-pop` recipe is designed for
 * exactly this) and owns positioning, outside-click + Escape dismissal and focus
 * management (focus-on-open, focus-return-to-trigger). The kebab stays a direct
 * child of `.ch-card` (PopoverTrigger `asChild` adds no wrapper) so the
 * `.ch-card > .ch-overflow` recipe raises it above the stretched `.ch-open`
 * button. The one thing Radix does NOT give a `role="menu"` is Arrow/Home/End
 * roving between items — added here; Radix still owns Escape, Tab and focus.
 *
 * The controlled open state + the no-navigate dismiss guard a `.ch-card` shell
 * needs live in the sibling `useCardMenuGuard` hook (its own module so this file
 * only exports components).
 */

import { Fragment, type KeyboardEvent } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CardMenuItem {
  /** Stable React key. */
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Renders in the danger (vermilion) tone — destructive actions. */
  danger?: boolean;
  /** Draw a separator rule ABOVE this item (groups off a destructive action). */
  dividerBefore?: boolean;
  /** When true the item is omitted entirely — for permission-gated actions. */
  hidden?: boolean;
}

export interface CardOverflowMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CardMenuItem[];
  /** aria-label for the kebab trigger, e.g. "More actions". */
  triggerLabel: string;
  /** aria-label for the menu, e.g. "Actions for {{name}}". */
  menuLabel: string;
  /** Trigger button class — defaults to the card kebab; override for other chrome
   *  (e.g. the fob family's `.fob-coin`). */
  triggerClassName?: string;
  /** Trigger glyph — defaults to the horizontal kebab. */
  triggerIcon?: LucideIcon;
  /**
   * Render the trigger through the canonical `<Button>` atom in this variant —
   * so a kebab can BE its sibling actions (e.g. the cockpit header's gold ghost
   * buttons), sharing the one brass recipe by construction (golden rule 3). When
   * omitted the trigger is the bare `.ch-overflow` card-chrome kebab the roster /
   * campaign cards use. Always icon-only (square).
   */
  triggerVariant?: ButtonProps["variant"];
}

export function CardOverflowMenu({
  open,
  onOpenChange,
  items,
  triggerLabel,
  menuLabel,
  triggerClassName = "ch-overflow",
  triggerIcon = MoreHorizontal,
  triggerVariant,
}: CardOverflowMenuProps) {
  const visible = items.filter((it) => !it.hidden);

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const els = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    );
    if (els.length === 0) return;
    const idx = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(idx + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(idx - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {/* Two ways in, ONE kebab: the bare card-chrome trigger (default — a
            direct child of `.ch-card`, raised above `.ch-open` by the
            `.ch-card > .ch-overflow` recipe) OR the canonical brass `<Button>`
            atom when a `triggerVariant` is given, so the cockpit header's kebab
            IS its sibling ghost actions (gold by construction, both themes) and
            any ghost-button fix propagates to it (golden rule 3). */}
        {triggerVariant ? (
          <Button
            variant={triggerVariant}
            size="sm"
            iconOnly
            className={triggerClassName}
            aria-label={triggerLabel}
            aria-haspopup="menu"
          >
            <Icon as={triggerIcon} decorative />
          </Button>
        ) : (
          <button
            type="button"
            className={triggerClassName}
            aria-label={triggerLabel}
            aria-haspopup="menu"
          >
            <Icon as={triggerIcon} decorative />
          </button>
        )}
      </PopoverTrigger>
      {/* PORTALS to <body>, escaping the card's `overflow:hidden` clip, and
          anchors the menu under the kebab at the card's top-right (align "end"). */}
      <PopoverContent
        className="ch-menu-pop"
        align="end"
        sideOffset={6}
        role="menu"
        aria-label={menuLabel}
        onKeyDown={onMenuKeyDown}
      >
        {visible.map((it, i) => (
          <Fragment key={it.key}>
            {/* A separator never leads the list (only groups off a later item). */}
            {it.dividerBefore && i > 0 ? (
              <div className="menu-div" role="separator" />
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={cn("menu-item", it.danger && "danger")}
              onClick={() => {
                onOpenChange(false);
                it.onSelect();
              }}
            >
              <Icon as={it.icon} decorative />
              {it.label}
            </button>
          </Fragment>
        ))}
      </PopoverContent>
    </Popover>
  );
}
