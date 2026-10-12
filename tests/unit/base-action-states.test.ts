import { describe, expect, it } from "vitest";
import { BASE_ACTION_STATES } from "@/lib/base-action-states";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { MOCK_CHARACTER } from "@/lib/mock";
import { resolveActions } from "@/lib/smart-tracker";

/**
 * A base combat action that puts its user in a state (2024 Dodge: until the
 * start of your next turn, attacks against you have Disadvantage and you make
 * Dexterity saves with Advantage) lights that state on use, the state carries
 * its rules while it lasts and shows nowhere when it is off. Cases come from
 * the state table itself (docs/RULES_COVERAGE.md).
 */
const doc = (activeFeatures: string[]) => {
  const next = structuredClone(MOCK_CHARACTER);
  next.session.activeFeatures = activeFeatures;
  return next;
};

describe.each(BASE_ACTION_STATES.map((state) => [state.actionId, state]))(
  "%s",
  (actionId, state) => {
    it("the base action lights its state until the declared turn edge", () => {
      const action = resolveActions(doc([])).find((row) => row.id === actionId);
      expect(action?.activatesKey).toBe(state.grant.activeKey);
      expect(action?.activeTurnBoundary).toEqual({
        phase: state.grant.duration.phase,
        turns: state.grant.duration.turns,
      });
    });

    it("while lit, its rules apply and its chip shows", () => {
      const on = doc([state.grant.activeKey]);
      const aggregate = aggregateCharacterGrants(on.character, on.session);
      expect(aggregate.activatableGroups.map((group) => group.key)).toContain(
        state.grant.activeKey
      );
      for (const inner of state.grant.grants) {
        if (inner.type === "incoming-attack-disadvantage") {
          expect(aggregate.incomingAttackDisadvantages.length).toBeGreaterThan(0);
        }
        if (inner.type === "advantage-on") {
          expect(
            aggregate.advantages.some(
              (clause) => clause.rollType === inner.rollType && clause.vs === inner.vs
            )
          ).toBe(true);
        }
      }
    });

    it("its rail lines never repeat the Adv./Disadv. label the rail prefixes", () => {
      for (const inner of state.grant.grants) {
        if (!("description" in inner) || !inner.description) continue;
        expect(inner.description.en).not.toMatch(/^(dis)?advantage\b/i);
        expect(inner.description.it).not.toMatch(/^(s)?vantaggio\b/i);
      }
    });

    it("while off, nothing of it shows", () => {
      const off = doc([]);
      const aggregate = aggregateCharacterGrants(off.character, off.session);
      expect(aggregate.activatableGroups.map((group) => group.key)).not.toContain(
        state.grant.activeKey
      );
    });
  }
);

it("Dodge is in the table", () => {
  expect(BASE_ACTION_STATES.map((state) => state.actionId)).toContain("base-dodge");
});
