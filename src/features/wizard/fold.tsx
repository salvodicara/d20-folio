/**
 * WizardFold — the ONE unfold/refold animator for every wizard disclosure
 * (the morph-list reading spread, spell prose, the swap's replacement phase).
 *
 * Owner 2026-06-11: expanding felt great but collapsing SNAPPED (the old fold
 * unmounted instantly). This wrapper animates BOTH directions on one CSS
 * grid-track transition (0fr ⇄ 1fr + opacity): opening enters through
 * `@starting-style`; closing keeps the children mounted until the track
 * transition ends, then unmounts them (so a closed row stays cheap).
 */
import { useState, type ReactNode } from "react";

export function WizardFold({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  // Mount-on-open during render (React's endorsed adjust pattern).
  if (open && !mounted) {
    setMounted(true);
  }
  if (!open && !mounted) return null;
  return (
    <div
      className="wiz-fold"
      data-open={open ? "" : undefined}
      onTransitionEnd={(e) => {
        // Unmount only after the TRACK finishes closing (not opacity's end,
        // and never an inner element's bubbled transition).
        if (
          !open &&
          e.target === e.currentTarget &&
          e.propertyName === "grid-template-rows"
        ) {
          setMounted(false);
        }
      }}
    >
      <div>{children}</div>
    </div>
  );
}
