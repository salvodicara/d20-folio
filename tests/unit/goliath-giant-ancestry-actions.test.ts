/**
 * Goliath Giant Ancestry: the chosen giant's boon is a real action row.
 *
 * The cases come from the trait's own picker (its `choice-grant-bundle` options
 * and their catalogue labels): a Goliath who chose an option gets exactly one
 * Giant Ancestry row naming that boon, spending the trait's shared
 * Proficiency-Bonus-per-Long-Rest counter; the other five boons stay hidden.
 */
import { describe, expect, it } from "vitest";
import { getRace } from "@/data/races";
import { asRaceId } from "@/data/srd-names";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeText } from "@/lib/views/srd-i18n";
import { makeCharacterDoc } from "./_helpers";
import { srd } from "../_harness/loc";

const BUNDLE_KEY = "goliath-giant-ancestry";
const TRACKER_ID = "race:goliath:giant-ancestry";

const trait = getRace("goliath")?.traits.find((t) => t.id === "giant-ancestry");
const bundle = trait?.grants?.find((g) => g.type === "choice-grant-bundle");
const optionIds =
  bundle?.type === "choice-grant-bundle" ? bundle.options.map((o) => o.id) : [];

function goliathRows(choice?: string) {
  const doc = makeCharacterDoc(
    { race: asRaceId("goliath"), level: 5 },
    choice ? { grantBundleChoices: { [BUNDLE_KEY]: choice } } : {}
  );
  return resolveActions(doc).filter((a) => a.id.startsWith(`${TRACKER_ID}-`));
}

describe("Goliath Giant Ancestry → one action row for the chosen boon", () => {
  it("the picker offers the six giants", () => {
    expect(optionIds).toHaveLength(6);
  });

  it("no choice yet → no Giant Ancestry row", () => {
    expect(goliathRows()).toEqual([]);
  });

  for (const optionId of optionIds) {
    const label = srd(
      "race",
      `goliath.traits.giant-ancestry.grants.0.options.${optionId}`,
      "label",
      "en"
    );
    it(`${label}: one row naming the boon, on the shared PB / Long Rest counter`, () => {
      const rows = goliathRows(optionId);
      expect(rows).toHaveLength(1);
      const [row] = rows;
      const effect = row?.summary.effect;
      expect(effect && localizeText(effect, "en")).toContain(label);
      expect(row?.costTracker).toBe(TRACKER_ID);
      // Level 5 → Proficiency Bonus 3.
      expect(row?.summary.uses).toMatchObject({ current: 3, total: 3 });
    });
  }

  it("each boon keeps its action economy (Bonus / on-hit / Reaction)", () => {
    const typeOf = (id: string) => goliathRows(id)[0]?.type;
    expect(typeOf("clouds-jaunt")).toBe("bonus");
    for (const id of ["fires-burn", "frosts-chill", "hills-tumble"]) {
      expect(typeOf(id)).toBe("free");
    }
    for (const id of ["stones-endurance", "storms-thunder"]) {
      expect(typeOf(id)).toBe("reaction");
      // "when you take damage": the reaction row says so.
      const trigger = goliathRows(id)[0]?.summary.trigger;
      expect(trigger && localizeText(trigger, "en")).toBeTruthy();
    }
  });
});
