/**
 * #1451 — the roster card's max HP through the sheet's read path. The parent's `cache`
 * keeps the max stamped at its last save; a rules fix since then can lower the derive,
 * so the card parses the stored build (memoised per character and revision) and folds
 * its `combat/state` child the way the sheet's load does, then reads the effective max.
 * Loaded with `import()` from the roster, so its first paint stays off the engine.
 */
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { hydrateCompleteCharacter, parseStoredCharacter } from "@/lib/character-read";
import type { CharacterDoc } from "@/types/character";
import type { CombatState } from "@/types/combat-state";

const parsed = new Map<string, { revision: unknown; parent: Promise<CharacterDoc> }>();

/** The max HP the sheet shows for a stored character, or null when it can't be read
 *  (the card then keeps its cached max). */
export async function rosterDerivedMaxHp(
  id: string,
  data: Record<string, unknown>,
  combat: CombatState
): Promise<number | null> {
  let entry = parsed.get(id);
  if (!entry || entry.revision !== data.revision) {
    entry = { revision: data.revision, parent: parseStoredCharacter(id, data) };
    parsed.set(id, entry);
  }
  try {
    const doc = await hydrateCompleteCharacter(await entry.parent, combat);
    return effectiveMaxHp(doc.character, doc.session);
  } catch {
    return null;
  }
}
