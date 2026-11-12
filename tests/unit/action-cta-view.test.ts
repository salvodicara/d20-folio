/**
 * `actionCtaView` — every action button's state from the turn the caller passes in,
 * shared by the old sheet's Play tab and the new Play screen. Cases from the rules it
 * reads: the Two-Weapon Fighting gate and cap, Extra Attack's live swings, the
 * Action slot's budget, the round's one Reaction, and a condition's reason line.
 */
import { describe, expect, it } from "vitest";

import { resolveConditionEffects } from "@/lib/condition-effects";
import { buildDevScenario } from "@/lib/dev-scenarios";
import {
  actionCtaView,
  type ActionConditions,
  type ActionTurnState,
} from "@/lib/views/action-cta-view";
import { localizeActions } from "@/lib/views/combat-action-view";

const scenario = buildDevScenario("twf-extra-attack");
if (!scenario) throw new Error("dev scenario twf-extra-attack is missing");
const doc = scenario;
const actions = localizeActions(doc, "en");
const NO_CONDITIONS: ActionConditions = {
  facts: {},
  list: [],
  effects: resolveConditionEffects([], {}),
};
const fresh: ActionTurnState = {
  selected: { action: [], bonus: [], free: [] },
  budget: { action: 1, bonus: 1 },
  attackBudget: 2,
  attacksUsed: 0,
  attackSwingIds: [],
  reactionUsed: false,
  reactionUsedId: null,
  movementUsedFt: 0,
  warMagicMax: -1,
};
const offHands = actions.filter((a) => a.offhand).map((a) => a.id);
const dagger = actions.find((a) => a.id === "weapon-dagger");

describe("actionCtaView", () => {
  it("keeps the off-hand attacks back until a Light main-hand attack lands", () => {
    expect(offHands.length).toBeGreaterThan(1);
    const before = actionCtaView(doc, actions, fresh, NO_CONDITIONS);
    expect(offHands.every((id) => before.get(id)?.hidden)).toBe(true);
    expect(before.get("weapon-dagger")).toMatchObject({ hidden: false, verb: "attack" });

    // Extra Attack: the swing rides the Attack action, the group entry holds the slot.
    const swung: ActionTurnState = {
      ...fresh,
      selected: { action: [{ id: "attack-group" }], bonus: [], free: [] },
      attacksUsed: 1,
      attackSwingIds: ["weapon-dagger"],
    };
    const after = actionCtaView(doc, actions, swung, NO_CONDITIONS);
    expect(offHands.some((id) => after.get(id)?.hidden)).toBe(false);
    // One swing left: the attack buttons are live, not spent, though the slot is full.
    expect(after.get("weapon-dagger")).toMatchObject({
      attacksLeft: { remaining: 1, total: 2 },
      attackOccupant: true,
      state: { spent: false, emphasis: true },
    });
  });

  it("once one off-hand attack is taken, the others read spent", () => {
    const [first, second] = offHands;
    // An off-hand attack takes the Bonus Action (or rides free with Nick).
    const slot = actions.find((a) => a.id === first)?.type === "bonus" ? "bonus" : "free";
    const turn: ActionTurnState = {
      ...fresh,
      selected: {
        action: [{ id: "attack-group" }],
        bonus: slot === "bonus" ? [{ id: first ?? "" }] : [],
        free: slot === "free" ? [{ id: first ?? "" }] : [],
      },
      attacksUsed: 2,
      attackSwingIds: ["weapon-dagger"],
    };
    const view = actionCtaView(doc, actions, turn, NO_CONDITIONS);
    expect(view.get(first ?? "")).toMatchObject({
      committed: true,
      state: { spent: true },
    });
    expect(view.get(second ?? "")).toMatchObject({
      slotFull: true,
      state: { spent: true },
    });
  });

  it("the round's Reaction, once used, spends every reaction but the one used is marked", () => {
    const reactions = actions.filter(
      (a) => a.type === "reaction" && a.source !== "spell"
    );
    const used = reactions[0];
    expect(used).toBeDefined();
    const view = actionCtaView(
      doc,
      actions,
      { ...fresh, reactionUsed: true, reactionUsedId: used?.id ?? null },
      NO_CONDITIONS
    );
    for (const r of reactions) {
      expect(view.get(r.id)).toMatchObject({ verb: "react", state: { spent: true } });
      expect(view.get(r.id)?.committed).toBe(r.id === used?.id);
    }
  });

  it("a condition that forbids actions dims the button and names itself", () => {
    const view = actionCtaView(doc, actions, fresh, {
      facts: {},
      list: ["incapacitated"],
      effects: resolveConditionEffects(["incapacitated"], {}),
    });
    expect(view.get(dagger?.id ?? "")).toMatchObject({
      reason: { kind: "condition", condition: "incapacitated" },
      state: { dimmed: true, disabled: false },
    });
  });
});

