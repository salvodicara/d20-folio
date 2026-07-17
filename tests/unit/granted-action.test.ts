/**
 * ARCHITECTURE.md combat model — `granted-action` grant. Feat/feature/invocation-granted
 * actions (Shield reaction, at-will invocations) aggregate into `grantedActions`
 * as pure data the Combat page can render.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { loc } from "../_harness/loc";

const SHIELD_FEAT: GrantSource = {
  id: "feat-shield-master",
  name: { en: "Shield Caster", it: "Incantatore Scudo" },
  grants: [
    {
      type: "granted-action",
      name: { en: "Shield", it: "Scudo" },
      slot: "reaction",
      description: {
        en: "+5 AC until your next turn.",
        it: "+5 CA fino al tuo prossimo turno.",
      },
      trigger: { en: "when you are hit by an attack", it: "quando vieni colpito" },
      cost: { kind: "spell-slot", minLevel: 1 },
    },
  ],
};

describe("granted-action evaluator", () => {
  it("aggregates a granted reaction with its source, slot, cost and trigger", () => {
    const agg = evaluateGrants([SHIELD_FEAT]);
    expect(agg.grantedActions).toHaveLength(1);
    expect(agg.grantedActions[0]).toMatchObject({
      sourceId: "feat-shield-master",
      slot: "reaction",
      cost: { kind: "spell-slot", minLevel: 1 },
    });
    expect(loc(agg.grantedActions[0]?.name, "en")).toBe("Shield");
    expect(loc(agg.grantedActions[0]?.trigger, "en")).toContain("hit");
  });

  it("collects granted actions across multiple sources; empty by default", () => {
    expect(evaluateGrants([]).grantedActions).toHaveLength(0);
    const atWill: GrantSource = {
      id: "invocation-eldritch-sight",
      name: { en: "Eldritch Sight", it: "Vista Esoterica" },
      grants: [
        {
          type: "granted-action",
          name: {
            en: "Detect Magic (at will)",
            it: "Individuazione del Magico (a volontà)",
          },
          slot: "action",
          cost: { kind: "none" },
        },
      ],
    };
    const agg = evaluateGrants([SHIELD_FEAT, atWill]);
    expect(agg.grantedActions.map((a) => a.slot).sort()).toEqual(["action", "reaction"]);
  });
});
