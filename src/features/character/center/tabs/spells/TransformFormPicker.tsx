/**
 * TransformFormPicker — the one form picker of the self-transformation spells
 * (Polymorph, True Polymorph, Shapechange, Animal Shapes): the Beast catalogue or
 * the lazy bestiary, per the spell's rule. Choosing a form applies it with an
 * undoable toast; closing it changes nothing. It never spends a slot: the cast
 * that opened it already paid, and the Spells tab's Transform reopens it later.
 */
import { lazy, Suspense, useCallback } from "react";
import { BeastFormPicker } from "@/components/sheet/BeastFormPicker";
import { ensureSrdKind } from "@/i18n";
import { useLocale } from "@/hooks/useLocale";
import { totalLevel } from "@/lib/classes";
import { resolvePolymorphForms, selfFormRule } from "@/lib/polymorph";
import { useCharacterStore } from "@/stores/characterStore";
import type { BeastStatBlock } from "@/data/types";
import { useFormActions } from "./use-form-actions";

// The bestiary pool (Shapechange, True Polymorph) reads the whole bestiary, so it
// rides a LAZY leaf.
const BestiaryFormPicker = lazy(() =>
  Promise.all([import("./BestiaryFormPicker"), ensureSrdKind("monster")]).then(([m]) => ({
    default: m.BestiaryFormPicker,
  }))
);

export interface TransformFormPickerProps {
  /** The spell whose form is being chosen; null keeps the picker closed. */
  spellId: string | null;
  onClose: () => void;
}

export function TransformFormPicker({ spellId, onClose }: TransformFormPickerProps) {
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const { assume } = useFormActions();
  const handleAssume = useCallback(
    (form: BeastStatBlock) => assume(form, spellId ?? "polymorph"),
    [assume, spellId]
  );

  if (!character) return null;
  if (spellId !== null && selfFormRule(spellId).pool === "bestiary") {
    return (
      <Suspense fallback={null}>
        <BestiaryFormPicker
          spellId={spellId}
          level={totalLevel(character.character)}
          locale={locale}
          onAssume={handleAssume}
          onClose={onClose}
        />
      </Suspense>
    );
  }
  return (
    <BeastFormPicker
      open={spellId !== null}
      forms={resolvePolymorphForms(character, spellId ?? "polymorph")}
      keepsMind={selfFormRule(spellId ?? "polymorph").keepsMind}
      locale={locale}
      onAssume={handleAssume}
      onClose={onClose}
    />
  );
}
