/**
 * Beginner glossary: the spellcasting terms a spell card explains on its visible
 * labels, each named by the ui key that holds its official SRD 5.2.1 name: the
 * label the sheet already shows where one exists, else a `glossary.name.<term>`
 * entry. The bodies live in `glossary.term.<id>`; glossary-spells.guard reads this
 * table, so the two can't drift. The older spell lines (spellSlot, cantrip, concentration, ritual,
 * components, spellSaveDc, spellAttack, preparedSpells) predate this table.
 *
 * Spellcasting Focus has no label of its own: the Material line names it.
 */
import type { Locale } from "@/lib/locale";
import { uiText } from "@/lib/loc-text";
import { localizeText } from "@/lib/views/srd-i18n";
import type { GlossaryTermId } from "./GlossaryTip";

export const SPELL_GLOSSARY = {
  castingTime: "spells.castingTime",
  range: "spells.range",
  duration: "spells.duration",
  areaOfEffect: "glossary.name.areaOfEffect",

  cone: "glossary.name.cone",
  cube: "glossary.name.cube",
  cylinder: "glossary.name.cylinder",
  emanation: "glossary.name.emanation",
  line: "glossary.name.line",
  sphere: "glossary.name.sphere",
  upcasting: "glossary.name.upcasting",
  verbal: "glossary.name.verbal",
  somatic: "glossary.name.somatic",
  material: "spells.material",
  spellSave: "abilities.savingThrowHead",
  reactionSpell: "features.slotReaction",
  bonusActionSpell: "features.slotBonus",
} as const satisfies Partial<Record<GlossaryTermId, string>>;

export type SpellTermId = keyof typeof SPELL_GLOSSARY;

/** A spell term's official name in `locale` (a tip's rubric). */
export const spellTermName = (term: SpellTermId, locale: Locale): string =>
  localizeText(uiText(SPELL_GLOSSARY[term]), locale);

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
 * → cone), else a bare radius → Area of Effect, else none. `t` reads the shape
 * names in the range's own locale.
 */
export function rangeAreaTerm(
  range: string,
  t: (key: string) => string
): SpellTermId | null {
  const shape = SHAPES.find(({ term }) => word(t(SPELL_GLOSSARY[term])).test(range));
  if (shape) return shape.term;
  return word("radius|raggio").test(range) ? RADIUS.term : null;
}
