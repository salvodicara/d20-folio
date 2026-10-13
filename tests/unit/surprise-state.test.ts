/**
 * Surprise as a one-tap state (SRD 5.2.1 "Initiative": "If a combatant is
 * surprised by combat starting, that combatant has Disadvantage on their
 * Initiative roll"). Lit, it nets into the Initiative roll like any other
 * Disadvantage (cancelled by an Advantage, beaten by the manual override); the
 * end of the encounter clears it.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { SURPRISE_STATE, isSurprised } from "@/lib/surprise-state";
import { setSurprised } from "@/lib/play/surprise";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { initiativeRollState } from "@/lib/compute";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { MOCK_CHARACTER } from "@/lib/mock";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const roll = (doc: CharacterDoc) =>
  initiativeRollState(
    aggregateCharacterGrants(doc.character, doc.session),
    doc.character.initiativeAdvantageOverride
  );

const surprised = (doc: CharacterDoc): CharacterDoc => ({
  ...doc,
  session: must(setSurprised(doc, true)),
});

describe("Surprise", () => {
  it("is a Disadvantage on the Initiative roll, and nothing else", () => {
    expect(SURPRISE_STATE.grants).toEqual([
      expect.objectContaining({ type: "disadvantage-on", rollType: "initiative" }),
    ]);
  });

  it("lit, the Initiative roll has Disadvantage; off, it does not", () => {
    expect(roll(MOCK_CHARACTER)).toBe("none");
    const doc = surprised(MOCK_CHARACTER);
    expect(isSurprised(doc.session)).toBe(true);
    expect(roll(doc)).toBe("disadvantage");
    const off = { ...doc, session: must(setSurprised(doc, false)) };
    expect(isSurprised(off.session)).toBe(false);
    expect(roll(off)).toBe("none");
  });

  it("an Advantage on Initiative cancels it (Feral Instinct)", () => {
    const barbarian: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        activeFeatures: [],
      },
      character: {
        ...MOCK_CHARACTER.character,
        features: [
          ...MOCK_CHARACTER.character.features,
          { srdId: "barbarian-feral-instinct" },
        ],
      },
    };
    expect(roll(barbarian)).toBe("advantage");
    expect(roll(surprised(barbarian))).toBe("none");
  });

  it("the manual override still wins", () => {
    const pinned: CharacterDoc = {
      ...MOCK_CHARACTER,
      character: { ...MOCK_CHARACTER.character, initiativeAdvantageOverride: "off" },
    };
    expect(roll(surprised(pinned))).toBe("none");
  });

  it("shows as a lit chip named Surprised", () => {
    const doc = surprised(MOCK_CHARACTER);
    const aggregate = aggregateCharacterGrants(doc.character, doc.session);
    expect(aggregate.activatableGroups.map((group) => group.key)).toContain(
      SURPRISE_STATE.activeKey
    );
    expect(grantSourceLabel(SURPRISE_STATE.activeKey, "it")).toBe("Sorpreso");
    expect(grantSourceLabel(SURPRISE_STATE.activeKey, "en")).toBe("Surprised");
  });

  it("setting what is already set changes nothing; it runs as a sheet event", () => {
    expect(setSurprised(MOCK_CHARACTER, false)).toBeNull();
    const doc = surprised(MOCK_CHARACTER);
    expect(setSurprised(doc, true)).toBeNull();
    const next = must(
      applySheetEvent(MOCK_CHARACTER, { kind: "set-surprised", surprised: true })
    );
    expect(isSurprised(next.session)).toBe(true);
  });
});
