/**
 * Escape a grapple (SRD 5.2.1 "Unarmed Strike": a Grappled creature can use its
 * action to make a Strength (Athletics) or Dexterity (Acrobatics) check against
 * the grapple's escape DC, ending the condition on itself on a success; "D20
 * Tests": a total that equals or exceeds the DC succeeds). The base action is on
 * the board only while the character is Grappled.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import {
  ESCAPE_GRAPPLE_ACTION_ID,
  ESCAPE_GRAPPLE_SKILLS,
  escapeGrappleSkill,
  judgeEscapeGrapple,
} from "@/lib/play/escape-grapple";
import { localizeActions } from "@/lib/views/combat-action-view";
import { economyActionCategory } from "@/lib/combat-economy";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function withConditions(conditions: string[]): CharacterDoc {
  return { ...MOCK_CHARACTER, session: { ...MOCK_CHARACTER.session, conditions } };
}

describe("escape a grapple", () => {
  it("is the two skills the rule names", () => {
    expect(ESCAPE_GRAPPLE_SKILLS).toEqual(["athletics", "acrobatics"]);
  });

  it("rolls the better of Athletics and Acrobatics", () => {
    for (const [athletics, acrobatics, skill, bonus] of [
      [5, 2, "athletics", 5],
      [1, 4, "acrobatics", 4],
      [3, 3, "athletics", 3],
    ] as const) {
      const bonuses: Record<string, number> = { athletics, acrobatics };
      expect(escapeGrappleSkill((id) => bonuses[id] ?? 0)).toEqual({ skill, bonus });
    }
  });

  it("succeeds when the total equals or exceeds the escape DC", () => {
    expect(judgeEscapeGrapple(8, 5, 13)).toEqual({ total: 13, escaped: true });
    expect(judgeEscapeGrapple(7, 5, 13)).toEqual({ total: 12, escaped: false });
    expect(judgeEscapeGrapple(20, 0, 14)).toEqual({ total: 20, escaped: true });
  });

  it("is on the board only while Grappled, as an action", () => {
    const free = localizeActions(withConditions([]), "it").map((a) => a.id);
    expect(free).not.toContain(ESCAPE_GRAPPLE_ACTION_ID);
    const grappled = localizeActions(withConditions(["grappled"]), "it").find(
      (a) => a.id === ESCAPE_GRAPPLE_ACTION_ID
    );
    expect(grappled).toMatchObject({ name: "Liberati", type: "action" });
    expect(grappled && economyActionCategory(grappled)).toBeNull();
  });
});
