/**
 * Inline picker for Magic-Initiate-style feat spell choices.
 *
 * Renders one section per slot produced by `pendingSpellChoicesForFeat`.
 * Each section shows the available spells (filtered by classSpellList +
 * level) and lets the player select exactly `count` of them. The parent
 * stores the selection in a SpellChoicePicks object keyed by slot id.
 *
 * COMPACT-DETAIL rows (owner fb3, 2026-06-11): these pickers mount inside
 * asks columns (a chosen feat's caused decisions), so the rows are dense
 * fact rows — a tap commits, the PICKED row grows the open-book affordance
 * that opens the shared `PickerDetailModal` compendium read view (the lab/B
 * pattern). No inline prose blobs in an asks column.
 */
import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { WizardPickList, type WizardPickOption } from "@/features/wizard/pick-list";
import { SpellLevelSeal } from "@/features/wizard/seals";
import { PickerDetailModal } from "@/components/shared/PickerDetailModal";
import { spellSpec } from "@/features/compendium/picker/specs/spell";
import { spellPickVM } from "@/lib/views/spell-pick-view";
import {
  listAvailableForSlot,
  type SpellChoicePicks,
  type SpellChoiceSlot,
} from "@/lib/feat-spell-choices";
import { getSrdFeatureSource, srdRefForFeatureSource } from "@/lib/srd-feature-lookup";
import { localizeSrd } from "@/i18n/resolver";
import { asLocale } from "@/lib/locale";

interface Props {
  slots: ReadonlyArray<SpellChoiceSlot>;
  picks: SpellChoicePicks;
  onChange: (picks: SpellChoicePicks) => void;
  /** Spell IDs the character already owns — excluded from the picker. */
  existingSpellIds: ReadonlySet<string>;
}

export function FeatSpellChoicesPicker({
  slots,
  picks,
  onChange,
  existingSpellIds,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <SpellSlotPicker
          key={slot.slotId}
          slot={slot}
          existingSpellIds={existingSpellIds}
          picked={picks[slot.slotId] ?? []}
          onChange={(ids) => onChange({ ...picks, [slot.slotId]: ids })}
          t={t}
        />
      ))}
    </div>
  );
}

function SpellSlotPicker({
  slot,
  existingSpellIds,
  picked,
  onChange,
  t,
}: {
  slot: SpellChoiceSlot;
  existingSpellIds: ReadonlySet<string>;
  picked: ReadonlyArray<string>;
  onChange: (ids: string[]) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const { i18n } = useTranslation();
  const locale = asLocale(i18n.language);
  // The open-book read target (detail on SELECTED only — the shared modal).
  const [readId, setReadId] = useState<string | null>(null);
  // SOURCE ATTRIBUTION — resolve the granting feature's localized name from the
  // slot's stamped sourceId ("Magic Initiate (Cleric)", "Abjuration Savant") so
  // every spell slot SAYS where it comes from. Quietly absent when unresolvable.
  const sourceEntry = slot.sourceId ? getSrdFeatureSource(slot.sourceId) : undefined;
  const sourceName = sourceEntry
    ? (() => {
        const ref = srdRefForFeatureSource(sourceEntry);
        return localizeSrd(ref.kind, ref.key, "name", locale);
      })()
    : undefined;
  // A spell the player has ALREADY picked in this slot must always render so
  // its selected state is visible — even if it also appears in
  // `existingSpellIds` (e.g. a caller that folds picks back in, or two slots
  // that share a list). Exclude only the OTHER already-owned ids from the
  // pool, never this slot's own picks.
  const excluded = new Set<string>();
  for (const id of existingSpellIds) {
    if (!picked.includes(id)) excluded.add(id);
  }
  const available = listAvailableForSlot(slot, excluded);

  function toggle(id: string) {
    if (picked.includes(id)) {
      onChange(picked.filter((p) => p !== id));
    } else if (picked.length < slot.count) {
      onChange([...picked, id]);
    } else {
      // At the limit → FIFO replace the oldest pick (matches OptionGrid auto-replace).
      onChange([...picked.slice(1), id]);
    }
  }

  const className = slot.classSpellList
    ? t(`srd.class_${slot.classSpellList}`)
    : undefined;
  const schoolName = slot.spellSchool ? t(`srd.school_${slot.spellSchool}`) : undefined;

  // The source class reads INLINE in the rubric ("Pick 2 CLERIC cantrips" / "Scegli 2
  // trucchetti da CHIERICO"), highlighted seamlessly — not as a trailing badge. A
  // SCHOOL-restricted slot (Wizard School Savant) names the school too ("Pick 1
  // ABJURATION Wizard Spell") and a Ritual-only slot (Pact of the Tome) says so —
  // the restriction must be VISIBLE, or the filtered pool reads like a bug. When
  // there is no restriction at all, fall back to the plain rubric. <Trans> places
  // the highlighted term per each language's word order.
  const label =
    schoolName && className ? (
      <Trans
        i18nKey="featChoices.pickSchoolSpells"
        count={slot.count}
        values={{ count: slot.count, school: schoolName, className }}
        components={{ c: <span className="choice-class-em" /> }}
      />
    ) : className ? (
      <Trans
        i18nKey={
          slot.kind === "cantrip"
            ? "featChoices.pickClassCantrips"
            : "featChoices.pickClassSpells"
        }
        count={slot.count}
        values={{ count: slot.count, className }}
        components={{ c: <span className="choice-class-em" /> }}
      />
    ) : slot.kind === "cantrip" ? (
      t("featChoices.pickCantrips", {
        count: slot.count,
      })
    ) : slot.ritualOnly ? (
      t("featChoices.pickRitualSpells", {
        count: slot.count,
      })
    ) : (
      t("featChoices.pickSpells", {
        count: slot.count,
      })
    );

  // F family (C1) + fb3 — compact fact rows (the level seal carries the level;
  // school/casting detail lives behind the picked row's open-book modal).
  const options = available.map((sp): WizardPickOption => {
    const vm = spellPickVM(sp, locale);
    return {
      id: vm.id,
      name: vm.name,
      seal: <SpellLevelSeal level={vm.level} />,
      searchText: vm.searchText,
      searchDesc: vm.searchDesc,
    };
  });
  const readEntry = readId ? (available.find((sp) => sp.id === readId) ?? null) : null;

  if (options.length === 0) {
    return (
      <p className="text-xs italic text-text-muted">
        {t("featChoices.noSpellsAvailable")}
      </p>
    );
  }

  return (
    <div>
      {/* Savant picks land in the SPELLBOOK (not always-prepared) — say so, or the
          player wonders why the new spell isn't ready to cast. Micro-copy reads
          BEFORE the picker it explains, never after it (owner, 2026-06-10). */}
      {slot.toSpellbook && (
        <p className="mb-1.5 text-[0.65rem] text-text-muted">
          {t("featChoices.toSpellbookHint")}
        </p>
      )}
      <WizardPickList
        label={
          <>
            {label}
            {sourceName && <span className="opt-head-chip">{sourceName}</span>}
          </>
        }
        options={options}
        selected={picked}
        total={slot.count}
        onToggle={toggle}
        onRead={setReadId}
        searchPlaceholder={t("wizard.searchSpells")}
      />
      {/* The shared compendium read view — ONE source of truth for a spell's
          details, opened from a picked row's open-book affordance. */}
      <PickerDetailModal
        entry={readEntry}
        spec={spellSpec}
        onClose={() => setReadId(null)}
      />
    </div>
  );
}
