/**
 * ShapechangeFormPicker — the Beast-form picker fed with the Shapechange pool: every
 * bestiary creature of CR ≤ the caster's level that is not a Construct or an
 * Undead, projected to the one self-form shape.
 *
 * SEAM file: reaches the bestiary corpus through `@/lib/shapechange`, so it is a
 * LAZY leaf (the Spells tab mounts it via `React.lazy` gated on
 * `ensureSrdKind("monster")`; the eager-partition sweep pins it).
 */
import { useMemo } from "react";
import { BeastFormPicker } from "@/components/sheet/BeastFormPicker";
import { resolveShapechangeForms } from "@/lib/shapechange";
import type { BeastStatBlock } from "@/data/types";
import type { Locale } from "@/lib/locale";

export interface ShapechangeFormPickerProps {
  level: number;
  locale: Locale;
  onAssume: (form: BeastStatBlock) => void;
  onClose: () => void;
}

export function ShapechangeFormPicker({
  level,
  locale,
  onAssume,
  onClose,
}: ShapechangeFormPickerProps) {
  const forms = useMemo(() => resolveShapechangeForms(level), [level]);
  return (
    <BeastFormPicker
      open
      shapechange
      keepsMind
      forms={forms}
      locale={locale}
      onAssume={onAssume}
      onClose={onClose}
    />
  );
}
