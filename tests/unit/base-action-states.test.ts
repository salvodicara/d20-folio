import { describe, expect, it } from "vitest";
import { BASE_ACTION_STATES, baseActionText } from "@/lib/base-action-states";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { MOCK_CHARACTER } from "@/lib/mock";
import { resolveActions } from "@/lib/smart-tracker";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { localizeText } from "@/lib/views/srd-i18n";
import type { Locale } from "@/lib/locale";

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

/** The rail lines a lit state adds, in `locale`. */
const railLines = (actionId: string, activeKey: string, locale: Locale): string[] => {
  const on = doc([activeKey]);
  const aggregate = aggregateCharacterGrants(on.character, on.session);
  return [
    ...aggregate.advantages,
    ...aggregate.disadvantages,
    ...aggregate.incomingAttackDisadvantages,
  ]
    .filter((clause) => clause.sourceId === actionId)
    .map((clause) => localizeText(clause.description, locale));
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
      const en = railLines(actionId, state.grant.activeKey, "en");
      const it = railLines(actionId, state.grant.activeKey, "it");
      expect(en).toHaveLength(state.grant.grants.length);
      for (const line of en) expect(line).not.toMatch(/^(dis)?advantage\b/i);
      for (const line of it) expect(line).not.toMatch(/^(s)?vantaggio\b/i);
    });

    it("its log lines and chips name it in each language, never by its id", () => {
      for (const locale of ["en", "it"] as const) {
        const name = localizeText(baseActionText(actionId, "name"), locale);
        expect(grantSourceLabel(state.grant.activeKey, locale)).toBe(name);
        expect(name).not.toBe(actionId);
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

it("Dodge names itself and its rules in both languages", () => {
  expect(grantSourceLabel("base-dodge", "en")).toBe("Dodge");
  expect(grantSourceLabel("base-dodge", "it")).toBe("Schivata");
  expect(railLines("base-dodge", "base-dodge", "en")).toEqual(
    expect.arrayContaining([
      "Attacks against you have Disadvantage (Dodge)",
      "Dexterity saving throws (Dodge)",
    ])
  );
  expect(railLines("base-dodge", "base-dodge", "it")).toEqual(
    expect.arrayContaining([
      "Gli attacchi contro di te hanno Svantaggio (Schivata)",
      "Tiri salvezza su Destrezza (Schivata)",
    ])
  );
});