describe("an Action spell once the Action is spent (one rule for every row that costs it)", () => {
  const bard = buildDevScenario("evoker-wizard");
  if (!bard) throw new Error("dev scenario evoker-wizard is missing");
  const rows = localizeActions(bard, "en");
  const actionSpell = rows.find((a) => a.spellId && a.type === "action");
  const weapon = rows.find((a) => a.source === "weapon" && a.type === "action");
  if (!actionSpell || !weapon) throw new Error("no action spell or weapon");
  const spentAction: ActionTurnState = {
    ...fresh,
    attackBudget: 1,
    selected: { action: [{ id: weapon.id }], bonus: [], free: [] },
  };

  it("an attack spends the Action: the Action spell reads «Used»", () => {
    const view = actionCtaView(bard, rows, spentAction, NO_CONDITIONS);
    expect(view.get(actionSpell.id)).toMatchObject({
      slotFull: true,
      state: { spent: true, disabled: true },
    });
    // Before the attack it is free.
    expect(
      actionCtaView(bard, rows, { ...fresh, attackBudget: 1 }, NO_CONDITIONS).get(
        actionSpell.id
      )
    ).toMatchObject({ slotFull: false });
  });

  it("a cast spends the Action too: the weapon reads «Used»", () => {
    const cast: ActionTurnState = {
      ...fresh,
      attackBudget: 1,
      selected: { action: [{ id: actionSpell.id }], bonus: [], free: [] },
    };
    expect(actionCtaView(bard, rows, cast, NO_CONDITIONS).get(weapon.id)).toMatchObject({
      slotFull: true,
    });
  });

  it("Action Surge: its extra action attacks but can't cast (\u00abexcept the Magic action\u00bb)", () => {
    const surging = structuredClone(bard);
    surging.character.features.push({ srdId: "fighter-action-surge" });
    surging.session.activeFeatures = [
      ...(surging.session.activeFeatures ?? []),
      "fighter-action-surge",
    ];
    const its = localizeActions(surging, "en");
    const spell = its.find((a) => a.id === actionSpell.id);
    if (!spell) throw new Error("no spell row");
    const budget = { action: 2, bonus: 1 };
    // Attacked first: the surge takes the Attack, the turn's own Action still casts.
    const attacked: ActionTurnState = {
      ...fresh,
      attackBudget: 1,
      budget,
      selected: {
        action: [{ id: weapon.id, economyCategory: "attack" }],
        bonus: [],
        free: [],
      },
    };
    expect(
      actionCtaView(surging, its, attacked, NO_CONDITIONS).get(spell.id)
    ).toMatchObject({ slotFull: false });
    // Cast first: a second spell has only the surge left, which can't cast.
    const cast: ActionTurnState = {
      ...attacked,
      selected: {
        action: [{ id: spell.id, economyCategory: "magic" }],
        bonus: [],
        free: [],
      },
    };
    const view = actionCtaView(surging, its, cast, NO_CONDITIONS);
    expect(view.get(spell.id)).toMatchObject({ slotFull: true });
    expect(view.get(weapon.id)).toMatchObject({ slotFull: false });
  });

  it("Ready took the Action: the spell to ready still casts", () => {
    const ready: ActionTurnState = {
      ...fresh,
      attackBudget: 1,
      selected: { action: [{ id: "base-ready" }], bonus: [], free: [] },
    };
    expect(
      actionCtaView(bard, rows, ready, NO_CONDITIONS).get(actionSpell.id)
    ).toMatchObject({ slotFull: false });
  });

  it("War Magic: a cantrip riding an Extra Attack swing follows the swings", () => {
    const cantrip = rows.find((a) => a.spellId === "fire-bolt");
    if (!cantrip) throw new Error("no Fire Bolt");
    const swinging: ActionTurnState = {
      ...fresh,
      attackBudget: 2,
      attacksUsed: 1,
      warMagicMax: 0,
      selected: { action: [{ id: "attack-group" }], bonus: [], free: [] },
    };
    expect(
      actionCtaView(bard, rows, swinging, NO_CONDITIONS).get(cantrip.id)
    ).toMatchObject({
      slotFull: false,
      attacksLeft: { remaining: 1, total: 2 },
    });
  });

  it("a Reaction spell doesn't wait on the Action", () => {
    const shielded = structuredClone(bard);
    shielded.character.spells.push({ srdId: "shield", prepared: true });
    const its = localizeActions(shielded, "en");
    const shield = its.find((a) => a.spellId === "shield");
    if (!shield) throw new Error("no Shield");
    expect(
      actionCtaView(shielded, its, spentAction, NO_CONDITIONS).get(shield.id)
    ).toMatchObject({ slotFull: false });
  });

  it("Quickened Spell with the points and the Bonus Action free keeps it castable", () => {
    const sorcerer = buildDevScenario("font-sorcerer");
    if (!sorcerer) throw new Error("dev scenario font-sorcerer is missing");
    const its = localizeActions(sorcerer, "en");
    const fireBolt = its.find((a) => a.spellId === "fire-bolt");
    const turn: ActionTurnState = {
      ...fresh,
      attackBudget: 1,
      selected: { action: [{ id: "spent-elsewhere" }], bonus: [], free: [] },
    };
    expect(
      actionCtaView(sorcerer, its, turn, NO_CONDITIONS).get(fireBolt?.id ?? "")
    ).toMatchObject({ slotFull: false });
    // The Bonus Action spent too: nowhere left to cast it.
    const both = { ...turn, selected: { ...turn.selected, bonus: [{ id: "x" }] } };
    expect(
      actionCtaView(sorcerer, its, both, NO_CONDITIONS).get(fireBolt?.id ?? "")
    ).toMatchObject({ slotFull: true });
  });
});
