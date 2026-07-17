/**
 * encounter-view — the PURE selector that composes the encounter STRUCTURE (PC
 * references + monster state) with each PC's LIVE merged facts into a sorted,
 * render-ready combatant list. No copy of any PC fact is ever persisted. Verifies:
 *  - a live initiative REORDER leaves the stable `currentId` pointing at the SAME
 *    combatant (the id-pointer guarantee — gotcha 6);
 *  - an absent live entry (member doc still loading) → a quiet placeholder row;
 *  - a hidden combatant is filtered for a player but present for the DM (ambush);
 *  - monster rows read from the doc; PC rows read from the live merge.
 */
import { describe, it, expect } from "vitest";
import {
  addReinforcement,
  buildEncounterView,
  type PcLive,
} from "@/features/campaigns/encounter-view";
import { removeCombatant } from "@/features/campaigns/encounter";
import type { EncounterState } from "@/types/campaign";
import { asRaceId } from "@/data/srd-names";

function pcLive(over: Partial<PcLive> = {}): PcLive {
  return {
    name: "Mara",
    ac: 15,
    maxHp: 30,
    currentHp: 30,
    tempHp: 0,
    conditions: [],
    initiative: null,
    initiativeBonus: 2,
    initiativeRoll: null,
    raceId: asRaceId("human"),
    classes: [{ classId: "bard", level: 5 }],
    portraitUrl: null,
    portraitCrop: null,
    ...over,
  };
}

/** Two PC refs + a monster; current starts on pc-mara. */
function encounter(over: Partial<EncounterState> = {}): EncounterState {
  return {
    round: 1,
    currentCombatantId: "pc-mara",
    epoch: 1,
    status: "active",
    combatants: [
      { kind: "pc", id: "pc-mara", memberUid: "mara", characterId: "char-mara" },
      { kind: "pc", id: "pc-bren", memberUid: "bren", characterId: "char-bren" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 14,
        conditions: ["prone"],
        maxHp: 7,
        tokens: [7, 3, 0],
      },
    ],
    ...over,
  };
}

describe("buildEncounterView — live merge + sort + current pointer", () => {
  it("assembles PC rows from the live merge and monster rows from the doc", () => {
    const view = buildEncounterView(
      encounter(),
      {
        "pc-mara": pcLive({ initiative: 18, currentHp: 22, conditions: ["frightened"] }),
        "pc-bren": pcLive({
          name: "Bren",
          initiative: 12,
          ac: 18,
          maxHp: 40,
          currentHp: 40,
        }),
      },
      true
    );
    const mara = view.rows.find((r) => r.id === "pc-mara");
    expect(mara).toMatchObject({
      kind: "pc",
      name: "Mara",
      ac: 15,
      initiative: 18,
      currentHp: 22,
      maxHp: 30,
      conditions: ["frightened"],
      down: false,
      memberUid: "mara",
      characterId: "char-mara",
    });
    const gob = view.rows.find((r) => r.id === "monster-1");
    expect(gob).toMatchObject({
      kind: "monster",
      name: "Goblin",
      ac: 13,
      initiative: 14,
      conditions: ["prone"],
      currentHp: 10, // 7 + 3 + 0
      maxHp: 21, // 7 × 3
      tokens: [7, 3, 0],
      down: false,
    });
  });

  it("orders by LIVE initiative (DESC, blanks last) and keeps `currentId` STABLE under a reorder", () => {
    // mara 18, goblin 14, bren blank → order mara, goblin, bren.
    const a = buildEncounterView(
      encounter(),
      {
        "pc-mara": pcLive({ initiative: 18 }),
        "pc-bren": pcLive({ name: "Bren", initiative: null }),
      },
      true
    );
    expect(a.rows.map((r) => r.id)).toEqual(["pc-mara", "monster-1", "pc-bren"]);
    expect(a.currentId).toBe("pc-mara");

    // Bren now rolls 20 → the list REORDERS, but the current pointer (an id) is unchanged:
    // it still names pc-mara, never silently jumping to whoever now sits at that index.
    const b = buildEncounterView(
      encounter(),
      {
        "pc-mara": pcLive({ initiative: 18 }),
        "pc-bren": pcLive({ name: "Bren", initiative: 20 }),
      },
      true
    );
    expect(b.rows.map((r) => r.id)).toEqual(["pc-bren", "pc-mara", "monster-1"]);
    expect(b.currentId).toBe("pc-mara"); // SAME combatant despite the reorder
  });

  it("an absent peer combat/state (full-HP default merge) reads as undamaged, not down", () => {
    // applyCombatToSession(null) defaults currentHp to maxHp upstream; the row reflects it.
    const view = buildEncounterView(
      encounter(),
      {
        "pc-mara": pcLive({ currentHp: 30, maxHp: 30 }),
        "pc-bren": pcLive({ name: "Bren" }),
      },
      true
    );
    const mara = view.rows.find((r) => r.id === "pc-mara");
    expect(mara?.currentHp).toBe(30);
    expect(mara?.maxHp).toBe(30);
    expect(mara?.down).toBe(false);
  });

  it("a missing live entry yields a quiet placeholder row (still ordered, never crashes)", () => {
    const view = buildEncounterView(encounter(), {}, true);
    const mara = view.rows.find((r) => r.id === "pc-mara");
    expect(mara).toMatchObject({ name: "", ac: 0, maxHp: 0, currentHp: 0, down: false });
  });

  it("marks a PC at 0 HP as down (but a 0-max placeholder is NOT down)", () => {
    const view = buildEncounterView(
      encounter(),
      {
        "pc-mara": pcLive({ currentHp: 0, maxHp: 30 }),
        "pc-bren": pcLive({ name: "Bren" }),
      },
      true
    );
    expect(view.rows.find((r) => r.id === "pc-mara")?.down).toBe(true);
    // The placeholder (no live entry → maxHp 0) must NOT read as down.
    expect(
      buildEncounterView(encounter(), {}, true).rows.find((r) => r.id === "pc-mara")?.down
    ).toBe(false);
  });
});

