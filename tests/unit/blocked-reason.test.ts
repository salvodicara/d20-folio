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
  committedOffHandId,
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

// RA-13 — the TWF once-per-turn off-hand cap. A dual-wielder holding a
// Nick-mastered Light weapon (off-hand rides the uncapped `free` slot) AND a
// second, non-Nick Light weapon (off-hand costs a `bonus`) has TWO off-hand rows
// in two different slots — the slot budget alone can't stop BOTH being committed,
// yet the Light property grants only ONE extra attack per turn. `committedOffHandId`
// makes all off-hand rows one mutually-exclusive resource so exactly one survives.
describe("committedOffHandId — the TWF one-off-hand-attack-per-turn cap", () => {
  // A Nick off-hand (free economy) + a non-Nick off-hand (bonus economy): the
  // two real rows the engine emits for a Nick-dagger + shortsword dual-wielder.
  const nickOffHand = { id: "weapon-dagger-offhand", offhand: true }; // Nick → free
  const bonusOffHand = { id: "weapon-shortsword-offhand", offhand: true }; // non-Nick → bonus
  const mainHand = { id: "weapon-dagger", offhand: false }; // a main-hand row (never capped)
  const offHands = [nickOffHand, bonusOffHand, mainHand];

  it("no off-hand committed → null (both rows freely usable)", () => {
    expect(committedOffHandId(offHands, new Set())).toBeNull();
  });

  it("committing the Nick (free) off-hand claims the turn's extra attack", () => {
    expect(committedOffHandId(offHands, new Set(["weapon-dagger-offhand"]))).toBe(
      "weapon-dagger-offhand"
    );
  });

  it("committing the non-Nick (bonus) off-hand also claims it (either slot counts)", () => {
    expect(committedOffHandId(offHands, new Set(["weapon-shortsword-offhand"]))).toBe(
      "weapon-shortsword-offhand"
    );
  });

  it("a committed MAIN-hand attack never claims the off-hand cap", () => {
    expect(committedOffHandId(offHands, new Set(["weapon-dagger"]))).toBeNull();
  });

  // The pure composition pin: once one off-hand is committed, feeding the "not
  // the claimant" verdict as `slotFull` into `combatCtaState` resolves the OTHER
  // off-hand row spent+disabled ("Used") — so only ONE off-hand attack survives
  // per turn across free+bonus. This pins the two ENGINE seams in isolation; the
  // LIVE PlayTab `slotFullFor` closure (the `offhand` guard + `!==` comparison
  // that actually wires them) is pinned by the render test in
  // `combat-action-derivations.test.tsx` — a change there can't slip past both.
  it("only ONE off-hand commit survives — the other reads 'Used' (spent + disabled)", () => {
    const claimed = committedOffHandId(offHands, new Set([nickOffHand.id]));
    // The claimant-match verdict `slotFullFor` composes (an off-hand that is NOT
    // the claimant is full); the live closure that mirrors it lives in PlayTab.
    const slotFullFor = (a: { id: string; offhand: boolean }) =>
      a.offhand && claimed != null && claimed !== a.id;
    expect(slotFullFor(bonusOffHand)).toBe(true);
    const cta = combatCtaState({
      committed: false,
      slotFull: slotFullFor(bonusOffHand),
      attackLive: false,
      depleted: false,
      conditionBlocked: false,
    });
    expect(cta.spent).toBe(true); // reads the "Used" label
    expect(cta.disabled).toBe(true); // cannot be committed
    // The committed off-hand itself is unaffected by the cap (its own "Used"
    // comes from `committed`, not the sibling cap).
    expect(slotFullFor(nickOffHand)).toBe(false);
  });
});
