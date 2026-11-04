/**
 * A reaction spell can answer several triggers (Moment of Prescience: a creature's
 * failed D20 Test or an attack hitting you). The data lists them; the Activity
 * keeps the first as its line and all of them for readers that offer reactions.
 */
import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import type { SrdSpellData } from "@/data/types";
import { activityFromSpell } from "@/lib/activities/from-spell";

const shield = getSpellById("shield");
if (!shield) throw new Error("no shield");

describe("several reaction triggers", () => {
  it("one token stays one trigger", () => {
    expect(activityFromSpell(shield).cost).toMatchObject({
      trigger: "hitOrMagicMissileTarget",
    });
    expect(activityFromSpell(shield).cost.triggers).toBeUndefined();
  });

  it("several tokens: the first is the line, all of them are offered", () => {
    const spell: SrdSpellData = {
      ...shield,
      reactionTrigger: ["takeDamage", "hitByAttack"],
    };
    expect(activityFromSpell(spell).cost).toMatchObject({
      trigger: "takeDamage",
      triggers: ["takeDamage", "hitByAttack"],
    });
  });
});

describe("the reaction line", () => {
  it("joins several triggers with «or» in both languages", async () => {
    const { localizeAction } = await import("@/lib/views/combat-action-view");
    const { resolveActions } = await import("@/lib/smart-tracker");
    const { makeCharacterDoc } = await import("./_helpers");
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 5,
      spells: [{ srdId: "shield", prepared: true }] as never,
    });
    const raw = resolveActions(doc, "combat").find((a) => a.id === "spell-shield");
    if (!raw) throw new Error("no shield action");
    const both = {
      ...raw,
      summary: {
        ...raw.summary,
        triggers: [
          { ui: "combat.reactionTrigger_hitByAttack" },
          { ui: "combat.reactionTrigger_takeDamage" },
        ],
      },
    };
    expect(localizeAction(both, "en").summary.trigger).toMatch(/ or /);
    expect(localizeAction(both, "it").summary.trigger).toMatch(/ oppure /);
    const { localizeText } = await import("@/lib/views/srd-i18n");
    expect(localizeAction(raw, "en").summary.trigger).toBe(
      localizeText({ ui: "combat.reactionTrigger_hitOrMagicMissileTarget" }, "en")
    );
  });
});
