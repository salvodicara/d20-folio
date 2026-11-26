/**
 * The DM's own monster as the new fight screen's form types it (the classic
 * AddMonsterForm, in short): a name, Armor Class, maximum Hit Points, an optional
 * Challenge Rating and notes. An edit keeps what the form does not show (a portrait,
 * a creature type, homebrew defenses, the structured stat block).
 */
import type { CustomMonster } from "@/types/campaign";

export interface CustomMonsterForm {
  name: string;
  ac: string;
  maxHp: string;
  cr: string;
  notes: string;
}

const FRACTIONS: Readonly<Record<string, string>> = {
  "1/8": "0.125",
  "1/4": "0.25",
  "1/2": "0.5",
};

/** A Challenge Rating as the library stores it ("0.25", "5"); undefined when blank,
 *  null when it is not one the rules print (0 to 30, or 1/8, 1/4, 1/2). */
export function parseCrInput(text: string): string | undefined | null {
  const s = text.trim();
  if (!s) return undefined;
  const fraction = FRACTIONS[s];
  if (fraction) return fraction;
  if (s === "0.125" || s === "0.25" || s === "0.5") return s;
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n <= 30 ? String(n) : null;
}

/** The ranges the form accepts for the two whole numbers. */
export const AC_RANGE = { min: 0, max: 40 } as const;
export const MAX_HP_RANGE = { min: 1, max: 9999 } as const;

const whole = (text: string, min: number, max: number): number | null => {
  const s = text.trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
};

/** The library template the form describes, or null while it is not one. */
export function customMonsterFromForm(
  form: CustomMonsterForm,
  before?: CustomMonster
): CustomMonster | null {
  const name = form.name.trim();
  const ac = whole(form.ac, AC_RANGE.min, AC_RANGE.max);
  const maxHp = whole(form.maxHp, MAX_HP_RANGE.min, MAX_HP_RANGE.max);
  const cr = parseCrInput(form.cr);
  if (!name || ac === null || maxHp === null || cr === null) return null;
  const notes = form.notes.trim();
  // An edit keeps the rest of the template; the form owns the CR and the notes.
  const kept: Partial<CustomMonster> = { ...before };
  delete kept.cr;
  delete kept.notes;
  return {
    ...kept,
    name,
    ac,
    maxHp,
    ...(cr ? { cr } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** The typed fields the form cannot take (blank is not wrong, only unfinished). */
export function customMonsterFormErrors(form: CustomMonsterForm): {
  ac: boolean;
  maxHp: boolean;
  cr: boolean;
} {
  const wrong = (text: string, range: { min: number; max: number }) =>
    text.trim() !== "" && whole(text, range.min, range.max) === null;
  return {
    ac: wrong(form.ac, AC_RANGE),
    maxHp: wrong(form.maxHp, MAX_HP_RANGE),
    cr: parseCrInput(form.cr) === null,
  };
}

/** The form's text for an existing template (empty for a new one). */
export function customMonsterToForm(monster?: CustomMonster): CustomMonsterForm {
  if (!monster) return { name: "", ac: "", maxHp: "", cr: "", notes: "" };
  const cr = monster.cr
    ? (Object.entries(FRACTIONS).find(([, v]) => v === monster.cr)?.[0] ?? monster.cr)
    : "";
  return {
    name: monster.name,
    ac: String(monster.ac),
    maxHp: String(monster.maxHp),
    cr,
    notes: monster.notes ?? "",
  };
}