describe("buildEncounterView — the FROZEN order locks the display once turns begin (C3)", () => {
  it("follows the FROZEN `order` (not a live re-sort) so a locked roll can't reshuffle", () => {
    // mara has the highest live init (18) but the frozen order puts her LAST — the display
    // must honour the frozen sequence (spec §3 "no live re-sort"), not re-sort by initiative.
    const view = buildEncounterView(
      encounter({ order: ["monster-1", "pc-bren", "pc-mara"] }),
      {
        "pc-mara": pcLive({ initiative: 18 }),
        "pc-bren": pcLive({ name: "Bren", initiative: 5 }),
      },
      true
    );
    expect(view.rows.map((r) => r.id)).toEqual(["monster-1", "pc-bren", "pc-mara"]);
    expect(view.turnOrderIds).toEqual(["monster-1", "pc-bren", "pc-mara"]);
  });

  it("appends a combatant MISSING from the frozen order at its live-sorted slot (never dropped)", () => {
    // A stale freeze that omits pc-bren: it still renders, slotted by its live initiative
    // after the frozen ids, so a reinforcement awaiting re-slot is never lost from the view.
    const view = buildEncounterView(
      encounter({ order: ["monster-1", "pc-mara"] }),
      {
        "pc-mara": pcLive({ initiative: 10 }),
        "pc-bren": pcLive({ name: "Bren", initiative: 99 }),
      },
      true
    );
    expect(view.rows.map((r) => r.id)).toEqual(["monster-1", "pc-mara", "pc-bren"]);
  });

  it("an EMPTY frozen order falls back to the live initiative sort (the gathering preview)", () => {
    // Gathering = no/empty order → the list is a LIVE PREVIEW that re-sorts as players roll.
    const view = buildEncounterView(
      encounter({ order: [] }),
      {
        "pc-mara": pcLive({ initiative: 8 }),
        "pc-bren": pcLive({ name: "Bren", initiative: 20 }),
      },
      true
    );
    // bren 20, goblin 14, mara 8 → live-sorted, NOT the doc/insertion order.
    expect(view.rows.map((r) => r.id)).toEqual(["pc-bren", "monster-1", "pc-mara"]);
  });
});

