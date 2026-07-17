/**
 * Regression: Magic-Initiate-style feat spell choices are surfaced from
 * the declarative grants and applied as always-prepared spells on confirm.
 *
 * Before this pass `choice-cantrip` and `choice-spell` grants on a feat
 * went into `aggregate.pendingChoices` and were never consumed. A player
 * who picked Magic Initiate (Cleric) at L4 ASI got no prompts and the
 * 2 cantrips + 1 L1 spell never appeared on the character. Same gap for
 * Magic Initiate (Druid), Magic Initiate (Wizard), Magic Initiate (Cleric),
 * and any future feat declaring those grants.
 *
 * The new flow:
 *   1. pendingSpellChoicesForFeat(feat) → list of SpellChoiceSlots
 *   2. UI picker collects SpellChoicePicks (slotId → spellIds)
 *   3. applySpellChoicePicks(spells, picks) → new spells[] with
 *      `prepared: true, alwaysPrepared: true` on each new ref
 *
 * The flag set means picks DON'T count against the class's
 * prepared-spell limit — they're feat-granted, not class-prepared.
 */
import { describe, expect, it } from "vitest";
import {
  pendingSpellChoicesForFeat,
  isSpellChoicesComplete,
  applySpellChoicePicks,
  listAvailableForSlot,
} from "@/lib/feat-spell-choices";
import { FEATS_BY_ID } from "@/data/feats";
import type { SrdSpellRef } from "@/types/character";

describe("pendingSpellChoicesForFeat", () => {
  it("Magic Initiate (Cleric) → 1 cantrip slot (×2) + 1 L1 spell slot (×1)", () => {
    const feat = FEATS_BY_ID.get("magic-initiate-cleric");
    expect(feat).toBeDefined();
    const slots = pendingSpellChoicesForFeat(feat ?? { grants: [] });
    expect(slots).toHaveLength(2);
    const [cantrip, spell] = slots;
    expect(cantrip?.kind).toBe("cantrip");
    expect(cantrip?.count).toBe(2);
    expect(cantrip?.classSpellList).toBe("cleric");
    expect(spell?.kind).toBe("spell");
    expect(spell?.count).toBe(1);
    expect(spell?.maxLevel).toBe(1);
    expect(spell?.classSpellList).toBe("cleric");
  });

  it("Magic Initiate (Druid) → same shape, druid list", () => {
    const slots = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-druid") ?? {}
    );
    expect(slots.find((s) => s.kind === "cantrip")?.classSpellList).toBe("druid");
    expect(slots.find((s) => s.kind === "spell")?.classSpellList).toBe("druid");
  });

  it("a feat with no spell grants returns []", () => {
    const alert = FEATS_BY_ID.get("alert");
    expect(alert).toBeDefined();
    const slots = pendingSpellChoicesForFeat(alert ?? {});
    expect(slots).toEqual([]);
  });
});

describe("listAvailableForSlot", () => {
  it("cantrip slot constrained to cleric list contains only cleric cantrips", () => {
    const slot = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-cleric") ?? {}
    ).find((s) => s.kind === "cantrip");
    if (!slot) throw new Error("expected cantrip slot");
    const options = listAvailableForSlot(slot, new Set());
    expect(options.length).toBeGreaterThan(0);
    // Every option must be level 0 and on the cleric list.
    for (const opt of options) {
      expect(opt.level).toBe(0);
    }
    // Cleric cantrip Sacred Flame should be present; non-cleric cantrip
    // Vicious Mockery (bard-only) should NOT.
    expect(options.some((o) => o.id === "sacred-flame")).toBe(true);
    expect(options.every((o) => o.id !== "vicious-mockery")).toBe(true);
  });

  it("excludes spells the character already owns", () => {
    const slot = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-wizard") ?? {}
    ).find((s) => s.kind === "cantrip");
    if (!slot) throw new Error("expected cantrip slot");
    const filtered = listAvailableForSlot(slot, new Set(["fire-bolt"]));
    expect(filtered.every((o) => o.id !== "fire-bolt")).toBe(true);
  });
});

