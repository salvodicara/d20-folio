/**
 * The character list on the new screen (approved prototype chars): each card's name,
 * class line (class and level, subclass), species, Hit Points, AC, speed, the campaign
 * it plays in and when it was last touched; the fallen dimmed, the retired last.
 */
import { describe, expect, it } from "vitest";
import { rosterCards } from "@/domains/roster/roster-view";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { MOCK_CHARACTER } from "@/lib/mock";

const NOW = new Date("2026-11-04T12:00:00Z").getTime();
const doc = (
  id: string,
  patch: Partial<RosterCharacterDoc> = {}
): RosterCharacterDoc => ({
  id,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-11-03T12:00:00Z"),
  portraitUrl: null,
  portraitCrop: null,
  status: "active",
  character: {
    projection: true,
    name: "Lyra Voss" as RosterCharacterDoc["character"]["name"],
    race: "elf",
    classes: [{ classId: "bard", level: 9, subclassId: "college-of-lore" }],
    ac: 17,
    speed: "30",
    hp: { max: 62 },
  },
  session: { ...MOCK_CHARACTER.session, hp: { current: 38, temp: 0 } },
  ...patch,
});

describe("rosterCards", () => {
  const [lyra] = rosterCards([doc("a")], { a: "La Rocca Senza Stelle" }, "it", NOW);
  it("names who it is: class and level, subclass, species", () => {
    expect(lyra).toMatchObject({
      id: "a",
      name: "Lyra Voss",
      classLine: "Bardo 9 · Collegio della Sapienza",
      species: "Elfo",
    });
  });
  it("its numbers: Hit Points, AC, speed in the reader's units", () => {
    expect(lyra).toMatchObject({ hp: { current: 38, max: 62 }, ac: 17, speed: "9 m" });
  });
  it("the campaign it plays in, and when it was last touched", () => {
    expect(lyra?.campaign).toBe("La Rocca Senza Stelle");
    expect(lyra?.updated).toBe("ieri");
  });
  it("the active first, then the fallen (marked), then the retired", () => {
    const cards = rosterCards(
      [
        doc("r", { status: "retired" }),
        doc("d", {
          session: {
            ...MOCK_CHARACTER.session,
            hp: { current: 0, temp: 0 },
            deathFail: 3,
          },
        }),
        doc("a"),
      ],
      {},
      "it",
      NOW
    );
    expect(cards.map((c) => [c.id, c.state])).toEqual([
      ["a", "active"],
      ["d", "fallen"],
      ["r", "retired"],
    ]);
  });
});