describe("addReinforcement — auto-slot a mid-combat monster into the frozen order (C3)", () => {
  it("slots the newcomer at its initiative rank, preserving the sequence + pinning the pointer", () => {
    // Frozen order: pc-mara(18) · Goblin/monster-1(14) · pc-bren(5); current on pc-mara.
    const before = encounter({
      order: ["pc-mara", "monster-1", "pc-bren"],
      currentCombatantId: "pc-mara",
    });
    const after = addReinforcement(
      before,
      { name: "Wolf", ac: 13, maxHp: 11, count: 1, initiative: 12 },
      {
        "pc-mara": pcLive({ initiative: 18 }),
        "pc-bren": pcLive({ name: "Bren", initiative: 5 }),
      }
    );
    // Wolf (init 12) lands between the Goblin (14) and pc-bren (5) — NOT tacked on the end.
    expect(after.order).toEqual(["pc-mara", "monster-1", "monster-2", "pc-bren"]);
    expect(after.currentCombatantId).toBe("pc-mara"); // pointer pinned through the re-freeze
    expect(after.combatants.some((c) => c.kind === "monster" && c.name === "Wolf")).toBe(
      true
    );
  });

  it("before Begin-turns (no frozen order) is a plain add — the order stays unset", () => {
    const after = addReinforcement(
      encounter({ currentCombatantId: null }),
      { name: "Wolf", ac: 13, maxHp: 11, count: 1, initiative: 12 },
      {}
    );
    expect(after.order).toBeUndefined();
    expect(after.combatants.some((c) => c.kind === "monster" && c.name === "Wolf")).toBe(
      true
    );
  });
});

describe("removeCombatant prunes an orphaned PC so it stops blocking Begin-turns (B03)", () => {
  it("an orphan pc row (member removed) counts toward the total but can never roll — pruning fixes it", () => {
    // Gathering: pc-bren's member was removed, so no live entry exists for it. The view
    // still emits pc-bren as a blank (initiative null) placeholder row, so it counts
    // toward the Begin-turns total (turnOrderIds) yet can never be marked "rolled" — the
    // gate that used to lock forever with no UI to remove the ghost.
    const enc = encounter({ currentCombatantId: null });
    const beforeView = buildEncounterView(
      enc,
      { "pc-mara": pcLive({ initiative: 12 }) },
      true
    );
    expect(beforeView.turnOrderIds).toContain("pc-bren");
    const brenBefore = beforeView.rows.find((r) => r.id === "pc-bren");
    expect(brenBefore?.initiative).toBeNull(); // counted in total, never "rolled"

    // Splicing the orphan out at the removeMember seam removes it from combatants + order,
    // so the Begin-turns total no longer counts it.
    const pruned = removeCombatant(enc, "pc-bren");
    const afterView = buildEncounterView(
      pruned,
      { "pc-mara": pcLive({ initiative: 12 }) },
      true
    );
    expect(afterView.turnOrderIds).not.toContain("pc-bren");
    expect(pruned.combatants.some((c) => c.id === "pc-bren")).toBe(false);
  });
});

describe("buildEncounterView — hidden ambush filtering", () => {
  function withHidden(): EncounterState {
    return encounter({
      combatants: [
        { kind: "pc", id: "pc-mara", memberUid: "mara", characterId: "char-mara" },
        {
          kind: "monster",
          id: "monster-1",
          name: "Assassin",
          ac: 15,
          initiative: 19,
          conditions: [],
          maxHp: 30,
          tokens: [30],
          hidden: true,
        },
      ],
    });
  }

  it("filters a hidden combatant out of a PLAYER view but keeps it in the turn order", () => {
    const view = buildEncounterView(withHidden(), { "pc-mara": pcLive() }, false);
    expect(view.rows.map((r) => r.id)).toEqual(["pc-mara"]);
    // INIT-6 — hidden is a DISPLAY filter, not a turn filter: the assassin still takes
    // its turn, so `turnOrderIds` (the advance order) includes it even for a player.
    expect(view.turnOrderIds).toEqual(["monster-1", "pc-mara"]);
  });

  it("shows a hidden combatant in the DM view, flagged hidden", () => {
    const view = buildEncounterView(withHidden(), { "pc-mara": pcLive() }, true);
    const assassin = view.rows.find((r) => r.id === "monster-1");
    expect(assassin).toBeDefined();
    expect(assassin?.hidden).toBe(true);
  });
});
