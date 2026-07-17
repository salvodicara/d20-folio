/**
 * `blockedReasonFor` + `combatCtaState` — the combat-CTA grammar's two pure
 * seams (combat-card-helpers).
 *
 * `blockedReasonFor` (B2) maps a card's economy `slot` + the condition-blocked
 * slot set + depleted to the ONE inline reason a card surfaces BEFORE a tap
 * (the post-tap toast stays the backstop). A SPENT economy token is NOT a
 * reason — spent-ness reads on the CTA itself, which `combatCtaState` composes:
 * ONE grammar (owner-ratified 2026-07-11) — the CTA states usability now
 * (spent ⇒ disabled "Used"; live Extra-Attack swings ⇒ struck gold; depleted ⇒
 * disabled + reason; condition ⇒ dimmed but tappable); the undo system owns
 * ALL reversal. The wiring (PlayTab → UniversalCard) is covered by the combat
 * render tests.
 */
import { describe, it, expect } from "vitest";
import {
  blockedReasonFor,
  combatCtaState,
} from "@/features/character/center/tabs/combat-card-helpers";
import type { GatedSlot } from "@/lib/condition-effects";

const NONE: ReadonlySet<GatedSlot> = new Set();
const ACTION_BLOCKED: ReadonlySet<GatedSlot> = new Set(["action", "bonus", "reaction"]);

describe("blockedReasonFor", () => {
  it("a freely usable action → null (no reason)", () => {
    expect(
      blockedReasonFor({ slot: "action", blockedSlots: NONE, depleted: false })
    ).toBeNull();
  });

  it("a depleted resource wins over the condition gate → depleted", () => {
    expect(
      blockedReasonFor({ slot: "action", blockedSlots: ACTION_BLOCKED, depleted: true })
    ).toEqual({ kind: "depleted" });
  });

  it("a condition-blocked slot → condition (carrying the slot kind to name the culprit)", () => {
    expect(
      blockedReasonFor({ slot: "action", blockedSlots: ACTION_BLOCKED, depleted: false })
    ).toEqual({ kind: "condition", slot: "action" });
  });

  it("a slot NOT in the blocked set → null even when other slots are blocked", () => {
    const onlyReaction: ReadonlySet<GatedSlot> = new Set(["reaction"]);
    expect(
      blockedReasonFor({ slot: "action", blockedSlots: onlyReaction, depleted: false })
    ).toBeNull();
  });
});

describe("combatCtaState — the ONE CTA grammar, table-driven", () => {
  const base = {
    committed: false,
    slotFull: false,
    attackLive: false,
    depleted: false,
    conditionBlocked: false,
  };

  it("freely usable → enabled verb (nothing lit, nothing dimmed)", () => {
    expect(combatCtaState(base)).toEqual({
      spent: false,
      disabled: false,
      emphasis: false,
      dimmed: false,
    });
  });

  it("the committed occupant → spent + disabled (the 'Used' state; reversal = undo)", () => {
    expect(combatCtaState({ ...base, committed: true, slotFull: true })).toEqual({
      spent: true,
      disabled: true,
      emphasis: false,
      dimmed: false,
    });
  });

  it("a full slot disables its non-occupant siblings too (the reaction contract generalized)", () => {
    expect(combatCtaState({ ...base, slotFull: true })).toEqual({
      spent: true,
      disabled: true,
      emphasis: false,
      dimmed: false,
    });
  });

  it("Extra Attack mid-swing: the slot is full but the pip card stays LIVE + struck gold", () => {
    expect(combatCtaState({ ...base, slotFull: true, attackLive: true })).toEqual({
      spent: false,
      disabled: false,
      emphasis: true,
      dimmed: false,
    });
  });

  it("the Attack action fully swung (slot full, no swings left) → spent like any action", () => {
    expect(combatCtaState({ ...base, slotFull: true, attackLive: false }).spent).toBe(
      true
    );
  });

  it("depleted → disabled with the verb + reason line (NOT the 'Used' label)", () => {
    expect(combatCtaState({ ...base, depleted: true })).toEqual({
      spent: false,
      disabled: true,
      emphasis: false,
      dimmed: false,
    });
  });

  it("condition-blocked → dimmed but TAPPABLE (override-first; the toast is the backstop)", () => {
    expect(combatCtaState({ ...base, conditionBlocked: true })).toEqual({
      spent: false,
      disabled: false,
      emphasis: false,
      dimmed: true,
    });
  });

  it("spent beats the condition dim (a spent card never double-signals)", () => {
    expect(combatCtaState({ ...base, slotFull: true, conditionBlocked: true })).toEqual({
      spent: true,
      disabled: true,
      emphasis: false,
      dimmed: false,
    });
  });
});
