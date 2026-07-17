/**
 * EditingPill — folio edit-mode toggle (§ header).
 *
 * At REST it is a quiet command (glyph + label, unboxed register); flipped ON it
 * becomes the filled amber "Editing" pill with the breathing dot — the gold
 * ceremony marks the STATE, never the resting band. Used by the campaign
 * encounter chrome (`party-encounter`); the character sheet's own edit toggle is
 * the fob family's ✎ coin (BinderFob / MobileSignet), a sibling of this recipe.
 * Its `editing` flag reads a single global toggle on `uiStore.sheetMode`. Caller wires the
 * bilingual label + the toggle handler; pressing also responds to Enter/Space
 * natively (it is a real <button>). `aria-pressed` exposes the on/off state.
 *
 * Discoverability (#101): the pill carries a branded tooltip naming its keyboard
 * accelerator — the platform-correct ⌘E / Ctrl+E combo (the chord
 * `useEditModeShortcut` listens for) rendered as a `<kbd>` glyph, the same recipe
 * the topbar uses for the ⌘K palette hint. While editing, the tooltip instead names
 * the Esc / Done exit. `aria-keyshortcuts` exposes the chord to assistive tech.
 */

import { SquarePen } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { shortcutLabel } from "@/lib/platform";
import { cn } from "@/lib/utils";

export interface EditingPillProps {
  editing: boolean;
  onToggle: () => void;
  /** Label shown when not editing (e.g. "Edit" / "Modifica"). */
  editLabel: string;
  /** Label shown while editing (e.g. "Editing" / "Modifica…"). */
  editingLabel: string;
  /** Tooltip while editing — surfaces the otherwise-undiscoverable Esc shortcut. */
  editingHint?: string;
  className?: string;
}

export function EditingPill({
  editing,
  onToggle,
  editLabel,
  editingLabel,
  editingHint,
  className,
}: EditingPillProps) {
  // The ⌘E / Ctrl+E accelerator, platform-correct ("⌘E" on Mac, "Ctrl E"
  // elsewhere) — the same chord `useEditModeShortcut` arms on the cockpit.
  const combo = shortcutLabel("E");
  const pill = (
    <button
      type="button"
      className={cn("editpill", editing && "editing", className)}
      aria-pressed={editing}
      aria-keyshortcuts="Meta+E Control+E"
      onClick={onToggle}
    >
      {/* Rest state carries the command glyph (its siblings' anatomy); the
          editing state swaps it for the CSS breathing dot. */}
      {!editing && <Icon as={SquarePen} size="xs" decorative />}
      {editing ? editingLabel : editLabel}
    </button>
  );

  return (
    // Self-contained provider (the CharacterCard recipe) so the pill carries its
    // hint without depending on a global TooltipProvider ancestor.
    <TooltipProvider delayDuration={200}>
      <Tooltip
        content={
          editing ? (
            editingHint
          ) : (
            // The play-mode tip teaches the shortcut: the SAME verb as the pill
            // (the caller's `editLabel`) + the combo as a `<kbd>` glyph (the topbar
            // ⌘K recipe), so the accelerator is findable. No new string — one home
            // for the "Edit" verb (golden rule 6).
            <span className="flex items-center gap-2">
              {editLabel}
              <Kbd>{combo}</Kbd>
            </span>
          )
        }
      >
        {pill}
      </Tooltip>
    </TooltipProvider>
  );
}
