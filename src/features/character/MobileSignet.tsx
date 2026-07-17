/**
 * MobileSignet — "The Signet": the sheet's MOBILE management home (owner-ratified
 * 2026-07-11, the fob family's compact sibling). One discreet struck-metal coin
 * fixed above the bottom nav, completely detached from the masthead so the tools
 * are reachable at every scroll depth by construction — the coarse-pointer /
 * <768px counterpart to the desktop Binder's Fob (`useBinderFobHome` picks
 * exactly one home; the Signet renders only where the fob does NOT).
 *
 * THE ANATOMY (the de-duplication ruling — "the edit icon is repeated twice"):
 *   · IDLE the coin bears the `Wrench` TOOLS glyph (owner-picked 2026-07-12 —
 *     reads "the tools you tap to open", matching the aria "Sheet tools" label) —
 *     NOT a pencil, so nothing reads as "edit" until you ask for it. A tap BLOOMS the
 *     chain upward: `⟲ ⟳` (only while history exists) · `⋯` · `✎ Edit`. The pencil
 *     lives ONLY in the bloomed chain.
 *   · While EDITING the coin itself becomes the LIT AMBER `✎` — a one-tap exit
 *     (aria "Done editing" / "Fine modifica"), exactly the fob's activated-toggle
 *     grammar (a lit toggle tap deactivates). The chain, if bloomed while editing,
 *     shows ONLY `⟲ ⟳ · ⋯` — never a second pencil, because the coin IS the edit
 *     control now.
 *   · Long-press flips the whole coin to the LEFT edge (persisted) for left-thumb
 *     reach / occlusion relief. Coarse pointers get no tooltips — the aria labels
 *     (EN + IT) carry every word.
 *
 * Every coin acts through the SAME seams as its keyboard/desktop twin (golden
 * rule 6): undo/redo via `useUndoActions` (⌘Z / ⌘⇧Z), the edit toggle via
 * `uiStore.sheetMode` (⌘E / Esc). Owner-only — hidden entirely on a read-only
 * glass-case sheet.
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Undo2, Redo2, SquarePen, Wrench } from "lucide-react";
import { useUndoStore } from "@/stores/undoStore";
import { useUIStore } from "@/stores/uiStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useLongPress } from "@/hooks/useLongPress";
import { useToasts } from "@/hooks/useToasts";
import { useUndoActions } from "@/hooks/useUndoActions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { SheetExtrasCoin } from "./SheetExtrasCoin";
import { useBinderFobHome } from "./use-binder-fob-home";
// The signet's struck-metal styles ride the lazy cockpit chunk via folio.css
// (the shared `.fob-coin` / `.fob-edit` material + the `.signet*` placement).

/** The shared management state the signet reads (mobile home only). */
function useSignetTools() {
  const { t } = useTranslation();
  const { toastMessage } = useToasts();
  const { triggerUndo, triggerRedo } = useUndoActions();
  const fobHome = useBinderFobHome();
  const readonly = useSheetReadonly();
  const hasCharacter = useCharacterStore((s) => s.character != null);
  const isEdit = useUIStore((s) => s.sheetMode === "edit");
  const setSheetMode = useUIStore((s) => s.setSheetMode);
  const undoTop = useUndoStore((s) => s.past.at(-1));
  const redoTop = useUndoStore((s) => s.future.at(-1));
  const undoAction = undoTop ? toastMessage(undoTop.label) : "";
  const redoAction = redoTop ? toastMessage(redoTop.label) : "";
  return {
    t,
    // Mobile home only: never beside the desktop fob, never under glass.
    ready: !fobHome && hasCharacter && !readonly,
    hasHistory: Boolean(undoTop) || Boolean(redoTop),
    undoTop,
    redoTop,
    undoAria: undoTop
      ? t("combat.undoControl", { action: undoAction })
      : t("common.undo"),
    redoAria: redoTop
      ? t("combat.redoControl", { action: redoAction })
      : t("common.redo"),
    triggerUndo,
    triggerRedo,
    isEdit,
    setSheetMode,
  };
}

export function MobileSignet() {
  const core = useSignetTools();
  const [open, setOpen] = useState(false);
  // Long-press flips the coin to the left edge (persisted for left-thumb reach).
  const [side, setSide] = useState<"right" | "left">(() => {
    try {
      return window.localStorage.getItem("signetSide") === "left" ? "left" : "right";
    } catch {
      return "right";
    }
  });
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, rootRef, () => setOpen(false));
  const { handlers, consume } = useLongPress(() => {
    setSide((s) => {
      const next = s === "right" ? "left" : "right";
      try {
        window.localStorage.setItem("signetSide", next);
      } catch {
        /* persistence is a nicety, not a requirement */
      }
      return next;
    });
  });
  if (!core.ready) return null;

  function onCoinClick(): void {
    if (consume()) return; // the tap that ended a long-press
    if (core.isEdit) {
      // The activated-toggle grammar: a lit toggle tap deactivates — one-tap exit.
      core.setSheetMode("play");
      setOpen(false);
      return;
    }
    setOpen((v) => !v);
  }

  return (
    <div
      ref={rootRef}
      className={cn("signet", side === "left" && "signet-left")}
      role="group"
      aria-label={core.t("common.sheetTools")}
    >
      {open && (
        <div className="signet-chain">
          {/* The ⟲ ⟳ session pair — mounts only WHILE history exists; an empty
              side shows disabled (coarse pointer ⇒ the aria label carries the act). */}
          {core.hasHistory && (
            <>
              <button
                type="button"
                className="fob-coin"
                disabled={!core.undoTop}
                onClick={core.triggerUndo}
                aria-label={core.undoAria}
              >
                <Icon as={Undo2} decorative />
              </button>
              <button
                type="button"
                className="fob-coin"
                disabled={!core.redoTop}
                onClick={core.triggerRedo}
                aria-label={core.redoAria}
              >
                <Icon as={Redo2} decorative />
              </button>
            </>
          )}
          {/* The ⋯ extras — the fob family's shared document-extras coin (no
              tooltip on the coarse-pointer Signet). */}
          <SheetExtrasCoin triggerClassName="fob-coin" />
          {/* The enter-edit coin lives ONLY here, and ONLY while NOT editing —
              while editing the signet itself IS the edit control, so the chain
              never shows a second pencil (the de-duplication invariant). */}
          {!core.isEdit && (
            <button
              type="button"
              className="fob-coin"
              aria-label={core.t("common.edit")}
              onClick={() => {
                core.setSheetMode("edit");
                setOpen(false);
              }}
            >
              <Icon as={SquarePen} decorative />
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className="fob-edit signet-fab"
        data-editing={core.isEdit ? "" : undefined}
        aria-pressed={core.isEdit}
        aria-expanded={core.isEdit ? undefined : open}
        aria-label={
          core.isEdit ? core.t("common.doneEditing") : core.t("common.sheetTools")
        }
        onClick={onCoinClick}
        {...handlers}
      >
        {/* IDLE the tools glyph (identity, never "edit"); EDITING the lit amber ✎. */}
        <Icon as={core.isEdit ? SquarePen : Wrench} decorative />
      </button>
    </div>
  );
}
