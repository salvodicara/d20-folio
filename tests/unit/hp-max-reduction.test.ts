/**
 * A Hit Point maximum reduction that is not a build edit (Harm, a wight's or a
 * vampire's drain): a session fact `effectiveMaxHp` subtracts, current HP clamps
 * down to, and a Long Rest clears. The cases come from the catalogue itself: every
 * spell and monster entry whose English text reduces a target's Hit Point maximum.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import monstersEn from "@/i18n/en/srd/monsters.json";
import spellsEn from "@/i18n/en/srd/spells.json";
import {
  computeCharacterMaxHp,
  effectiveMaxHp,
  effectiveMaxHpBreakdown,
} from "@/lib/aggregate-character";
import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { longRestCharacter, shortRestCharacter } from "@/lib/play/rests";
import { setHpMaxReduction } from "@/lib/play/vitals";
import {
  parsePersistedPlayStateV1,
  sessionToPlayStateV1,
  sessionToState,
  stateToSession,
} from "@/lib/session-state-codec";
import { sanitizeSession } from "@/lib/sanitize-session";
import { useCharacterStore } from "@/stores/characterStore";
import { breakdownTotal } from "@/lib/value-breakdown";
import type { CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const REDUCES_MAX = /hit point maximum (?:is reduced|decreases) by/i;
/** The entries whose reduction outlasts a Long Rest (it needs re-entering by hand). */
const OUTLASTS_LONG_REST =
  /doesn't return to normal (?:when finishing a Long Rest|until)|gains no benefit from finishing a Long Rest/i;

interface CatalogueCase {
  key: string;
  text: string;
  /** The reduction the entry applies: its printed average, else the damage taken. */
  amount: number;
  clearsOnLongRest: boolean;
}

function entryText(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  const record = value as Record<string, unknown>;
  const text = record.text ?? record.description;
  return typeof text === "string" ? text : "";
}

/** The reduction an entry prints: "decreases by 10 (3d6)" → 10; "equal to the
 *  damage taken" → the first printed damage average in the entry. */
function printedAmount(text: string): number {
  const fixed = /maximum (?:is reduced|decreases) by (\d+)/i.exec(text);
  if (fixed) return Number(fixed[1]);
  const damage = /(\d+) \(\d+d\d+(?: \+ \d+)?\) \w+ damage/i.exec(text);
  if (damage) return Number(damage[1]);
  const dice = /(\d+)d(\d+) \w+ damage/i.exec(text);
  if (dice) return Math.floor((Number(dice[1]) * (Number(dice[2]) + 1)) / 2);
  // The damage comes from elsewhere (the Night Hag's Dream): the table enters it.
  return TABLE_ENTERED;
}

const TABLE_ENTERED = 10;

function catalogueCases(): CatalogueCase[] {
  const sources: Array<[string, unknown]> = [
    ...Object.entries(monstersEn).map(([key, value]): [string, unknown] => [
      `monster:${key}`,
      value,
    ]),
    ...Object.entries(spellsEn).map(([key, value]): [string, unknown] => [
      `spell:${key}`,
      value,
    ]),
  ];
  const cases: CatalogueCase[] = [];
  for (const [key, value] of sources) {
    const text = entryText(value);
    if (!REDUCES_MAX.test(text)) continue;
    cases.push({
      key,
      text,
      amount: printedAmount(text),
      clearsOnLongRest: !OUTLASTS_LONG_REST.test(text),
    });
  }
  return cases;
}

const UID = "test-uid";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

function withWorld(doc: CharacterDoc): CharacterDoc {
  const world = characterWorldState(
    doc,
    UID,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) throw new Error("world fixture failed");
  return { ...doc, session: { ...doc.session, world: structuredClone(world) } };
}

/** A level-10 fighter at full HP, big enough to survive every catalogue drain. */
const fighter = (session: Partial<SessionState> = {}): CharacterDoc => {
  const doc = makeCharacterDoc({ classId: "fighter", level: 10 }, session);
  const max = 120;
  return {
    ...doc,
    character: { ...doc.character, hp: { ...doc.character.hp, max } },
    session: { ...doc.session, hp: { current: max, temp: 0 }, ...session },
  };
};

