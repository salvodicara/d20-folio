/**
 * The Wizard's spellbook (SRD 5.2.1 Wizard, "Spellbook"): "six level 1 Wizard spells of
 * your choice", then "two Wizard spells of your choice" each time you gain a Wizard
 * level, of a level for which you have spell slots. The sheet's spell list IS the
 * book (`prepared` marks the prepared ones, which the Prepared Spells column caps);
 * no field stores the book separately.
 *
 * A book grant's picks (Divination Savant) come on top of the free picks, and sheets
 * from before the grant marker hold them unmarked: so the book is owed the free picks
 * plus each book grant's picks to date, against every Wizard spell on the sheet (but
 * an always-prepared one, or another grant's marked pick). The sheet cannot tell a
 * level-up pick from a spell copied in by hand (a scroll, another book), so a copied
 * spell counts too: a stored wizard is never owed more than the rule gives.
 *
 * Expanding the book: once the free picks are in, a Wizard spell of a level the
 * Wizard has slots for is copied in for 2 hours and 50 GP per spell level
 * (`spellbookEntry`, `copyIntoSpellbook`).
 *
 * Pure module — no React, no store.
 */
import { getClassTable } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import { savantSpellEntitlement } from "@/lib/feat-spell-choices";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import { adjustCurrency, goldSpendDelta } from "@/lib/play/material-cost";
import type { CharacterData, CharacterDoc } from "@/types/character";

/** Spells in a level 1 Wizard's book. */
export const WIZARD_BOOK_START = 6;
/** Spells a Wizard adds to the book at each Wizard level after the first. */
export const WIZARD_BOOK_PER_LEVEL = 2;

/** The free picks a Wizard of this level has made into the book. */
export function wizardBookSize(wizardLevel: number): number {
  const level = Math.max(1, Math.min(20, Math.floor(wizardLevel)));
  return WIZARD_BOOK_START + WIZARD_BOOK_PER_LEVEL * (level - 1);
}

/** The highest spell level a Wizard of this level has slots for. */
export function wizardMaxSpellLevel(wizardLevel: number): number {
  const row = getClassTable("wizard")?.levels.find((l) => l.level === wizardLevel);
  return (row?.spellSlots ?? []).reduce((max, n, i) => (n > 0 ? i + 1 : max), 0);
}

/** A grant that adds spells to the book (a Savant feature), with what it has given by
 *  this Wizard level: its picks, plus one per new spell-slot level when it recurs. */
function bookGrantAllotments(
  character: Pick<CharacterData, "features">,
  wizardLevel: number
): Map<string, number> {
  const slots = getClassTable("wizard")?.levels.find(
    (l) => l.level === wizardLevel
  )?.spellSlots;
  const out = new Map<string, number>();
  for (const f of character.features) {
    if (!("srdId" in f) || out.has(f.srdId)) continue;
    for (const g of getSrdFeatureSource(f.srdId)?.grants ?? []) {
      if (g.type !== "choice-spell" || !g.toSpellbook) continue;
      const count =
        g.recurringPerSpellLevel !== undefined
          ? savantSpellEntitlement(slots, g.amount, g.maxLevel).count
          : g.amount;
      out.set(f.srdId, (out.get(f.srdId) ?? 0) + count);
    }
  }
  return out;
}

/** The spells a grant has added to the book by this Wizard level (Divination Savant:
 *  2 at level 3, then 1 per new spell-slot level). */
export function wizardBookAllotment(
  character: Pick<CharacterData, "features">,
  wizardLevel: number
): number {
  let total = 0;
  for (const n of bookGrantAllotments(character, wizardLevel).values()) total += n;
  return total;
}

/**
 * The levelled Wizard spells in the book: every levelled Wizard spell on the sheet
 * except the always-prepared ones and the picks another grant marked as its own
 * (Magic Initiate's spell is not in the book). A book grant's picks count: they are
 * in the book, on top of the free picks; an older pick with no marker counts too.
 */
