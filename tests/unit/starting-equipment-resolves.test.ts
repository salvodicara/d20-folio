/**
 * Starting equipment must auto-resolve — no "(add manually)" placeholders.
 *
 * Owner principle: the app takes the burden off the player. Every SRD-backed
 * item id in a class's `startingEquipment` packages must resolve to a real SRD
 * item (weapon / armor / gear), so a new character starts with usable, specific
 * gear instead of a generic "add manually" reference. This guard fails if a
 * future class-data edit introduces an unresolvable id. (Name-only flavour
 * entries carry their own bilingual label and are intentionally exempt.)
 */
import { describe, it, expect } from "vitest";
import { classTables, getClassTable } from "@/data/classes";
import { getEquipment } from "@/data/equipment";
import {
  resolveStartingEquipment,
  toolChoiceKind,
  toolChoiceKindCategory,
} from "@/data/background-equipment";
import {
  toolChoiceContextForClass,
  toolChoiceContextForSource,
} from "@/lib/resolve-grant-sources";
import type { BackgroundEquipmentOption } from "@/data/types";
import type { Grant } from "@/lib/grants";

describe("class starting equipment resolves to real SRD items", () => {
  it("has no unresolvable starting-equipment ids across all classes", () => {
    const unresolved = new Set<string>();
    for (const cls of classTables) {
      for (const option of cls.startingEquipment) {
        for (const item of option.items) {
          if (item.srdId === undefined) continue; // name-only / tool-choice marker, exempt
          if (getEquipment(item.srdId)) continue;
          // Transitional safety net: quantity-suffixed "arrows-20" → base "arrows".
          const m = item.srdId.match(/^(.+?)-(\d+)$/);
          if (m && m[1] && getEquipment(m[1])) continue;
          unresolved.add(`${cls.id}:${item.srdId}`);
        }
      }
    }
    expect([...unresolved].sort()).toEqual([]);
  });

  it("every tool-choice grant option resolves to a real SRD item (no add-manually pick)", () => {
    // A `fromToolChoice` pack member resolves to the PICKED tool — so EVERY
    // pickable option must be a real catalogue item, else a valid pick would
    // land as a generic "add manually" row.
    const unresolved: string[] = [];
    for (const cls of classTables) {
      const grant = cls.grants?.find((g) => g.type === "choice-tool-proficiency");
      if (!grant) continue;
      for (const id of grant.options) {
        if (!getEquipment(id)) unresolved.push(`${cls.id}:${id}`);
      }
    }
    expect(unresolved.sort()).toEqual([]);
  });
});

describe("fromToolChoice marker — single-source expansion (Monk + Bard)", () => {
  const slotId = (classId: string) => `class:${classId}::tool-slot-0`;

  it("classifies the placeholder kind from the grant options (id-driven)", () => {
    // Monk options span Artisan's Tools ∪ Musical Instruments; Bard's are
    // instruments only — the placeholder wording follows.
    const monkGrant = getClassTable("monk")?.grants?.find(
      (g) => g.type === "choice-tool-proficiency"
    );
    const bardGrant = getClassTable("bard")?.grants?.find(
      (g) => g.type === "choice-tool-proficiency"
    );
    expect(toolChoiceKind(monkGrant?.options ?? [])).toBe("artisan-or-instrument");
    expect(toolChoiceKind(bardGrant?.options ?? [])).toBe("instrument");
  });

  it("maps each placeholder kind to a representative tool category (no default branch)", () => {
    // The seal glyph for an un-picked `fromToolChoice` line reads this category.
    // EXHAUSTIVE: a pure instrument choice → "instrument"; anything that includes
    // Artisan's Tools → "artisan" (the hammer). No "absence-of-category" fallback.
    expect(toolChoiceKindCategory("instrument")).toBe("instrument");
    expect(toolChoiceKindCategory("artisan")).toBe("artisan");
    expect(toolChoiceKindCategory("artisan-or-instrument")).toBe("artisan");
  });

  it("Monk Option A resolves to NOTHING extra before a pick (placeholder only)", () => {
    // No pick yet → the marker contributes no inventory row (the wizard preview
    // shows the placeholder); the static spear/daggers/pack still resolve.
    const ctx = toolChoiceContextForClass("monk", {}); // no picks
    const res = resolveStartingEquipment(
      getClassTable("monk")?.startingEquipment,
      "A",
      ctx
    );
    const ids = [...res.weapons, ...res.equipment].map((e) =>
      "srdId" in e ? e.srdId : undefined
    );
    expect(ids).toContain("spear");
    expect(ids).toContain("explorers-pack");
    // No tool row of any kind before a pick.
    expect(ids.some((id) => id?.endsWith("-tools") || id?.endsWith("-supplies"))).toBe(
      false
    );
  });

  it("Monk Option A resolves the PICKED tool EXACTLY once after a pick (no double-add)", () => {
    const ctx = toolChoiceContextForClass("monk", {
      [slotId("monk")]: ["smiths-tools"],
    });
    const res = resolveStartingEquipment(
      getClassTable("monk")?.startingEquipment,
      "A",
      ctx
    );
    const smiths = res.equipment.filter(
      (e) => "srdId" in e && e.srdId === "smiths-tools"
    );
    expect(smiths).toHaveLength(1);
    expect((smiths[0] as { quantity?: number }).quantity ?? 1).toBe(1);
  });

  it("Bard Option A resolves the chosen instrument (first pick) once, not the umbrella", () => {
    // The Bard's `choice-tool-proficiency` is amount-3, but the pack member is a
    // SINGLE instrument — the FIRST chosen instrument, not a generic umbrella.
    const ctx = toolChoiceContextForClass("bard", {
      [slotId("bard")]: ["lute", "drum", "horn"],
    });
    const res = resolveStartingEquipment(
      getClassTable("bard")?.startingEquipment,
      "A",
      ctx
    );
    const instruments = res.equipment.filter(
      (e) =>
        "srdId" in e && (e.srdId === "lute" || e.srdId === "drum" || e.srdId === "horn")
    );
    expect(instruments).toHaveLength(1);
    expect((instruments[0] as { srdId: string }).srdId).toBe("lute"); // first pick
    // The generic umbrella never appears.
    expect(
      res.equipment.some((e) => "srdId" in e && e.srdId === "musical-instrument")
    ).toBe(false);
  });
});

