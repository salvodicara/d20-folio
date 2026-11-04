/**
 * The Play «Condizioni» panel's view: each condition the player can take off, with
 * its effect line and, for a source-gated one the sheet can't decide, the «Non vedo la
 * fonte» answer; Exhaustion as a level 1–6; what can be added; and which conditions
 * ask «Da chi?» (a source among the fight's other combatants) when added by hand.
 */
import { describe, expect, it } from "vitest";

import { conditionsPanelView, asksSource } from "@/domains/play/play-conditions-view";
import { RAW_TABLE_RULES } from "@/lib/table-rules";
import { makeCharacterDoc } from "./_helpers";

const doc = (session: Record<string, unknown>) =>
  makeCharacterDoc({ classId: "fighter", level: 3 }, session);

describe("conditionsPanelView", () => {
  it("lists each condition with its name and first effect line", () => {
    const v = conditionsPanelView(doc({ conditions: ["poisoned"] }), "it");
    expect(v.rows).toEqual([
      { id: "poisoned", name: "Avvelenato", effect: "Svantaggio sui tiri per colpire." },
    ]);
  });

  it("asks «can't see the source» on Frightened, pressed when the table said no", () => {
    expect(
      conditionsPanelView(doc({ conditions: ["frightened"] }), "en").rows[0]?.ask
    ).toEqual({
      key: "condition:frightened",
      pressed: false,
    });
    const answered = doc({
      conditions: ["frightened"],
      seesSource: { "condition:frightened": false },
    });
    expect(conditionsPanelView(answered, "en").rows[0]?.ask?.pressed).toBe(true);
  });

  it("names a condition's source from the fight", () => {
    const v = conditionsPanelView(
      doc({ conditions: ["grappled"], conditionSources: { grappled: "ogre-1" } }),
      "en",
      { rows: [{ id: "ogre-1", name: "Ogre", conditions: [] }] }
    );
    expect(v.rows[0]?.source).toBe("Ogre");
  });

  it("shows Exhaustion as its level, counted once, and never as a plain chip to add", () => {
    const tired = conditionsPanelView(doc({ conditions: [], exhaustion: 2 }), "it");
    expect(tired.exhaustion).toEqual({ level: 2, max: 6, d20: 4, speedFt: 10 });
    expect(tired.count).toBe(1);
    expect(tired.addable).not.toContain("exhaustion");
    const fresh = conditionsPanelView(doc({ conditions: [], exhaustion: 0 }), "it");
    expect(fresh.exhaustion.level).toBe(0);
    expect(fresh.count).toBe(0);
    expect(fresh.addable).toContain("exhaustion");
  });

  it("Exhaustion follows the table's rules: its maximum and its penalties", () => {
    const rules = {
      ...RAW_TABLE_RULES,
      exhaustion: { maxLevel: 4, d20PerLevel: -1, speedFtPerLevel: -10 },
    };
    const v = conditionsPanelView(
      doc({ conditions: [], exhaustion: 3, tableRules: rules }),
      "it"
    );
    expect(v.exhaustion).toEqual({ level: 3, max: 4, d20: 3, speedFt: 30 });
  });

  it("offers every SRD condition not already held", () => {
    const v = conditionsPanelView(doc({ conditions: ["prone"] }), "en");
    expect(v.addable).not.toContain("prone");
    expect(v.addable).toContain("grappled");
  });

  it("offers the fight's other combatants as sources", () => {
    const self = doc({ conditions: [] });
    const v = conditionsPanelView(self, "en", {
      rows: [
        { id: "pc-mara", characterId: self.id, name: "Me", conditions: [] },
        { id: "ogre-1", name: "Ogre", conditions: [] },
      ],
    });
    expect(v.sources).toEqual([{ id: "ogre-1", name: "Ogre" }]);
  });
});

describe("asksSource", () => {
  it("asks for the source of Grappled, Frightened and Charmed only", () => {
    expect(["grappled", "frightened", "charmed", "prone"].filter(asksSource)).toEqual([
      "grappled",
      "frightened",
      "charmed",
    ]);
  });
});
