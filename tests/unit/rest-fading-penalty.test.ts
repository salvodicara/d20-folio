/**
 * A D20 Test penalty that fades by one each Long Rest (Raise Dead, 2024: "a −4
 * penalty to all attack rolls, saving throws, and ability checks. Every time the
 * creature finishes a Long Rest, the penalty is reduced by 1 until it disappears").
 * The cases come from the catalogue text: every spell whose English text carries a
 * penalty that a Long Rest reduces by 1 has a fading status that starts at the
 * printed amount, lowers every D20 Test by it, and counts down to nothing.
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
import { MOCK_CHARACTER } from "@/lib/mock";
import { deathSaveD20Context } from "@/lib/character-d20-tests";
import {
  FADING_PENALTIES,
  fadingPenaltiesAfterLongRest,
  startFadingPenalty,
  endFadingPenalty,
} from "@/lib/play/fading-penalties";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { longRestCharacter, shortRestCharacter } from "@/lib/play/rests";
import {
  parsePersistedPlayStateV1,
  sessionToPlayStateV1,
  stateToSession,
} from "@/lib/session-state-codec";
import { sanitizeSession } from "@/lib/sanitize-session";
import { resolveActions } from "@/lib/smart-tracker";
import { deriveCharacter } from "@/lib/views/derive-character";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

/** "a −4 penalty to all attack rolls, …" + "the penalty is reduced by 1". */
const FADES =
  /a [−-](\d+) penalty to all attack rolls, saving throws, and ability checks[^.]*\.[^.]*finishes a Long Rest, the penalty is reduced by 1/i;

