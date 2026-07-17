/**
 * RailNotes — the combat-side "post-it" (item c, owner directive). A compact,
 * collapsible notes affordance pinned at the BOTTOM of the Right HUD resource
 * rail, where the non-automatable bonuses live (a +1 from an ally's Bless, a DM
 * ruling, "remember the trap on round 3"). It reads/writes the SAME
 * `session.notes` the Bio tab edits — ONE source of truth (golden rule 6), so a
 * note jotted mid-combat shows up under Bio and vice-versa, by construction.
 *
 * Progressive disclosure (impeccable §2.1): collapsed by default to a single
 * preview line (or an honest empty prompt); the player taps the rubric to expand
 * the full editable textarea. Writes debounce-save through the store like every
 * other field (`updateSession`). In a read-only sheet (a teammate/DM viewing
 * another character) the empty state is suppressed AND the note is NOT rendered
 * in a textarea at all: the read-only branch prints the note as plain flowing
 * text at full content height (no fixed-height scrollbox, no resize handle) — so
 * the whole note is visible and a reader can never resize or write anything back
 * to the owner's stored view (the no-persist guarantee is structural — there is
 * no editable control in the read-only path).
 */

import { useState, useCallback, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { StickyNote, ChevronDown } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function RailNotes() {
  const { t } = useTranslation();
  const notes = useCharacterStore((s) => s.character?.session.notes ?? "");
  const updateSession = useCharacterStore((s) => s.updateSession);
  const readonly = useSheetReadonly();

  const hasNote = notes.trim().length > 0;

  // Open/collapsed DERIVES from content presence (owner directive): collapsed when
  // empty, open when a note exists — a returning player sees their reminder without
  // a click, a blank rail stays tidy, and clearing the note auto-collapses it back
  // to the initial state. `manualOpen` is an explicit user override of that default
  // (tap to expand an empty box, or collapse a note to its one-line preview); it
  // sits ON TOP of the derived default and is RESET to null on blur whenever the
  // note is empty, so an abandoned empty note re-derives to collapsed. `editing`
  // (the textarea is focused) pins it open mid-edit, so a momentary empty value
  // while typing never yanks the box shut before the user is done.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const open = editing || (manualOpen ?? hasNote);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => updateSession({ notes: e.target.value }),
    [updateSession]
  );

  // A DM viewing an empty sheet gets nothing to show — suppress the whole section
  // rather than render a prompt to author notes they can't write.
  if (readonly && !hasNote) return null;

  const previewId = "rail-notes-body";

  return (
    <section className="rail-notes">
      <button
        type="button"
        className="rail-notes-head"
        aria-expanded={open}
        aria-controls={previewId}
        // Toggle relative to the current (possibly derived) open state.
        onClick={() => setManualOpen(!open)}
      >
        <span className="rh-diamond" aria-hidden />
        <StickyNote className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
        <span className="rail-notes-rubric">{t("notes.combatRubric")}</span>
        <span className="rh-rule" aria-hidden />
        <ChevronDown
          className={cn("rail-notes-chev h-3.5 w-3.5", open && "open")}
          aria-hidden
        />
      </button>

      <div id={previewId}>
        {open && readonly ? (
          // Read-only viewer (a teammate/DM reading another character): render the
          // note as plain FLOWING text at full content height — the entire note is
          // visible, with NO textarea, NO inner scrollbar, and NO resize handle
          // (owner: "they'll definitely be read-only, and the resize should not
          // affect what the owner sees"). `white-space: pre-wrap` preserves the
          // multi-line prose. With no editable control here, a reader structurally
          // cannot resize or persist anything back to the owner's stored view.
          <p className="rail-notes-read">{notes}</p>
        ) : open ? (
          <Textarea
            value={notes}
            onChange={handleChange}
            onFocus={() => setEditing(true)}
            // On blur, stop editing. If the note is now empty, drop the manual
            // override so the open state re-derives from content → collapsed (the
            // owner's "remove everything → back to the initial state"). A surviving
            // note keeps it open. Never collapses while the field is focused.
            onBlur={() => {
              setEditing(false);
              if (notes.trim().length === 0) setManualOpen(null);
            }}
            placeholder={t("notes.combatPlaceholder")}
            aria-label={t("notes.combatRubric")}
            className="rail-notes-area"
            rows={3}
            spellCheck
          />
        ) : (
          <button
            type="button"
            className="rail-notes-preview"
            onClick={() => setManualOpen(true)}
            title={hasNote ? notes : undefined}
          >
            {hasNote ? notes : t("notes.combatEmpty")}
          </button>
        )}
      </div>
    </section>
  );
}
