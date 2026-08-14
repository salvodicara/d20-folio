/**
 * ResourceConversions — the PRIM-resource-conversion action affordance (closes
 * `needs-UI:resource-conversion-action`). One compact control per
 * `resource-conversion` grant the character has (Sorcerer Font of Magic
 * Creating + Converting Spell Slots, Druid Archdruid Nature Magician), living
 * in the rail's Resources section right under the pool it converts.
 *
 * Interaction = the combat commit model: the button opens an inline picker
 * (the SAME `.co-add` + `.co-picker` recipes the condition strip uses) listing
 * ONLY the conversions that are legal right now (`conversionOptionVMs` — every
 * constraint pre-validated, golden rule 20); clicking an option IMMEDIATELY
 * captures that stable choice, then re-resolves the live grant and every owner
 * through `prepareMechanicsCommand` immediately before one atomic CAS commit.
 * No eligible option → the affordance is disabled with an honest hint.
 *
 * Undo is the receipt's exact causal inverse; redo prepares the same choice
 * again against current facts instead of replaying stale mutation deltas.
 */

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useToastStore } from "@/stores/toastStore";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import {
  buildConversionCtx,
  conversionOptionVMs,
  planMechanicsRevert,
  prepareMechanicsCommand,
  type ConversionOptionVM,
  type ResourceConversionSelection,
} from "@/lib/mechanics-command";
import type { ResourceConversionEntry } from "@/lib/grants";
import { Icon } from "@/components/ui/icon";
import type { CharacterDoc } from "@/types/character";

/** One conversion entry → its button + inline option picker. */
function ConversionControl({
  entry,
  doc,
  unitLabel,
}: {
  entry: ResourceConversionEntry;
  doc: CharacterDoc;
  unitLabel: string;
}) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.showToast);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, wrapRef, () => setOpen(false));

  const options = useMemo(
    () => conversionOptionVMs(entry, buildConversionCtx(doc, entry)),
    [entry, doc]
  );

  const label =
    entry.produces === "sorcery-points"
      ? t("character.convertSlotToPoints")
      : entry.produces === "pact-slot"
        ? t("character.restorePactSlots")
        : t("character.convertCreateSlot");

  function reportConflict(): void {
    showToast({ message: t("character.conversionConflict"), duration: 4000 });
  }

  function execute(selection: ResourceConversionSelection) {
    const store = useCharacterStore.getState();
    const live = store.character;
    if (!live) {
      reportConflict();
      return null;
    }
    const prepared = prepareMechanicsCommand(live, {
      kind: "resource-conversion",
      occurrenceId: crypto.randomUUID(),
      characterId: doc.id,
      sourceId: entry.sourceId,
      conversionId: entry.conversionId,
      selection,
    });
    if (prepared.status !== "planned") {
      reportConflict();
      return null;
    }
    const committed = store.applyMechanicsPlan(prepared.plan);
    if (committed.status !== "applied") {
      reportConflict();
      return null;
    }
    return () => {
      const reverted = useCharacterStore
        .getState()
        .applyMechanicsPlan(planMechanicsRevert(committed.receipt));
      if (reverted.status !== "applied") {
        reportConflict();
        return false;
      }
      return true;
    };
  }

  function commit(opt: ConversionOptionVM): void {
    const message =
      opt.kind === "create-slot"
        ? t("character.convertedSlotToast", { level: opt.producedSlotLevel })
        : opt.kind === "restore-pact"
          ? t("character.restoredPactSlotsToast", { count: opt.pactRestored })
          : t("character.convertedPointsToast", {
              points: opt.pointsGained,
              unit: unitLabel,
            });
    registerUndoableToast({ message }, () => execute(opt.selection), {
      turnScoped: false,
    });
    setOpen(false);
  }

  /** Localized option row text — the full trade, stated up front. */
  function optionLabel(opt: ConversionOptionVM): string {
    if (opt.kind === "create-slot") {
      return t("character.convertOptionSlot", {
        level: opt.producedSlotLevel,
        cost: opt.costUnits,
        unit: unitLabel,
      });
    }
    if (opt.kind === "restore-pact") {
      return t("character.restorePactOption", { count: opt.pactRestored });
    }
    return t("character.convertOptionPoints", {
      level: opt.slotLevelSpent,
      points: opt.pointsGained,
      unit: unitLabel,
    });
  }

  return (
    <div className="co-add-wrap" style={{ position: "relative" }} ref={wrapRef}>
      <button
        type="button"
        className="co-add"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={options.length === 0}
        title={options.length === 0 ? t("character.convertNone") : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon as={ArrowLeftRight} size="xs" decorative />
        {label}
      </button>
      {open && options.length > 0 && (
        <div className="co-picker" role="listbox" aria-label={label}>
          {options.map((opt) => (
            <button
              key={`${opt.kind}-${opt.producedSlotLevel ?? opt.slotLevelSpent ?? opt.pactRestored}`}
              type="button"
              role="option"
              aria-selected={false}
              className="co-pick-item"
              onClick={() => commit(opt)}
            >
              {optionLabel(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Every resource-conversion affordance for the character — rendered by the
 * rail's Resources section under the trackers. Empty (renders nothing) for the
 * vast majority of characters with no conversion grant.
 */
export function ResourceConversions({
  entries,
  doc,
  unitFor,
}: {
  entries: ReadonlyArray<ResourceConversionEntry>;
  doc: CharacterDoc;
  /** Localized unit word for a tracker id ("pts", "uses") — from the rail's
   *  already-localized tracker rows so the strings stay single-sourced. */
  unitFor: (trackerId: string | undefined) => string;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry) => (
        <ConversionControl
          key={`${entry.sourceId}-${entry.conversionId}`}
          entry={entry}
          doc={doc}
          unitLabel={unitFor(entry.fromTracker ?? entry.toTracker)}
        />
      ))}
    </div>
  );
}
