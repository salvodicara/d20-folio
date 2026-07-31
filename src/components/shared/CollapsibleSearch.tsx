/**
 * CollapsibleSearch (W5) — the unified cockpit search affordance.
 *
 * At rest it's a small lens icon; clicking (or focusing) it animates open into a
 * search field, and it collapses back to the lens when blurred AND empty. A live
 * query keeps it open. ONE component so every tab search reads and behaves the
 * same (the owner's "collapse to a lens that expands… unify every search input").
 *
 * Built on the shared `.search` vocabulary (gold focus halo, recessed input,
 * hidden native widgets). Only the width/opacity animate; reduced-motion users
 * get an instant swap via the recipe's `@media (prefers-reduced-motion)`.
 */

import { useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Field placeholder + the lens button's accessible name. */
  placeholder: string;
  className?: string;
}

export function CollapsibleSearch({ value, onChange, placeholder, className }: Props) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Open whenever it's focused or carries a query — so it never collapses mid-search.
  const open = focused || value.length > 0;
  const id = useId();

  function toggle() {
    // A true toggle (owner bug, 2026-07-31: "if it's open it should close —
    // right now it flashes"): the flash was pointerdown blurring the input
    // (collapse) and click refocusing it (reopen). The lens's onPointerDown
    // preventDefault keeps focus where it is, so `open` is still truthful
    // here and the branch is deterministic. Closing also clears the query —
    // a hidden active filter is worse than a cleared one.
    if (open) {
      if (value) onChange("");
      inputRef.current?.blur();
    } else {
      // Focus in an event handler (not render) — React-Compiler safe.
      inputRef.current?.focus();
    }
  }

  return (
    <div className={cn("search csearch", className)} data-open={open ? "" : undefined}>
      <button
        type="button"
        className="csearch-lens"
        aria-label={placeholder}
        aria-expanded={open}
        aria-controls={id}
        onPointerDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        <Icon as={Search} decorative />
      </button>
      <input
        id={id}
        ref={inputRef}
        type="search"
        className="input csearch-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        aria-label={placeholder}
        // Off the tab order while collapsed — the lens button is the affordance.
        tabIndex={open ? 0 : -1}
      />
      {value.length > 0 && (
        <button
          type="button"
          className="csearch-clear"
          aria-label={t("common.clearSearch")}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </div>
  );
}