describe("fromToolChoice is SOURCE-AGNOSTIC — works for any source, zero new code", () => {
  // Proof the mechanism is not class-specific: a HYPOTHETICAL background that
  // grants "a Gaming Set of your choice" resolves through the IDENTICAL engine
  // seam — a `choice-tool-proficiency` grant + a `{ fromToolChoice: true }` pack
  // item + the source-agnostic `toolChoiceContextForSource`. No Monk/Bard branch,
  // no class-table lookup — only the grant, the source id, and the player's pick.
  const SOURCE_ID = "bg:gambler"; // any grant-namespace works (bg:/class:/feat id)
  const grants: Grant[] = [
    {
      type: "choice-tool-proficiency",
      options: ["dice-set", "playing-card-set"],
      amount: 1,
    },
  ];
  const pkg: BackgroundEquipmentOption[] = [
    {
      label: "A",
      items: [{ srdId: "dagger" }, { fromToolChoice: true }],
      gold: 5,
    },
    { label: "B", items: [], gold: 50 },
  ];

  const slotId = `${SOURCE_ID}::tool-slot-0`;

  it("resolves the chosen gaming set as a first-class pack member (exactly once)", () => {
    const ctx = toolChoiceContextForSource(SOURCE_ID, grants, {
      [slotId]: ["dice-set"],
    });
    const res = resolveStartingEquipment(pkg, "A", ctx);
    // The chosen tool lands EXACTLY once — as a labelled row (gaming sets aren't
    // modelled as catalogue equipment, so they take the resolver's faithful
    // custom-row fallback; a catalogued tool would land as an `srdId` row). The
    // count is what matters: never zero, never doubled.
    const chosen = res.equipment.filter(
      (e) =>
        ("srdId" in e && e.srdId === "dice-set") ||
        ("custom" in e && e.name === "dice-set")
    );
    expect(chosen).toHaveLength(1);
    // The static dagger still resolves alongside it (mixed package).
    expect(res.weapons.some((w) => w.srdId === "dagger")).toBe(true);
  });

  it("shows a placeholder (no inventory row) before the player picks", () => {
    const ctx = toolChoiceContextForSource(SOURCE_ID, grants, {}); // no pick
    const res = resolveStartingEquipment(pkg, "A", ctx);
    expect(
      res.equipment.some(
        (e) =>
          ("srdId" in e && e.srdId === "dice-set") ||
          ("custom" in e && e.name === "dice-set")
      )
    ).toBe(false);
    // The placeholder kind for a gaming-only choice is "instrument" (the
    // non-artisan bucket — its glyph is the instrument note, never a wrench
    // "default"). The classifier is purely id-driven, not class-aware.
    expect(toolChoiceKind(["dice-set", "playing-card-set"])).toBe("instrument");
  });
});
