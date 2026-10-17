/**
 * Cover as a one-tap, turn-scoped state (SRD 5.2.1 "Cover": Half Cover gives +2
 * to AC and Dexterity saving throws, Three-Quarters Cover +5). The cases come from
 * the cover table itself (`COVER_REFERENCE`): its numbers, cross-checked against
 * its own summary sentence, are what the sheet must add while the chip is lit.
 * Total Cover has no number to add (it only stops targeting), so it has no chip.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { COVER_REFERENCE, coverKey } from "@/data/cover";
import { COVER_STATES, coverStateKey, litCoverLevel } from "@/lib/cover-states";
import { setCover } from "@/lib/play/cover";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { MOCK_CHARACTER } from "@/lib/mock";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { deriveCharacter } from "@/lib/views/derive-character";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { srdText } from "@/lib/loc-text";
import { srd } from "@tests/_harness/loc";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

const UNTIL = { round: 3, phase: "turn-start" as const };

/** The mock pins its AC by hand; a pinned AC wins over every bonus (override-first),
 *  so the cover numbers are read on the computed AC. */
const COMPUTED: CharacterDoc = {
  ...MOCK_CHARACTER,
  character: { ...MOCK_CHARACTER.character, acOverride: null },
};

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const withSession = (doc: CharacterDoc, session: CharacterDoc["session"]) => ({
  ...doc,
  session,
});

function numbers(doc: CharacterDoc): { ac: number; dex: number; others: number[] } {
  const sheet = deriveCharacter(doc);
  const dex = must(sheet.saves.find((save) => save.ability === "DEX")).bonus;
  const others = sheet.saves
    .filter((save) => save.ability !== "DEX")
    .map((save) => save.bonus);
  return { ac: sheet.ac, dex, others };
}

/** "+2 AC and +2 Dexterity saving throws." → [2, 2]. */
function summaryNumbers(summary: string): [number, number] | null {
  const match = /\+(\d+) AC and \+(\d+) Dexterity saving throws/.exec(summary);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** The table rows that carry a number to add (Total Cover carries none). */
const cases = COVER_REFERENCE.flatMap((c) =>
  c.id === "total" || c.acBonus === null ? [] : [{ ...c, id: c.id }]
);

describe("the cover table's chips", () => {
  it("every cover level with a number has a chip, Total Cover has none", () => {
    expect(COVER_STATES.map((state) => state.level)).toEqual(cases.map((c) => c.id));
    expect(cases.map((c) => c.id)).toEqual(["half", "three-quarters"]);
  });

  it.each(cases.map((c) => [c.id, c] as const))(
    "%s: the table's numbers match its own sentence",
    (_id, c) => {
      expect(summaryNumbers(srd("rule", coverKey(c.id), "summary", "en"))).toEqual([
        c.acBonus,
        c.dexSaveBonus,
      ]);
    }
  );

  it.each(cases.map((c) => [c.id, c] as const))(
    "%s: lit, it adds its AC and Dexterity save bonus and nothing else",
    (_id, c) => {
      const base = numbers(COMPUTED);
      const lit = withSession(COMPUTED, must(setCover(COMPUTED, c.id, UNTIL)));
      const covered = numbers(lit);
      expect(covered.ac).toBe(base.ac + (c.acBonus ?? 0));
      expect(covered.dex).toBe(base.dex + (c.dexSaveBonus ?? 0));
      expect(covered.others).toEqual(base.others);
    }
  );

  it.each(cases.map((c) => [c.id, c] as const))(
    "%s: it ends at the start of your next turn and shows as a lit chip",
    (_id, c) => {
      const session = must(setCover(MOCK_CHARACTER, c.id, UNTIL));
      const key = coverStateKey(c.id);
      expect(session.activeFeatures).toContain(key);
      expect(session.effectBoundaries?.[key]).toEqual(UNTIL);
      const aggregate = aggregateCharacterGrants(MOCK_CHARACTER.character, session);
      const chip = aggregate.activatableGroups.find((group) => group.key === key);
      expect(chip?.label).toEqual(srdText("rule", coverKey(c.id), "name"));
      expect(grantSourceLabel(key, "it")).toBe(srd("rule", coverKey(c.id), "name", "it"));
    }
  );

  it.each(cases.map((c) => [c.id, c] as const))(
    "%s: off, nothing of it shows",
    (_id, c) => {
      const aggregate = aggregateCharacterGrants(
        MOCK_CHARACTER.character,
        MOCK_CHARACTER.session
      );
      expect(aggregate.activatableGroups.map((group) => group.key)).not.toContain(
        coverStateKey(c.id)
      );
    }
  );
});

describe("setting cover", () => {
  it("one level at a time: a new level replaces the other, none clears it", () => {
    const half = withSession(
      MOCK_CHARACTER,
      must(setCover(MOCK_CHARACTER, "half", UNTIL))
    );
    expect(litCoverLevel(half.session)).toBe("half");
    const three = withSession(half, must(setCover(half, "three-quarters", UNTIL)));
    expect(litCoverLevel(three.session)).toBe("three-quarters");
    expect(three.session.activeFeatures).not.toContain(coverStateKey("half"));
    expect(three.session.effectBoundaries?.[coverStateKey("half")]).toBeUndefined();
    const none = withSession(three, must(setCover(three, null, undefined)));
    expect(litCoverLevel(none.session)).toBeNull();
    expect(none.session.effectBoundaries).toBeUndefined();
    expect(numbers(none)).toEqual(numbers(MOCK_CHARACTER));
  });

  it("setting the level already lit changes nothing", () => {
    const half = withSession(
      MOCK_CHARACTER,
      must(setCover(MOCK_CHARACTER, "half", UNTIL))
    );
    expect(setCover(half, "half", UNTIL)).toBeNull();
    expect(setCover(MOCK_CHARACTER, null, undefined)).toBeNull();
  });

  it("outside a fight there is no turn edge: it stays until tapped off", () => {
    const session = must(setCover(MOCK_CHARACTER, "half", undefined));
    expect(session.effectBoundaries).toBeUndefined();
    expect(litCoverLevel(session)).toBe("half");
  });

  it("runs as a sheet event", () => {
    const next = must(
      applySheetEvent(MOCK_CHARACTER, {
        kind: "set-cover",
        level: "three-quarters",
        until: UNTIL,
      })
    );
    expect(litCoverLevel(next.session)).toBe("three-quarters");
  });

  it("the start of your next turn drops it", () => {
    const doc = withSession(
      MOCK_CHARACTER,
      must(setCover(MOCK_CHARACTER, "half", UNTIL))
    );
    useCharacterStore.setState({ character: doc, readonly: false });
    const { expired } = useCharacterStore
      .getState()
      .expireEffectBoundaries({ round: UNTIL.round, phase: "turn-start" });
    expect(expired.map((effect) => effect.activeKey)).toEqual([coverStateKey("half")]);
    expect(litCoverLevel(must(useCharacterStore.getState().character).session)).toBe(
      null
    );
  });
});
