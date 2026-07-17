/**
 * BinderFob — "The Binder's Fob": the sheet's DESKTOP management home
 * (owner-ratified, 2026-07-11). A fixed bottom-right coin chain in the Rest
 * medallion's struck-metal family, completely detached from the masthead so the
 * tools are reachable at every scroll depth by construction:
 *
 *     [ ⟲ ]  ← undo   ┐ the session pair mounts ONLY while history exists,
 *     [ ⟳ ]  ← redo   ┘ growing the chain UPWARD (the standing coins never move)
 *     [ ⋯ ]  ← extras (History · Export JSON · Export PDF)
 *     [ ✎ ]  ← the edit coin — enter AND exit are the same control
 *
 * THE ACTIVATED-COIN GRAMMAR (the owner's FATTO answer): the ✎ coin is a
 * toggle — uncolored at rest, LIT AMBER while editing (`data-editing` +
 * `aria-pressed`), with zero geometry change so flipping the mode can never
 * reflow anything. Its quiet branded tooltip (the HoverTip idiom, as
 * non-invasive as a native tip) names the act + the shortcut: "Edit · ⌘E" at
 * rest, "Done editing · Esc" while lit. The lit coin + the `.content` amber
 * edit frame carry the mode together; there is no separate masthead signifier
 * and no floating deep-scroll exit on desktop — the fob IS always reachable.
 *
 * Every coin acts through the SAME seams as its keyboard twin (golden rule 6):
 * undo/redo via `useUndoActions` (⌘Z / ⌘⇧Z), the edit toggle via
 * `uiStore.toggleSheetMode` (⌘E / Esc). Undo/redo tooltips + aria name the
 * concrete acted-on entry ("Undo: Cast Cure Wounds…" — the same localized
 * string its toast showed).
 *
 * HOME SPLIT (`useBinderFobHome`): the fob is the management home on fine
 * pointers ≥768px ONLY; coarse-pointer / narrow viewports get the Signet
 * (`MobileSignet`) instead. The masthead carries no management row on either
 * home — it is pure identity + vitals, the vitals aligned with the name.
 * Owner-only: hidden entirely on a read-only glass-case sheet.
 */

import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Undo2, Redo2, SquarePen } from "lucide-react";
import { useUndoStore } from "@/stores/undoStore";
import { useUIStore } from "@/stores/uiStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { useToasts } from "@/hooks/useToasts";
import { useUndoActions } from "@/hooks/useUndoActions";
import { shortcutLabel } from "@/lib/platform";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { SheetExtrasCoin } from "./SheetExtrasCoin";
import { HoverTip } from "./center/HoverTip";
import { useBinderFobHome } from "./use-binder-fob-home";

/** Two-line tooltip body: the concrete act (or verb) over its key hint. */
function tipBody(label: ReactNode, keyHint: ReactNode): ReactNode {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{label}</span>
      <span className="text-text-muted">{keyHint}</span>
    </span>
  );
}

export function BinderFob() {
  const { t } = useTranslation();
  const fobHome = useBinderFobHome();
  const readonly = useSheetReadonly();
  const hasCharacter = useCharacterStore((s) => s.character != null);
  const isEdit = useUIStore((s) => s.sheetMode === "edit");
  const toggleSheetMode = useUIStore((s) => s.toggleSheetMode);
  const { toastMessage } = useToasts();
  const { triggerUndo, triggerRedo } = useUndoActions();
  const undoTop = useUndoStore((s) => s.past.at(-1));
  const redoTop = useUndoStore((s) => s.future.at(-1));

  // Own-sheet + fob-home only: no doc, a glass-case viewer, or a compact/coarse
  // viewport (where the Signet is the home instead) ⇒ nothing.
  if (!fobHome || !hasCharacter || readonly) return null;

  const undoAction = undoTop ? toastMessage(undoTop.label) : "";
  const redoAction = redoTop ? toastMessage(redoTop.label) : "";

  return (
    <div className="fob" role="group" aria-label={t("common.sheetTools")}>
      {/* The session pair — mounts only WHILE history exists, ABOVE the standing
          coins (the bottom-anchored column grows upward, so ⋯ and ✎ never move).
          An empty side shows disabled: no in-pair shift while you work the stack. */}
      {(undoTop || redoTop) && (
        <>
          <HoverTip
            side="left"
            show={Boolean(undoTop)}
            content={tipBody(undoAction, shortcutLabel("Z"))}
          >
            <button
              type="button"
              className="fob-coin"
              disabled={!undoTop}
              onClick={triggerUndo}
              aria-label={
                undoTop
                  ? t("combat.undoControl", { action: undoAction })
                  : t("common.undo")
              }
            >
              <Icon as={Undo2} decorative />
            </button>
          </HoverTip>
          <HoverTip
            side="left"
            show={Boolean(redoTop)}
            content={tipBody(redoAction, shortcutLabel("Z", true))}
          >
            <button
              type="button"
              className="fob-coin"
              disabled={!redoTop}
              onClick={triggerRedo}
              aria-label={
                redoTop
                  ? t("combat.redoControl", { action: redoAction })
                  : t("common.redo")
              }
            >
              <Icon as={Redo2} decorative />
            </button>
          </HoverTip>
        </>
      )}

      {/* The ⋯ extras — the fob family's shared document-extras coin, wearing the
          desktop branded tooltip. */}
      <SheetExtrasCoin triggerClassName="fob-coin" tooltip={t("roster.moreActions")} />

      {/* The ✎ edit coin — the activated toggle (enter · mode light · exit). */}
      <HoverTip
        side="left"
        show
        content={
          isEdit
            ? tipBody(t("common.doneEditing"), <Kbd>Esc</Kbd>)
            : tipBody(t("common.edit"), <Kbd>{shortcutLabel("E")}</Kbd>)
        }
      >
        <button
          type="button"
          className="fob-edit"
          data-editing={isEdit ? "" : undefined}
          aria-pressed={isEdit}
          aria-keyshortcuts="Meta+E Control+E"
          aria-label={isEdit ? t("common.doneEditing") : t("common.edit")}
          onClick={toggleSheetMode}
        >
          <Icon as={SquarePen} decorative />
        </button>
      </HoverTip>
    </div>
  );
}
