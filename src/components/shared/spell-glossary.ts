/**
 * Beginner glossary: the spellcasting terms a spell card explains on its visible
 * labels, with their official SRD 5.2.1 names (EN / IT). The bodies live in
 * `glossary.term.<id>`; glossary-spells.guard reads this table, so the two can't
 * drift. The older spell lines (spellSlot, cantrip, concentration, ritual,
 * components, spellSaveDc, spellAttack, preparedSpells) predate this table.
 *
 * Spellcasting Focus has no label of its own: the Material line names it.
 */
import type { LocaleText } from "@/data/types";
import type { Locale } from "@/lib/locale";
import { litText } from "@/lib/loc-text";
import { localizeText } from "@/lib/views/srd-i18n";
import type { GlossaryTermId } from "./GlossaryTip";

export const SPELL_GLOSSARY = {
  castingTime: { en: "Casting Time", it: "Tempo di Lancio" },
  range: { en: "Range", it: "Gittata" },
  duration: { en: "Duration", it: "Durata" },
  areaOfEffect: { en: "Area of Effect", it: "Area d'Effetto" },

  cone: { en: "Cone", it: "Cono" },
  cube: { en: "Cube", it: "Cubo" },
  cylinder: { en: "Cylinder", it: "Cilindro" },
  emanation: { en: "Emanation", it: "Emanazione" },
  line: { en: "Line", it: "Linea" },
  sphere: { en: "Sphere", it: "Sfera" },
  upcasting: {
    en: "Higher-Level Spell Slot",
    it: "Slot Incantesimo di Livello Superiore",
  },
  verbal: { en: "Verbal", it: "Verbale" },
  somatic: { en: "Somatic", it: "Somatica" },
  material: { en: "Material", it: "Materiale" },
  spellSave: { en: "Saving Throw", it: "Tiro Salvezza" },
  reactionSpell: { en: "Reaction", it: "Reazione" },
  bonusActionSpell: { en: "Bonus Action", it: "Azione Bonus" },
} as const satisfies Partial<Record<GlossaryTermId, LocaleText>>;

export type SpellTermId = keyof typeof SPELL_GLOSSARY;

/** A spell term's official name in `locale` (a tip's rubric). */
export const spellTermName = (term: SpellTermId, locale: Locale): string =>
  localizeText(litText(SPELL_GLOSSARY[term]), locale);

/** The area shapes a range names ("Self (15-foot cone)"), as their terms. */
const SHAPES = [
  { term: "cone" },
  { term: "cube" },
  { term: "cylinder" },
  { term: "emanation" },
  { term: "line" },
  { term: "sphere" },
] as const satisfies readonly { term: SpellTermId }[];

const RADIUS = { term: "areaOfEffect" } as const;

const word = (w: string): RegExp => new RegExp(`(?<!\\p{L})(?:${w})(?!\\p{L})`, "iu");

/**
 * The area term a localized range names: its shape ("Sé stessi (cono di 9 metri)"
 * → cone), else a bare radius → Area of Effect, else none.
 */
export function rangeAreaTerm(range: string): SpellTermId | null {
  const shape = SHAPES.find(({ term }) =>
    Object.values(SPELL_GLOSSARY[term]).some((n) => word(n).test(range))
  );
  if (shape) return shape.term;
  return word("radius|raggio").test(range) ? RADIUS.term : null;
}
