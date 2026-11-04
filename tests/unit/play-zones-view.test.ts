/**
 * The zones on the field, on Play's Iniziativa panel (M9): each one's spell, who cast
 * it, when it bites and whom it spares, named for the table; and the light where they
 * overlap (Daylight dispels a lower Darkness). The zones come from the encounter's
 * live effects, as the cast laid them (`zoneEffectForCast`).
 */
import { describe, expect, it } from "vitest";
import { playZonesView } from "@/domains/play/play-zones-view";
import { zoneEffectForCast } from "@/lib/zones";

const ROWS = [
  { id: "pc-me", name: "Lyra" },
  { id: "pc-bren", name: "Bren" },
  { id: "m-gob", name: "Goblin" },
];
const cast = (spellId: string, castLevel: number, casterId: string, spared?: string[]) =>
  zoneEffectForCast({
    effectId: `e-${spellId}`,
    spellId,
    actionId: `spell-${spellId}`,
    castLevel,
    caster: { kind: "pc", combatantId: casterId, memberUid: "u", characterId: "c" },
    concentration: true,
    ...(spared ? { spared } : {}),
  });

describe("playZonesView", () => {
  it("Spirit Guardians: its name, its caster, when it bites, whom it spares", () => {
    expect(
      playZonesView([cast("spirit-guardians", 3, "pc-me", ["pc-bren"])], ROWS, "it")
    ).toEqual({
      zones: [
        {
          id: "e-spirit-guardians",
          name: "Guardiani Spirituali",
          caster: "Lyra",
          triggers: ["enter", "end-turn"],
          spared: ["Bren"],
        },
      ],
      light: null,
    });
  });

  it("the light where zones overlap: Daylight over a lower Darkness", () => {
    const view = playZonesView(
      [cast("darkness", 2, "m-gob"), cast("daylight", 3, "pc-me")],
      ROWS,
      "it"
    );
    expect(view.zones.map((z) => z.caster)).toEqual(["Goblin", "Lyra"]);
    expect(view.light).toBe("bright");
  });

  it("my zone that bites on entering offers who can walk in: not me, not the spared", () => {
    const view = playZonesView(
      [cast("spirit-guardians", 3, "pc-me", ["pc-bren"])],
      [...ROWS, { id: "m-ogre", name: "Ogre", down: true }],
      "it",
      "pc-me"
    );
    expect(view.zones[0]?.enter).toEqual([{ id: "m-gob", name: "Goblin" }]);
  });

  it("someone else's zone, or one that doesn't bite on entering, offers nothing", () => {
    expect(
      playZonesView([cast("spirit-guardians", 3, "pc-me")], ROWS, "it", "pc-bren")
        .zones[0]?.enter
    ).toBeUndefined();
    expect(
      playZonesView([cast("darkness", 2, "pc-me")], ROWS, "it", "pc-me").zones[0]?.enter
    ).toBeUndefined();
  });

  it("no zones, nothing to show", () => {
    expect(playZonesView([], ROWS, "it")).toEqual({ zones: [], light: null });
  });
});