describe("the catalogue's Hit Point maximum reductions", () => {
  const cases = catalogueCases();

  it("finds every entry that reduces a Hit Point maximum", () => {
    // Harm plus the monster drains (wight, specter, wraith, vampires, …).
    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect(cases.map((c) => c.key)).toContain("spell:harm");
    expect(cases.map((c) => c.key)).toContain("monster:wight.actions.life-drain");
  });

  it.each(cases.map((c) => [c.key, c] as const))(
    "%s lowers the maximum, clamps current HP, and a Long Rest behaves as the text says",
    (_key, c) => {
      for (const doc of [fighter(), withWorld(fighter())]) {
        const base = effectiveMaxHp(doc.character, doc.session);
        const session = setHpMaxReduction(doc, c.amount);
        expect(session).not.toBeNull();
        const reduced = { ...doc, session: must(session) };
        expect(effectiveMaxHp(reduced.character, reduced.session)).toBe(base - c.amount);
        expect(reduced.session.hp.current).toBe(base - c.amount);

        const rested = longRestCharacter(reduced);
        // The reduction lasts until a Long Rest; the few entries whose text
        // says it outlasts the rest are re-entered by hand afterwards.
        expect(rested.session.hpMaxReduction).toBeUndefined();
        expect(rested.session.hp.current).toBe(base);
        expect(c.clearsOnLongRest || OUTLASTS_LONG_REST.test(c.text)).toBe(true);
      }
    }
  );
});

describe("setHpMaxReduction", () => {
  it("sets the total, never below a zero maximum, and restores without healing", () => {
    const doc = fighter({ hp: { current: 50, temp: 0 } });
    const reduced = { ...doc, session: must(setHpMaxReduction(doc, 30)) };
    expect(reduced.session.hpMaxReduction).toBe(30);
    expect(reduced.session.hp.current).toBe(50); // 50 ≤ 90: no clamp

    const deeper = { ...reduced, session: must(setHpMaxReduction(reduced, 500)) };
    expect(deeper.session.hpMaxReduction).toBe(120);
    expect(effectiveMaxHp(deeper.character, deeper.session)).toBe(0);
    expect(deeper.session.hp.current).toBe(0);

    const restored = must(setHpMaxReduction(reduced, 0));
    expect(restored.hpMaxReduction).toBeUndefined();
    expect(restored.hp.current).toBe(50); // restoring the maximum is not a heal
  });

  it("is a no-op for the same total", () => {
    expect(setHpMaxReduction(fighter(), 0)).toBeNull();
    const doc = fighter({ hpMaxReduction: 7 });
    expect(setHpMaxReduction(doc, 7)).toBeNull();
  });

  it("runs as a sheet event", () => {
    const next = applySheetEvent(fighter(), { kind: "set-hp-max-reduction", total: 9 });
    expect(next?.session.hpMaxReduction).toBe(9);
    expect(next?.session.hp.current).toBe(111);
  });

  it("a Short Rest keeps the reduction", () => {
    const doc = fighter({ hpMaxReduction: 9, hp: { current: 100, temp: 0 } });
    expect(shortRestCharacter(doc).session.hpMaxReduction).toBe(9);
  });

  it("the maximum's breakdown names the reduction and still sums to the maximum", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 3 }, { hpMaxReduction: 4 });
    const parts = effectiveMaxHpBreakdown(doc.character, doc.session);
    expect(breakdownTotal(parts)).toBe(computeCharacterMaxHp(doc.character) - 4);
    expect(parts.at(-1)).toMatchObject({
      label: { term: "breakdown.hpMaxReduction" },
      value: -4,
    });
  });
});

describe("the store seam", () => {
  it("logs the reduction, and its undo restores the total, current HP and the log", () => {
    const doc = fighter();
    useCharacterStore.setState({ character: doc, readonly: false, loading: false });
    const undo = useCharacterStore.getState().setHpMaxReduction(20);
    const reduced = must(useCharacterStore.getState().character);
    expect(reduced.session.hpMaxReduction).toBe(20);
    expect(reduced.session.hp.current).toBe(100);
    expect(reduced.session.logEntries.at(-1)?.event).toEqual({
      kind: "hp-max-reduction",
      reduction: 20,
      max: 100,
    });

    undo?.();
    const restored = must(useCharacterStore.getState().character);
    expect(restored.session.hpMaxReduction).toBeUndefined();
    expect(restored.session.hp.current).toBe(120);
    expect(restored.session.logEntries).toEqual(doc.session.logEntries);
  });

  it("a read-only sheet cannot change it", () => {
    useCharacterStore.setState({ character: fighter(), readonly: true });
    expect(useCharacterStore.getState().setHpMaxReduction(5)).toBeNull();
    useCharacterStore.setState({ readonly: false });
  });
});

describe("stored data", () => {
  it("round-trips through the play-state codec and is absent when there is none", () => {
    const session = sanitizeSession({ hpMaxReduction: 12 });
    const stored = sessionToPlayStateV1(session);
    expect(stored.state.hpMaxReduction).toBe(12);
    const parsed = parsePersistedPlayStateV1(stored);
    expect(parsed.ok && parsed.session.hpMaxReduction).toBe(12);
    expect(sessionToState(sanitizeSession({})).hpMaxReduction).toBeUndefined();
    expect(stateToSession({ hpMaxReduction: 12 }).unknown).toBeUndefined();
  });
});
