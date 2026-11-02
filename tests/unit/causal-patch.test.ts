import { describe, expect, it } from "vitest";

import { causalPatch, undoPatch } from "@/lib/play/causal-patch";

/** A slice of a sheet the way a use touches it. */
const sheet = () => ({
  session: {
    hp: { current: 20, temp: 0 },
    spellSlots: { "1": { used: 0 } } as Record<string, { used: number }>,
    concentration: "",
    logEntries: [{ id: "a", text: "earlier" }] as Array<{ id: string; text: string }>,
  },
  character: { equipment: [{ srdId: "arrows", quantity: 18 }] },
});

describe("a causal patch: undo takes back what the use changed, and nothing else", () => {
  it("restores every field the use changed", () => {
    const before = sheet();
    const after = structuredClone(before);
    after.session.spellSlots["1"] = { used: 1 };
    after.session.concentration = "bless";
    after.character.equipment[0] = { srdId: "arrows", quantity: 17 };
    after.session.logEntries.push({ id: "b", text: "cast" });
    const patch = causalPatch(before, after);
    expect(undoPatch(after, patch)).toEqual(before);
  });

  it("keeps a change someone else made to a field the use never touched", () => {
    const before = sheet();
    const after = structuredClone(before);
    after.session.spellSlots["1"] = { used: 1 };
    const patch = causalPatch(before, after);
    const later = structuredClone(after);
    later.session.hp.current = 12; // the DM's hit, after the use
    expect(undoPatch(later, patch)).toEqual({
      ...before,
      session: { ...before.session, hp: { current: 12, temp: 0 } },
    });
  });

  it("removes only its own log line, keeping a line added after it", () => {
    const before = sheet();
    const after = structuredClone(before);
    after.session.logEntries.push({ id: "b", text: "cast" });
    const patch = causalPatch(before, after);
    const later = structuredClone(after);
    later.session.logEntries.push({ id: "c", text: "the DM's hit" });
    expect(undoPatch(later, patch)?.session.logEntries.map((e) => e.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("puts back a line the use removed, where it was", () => {
    const before = sheet();
    before.session.logEntries.push({ id: "b", text: "mid" }, { id: "c", text: "last" });
    const after = structuredClone(before);
    after.session.logEntries.splice(1, 1);
    const patch = causalPatch(before, after);
    expect(undoPatch(after, patch)?.session.logEntries.map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("refuses when someone else changed a field the use changed", () => {
    const before = sheet();
    const after = structuredClone(before);
    after.session.hp.current = 15; // the use healed or hurt
    const patch = causalPatch(before, after);
    const later = structuredClone(after);
    later.session.hp.current = 9; // then the DM changed the same number
    expect(undoPatch(later, patch)).toBeNull();
  });

  it("restores a field the use added or removed", () => {
    const before = { session: { a: 1 } as Record<string, number> };
    const after = { session: { b: 2 } as Record<string, number> };
    expect(undoPatch(after, causalPatch(before, after))).toEqual(before);
  });

  it("is empty for a use that changed nothing", () => {
    const before = sheet();
    expect(causalPatch(before, structuredClone(before))).toEqual([]);
  });

  it("refuses to take back a list row someone else already removed", () => {
    const before = { tags: ["x", "y"] };
    const after = { tags: ["y", "w"] };
    const patch = causalPatch(before, after);
    expect(undoPatch(after, patch)).toEqual(before);
    expect(undoPatch({ tags: ["y"] }, patch)).toBeNull();
  });

  it("never mutates its inputs", () => {
    const before = sheet();
    const after = structuredClone(before);
    after.session.concentration = "bless";
    const frozenAfter = structuredClone(after);
    undoPatch(after, causalPatch(before, after));
    expect(after).toEqual(frozenAfter);
  });
});

describe("a list without ids (the inventory, the active-state chips)", () => {
  it("takes back the use's own row change, keeping a row added by someone else", () => {
    const before = { equipment: [{ srdId: "potion", quantity: 2 }] };
    const after = { equipment: [{ srdId: "potion", quantity: 1 }] };
    const patch = causalPatch(before, after);
    const later = {
      equipment: [
        { srdId: "rope", quantity: 4 },
        { srdId: "potion", quantity: 1 },
      ],
    };
    const undone = undoPatch(later, patch);
    expect(undone?.equipment).toHaveLength(2);
    expect(undone?.equipment).toContainEqual({ srdId: "rope", quantity: 4 });
    expect(undone?.equipment).toContainEqual({ srdId: "potion", quantity: 2 });
  });

  it("removes the chip the use lit, keeping one the player lit after it", () => {
    const before = { active: ["bless"] };
    const after = { active: ["bless", "rage"] };
    const patch = causalPatch(before, after);
    expect(undoPatch({ active: ["bless", "rage", "dodge"] }, patch)).toEqual({
      active: ["bless", "dodge"],
    });
  });

  it("puts a removed row back next to the row it followed", () => {
    const before = { list: ["a", "b", "c"] };
    const after = { list: ["a", "c"] };
    expect(undoPatch(after, causalPatch(before, after))).toEqual(before);
  });

  it("refuses when the row the use added was changed since", () => {
    const before = { equipment: [{ srdId: "potion", quantity: 2 }] };
    const after = { equipment: [{ srdId: "potion", quantity: 1 }] };
    const patch = causalPatch(before, after);
    expect(
      undoPatch({ equipment: [{ srdId: "potion", quantity: 7 }] }, patch)
    ).toBeNull();
  });
});
