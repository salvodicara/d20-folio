/** Recovering ammunition after a fight: half of what was spent, rounded down. */
import { describe, expect, it } from "vitest";
import {
  ammunitionRecovery,
  recoverAmmunition,
  recoveredAmmunition,
  withAmmoSpent,
} from "@/lib/play/ammunition";
import { MOCK_CHARACTER } from "@/lib/mock";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import type { CharacterDoc } from "@/types/character";

describe("recoveredAmmunition", () => {
  it("recovers half the spent ammunition, rounded down", () => {
    expect(recoveredAmmunition(7)).toBe(3);
    expect(recoveredAmmunition(20)).toBe(10);
    expect(recoveredAmmunition(1)).toBe(0);
  });

  it("recovers nothing from nothing", () => {
    expect(recoveredAmmunition(0)).toBe(0);
    expect(recoveredAmmunition(-3)).toBe(0);
  });
});

describe("the spent count and the search", () => {
  const archer = (ammoSpent?: Record<string, number>): CharacterDoc => ({
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      equipment: [
        { srdId: "arrows", quantity: 2 },
        { srdId: "arrows", quantity: 5 },
        { srdId: "bolts", quantity: 1 },
      ],
    },
    session: { ...MOCK_CHARACTER.session, ...(ammoSpent ? { ammoSpent } : {}) },
  });

  it("counts each piece spent per kind", () => {
    let session = archer().session;
    session = withAmmoSpent(session, "arrows");
    session = withAmmoSpent(session, "arrows");
    session = withAmmoSpent(session, "bolts");
    expect(session.ammoSpent).toEqual({ arrows: 2, bolts: 1 });
  });

  it("brings half of each kind back onto its first row and starts the count again", () => {
    const doc = archer({ arrows: 7, bolts: 1 });
    expect(ammunitionRecovery(doc)).toEqual([
      { itemId: "arrows", spent: 7, recovered: 3 },
    ]);
    const after = recoverAmmunition(doc);
    expect(after?.character.equipment).toEqual([
      { srdId: "arrows", quantity: 5 },
      { srdId: "arrows", quantity: 5 },
      { srdId: "bolts", quantity: 1 },
    ]);
    expect(after?.session).not.toHaveProperty("ammoSpent");
    expect(recoverAmmunition(archer())).toBeNull();
  });

  it("the count is stored with the session and read back", () => {
    const session = { ...MOCK_CHARACTER.session, ammoSpent: { arrows: 4 } };
    expect(stateToSession(sessionToState(session)).ammoSpent).toEqual({ arrows: 4 });
    expect(stateToSession(sessionToState(MOCK_CHARACTER.session))).not.toHaveProperty(
      "ammoSpent"
    );
  });
});
