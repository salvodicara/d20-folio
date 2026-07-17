/**
 * Cast-option parity — `buildCastOptions` is the SINGLE source of a spell's
 * castable options (upcast slots, per-rest free casts, at-will mastery). The
 * Spells page already renders from it; this pins its behaviour so the Combat
 * page can render the identical options when it adopts rich in-combat casting
 * (ARCHITECTURE.md combat model parity). One source → the two pages can't drift.
 */
import { describe, expect, it } from "vitest";
import { buildCastOptions } from "@/lib/cast-options";

const SLOTS = [
  { level: 1, total: 4 },
  { level: 2, total: 3 },
  { level: 3, total: 2 },
];

describe("buildCastOptions — slot options", () => {
  it("offers every slot level at or above the spell's base level", () => {
    const opts = buildCastOptions(SLOTS, {}, 1);
    expect(opts.filter((o) => o.kind === "slot").map((o) => o.level)).toEqual([1, 2, 3]);
  });

  it("a level-2 spell can't be cast with a level-1 slot", () => {
    const opts = buildCastOptions(SLOTS, {}, 2);
    expect(opts.filter((o) => o.kind === "slot").map((o) => o.level)).toEqual([2, 3]);
  });

  it("excludes a fully-spent slot level", () => {
    const opts = buildCastOptions(SLOTS, { "1": { used: 4 } }, 1);
    expect(opts.some((o) => o.kind === "slot" && o.level === 1)).toBe(false);
    expect(opts.some((o) => o.kind === "slot" && o.level === 2)).toBe(true);
  });

  it("cantrips (base level 0) have no slot options", () => {
    expect(buildCastOptions(SLOTS, {}, 0)).toEqual([]);
  });
});

describe("buildCastOptions — free casts + mastery (ordered after slots)", () => {
  it("appends an available free cast (skips spent ones) at the base level", () => {
    const withFree = buildCastOptions(SLOTS, {}, 1, [
      {
        sourceId: "fey-touched",
        sourceName: "Fey-Touched",
        usesPerRest: 1,
        usedNow: 0,
        rest: "long",
      },
      {
        sourceId: "spent",
        sourceName: "Spent",
        usesPerRest: 1,
        usedNow: 1,
        rest: "long",
      },
    ]);
    const free = withFree.filter((o) => o.kind === "free-cast");
    expect(free).toHaveLength(1);
    expect(free[0]).toMatchObject({ sourceId: "fey-touched", level: 1, rest: "long" });
  });

  it("orders slots → free-casts → masteries", () => {
    const opts = buildCastOptions(
      SLOTS,
      {},
      1,
      [{ sourceId: "f", sourceName: "F", usesPerRest: 1, usedNow: 0, rest: "long" }],
      [{ sourceName: "Spell Mastery" }]
    );
    const kinds = opts.map((o) => o.kind);
    const lastSlot = kinds.lastIndexOf("slot");
    const free = kinds.indexOf("free-cast");
    const mastery = kinds.indexOf("mastery");
    expect(lastSlot).toBeLessThan(free);
    expect(free).toBeLessThan(mastery);
  });
});
