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
 * commits the reversible plan (`planResourceConversion` → `applyCommitOps`)
 * and raises an undo toast. No eligible option → the affordance is disabled
 * with an honest hint (never an error after the fact).
 *
 * Engine seam: read-only derive + the existing store mutations through the
 * cost-engine `CommitStore` adapter — the SAME ops every combat action uses,
 * so undo semantics are identical by construction.
 */

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { classFeatureIndex } from "@/data/classes";
import { classEntryLevel } from "@/lib/classes";
import { resolveTrackers } from "@/lib/smart-tracker";
import { slotUsageKey } from "@/lib/cast-options";
import {
  applyCommitOps,
  planResourceConversion,
  type CommitStore,
} from "@/lib/cost-engine";
import type { ResourceConversionEntry } from "@/lib/grants";
import {
  conversionOptionVMs,
  type ConversionOptionVM,
  type ConversionCtx,
} from "@/lib/views/tracker-view";
import { Icon } from "@/components/ui/icon";
import type { CharacterDoc } from "@/types/character";

/**
 * The cost-engine store adapter. `planResourceConversion` only ever plans
 * spend/gain ops over slots + trackers, so the equipment/concentration members
 * delegate to the store where it has them and are inert otherwise (a guard
 * test pins that conversion plans never contain those ops).
 */
function commitStore(): CommitStore {
  const s = useCharacterStore.getState();
  return {
    useSpellSlot: s.useSpellSlot,
    restoreSpellSlot: s.restoreSpellSlot,
    useTracker: s.useTracker,
    restoreTracker: s.restoreTracker,
    useEquipmentItem: s.useEquipmentItem,
    // Never produced by a conversion plan (spend/gain slots + trackers only).
    restoreEquipmentItem: () => undefined,
    getConcentration: () => s.character?.session.concentration ?? "",
    setConcentration: s.setConcentration,
  };
}

/** Live resource counts for the option validator, from the current doc. */
function buildCtx(doc: CharacterDoc, entry: ResourceConversionEntry): ConversionCtx {
  const { character, session } = doc;
  // The conversion is gated by the level IN the class that owns its source
  // feature (Font of Magic's cost table reads the Sorcerer level).
  const ownerClass = classFeatureIndex.get(entry.sourceId)?.class;
  const classLevel = ownerClass ? classEntryLevel(character, ownerClass) : 0;
  const trackers = resolveTrackers(doc);
  const remaining = (id: string): number => {
    const tr = trackers.find((t) => t.id === id);
    return tr ? Math.max(0, tr.total - tr.used) : 0;
  };
  const deficit = (id: string): number => {
    const tr = trackers.find((t) => t.id === id);
    return tr ? Math.max(0, Math.min(tr.used, tr.total)) : 0;
  };
  // Font of Magic (Sorcerer) creates/converts NORMAL slots only — Pact-Magic
  // slots can't be converted — so resolve the non-pact pool at each level (which
  // keys as `String(level)` via slotUsageKey, distinct from a same-level pact pool).
  const normalSlotAt = (level: number) =>
    character.spellSlots.find((s) => s.level === level && !s.pactMagic);
  const slotTotal = (level: number): number => normalSlotAt(level)?.total ?? 0;
  const slotUsed = (level: number): number => {
    const slot = normalSlotAt(level);
    if (!slot) return 0;
    return Math.min(session.spellSlots[slotUsageKey(slot)]?.used ?? 0, slot.total);
  };
  return {
    classLevel,
    trackerRemaining: remaining,
    trackerDeficit: deficit,
    slotsExpended: slotUsed,
    slotsAvailable: (level) => Math.max(0, slotTotal(level) - slotUsed(level)),
    // PRIM-resource-conversion `pact-slot` (Warlock Magical Cunning / Eldritch
    // Master) — UNLIKE Font of Magic, this path acts on the Pact-Magic pool, so
    // resolve THAT pool (single level for a Warlock) here. `restoresAll` = the
    // character also has Eldritch Master, gated by its STABLE feature id's
    // declared level vs the live Warlock level (golden rule 7 — no magic 20).
    ...(entry.produces === "pact-slot" && { pactPool: pactPool(doc) }),
  };
}

/**
 * The Warlock Pact-Magic pool for a `pact-slot` conversion (Magical Cunning /
 * Eldritch Master): the single pact slot level, the pool max, how many are
 * expended, and whether Eldritch Master upgrades the restore to the full pool.
 * Returns `undefined` when the character has no Pact slot (no conversion to make).
 */
function pactPool(doc: CharacterDoc): ConversionCtx["pactPool"] {
  const { character, session } = doc;
  const slot = character.spellSlots.find((s) => s.pactMagic);
  if (!slot) return undefined;
  const expended = Math.min(
    session.spellSlots[slotUsageKey(slot)]?.used ?? 0,
    slot.total
  );
  const warlockLevel = classEntryLevel(character, "warlock");
  const eldritchMaster = classFeatureIndex.get("warlock-eldritch-master");
  const restoresAll = eldritchMaster != null && warlockLevel >= eldritchMaster.level;
  return { level: slot.level, max: slot.total, expended, restoresAll };
}

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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, wrapRef, () => setOpen(false));

  const options = useMemo(
    () => conversionOptionVMs(entry, buildCtx(doc, entry)),
    [entry, doc]
  );

  const label =
    entry.produces === "sorcery-points"
      ? t("character.convertSlotToPoints")
      : entry.produces === "pact-slot"
        ? t("character.restorePactSlots")
        : t("character.convertCreateSlot");

  function commit(opt: ConversionOptionVM): void {
    const ops = planResourceConversion(entry, opt.choice);
    if (ops.length === 0) return; // incoherent choice — the plan refuses
    const message =
      opt.kind === "create-slot"
        ? t("character.convertedSlotToast", { level: opt.producedSlotLevel })
        : opt.kind === "restore-pact"
          ? t("character.restoredPactSlotsToast", { count: opt.pactRestored })
          : t("character.convertedPointsToast", {
              points: opt.pointsGained,
              unit: unitLabel,
            });
    registerUndoableToast({ message }, () => applyCommitOps(ops, commitStore()), {
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
