/**
 * BestiaryFormPicker — the Beast-form picker fed with a bestiary pool: every
 * creature of CR ≤ the caster's level that the spell allows (Shapechange: no
 * Construct or Undead; True Polymorph: any kind), projected to the one self-form
 * shape.
 *
 * SEAM file: reaches the bestiary corpus through `@/lib/bestiary-forms`, so it is
 * a LAZY leaf (the Spells tab mounts it via `React.lazy` gated on
 * `ensureSrdKind("monster")`; the eager-partition sweep pins it).
 */
import { useMemo } from "react";
import { BeastFormPicker } from "@/components/sheet/BeastFormPicker";
import { resolveBestiaryForms } from "@/lib/bestiary-forms";
import { selfFormRule } from "@/lib/polymorph";
import type { BeastStatBlock } from "@/data/types";
import type { Locale } from "@/lib/locale";

export interface BestiaryFormPickerProps {
  spellId: string;
  level: number;
  locale: Locale;
  onAssume: (form: BeastStatBlock) => void;
  onClose: () => void;
}

export function BestiaryFormPicker({
  spellId,
  level,
  locale,
  onAssume,
  onClose,
}: BestiaryFormPickerProps) {
  const forms = useMemo(() => resolveBestiaryForms(spellId, level), [spellId, level]);
  const rule = selfFormRule(spellId);
  return (
    <BeastFormPicker
      open
      bestiary
      selfOnly={rule.selfOnly ?? false}
      keepsMind={rule.keepsMind}
      forms={forms}
      locale={locale}
      onAssume={onAssume}
      onClose={onClose}
    />
  );
}
