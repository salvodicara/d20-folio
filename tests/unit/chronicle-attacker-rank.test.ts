/**
 * rankAttackers — the order of the "Who struck?" chips on a chronicle damage line.
 * The likely attacker leads (the current combatant / the derived attacker), then the
 * target's opponents; the target's own side sits behind "More…" so a fight with six
 * goblins doesn't bury the one PC who could have landed the hit.
 */
import { describe, it, expect } from "vitest";
import { rankAttackers } from "@/lib/views/combat-chronicle-view";

const pc = (id: string) => ({ id, kind: "pc" as const });
const goblin = (id: string, side?: "ally" | "enemy") => ({
  id,
  kind: "monster" as const,
  side,
});
const ids = (xs: ReadonlyArray<{ id: string }>) => xs.map((x) => x.id);

describe("rankAttackers", () => {
  const rows = [
    pc("lyra"),
    goblin("g1"),
    pc("bren"),
    goblin("g2"),
    goblin("wolf", "ally"),
  ];

  it("puts the preselected attacker first, then the target's opponents; same side goes to more", () => {
    const { primary, more } = rankAttackers(rows, "g1", "bren");
    expect(ids(primary)).toEqual(["bren", "lyra", "wolf"]);
    expect(ids(more)).toEqual(["g2"]);
  });

  it("ranks monsters first when a PC takes the hit", () => {
    const { primary, more } = rankAttackers(rows, "lyra", "g2");
    expect(ids(primary)).toEqual(["g2", "g1"]);
    expect(ids(more)).toEqual(["bren", "wolf"]);
  });

  it("keeps a same-side preselect in front (friendly fire is still the DM's call)", () => {
    const { primary, more } = rankAttackers(rows, "g1", "g2");
    expect(ids(primary)).toEqual(["g2", "lyra", "bren", "wolf"]);
    expect(ids(more)).toEqual([]);
  });

  it("never offers the target itself, nor a missing preselect", () => {
    const { primary, more } = rankAttackers(rows, "g1", "g1");
    expect([...ids(primary), ...ids(more)]).not.toContain("g1");
    expect(ids(primary)).toEqual(["lyra", "bren", "wolf"]);
  });

  it("offers everyone in front when the target is unknown", () => {
    const { primary, more } = rankAttackers(rows, "gone", null);
    expect(ids(primary)).toEqual(["lyra", "g1", "bren", "g2", "wolf"]);
    expect(more).toEqual([]);
  });
});