function catalogueCases(): Array<{ spellId: string; amount: number }> {
  return Object.entries(spellsEn).flatMap(([spellId, value]) => {
    const match = FADES.exec(JSON.stringify(value));
    return match ? [{ spellId, amount: Number(match[1]) }] : [];
  });
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

/** Every number a D20 Test adds, keyed so two sheets compare row by row. */
function d20Numbers(doc: CharacterDoc): Map<string, number> {
  const sheet = deriveCharacter(doc);
  const numbers = new Map<string, number>();
  for (const save of sheet.saves) numbers.set(`save:${save.ability}`, save.bonus);
  for (const skill of sheet.skills) numbers.set(`skill:${skill.id}`, skill.bonus);
  numbers.set("initiative", sheet.initiativeBonus);
  for (const [key, value] of Object.entries(sheet.passives)) {
    numbers.set(`passive:${key}`, value);
  }
  if (sheet.spellcasting) numbers.set("spell-attack", sheet.spellcasting.attackBonus);
  // Every attack row the Play board offers: weapons, unarmed, spell attacks.
  for (const row of resolveActions(doc)) {
    const bonus = row.summary.attackBonus;
    if (typeof bonus === "number") numbers.set(`attack:${row.id}`, bonus);
  }
  const death = deathSaveD20Context(doc).modifierTerms.reduce((s, t) => s + t.value, 0);
  numbers.set("death-save", death);
  return numbers;
}

const withPenalty = (doc: CharacterDoc, id: string, amount: number): CharacterDoc => ({
  ...doc,
  session: { ...doc.session, fadingPenalties: { [id]: amount } },
});

describe("the catalogue's fading D20 Test penalties", () => {
  const cases = catalogueCases();

  it("finds Raise Dead's −4", () => {
    expect(cases).toContainEqual({ spellId: "raise-dead", amount: 4 });
  });

  it.each(cases.map((c) => [c.spellId, c] as const))(
    "%s: a status starting at the printed amount, fading by 1 each Long Rest",
    (_id, c) => {
      expect(FADING_PENALTIES[c.spellId]?.start).toBe(c.amount);
      let doc = {
        ...MOCK_CHARACTER,
        session: must(startFadingPenalty(MOCK_CHARACTER, c.spellId)),
      };
      const amounts: number[] = [];
      // Bounded: a rest that never counts down fails here instead of hanging.
      for (
        let rest = 0;
        rest < 10 && doc.session.fadingPenalties?.[c.spellId] !== undefined;
        rest += 1
      ) {
        amounts.push(doc.session.fadingPenalties[c.spellId] ?? 0);
        doc = longRestCharacter(doc);
      }
      expect(amounts).toEqual(Array.from({ length: c.amount }, (_, i) => c.amount - i));
      expect(doc.session.fadingPenalties).toBeUndefined();
    }
  );

  it.each(cases.map((c) => [c.spellId, c] as const))(
    "%s lowers every D20 Test by the remaining amount",
    (_id, c) => {
      const base = d20Numbers(MOCK_CHARACTER);
      expect(base.size).toBeGreaterThan(20);
      for (let amount = c.amount; amount > 0; amount -= 1) {
        const penalized = d20Numbers(withPenalty(MOCK_CHARACTER, c.spellId, amount));
        for (const [key, value] of base) {
          expect([key, penalized.get(key)]).toEqual([key, value - amount]);
        }
      }
    }
  );
});

describe("the fading penalty status", () => {
  it("a Short Rest leaves it alone", () => {
    const doc = withPenalty(MOCK_CHARACTER, "raise-dead", 3);
    expect(shortRestCharacter(doc).session.fadingPenalties).toEqual({ "raise-dead": 3 });
  });

  it("lighting it again restarts it; ending it clears it", () => {
    const doc = withPenalty(MOCK_CHARACTER, "raise-dead", 1);
    expect(must(startFadingPenalty(doc, "raise-dead")).fadingPenalties).toEqual({
      "raise-dead": 4,
    });
    expect(must(endFadingPenalty(doc, "raise-dead")).fadingPenalties).toBeUndefined();
    expect(endFadingPenalty(MOCK_CHARACTER, "raise-dead")).toBeNull();
    expect(startFadingPenalty(MOCK_CHARACTER, "fireball")).toBeNull();
  });

  it("the Long Rest law counts each entry down and drops the spent ones", () => {
    expect(fadingPenaltiesAfterLongRest({ "raise-dead": 2 })).toEqual({
      "raise-dead": 1,
    });
    expect(fadingPenaltiesAfterLongRest({ "raise-dead": 1 })).toBeUndefined();
    expect(fadingPenaltiesAfterLongRest(undefined)).toBeUndefined();
  });

  it("runs as sheet events", () => {
    const lit = applySheetEvent(MOCK_CHARACTER, {
      kind: "start-fading-penalty",
      penaltyId: "raise-dead",
    });
    expect(lit?.session.fadingPenalties).toEqual({ "raise-dead": 4 });
    const ended = applySheetEvent(must(lit), {
      kind: "set-fading-penalty",
      penaltyId: "raise-dead",
      amount: 0,
    });
    expect(ended?.session.fadingPenalties).toBeUndefined();
  });
});

describe("the store seam", () => {
  it("logs the start, and its undo removes the status and the log line", () => {
    useCharacterStore.setState({ character: MOCK_CHARACTER, readonly: false });
    const undo = useCharacterStore.getState().startFadingPenalty("raise-dead");
    const lit = must(useCharacterStore.getState().character);
    expect(lit.session.fadingPenalties).toEqual({ "raise-dead": 4 });
    expect(lit.session.logEntries.at(-1)?.event).toEqual({
      kind: "fading-penalty",
      penaltyId: "raise-dead",
      amount: 4,
    });
    must(undo)();
    const back = must(useCharacterStore.getState().character);
    expect(back.session.fadingPenalties).toBeUndefined();
    expect(back.session.logEntries).toEqual(MOCK_CHARACTER.session.logEntries);
  });
});

describe("stored data", () => {
  it("round-trips through the play-state codec and is absent when there is none", () => {
    const session = sanitizeSession({ fadingPenalties: { "raise-dead": 3 } });
    const stored = sessionToPlayStateV1(session);
    expect(stored.state.fadingPenalties).toEqual({ "raise-dead": 3 });
    const parsed = parsePersistedPlayStateV1(stored);
    expect(parsed.ok && parsed.session.fadingPenalties).toEqual({ "raise-dead": 3 });
    expect(
      sessionToPlayStateV1(sanitizeSession({})).state.fadingPenalties
    ).toBeUndefined();
    expect(
      stateToSession({ fadingPenalties: { "raise-dead": 3 } }).unknown
    ).toBeUndefined();
  });
});
