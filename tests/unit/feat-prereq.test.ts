/**
 * feat-prereq — the 2024 feat ELIGIBILITY engine seam ("a feat for which you
 * qualify"): category-derived level/feature gates + per-feat structured
 * prerequisites (verified against dnd2024.wikidot.com), and the character-side
 * fact derivation (`featGateCtx`).
 */
import { describe, expect, it } from "vitest";
import {
  featGateCtx,
  featCategoryOffered,
  featPrereqMet,
  type FeatGateCtx,
} from "@/lib/feat-prereq";
import { FEATS_BY_ID } from "@/data/feats";
import { offeredFeatVMs } from "@/lib/views/feat-pick-view";
import { makeCharacterDoc } from "./_helpers";
import type { AbilityCode } from "@/data/types";

const SCORES: Record<AbilityCode, number> = {
  STR: 14,
  DEX: 10,
  CON: 14,
  INT: 12,
  WIS: 12,
  CHA: 10,
};

function ctx(overrides: Partial<FeatGateCtx> = {}): FeatGateCtx {
  return {
    level: 4,
    abilityScores: SCORES,
    armorTraining: [],
    hasSpellcasting: false,
    hasFightingStyleFeature: false,
    ...overrides,
  };
}

function feat(id: string) {
  const f = FEATS_BY_ID.get(id);
  if (!f) throw new Error(`feat ${id} missing`);
  return f;
}

describe("featCategoryOffered — category gates derive from the category", () => {
  const ROWS: ReadonlyArray<{
    category: Parameters<typeof featCategoryOffered>[0];
    ctx: FeatGateCtx;
    offered: boolean;
    why: string;
  }> = [
    { category: "origin", ctx: ctx({ level: 4 }), offered: true, why: "no prereq" },
    { category: "general", ctx: ctx({ level: 4 }), offered: true, why: "level 4+" },
    { category: "general", ctx: ctx({ level: 3 }), offered: false, why: "below 4" },
    { category: "epic-boon", ctx: ctx({ level: 18 }), offered: false, why: "below 19" },
    { category: "epic-boon", ctx: ctx({ level: 19 }), offered: true, why: "level 19+" },
    {
      category: "fighting-style",
      ctx: ctx({ hasFightingStyleFeature: false }),
      offered: false,
      why: "needs the Fighting Style feature",
    },
    {
      category: "fighting-style",
      ctx: ctx({ hasFightingStyleFeature: true }),
      offered: true,
      why: "has the feature",
    },
    { category: "heritage", ctx: ctx(), offered: true, why: "setting content" },
    // D7 — at the L19 Epic Boon gate, ONLY epic-boon is offered (no general feat,
    // no fighting-style, no origin) — 2024 RAW grants specifically an Epic Boon.
    {
      category: "epic-boon",
      ctx: ctx({ level: 19, isEpicBoonGate: true }),
      offered: true,
      why: "the boon itself is offered at the epic-boon gate",
    },
    {
      category: "general",
      ctx: ctx({ level: 19, isEpicBoonGate: true }),
      offered: false,
      why: "general feats are NOT offered at the epic-boon gate",
    },
    {
      category: "fighting-style",
      ctx: ctx({ level: 19, isEpicBoonGate: true, hasFightingStyleFeature: true }),
      offered: false,
      why: "even with the feature, fighting-style is NOT offered at the epic-boon gate",
    },
    {
      category: "origin",
      ctx: ctx({ level: 19, isEpicBoonGate: true }),
      offered: false,
      why: "origin feats are NOT offered at the epic-boon gate",
    },
    // L16 (a normal ASI level) STILL offers general + (origin/fighting-style) — the
    // restriction is ONLY at the epic-boon gate.
    {
      category: "general",
      ctx: ctx({ level: 16 }),
      offered: true,
      why: "L16 is a normal ASI level — general feats still offered",
    },
  ];
  for (const r of ROWS) {
    it(`${r.category} @${r.ctx.level}${r.ctx.hasFightingStyleFeature ? "+FS" : ""} → ${r.offered} (${r.why})`, () => {
      expect(featCategoryOffered(r.category, r.ctx)).toBe(r.offered);
    });
  }
});

