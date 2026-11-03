/**
 * The Play action slot's icon (approved prototype x-play, the 46 px framed slot), from
 * the data: a weapon its own kind, a spell or an attack by what it deals, a healing
 * spell the support mark, a class feature its class, a base action its own sign.
 */
import { describe, expect, it } from "vitest";
import { actionIcon } from "@/domains/play/action-icon";
import { playActionsView } from "@/domains/play/play-actions-view";
import { buildDevScenario } from "@/lib/dev-scenarios";

function rowsOf(scenario: string) {
  const doc = buildDevScenario(scenario);
  if (!doc) throw new Error(`the ${scenario} scenario is missing`);
  return playActionsView(doc, "en").groups.flatMap((g) => g.rows);
}

const druid = rowsOf("potent-druid");
const icon = (id: string) => {
  const row = druid.find((r) => r.id === id);
  if (!row) throw new Error(`no ${id} row`);
  return actionIcon(row);
};

describe("actionIcon", () => {
  it("an unarmed strike is a fist", () => {
    expect(icon("unarmed-strike")).toEqual({ kind: "unarmed" });
  });

  it("a spell that deals damage shows its damage type", () => {
    expect(icon("spell-produce-flame")).toEqual({ kind: "damage", type: "fire" });
  });

  it("a spell without damage or healing is a spell", () => {
    expect(icon("spell-speak-with-animals")).toEqual({ kind: "spell" });
  });

  it("a class feature shows its class", () => {
    expect(icon("druid-wild-shape-bonus")).toEqual({ kind: "class", id: "druid" });
  });

  it("a base action shows its own sign", () => {
    expect(icon("base-dash")).toEqual({ kind: "base", id: "dash" });
  });

  it("a weapon shows its own kind", () => {
    const sword = rowsOf("potent-druid")
      .map((r) => ({ ...r, action: { ...r.action, weaponId: "longsword" } }))
      .find((r) => r.id === "unarmed-strike");
    if (!sword) throw new Error("no row");
    expect(actionIcon(sword)).toEqual({ kind: "weapon", id: "longsword" });
  });

  it("a healing spell is the support mark", () => {
    const heal = druid.find((r) => r.id === "spell-speak-with-animals");
    if (!heal) throw new Error("no row");
    expect(actionIcon({ ...heal, healing: "1d8+4" })).toEqual({ kind: "heal" });
  });
});
