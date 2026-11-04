/**
 * Giant Insect, spider (SRD 5.2.1): "Web Bolt … the target's Speed is 0 until the
 * start of the insect's next turn." That standing effect is entered by the attack,
 * never by casting the spell: a state naming its entering rows
 * (`activatedByAction`) is skipped by the cast.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import { GIANT_INSECT } from "@/data/spells/companions";
import { translateSpell } from "@/lib/activities";
import { resolveActions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

describe("Web Bolt's Speed 0", () => {
  it("the attack names the state it enters", () => {
    const spider = GIANT_INSECT.variants?.find((v) => v.variantId === "spider");
    const web = spider?.attacks?.find((a) => a.id === "web-bolt");
    expect(web?.effects).toEqual([
      {
        kind: "speed-zero",
        activeKey: "giant-insect-web-bolt",
        until: { phase: "turn-start", anchor: "actor" },
      },
    ]);
    const state = getSpellById("giant-insect")?.grants?.find(
      (g) => g.type === "while-active"
    );
    expect(state).toMatchObject({
      activeKey: "giant-insect-web-bolt",
      recipient: "selected",
      activatedByAction: ["web-bolt"],
      grants: [{ type: "speed-cap", maxFt: 0 }],
    });
  });

  it("casting Giant Insect lights nothing", () => {
    const spell = getSpellById("giant-insect");
    if (!spell) throw new Error("no Giant Insect");
    const statuses = translateSpell(spell).activity.effects.filter(
      (e) => e.kind === "status"
    );
    expect(statuses).toEqual([]);
    const doc = makeCharacterDoc({
      classId: "druid",
      level: 7,
      spells: [{ srdId: "giant-insect", prepared: true }] as never,
    });
    const cast = resolveActions(doc).find((a) => a.id === "spell-giant-insect");
    expect(cast).toBeDefined();
    expect(cast?.activatesKey).toBeUndefined();
    expect(cast?.standingEffect).toBeUndefined();
  });
});
