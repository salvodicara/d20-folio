/**
 * The campaign's table rules reach the open sheet (edge-case M16): a composed read
 * field the codec never stores, set by an idempotent setter; the consumers read it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkSucceeded } from "@/lib/play/checks";
import { sessionToState } from "@/lib/session-state-codec";
import { resolveActions } from "@/lib/smart-tracker";
import { effectiveTableRules } from "@/lib/table-rules";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const potionDoc = () =>
  makeCharacterDoc({
    equipment: [
      { srdId: "potion-of-healing", instanceId: "p1", quantity: 1, equipped: false },
    ],
  });

beforeEach(() => {
  useCharacterStore.setState({ character: potionDoc(), readonly: false });
});

describe("table rules on the sheet", () => {
  const actionPotions = effectiveTableRules({
    tableRules: { potions: { drink: "action" } },
  });

  it("are never stored with the play state", () => {
    const doc = potionDoc();
    const state = sessionToState({ ...doc.session, tableRules: actionPotions });
    expect(state).not.toHaveProperty("tableRules");
  });

  it("the setter projects them once and publishes nothing when unchanged", () => {
    const id = useCharacterStore.getState().character?.id ?? "";
    useCharacterStore.getState().setTableRules(id, actionPotions);
    const first = useCharacterStore.getState().character;
    expect(first?.session.tableRules?.potions.drink).toBe("action");
    useCharacterStore.getState().setTableRules(id, { ...actionPotions });
    expect(useCharacterStore.getState().character).toBe(first);
    useCharacterStore.getState().setTableRules(id, null);
    expect(useCharacterStore.getState().character?.session).not.toHaveProperty(
      "tableRules"
    );
  });

  it("a table that makes drinking a potion an action changes its row", () => {
    const slot = (rules?: typeof actionPotions) => {
      const doc = potionDoc();
      const withRules = rules
        ? { ...doc, session: { ...doc.session, tableRules: rules } }
        : doc;
      return resolveActions(withRules, "combat").find((a) =>
        a.id.includes("potion-of-healing")
      )?.type;
    };
    expect(slot()).toBe("bonus");
    expect(slot(actionPotions)).toBe("action");
  });

  it("a table that makes a natural 1 fail a check is honoured", () => {
    const rules = effectiveTableRules({ tableRules: { nat1: { checks: "fail" } } });
    const check = { skill: "perception", total: 25, dc: 10, face: 1 } as never;
    expect(checkSucceeded(check)).toBe(true);
    expect(checkSucceeded(check, rules)).toBe(false);
  });
});
