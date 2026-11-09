/**
 * A temporary defense, and the familiar's and a summon's form, on the new Play screen
 * (headless), from the classic sheet's own writes: `addSessionDefense` (a potion, a
 * spell: it ends without touching the build), `summonFamiliar` with the form's printed
 * HP (the 2024 Celestial/Fey/Fiend swap) and `setCompanionVariant` for a summon. The
 * form lists read the monster corpus, so they stay in the lazy pickers.
 */
import type { TFunction } from "i18next";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import type { FamiliarCreatureType } from "@/lib/familiar-ids";
import { FIND_FAMILIAR_SPELL_ID } from "@/lib/familiar-ids";
import type { Locale } from "@/lib/locale";
import { summonMaxHp } from "@/lib/play/companions";
import {
  defenseKindViews as deriveViews,
  type DefenseKindView,
} from "@/lib/views/sheet-view";
import { conditionOptions } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc, SessionDefenseKind } from "@/types/character";
import { DAMAGE_TYPES } from "@/types/damage";

export function defenseKindViews(
  doc: CharacterDoc
): Record<SessionDefenseKind, DefenseKindView> {
  return deriveViews(
    aggregateCharacterGrants(doc.character, doc.session),
    doc.character,
    doc.session.sessionDefenses
  );
}

/** What «Add defense» offers for one kind, alphabetised; one already held is
 *  offered disabled (`already`). */
export function addDefenseOptions(
  doc: CharacterDoc,
  kind: SessionDefenseKind,
  locale: Locale,
  t: TFunction
): Array<{ id: string; label: string; already: boolean }> {
  const effective = new Set(defenseKindViews(doc)[kind].effective);
  const options =
    kind === "conditionImmunity"
      ? conditionOptions(locale)
      : DAMAGE_TYPES.map((d) => ({ id: d, label: t(`srd.damage_${d}`) })).sort((a, b) =>
          a.label.localeCompare(b.label, locale)
        );
  return options.map((o) => ({ id: o.id, label: o.label, already: effective.has(o.id) }));
}

/** Add a temporary defense to the open sheet (the classic Play-mode write). */
export function addTemporaryDefense(kind: SessionDefenseKind, id: string): void {
  useCharacterStore.getState().addSessionDefense(kind, id);
}

/** Summon the familiar in `form` as `creatureType`, with the undo toast. */
export function summonFamiliarForm(
  form: { id: string; hpAverage: number },
  creatureType: FamiliarCreatureType,
  name: string,
  t: TFunction
): void {
  registerUndoableToast(
    { message: t("familiar.summoned", { name }) },
    () => {
      const doc = useCharacterStore.getState().character;
      return useCharacterStore
        .getState()
        .summonFamiliar(
          form.id,
          creatureType,
          doc ? summonMaxHp(doc, FIND_FAMILIAR_SPELL_ID, form.hpAverage) : form.hpAverage
        );
    },
    { turnScoped: false }
  );
}

/** Pick a summon spell's creature (its companion variant), with the undo toast. */
export function pickSummonForm(
  spellId: string,
  monsterId: string,
  name: string,
  t: TFunction
): void {
  registerUndoableToast(
    { message: t("features.creaturePicked", { name }) },
    () => useCharacterStore.getState().setCompanionVariant(spellId, monsterId),
    { turnScoped: false }
  );
}
