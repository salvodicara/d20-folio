/**
 * The Druid's known Wild Shape forms (SRD 5.2.1, Druid, Wild Shape, «Known Forms»):
 * the Beast Shapes table's count (4 at Druid 2, 6 at 4, 8 at 8, the class table's
 * `wildShapeKnownForms`), the beasts the Druid may know (the Wild Shape pool at a
 * Druid level: its Max CR and the Fly Speed from level 8), what the picker offers,
 * what is still owed, and the Long Rest's one swap («you can replace one of your
 * known forms with another eligible form»).
 *
 * The list is optional (`character.wildShapeForms`): with none chosen, or none of them
 * usable now, the picker offers every eligible beast, so it never goes empty. Pure.
 */
import { getClassTable } from "@/data/classes";
import type { BeastStatBlock } from "@/data/types";
import { classEntryLevel } from "@/lib/classes";
import { formPool } from "@/lib/form-pool";
import type { CharacterDoc } from "@/types/character";

export const WILD_SHAPE_ID = "druid-wild-shape";

/** How many forms a Druid of `level` knows (0 before Wild Shape). */
export function knownFormsAt(level: number): number {
  const row = getClassTable("druid")?.levels.find((l) => l.level === level);
  const n = row?.classSpecific?.wildShapeKnownForms;
  return typeof n === "number" ? n : 0;
}

function druidLevel(doc: CharacterDoc): number {
  return classEntryLevel(doc.character, "druid");
}

/**
 * The beasts a Druid may know: the Wild Shape pool at its Druid level, or at `level`
 * (the level-up reads the new level's Max CR and Fly Speed).
 */
export function eligibleWildShapeForms(
  doc: CharacterDoc,
  level?: number
): ReadonlyArray<BeastStatBlock> {
  if (level === undefined || level === druidLevel(doc))
    return formPool(doc, WILD_SHAPE_ID);
  const classes = doc.character.classes.some((e) => e.classId === "druid")
    ? doc.character.classes.map((e) => (e.classId === "druid" ? { ...e, level } : e))
    : [...doc.character.classes, { classId: "druid", level }];
  return formPool({ ...doc, character: { ...doc.character, classes } }, WILD_SHAPE_ID);
}

/** The stored known forms, each once, in the player's order. */
export function storedWildShapeForms(doc: CharacterDoc): string[] {
  const list = doc.character.wildShapeForms;
  return Array.isArray(list)
    ? [...new Set(list.filter((id): id is string => typeof id === "string"))]
    : [];
}

/** The known forms the Druid can take now (eligible at its level), in pool order. */
function usableKnownForms(doc: CharacterDoc): ReadonlyArray<BeastStatBlock> {
  const known = new Set(storedWildShapeForms(doc));
  return eligibleWildShapeForms(doc).filter((b) => known.has(b.id));
}

/**
 * What the Wild Shape picker offers: the known forms, or every eligible beast when the
 * Druid has none chosen (or none of them can be taken now).
 */
export function wildShapePickerPool(doc: CharacterDoc): ReadonlyArray<BeastStatBlock> {
  const known = usableKnownForms(doc);
  return known.length > 0 ? known : eligibleWildShapeForms(doc);
}

/** How many forms the Druid may still learn: the table's count minus the forms known. */
export function wildShapeFormsOwed(doc: CharacterDoc): number {
  const count = knownFormsAt(druidLevel(doc));
  if (count === 0) return 0;
  const held = usableKnownForms(doc).length;
  const open = eligibleWildShapeForms(doc).length - held;
  return Math.max(0, Math.min(count - held, open));
}

/**
 * What a Druid reaching `level` may learn: the eligible beasts at that level it
 * doesn't know, and how many (the count minus the known forms still eligible).
 */
export function wildShapeFormsAt(
  doc: CharacterDoc,
  level: number
): { owed: number; options: ReadonlyArray<BeastStatBlock> } {
  const known = new Set(storedWildShapeForms(doc));
  const eligible = eligibleWildShapeForms(doc, level);
  const held = eligible.filter((b) => known.has(b.id)).length;
  const options = eligible.filter((b) => !known.has(b.id));
  return {
    owed: Math.max(0, Math.min(knownFormsAt(level) - held, options.length)),
    options,
  };
}

/**
 * The character with `ids` learned: each eligible form not yet known, after the known
 * ones, never past the count at `level` (the Druid level by default).
 */
export function learnWildShapeForms(
  doc: CharacterDoc,
  ids: readonly string[],
  level: number = druidLevel(doc)
): CharacterDoc {
  const known = storedWildShapeForms(doc);
  const eligible = new Set(eligibleWildShapeForms(doc, level).map((b) => b.id));
  const room = knownFormsAt(level) - known.filter((id) => eligible.has(id)).length;
  const added = [...new Set(ids)]
    .filter((id) => eligible.has(id) && !known.includes(id))
    .slice(0, Math.max(0, room));
  if (added.length === 0) return doc;
  return {
    ...doc,
    character: { ...doc.character, wildShapeForms: [...known, ...added] },
  };
}

/**
 * The known forms with `removeId` replaced by `replaceId`, in its place. Unchanged
 * unless `removeId` is known and `replaceId` is a form not yet known.
 */
export function swapKnownForm(
  forms: readonly string[],
  removeId: string | null,
  replaceId: string | null
): string[] {
  if (!removeId || !replaceId || !forms.includes(removeId) || forms.includes(replaceId))
    return [...forms];
  return forms.map((id) => (id === removeId ? replaceId : id));
}

/** The forms a Long Rest may swap in: the eligible beasts the Druid doesn't know. */
export function formSwapOptions(doc: CharacterDoc): ReadonlyArray<BeastStatBlock> {
  const known = new Set(storedWildShapeForms(doc));
  return eligibleWildShapeForms(doc).filter((b) => !known.has(b.id));
}