describe("isSpellChoicesComplete", () => {
  it("returns false until every slot is filled to its count", () => {
    const slots = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-cleric") ?? {}
    );
    expect(isSpellChoicesComplete(slots, {})).toBe(false);
    expect(isSpellChoicesComplete(slots, { "slot-0": ["sacred-flame"] })).toBe(false);
    // Both slots filled to their counts → complete.
    const cantripSlot = slots.find((s) => s.kind === "cantrip");
    const spellSlot = slots.find((s) => s.kind === "spell");
    const picks = {
      [cantripSlot?.slotId ?? "x"]: ["sacred-flame", "guidance"],
      [spellSlot?.slotId ?? "y"]: ["bless"],
    };
    expect(isSpellChoicesComplete(slots, picks)).toBe(true);
  });

  it("rejects under- AND over-counts", () => {
    const slots = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-cleric") ?? {}
    );
    const cantripSlot = slots.find((s) => s.kind === "cantrip");
    // Three cantrips for a 2-cantrip slot — must be rejected.
    expect(
      isSpellChoicesComplete(slots, {
        [cantripSlot?.slotId ?? "x"]: ["sacred-flame", "guidance", "light"],
        "slot-1": ["bless"],
      })
    ).toBe(false);
  });
});

describe("applySpellChoicePicks", () => {
  it("injects new refs with prepared:true and alwaysPrepared:true", () => {
    const before: SrdSpellRef[] = [{ srdId: "fire-bolt", prepared: true }];
    const after = applySpellChoicePicks(before, {
      "slot-0": ["sacred-flame", "guidance"],
      "slot-1": ["bless"],
    });
    expect(after).toHaveLength(4);
    const sacred = after.find((s) => "srdId" in s && s.srdId === "sacred-flame");
    expect(sacred).toMatchObject({
      srdId: "sacred-flame",
      prepared: true,
      alwaysPrepared: true,
    });
  });

  it("is idempotent — re-applying the same picks doesn't duplicate", () => {
    const picks = { "slot-0": ["sacred-flame"] };
    const first = applySpellChoicePicks([], picks);
    const second = applySpellChoicePicks(first, picks);
    expect(second).toHaveLength(1);
  });

  it("leaves untouched spells alone (preserved field values)", () => {
    const before: SrdSpellRef[] = [
      { srdId: "fireball", prepared: false, notes: "saved-for-later" },
    ];
    const after = applySpellChoicePicks(before, { "slot-0": ["sacred-flame"] });
    const fireball = after.find((s) => "srdId" in s && s.srdId === "fireball");
    expect(fireball).toMatchObject({
      srdId: "fireball",
      prepared: false,
      notes: "saved-for-later",
    });
  });
});

describe("2024 Magic Initiate — player-chosen casting ability (Int/Wis/Cha)", () => {
  it("the grants defer the ability to a choice set, not a pinned ability", () => {
    for (const id of [
      "magic-initiate-cleric",
      "magic-initiate-druid",
      "magic-initiate-wizard",
    ]) {
      const slots = pendingSpellChoicesForFeat(FEATS_BY_ID.get(id) ?? {});
      expect(slots.length).toBeGreaterThan(0);
      for (const s of slots) {
        expect(s.spellAbility).toBeUndefined();
        expect(s.spellAbilityChoice).toEqual(["INT", "WIS", "CHA"]);
      }
    }
  });

  it("auto-defaults the picked spell's ability to the character's BEST of the set (override-first)", () => {
    const slots = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-cleric") ?? {}
    );
    const cantripSlot = slots.find((s) => s.kind === "cantrip");
    if (!cantripSlot) throw new Error("expected a cantrip slot");
    const picks = { [cantripSlot.slotId]: ["guidance"] };
    // A Fighter with high CHA should cast the feat cantrip with CHA, not WIS.
    const scores = { STR: 16, DEX: 12, CON: 14, INT: 8, WIS: 10, CHA: 18 } as const;
    const out = applySpellChoicePicks([], picks, slots, scores) as SrdSpellRef[];
    const guidance = out.find((r) => "srdId" in r && r.srdId === "guidance");
    expect(guidance?.spellAbilityOverride).toBe("CHA");
  });

  it("a fixed spellAbility still wins over a choice set (Cold Caster-style)", () => {
    const slot = {
      kind: "cantrip" as const,
      maxLevel: 0,
      count: 1,
      slotId: "slot-0",
      spellAbility: "WIS" as const,
      spellAbilityChoice: ["INT", "WIS", "CHA"] as const,
    };
    const scores = { STR: 10, DEX: 10, CON: 10, INT: 18, WIS: 8, CHA: 8 } as const;
    const out = applySpellChoicePicks(
      [],
      { "slot-0": ["light"] },
      [slot],
      scores
    ) as SrdSpellRef[];
    expect(
      out.find((r) => "srdId" in r && r.srdId === "light")?.spellAbilityOverride
    ).toBe("WIS");
  });
});
