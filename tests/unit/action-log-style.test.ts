/**
 * action-log-style — the per-row palette invariant + the colour-by-economy rule.
 *
 * Confirmed bugs locked here (action-log finder set):
 *  - `glyph-and-border-palette-divergence`: glyph + border once read from two
 *    different palettes (gold glyph on a purple/blue border). The resolver now
 *    drives BOTH from one family per row, so they can never clash.
 *  - `colour-by-semantic-not-economy` (owner-reported): every spell row was
 *    painted MAGIC/purple regardless of the slot it consumed — so an Action spell
 *    (Hypnotic Pattern) read purple instead of green, a Reaction (Counterspell)
 *    purple instead of red, a bonus-action heal/potion green instead of blue. The
 *    fix splits the two axes: GLYPH SHAPE follows the semantic `type`, ROW COLOUR
 *    follows the economy `slot` (action=green, bonus=blue, reaction=red, free=
 *    grey) — the same `--at-<slot>` family the cockpit action cards use. A
 *    slot-less non-action event (death save, thrown save, rest) keeps its
 *    semantic hue as a fallback.
 *
 * Pure module — no React, no stores.
 */

import { describe, it, expect } from "vitest";
import {
  resolveLogStyle,
  STYLED_LOG_TYPES,
  type LogHueFamily,
} from "@/lib/action-log-style";

// Family → the deep ink var (glyph) and vivid graphic var (border) it must use.
const FAMILY_EXPECT: Record<LogHueFamily, { glyph: string; border: string }> = {
  magic: { glyph: "var(--at-magic)", border: "var(--at-magic-vivid)" },
  reaction: { glyph: "var(--at-reaction)", border: "var(--at-reaction-vivid)" },
  action: { glyph: "var(--at-action)", border: "var(--at-action-vivid)" },
  bonus: { glyph: "var(--at-bonus)", border: "var(--at-bonus-vivid)" },
  warning: { glyph: "var(--semantic-warning)", border: "var(--semantic-warning)" },
  free: { glyph: "var(--at-free)", border: "var(--at-free-vivid)" },
  neutral: { glyph: "var(--text-secondary)", border: "var(--border-medium)" },
};

describe("resolveLogStyle — glyph & border share one hue family", () => {
  it("EVERY styled type's glyph + border come from the same family's var pair", () => {
    for (const type of STYLED_LOG_TYPES) {
      const s = resolveLogStyle(type);
      const fam = FAMILY_EXPECT[s.hueFamily];
      expect(s.glyphColor, `glyph for "${type}"`).toBe(fam.glyph);
      expect(s.borderColor, `border for "${type}"`).toBe(fam.border);
    }
  });

  // ── The specific user-visible mismatches the owner reported ──────────────
  it("spell-cast is MAGIC (amethyst) — glyph & border both --at-magic*, NOT gold", () => {
    const s = resolveLogStyle("spell-cast");
    expect(s.hueFamily).toBe("magic");
    expect(s.glyphColor).toBe("var(--at-magic)");
    expect(s.borderColor).toBe("var(--at-magic-vivid)");
    // Regression guard: the glyph must NOT be the global gold accent.
    expect(s.glyphColor).not.toContain("accent");
  });

  it("tracker-use is BONUS (lapis) — glyph & border both --at-bonus*, NOT gold", () => {
    const s = resolveLogStyle("tracker-use");
    expect(s.hueFamily).toBe("bonus");
    expect(s.glyphColor).toBe("var(--at-bonus)");
    expect(s.borderColor).toBe("var(--at-bonus-vivid)");
    expect(s.glyphColor).not.toContain("accent");
  });

  it("heal is ACTION/green and damage/attack are REACTION/red (effect hues)", () => {
    expect(resolveLogStyle("heal").hueFamily).toBe("action");
    expect(resolveLogStyle("damage").hueFamily).toBe("reaction");
    expect(resolveLogStyle("attack").hueFamily).toBe("reaction");
  });

  // ── Coverage: every type the engine emits must be styled ────────────────
  it("covers every LogType the engine emits (no fall-through to generic)", () => {
    const emitted = ["spell-cast", "attack", "tracker-use", "heal", "damage", "generic"];
    for (const type of emitted) {
      expect(STYLED_LOG_TYPES, `"${type}" styled`).toContain(type);
    }
  });

  it("an unknown/legacy type falls back to the neutral generic style", () => {
    const s = resolveLogStyle("not-a-real-type");
    expect(s.hueFamily).toBe("neutral");
    expect(s.glyphColor).toBe("var(--text-secondary)");
    expect(s.borderColor).toBe("var(--border-medium)");
  });
});

// ── The owner's rule: ROW COLOUR follows the ECONOMY SLOT, not the semantics ──
describe("resolveLogStyle — colour by economy slot (action=green, bonus=blue, …)", () => {
  it("the slot drives the family: action→action, bonus→bonus, reaction→reaction, free→free", () => {
    expect(resolveLogStyle("spell-cast", "action").hueFamily).toBe("action");
    expect(resolveLogStyle("spell-cast", "bonus").hueFamily).toBe("bonus");
    expect(resolveLogStyle("spell-cast", "reaction").hueFamily).toBe("reaction");
    expect(resolveLogStyle("spell-cast", "free").hueFamily).toBe("free");
  });

  it("a weapon ATTACK is an Action → GREEN, not red (the exact reported bug)", () => {
    const s = resolveLogStyle("attack", "action");
    expect(s.hueFamily).toBe("action");
    expect(s.glyphColor).toBe("var(--at-action)");
    expect(s.borderColor).toBe("var(--at-action-vivid)");
  });

  it("a Reaction spell (Counterspell) is RED, not purple — slot beats semantics", () => {
    const s = resolveLogStyle("spell-cast", "reaction");
    expect(s.glyphColor).toBe("var(--at-reaction)");
    expect(s.borderColor).toBe("var(--at-reaction-vivid)");
  });

  it("a bonus-action heal/potion is BLUE, not green — slot beats effect", () => {
    // The potion-drink action logs type "heal" but is a Bonus Action (2024 rule).
    const s = resolveLogStyle("heal", "bonus");
    expect(s.hueFamily).toBe("bonus");
    expect(s.glyphColor).toBe("var(--at-bonus)");
    expect(s.borderColor).toBe("var(--at-bonus-vivid)");
  });

  it("GLYPH SHAPE still follows the semantic type, independent of the slot", () => {
    // Same Sparkles icon whether the spell was an Action or a Reaction.
    const asAction = resolveLogStyle("spell-cast", "action");
    const asReaction = resolveLogStyle("spell-cast", "reaction");
    expect(asAction.glyph).toBe(asReaction.glyph);
  });

  it("glyph + border stay in ONE family for every slot (no intra-row drift)", () => {
    for (const slot of ["action", "bonus", "reaction", "free"] as const) {
      const s = resolveLogStyle("spell-cast", slot);
      const fam = FAMILY_EXPECT[s.hueFamily];
      expect(s.glyphColor, `glyph @ ${slot}`).toBe(fam.glyph);
      expect(s.borderColor, `border @ ${slot}`).toBe(fam.border);
    }
  });

  it("a slot-LESS non-action event keeps its semantic hue (fallback)", () => {
    expect(resolveLogStyle("death-save").hueFamily).toBe("reaction");
    expect(resolveLogStyle("save").hueFamily).toBe("warning");
    expect(resolveLogStyle("rest").hueFamily).toBe("free");
  });
});
