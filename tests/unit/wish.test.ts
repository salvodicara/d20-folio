/**
 * Wish (2024) — the cases come from the catalogue: the spell list in `src/data/spells`
 * and the level cap in Wish's own text ("duplicate any spell of 8th level or lower").
 * The basic use duplicates any spell up to that cap with no slot of its own (the Wish
 * cast already spent the 9th-level slot); any other use lights Wish Stress, which a
 * Long Rest ends and which reminds the caster of 1d10 Necrotic per level of each
 * spell cast meanwhile.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import spellsEn from "@/i18n/en/srd/spells.json";
import { spells } from "@/data/spells";
import {
  WISH_ID,
  pendingWish,
  setWishStress,
  wishDuplicatePool,
  wishDuplicateSpellIds,
  wishStressDice,
} from "@/lib/play/wish";
import { WISH_STRESS_STATE, isWishStressed } from "@/lib/wish-state";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { longRestCharacter, shortRestCharacter } from "@/lib/play/rests";
import { MOCK_CHARACTER } from "@/lib/mock";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import type { CharacterDoc, LogEntry } from "@/types/character";

const wishText =
  (spellsEn as unknown as Record<string, { description: string }>)[WISH_ID]
    ?.description ?? "";
/** "duplicate any spell of 8th level or lower" → 8. */
const cap = Number(/duplicate any spell of (\d)th level or lower/.exec(wishText)?.[1]);

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const stressed = (doc: CharacterDoc): CharacterDoc => ({
  ...doc,
  session: must(setWishStress(doc, true)),
});

describe("Wish duplicates any spell up to its cap", () => {
  it("reads the cap from Wish's own text", () => {
    expect(cap).toBe(8);
  });

  it("offers every catalogue spell of the cap or lower, and none above", () => {
    const offered = wishDuplicateSpellIds();
    const expected = spells.filter((spell) => spell.level <= cap).map((s) => s.id);
    expect([...offered].sort()).toEqual([...expected].sort());
    const levels = new Map(spells.map((spell) => [spell.id, spell.level]));
    expect(offered.every((id) => (levels.get(id) ?? 99) <= cap)).toBe(true);
    for (const spell of spells.filter((s) => s.level > cap)) {
      expect(offered).not.toContain(spell.id);
    }
    expect(offered).not.toContain(WISH_ID);
  });

  it("is a picker pool that costs nothing more than the Wish cast", () => {
    const pool = wishDuplicatePool();
    expect(pool).toMatchObject({ sourceId: WISH_ID, maxSpellLevel: cap });
    expect(pool.spellIds).toEqual(wishDuplicateSpellIds());
    expect(pool.payment).toBeUndefined();
    expect(Object.values(pool.costBySpell).every((cost) => cost <= pool.remaining)).toBe(
      true
    );
  });
});

describe("the Wish follow-up", () => {
  const entry = (id: string, key: string): LogEntry => ({
    id,
    ts: 0,
    event: {
      kind: "action-use",
      action: { srd: { kind: "spell", key, field: "name" } },
      slot: "action",
      effect: "spell-cast",
    },
  });
  const turn: LogEntry = { id: "t", ts: 0, event: { kind: "turn-end", round: 2 } };

  it("waits on the latest Wish cast of this turn until another use follows it", () => {
    expect(pendingWish([turn, entry("w", WISH_ID)])).toBe("w");
    expect(pendingWish([entry("w", WISH_ID), entry("f", "fireball")])).toBeNull();
    expect(pendingWish([entry("w", WISH_ID), turn])).toBeNull();
    expect(pendingWish([entry("f", "fireball")])).toBeNull();
    expect(pendingWish([])).toBeNull();
  });
});

describe("Wish Stress", () => {
  it("is a one-tap state with its name on the rail, lit by the sheet event", () => {
    const doc = MOCK_CHARACTER;
    expect(isWishStressed(doc.session)).toBe(false);
    const lit = applySheetEvent(doc, { kind: "set-wish-stress", stressed: true });
    expect(isWishStressed(must(lit).session)).toBe(true);
    const groups = aggregateCharacterGrants(
      must(lit).character,
      must(lit).session
    ).activatableGroups;
    expect(groups).toContainEqual(
      expect.objectContaining({ key: WISH_STRESS_STATE.activeKey, active: true })
    );
    expect(grantSourceLabel(WISH_STRESS_STATE.activeKey, "it")).toBe(
      "Stress di Desiderio"
    );
    expect(grantSourceLabel(WISH_STRESS_STATE.activeKey, "en")).toBe("Wish Stress");
  });

  it("lasts until a Long Rest, not a Short Rest", () => {
    const doc = stressed(MOCK_CHARACTER);
    expect(isWishStressed(shortRestCharacter(doc).session)).toBe(true);
    expect(isWishStressed(longRestCharacter(doc).session)).toBe(false);
  });

  it("costs 1d10 Necrotic per level of each later spell, nothing for a cantrip", () => {
    expect(wishStressDice(3)).toBe(3);
    expect(wishStressDice(9)).toBe(9);
    expect(wishStressDice(0)).toBe(0);
  });
});
