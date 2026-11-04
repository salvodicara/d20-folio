/** A turn change fires the zones that trigger on it (edge-case M9). */
import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import { zoneTurnHits, type ZoneInstance } from "@/lib/zones";

function zoneOf(spellId: string, spared: string[] = []): ZoneInstance {
  const zone = getSpellById(spellId)?.zone;
  if (!zone) throw new Error(`no zone ${spellId}`);
  return {
    id: `${spellId}-1`,
    spellId,
    zone,
    casterId: "pc-me",
    castLevel: zone.spellLevel,
    spared,
  };
}

describe("zone turn hits", () => {
  it("a zone that triggers at the end of a turn fires on the creature whose turn ended", () => {
    const guardians = zoneOf("spirit-guardians", ["pc-me"]);
    const { hits, ledger } = zoneTurnHits(
      [guardians],
      { round: 2, ended: "goblin", started: "pc-me" },
      {}
    );
    expect(hits).toEqual([{ zone: guardians, creatureId: "goblin", kind: "end-turn" }]);
    // Once per turn: the same moment again fires nothing.
    expect(
      zoneTurnHits([guardians], { round: 2, ended: "goblin", started: "pc-me" }, ledger)
        .hits
    ).toEqual([]);
  });

  it("spares the caster's chosen and ignores moments it doesn't list", () => {
    const guardians = zoneOf("spirit-guardians", ["pc-ally"]);
    expect(
      zoneTurnHits([guardians], { round: 1, ended: "pc-ally", started: "goblin" }, {})
        .hits
    ).toEqual([]);
  });
});