describe("featPrereqMet — structured prerequisites (wikidot-verified rows)", () => {
  // The spellcasting-feature / armor-training prereq variants live on PACK
  // feats only (War Caster, Heavily Armored, Shield Master, …) — those rows
  // are pinned in content-pack/tests/unit/feat-prereq.pack.test.ts.
  const ROWS: ReadonlyArray<{ id: string; ctx: FeatGateCtx; met: boolean }> = [
    // Ability minimums — "anyOf" semantics
    { id: "grappler", ctx: ctx(), met: true }, // STR 14 satisfies STR-or-DEX 13+
    {
      id: "grappler",
      ctx: ctx({ abilityScores: { ...SCORES, STR: 10, DEX: 10 } }),
      met: false, // neither STR nor DEX reaches 13
    },
    // No structured prereq → always met
    { id: "alert", ctx: ctx(), met: true },
    { id: "savage-attacker", ctx: ctx(), met: true },
  ];
  for (const r of ROWS) {
    it(`${r.id} (${r.met ? "met" : "unmet"} ctx) → ${r.met}`, () => {
      expect(featPrereqMet(feat(r.id), r.ctx)).toBe(r.met);
    });
  }
});

describe("featGateCtx — character-side fact derivation", () => {
  it("a Fighter has full armor training, no spellcasting, and the Fighting Style feature via its placeholder", () => {
    const c = makeCharacterDoc({
      classes: [{ classId: "fighter", level: 4 }],
      features: [{ srdId: "fighter-fighting-style" }],
    }).character;
    const g = featGateCtx(c, 5);
    expect(g.level).toBe(5);
    expect(g.hasSpellcasting).toBe(false);
    expect(g.hasFightingStyleFeature).toBe(true);
    expect(g.armorTraining).toEqual(
      expect.arrayContaining(["light-armor", "medium-armor", "heavy-armor", "shields"])
    );
  });

  it("a Wizard casts but has no armor training", () => {
    const c = makeCharacterDoc({
      classes: [{ classId: "wizard", level: 4 }],
      features: [],
    }).character;
    const g = featGateCtx(c, 5);
    expect(g.hasSpellcasting).toBe(true);
    expect(g.armorTraining).toEqual([]);
    expect(g.hasFightingStyleFeature).toBe(false);
  });

  it("owning a fighting-style FEAT also counts as having the feature", () => {
    const c = makeCharacterDoc({
      classes: [{ classId: "paladin", level: 4 }],
      features: [{ srdId: "defense" }],
    }).character;
    expect(featGateCtx(c, 5).hasFightingStyleFeature).toBe(true);
  });
});

// ── D7 — the L19 Epic Boon gate restricts the offered pool to epic-boon only ──────
// 2024 RAW: every class gains an EPIC BOON feat at level 19 (not a general feat, not
// the +2/+1 ASI fork). The engine flag `isEpicBoonGate` (set by featGateCtx) drives
// both featCategoryOffered (epic-boon only) and the wizard's suppressed ASI fork.

describe("D7 — featGateCtx propagates the epic-boon-gate flag", () => {
  it("defaults to false (a normal ASI level)", () => {
    const c = makeCharacterDoc({
      classes: [{ classId: "fighter", level: 15 }],
    }).character;
    expect(featGateCtx(c, 16).isEpicBoonGate).toBeFalsy();
  });

  it("is true when explicitly the epic-boon gate", () => {
    const c = makeCharacterDoc({
      classes: [{ classId: "fighter", level: 18 }],
    }).character;
    expect(featGateCtx(c, 19, true).isEpicBoonGate).toBe(true);
  });
});

describe("D7 — offeredFeatVMs at the epic-boon gate vs a normal ASI level", () => {
  const c = makeCharacterDoc({ classes: [{ classId: "fighter", level: 18 }] }).character;

  it("L19 epic-boon gate: the offered pool is EPIC-BOON ONLY (no general/fighting-style)", () => {
    const vms = offeredFeatVMs(featGateCtx(c, 19, true), new Set(), "en");
    expect(vms.length).toBeGreaterThan(0);
    expect(vms.every((v) => v.category === "epic-boon")).toBe(true);
  });

  it("L16 (normal ASI): general feats ARE still offered (no epic-boon restriction)", () => {
    const at16 = makeCharacterDoc({
      classes: [{ classId: "fighter", level: 15 }],
    }).character;
    const vms = offeredFeatVMs(featGateCtx(at16, 16), new Set(), "en");
    expect(vms.some((v) => v.category === "general")).toBe(true);
    // Epic boons are NOT offered yet at 16.
    expect(vms.some((v) => v.category === "epic-boon")).toBe(false);
  });
});