export function wizardBookSpellCount(
  character: Pick<CharacterData, "spells" | "features">
): number {
  const bookSources = new Set(bookGrantAllotments(character, 20).keys());
  let count = 0;
  for (const s of character.spells) {
    if ("custom" in s || s.alwaysPrepared) continue;
    if (s.grantedBy && !bookSources.has(s.grantedBy)) continue;
    const data = getSpellById(s.srdId);
    if (data && data.level > 0 && data.classes.includes("wizard")) count += 1;
  }
  return count;
}

/** The book spells a Wizard of this level still owes: the free picks and the book
 *  grants' picks to date, less the book spells on the sheet. Never negative. */
export function wizardBookOwed(
  character: Pick<CharacterData, "spells" | "features">,
  wizardLevel: number
): number {
  return Math.max(
    0,
    wizardBookSize(wizardLevel) +
      wizardBookAllotment(character, wizardLevel) -
      wizardBookSpellCount(character)
  );
}

/** Levelled spells prepared against the limit (the Spells tab's count: always-prepared
 *  spells and cantrips never count). */
export function preparedLevelledCount(character: Pick<CharacterData, "spells">): number {
  return character.spells.filter((s) => {
    if (s.prepared !== true) return false;
    if ("custom" in s) return s.level > 0;
    return !s.alwaysPrepared && (getSpellById(s.srdId)?.level ?? 0) > 0;
  }).length;
}

// ─── Copying a spell into the book ───────────────────────────────────────────

/** SRD 5.2.1 Wizard, "Expanding the Book": per spell level, 2 hours and 50 GP. */
export const COPY_HOURS_PER_LEVEL = 2;
export const COPY_GP_PER_LEVEL = 50;

export function spellbookCopyCost(level: number): { hours: number; gp: number } {
  return { hours: COPY_HOURS_PER_LEVEL * level, gp: COPY_GP_PER_LEVEL * level };
}

/**
 * What adding this spell is for the character's Wizard: one of the book's free picks
 * while the book still owes them (`free`, no cost: the level-up's two spells), else a
 * copy at its cost, with whether the gold (or platinum broken into it) covers it.
 * Null when there is nothing to copy: not a Wizard, not a levelled Wizard spell, a
 * level the Wizard has no slots for, or a spell already on the sheet.
 */
export function spellbookEntry(
  doc: CharacterDoc,
  spellId: string
):
  | { kind: "free" }
  | { kind: "copy"; hours: number; gp: number; affordable: boolean }
  | null {
  const wizardLevel = doc.character.classes.find((c) => c.classId === "wizard")?.level;
  if (!wizardLevel) return null;
  const spell = getSpellById(spellId);
  if (!spell || spell.level < 1 || !spell.classes.includes("wizard")) return null;
  if (spell.level > wizardMaxSpellLevel(wizardLevel)) return null;
  if (doc.character.spells.some((s) => !("custom" in s) && s.srdId === spellId))
    return null;
  if (wizardBookOwed(doc.character, wizardLevel) > 0) return { kind: "free" };
  const cost = spellbookCopyCost(spell.level);
  return {
    kind: "copy",
    ...cost,
    affordable: goldSpendDelta(doc.session.currency, cost.gp) !== null,
  };
}

/**
 * The character with the spell copied into the book (on the sheet, not prepared,
 * as any added spell) and, when `pay`, its cost taken from the gold (platinum broken
 * when the gold falls short). Null when it is not a copy (`spellbookEntry`), or when
 * paying and the purse does not hold the cost. Copying without paying leaves the
 * coins for the table to settle.
 */
export function copyIntoSpellbook(
  doc: CharacterDoc,
  spellId: string,
  { pay }: { pay: boolean }
): CharacterDoc | null {
  const entry = spellbookEntry(doc, spellId);
  if (entry?.kind !== "copy") return null;
  let session = doc.session;
  if (pay) {
    const delta = goldSpendDelta(session.currency, entry.gp);
    if (!delta) return null;
    session = adjustCurrency(session, delta) ?? session;
  }
  return {
    ...doc,
    character: {
      ...doc.character,
      spells: [...doc.character.spells, { srdId: spellId }],
    },
    session,
  };
}
