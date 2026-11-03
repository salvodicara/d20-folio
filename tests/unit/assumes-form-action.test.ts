/**
 * The action that makes a form names it (edge-case family M2): Wild Shape's Bonus
 * Action carries `assumesForm`, so using it opens the form picker on any screen.
 * Wild Companion spends the same uses but makes no form.
 */
import { describe, expect, it } from "vitest";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { resolveActions } from "@/lib/smart-tracker";

function druidActions() {
  const doc = buildDevScenario("potent-druid");
  if (!doc) throw new Error("the potent-druid scenario is missing");
  return resolveActions(doc);
}

describe("assumesForm", () => {
  it("names Wild Shape on the druid's Wild Shape action", () => {
    const action = druidActions().find((a) => a.id === "druid-wild-shape-bonus");
    expect(action?.assumesForm).toBe("druid-wild-shape");
  });

  it("is absent on an action that spends the uses without a form", () => {
    const action = druidActions().find((a) => a.id === "druid-wild-companion-action");
    expect(action).toBeDefined();
    expect(action?.assumesForm).toBeUndefined();
  });
});
