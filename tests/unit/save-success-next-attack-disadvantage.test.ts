/**
 * Ray of Enfeeblement on a successful save (SRD 5.2.1): "On a successful save, the
 * target has Disadvantage on the next attack roll it makes until the start of your
 * next turn." The cast's catalogue effect `next-attack-disadvantage` (the target's own
 * next attack roll) lands a one-shot state on a target that saved; a target that
 * failed takes the spell's full effect instead. Its next attack roll spends the state,
 * or it ends at the start of the caster's next turn.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import {
  combineWriters,
  saveFailedWriter,
  saveSuccessWriter,
  standingOutcomeWriter,
} from "@/features/character/center/outcome-offer";
import i18n from "@/i18n";
import en from "@/i18n/en/srd/spells.json";
import { effectIdsConsumedByRoll, foldCombatEffectOps } from "@/lib/combat-effects";
import { resolveCombatEffectGrants } from "@/lib/resolve-grant-sources";
import {
  damageTrayPlan,
  initialTrayRow,
  rowSavedLeaves,
  toggleSaved,
} from "@/lib/play/damage-tray";
import { sourcedFightConditions } from "@/lib/play/fight-condition-ends";
import { monsterTurnModifiers } from "@/lib/play/monster-turn-modifiers";
import { outcomeEffects } from "@/lib/play/outcome-effects";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
  EncounterPosition,
} from "@/types/combat-effect";

const RIDER = "ray-of-enfeeblement-next-attack";

const wizard = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 5 }],
  spells: [{ srdId: "ray-of-enfeeblement" }],
});
const ray = resolveActions(wizard, "spellbook")
  .map((row) => localizeAction(row, "en"))
  .find((a) => a.spellId === "ray-of-enfeeblement" && !a.id.endsWith("-recurring"));
if (!ray) throw new Error("no Ray of Enfeeblement cast row");

const caster: CombatantRef = {
  kind: "pc",
  combatantId: "pc-me",
  memberUid: "me",
  characterId: wizard.id,
};
const goblin: CombatantRef = { kind: "monster", combatantId: "goblin-a" };
const apply = (effect: ActiveCombatEffect): CombatEffectOp => ({
  id: `op-${effect.id}`,
  kind: "apply",
  effect,
});
const revoke = (effectId: string): CombatEffectOp => ({
  id: `op-revoke-${effectId}`,
  kind: "revoke",
  effectId,
  actorId: "pc-me",
  targetId: "goblin-a",
});

/** The rider a saved Goblin takes from a cast in round 2. */
function riderOn(target: CombatantRef, round = 2): ActiveCombatEffect {
  const [rider] = outcomeEffects({
    source: { kind: "spell", id: "ray-of-enfeeblement", actionId: ray?.id ?? "" },
    effects: ray?.summary.saveSuccessEffects ?? [],
    outcome: "save-success",
    actor: caster,
    target,
    round,
    effectId: () => "rider-a",
  });
  if (!rider) throw new Error("no rider written");
  return rider;
}

describe("the SRD text", () => {
  it("a successful save still gives Disadvantage on the target's next attack roll", () => {
    const text = (en as Record<string, { description?: string }>)["ray-of-enfeeblement"];
    expect(text?.description).toMatch(
      /On a successful save, the target has Disadvantage on the next attack roll it makes until the start of your next turn\./
    );
  });
});

describe("the cast carries the success rider", () => {
  it("one `next-attack-disadvantage` state for a successful save, held by the spell", () => {
    expect(ray.summary.targetStateSource).toEqual({
      kind: "spell",
      id: "ray-of-enfeeblement",
    });
    expect(ray.summary.saveSuccessEffects).toEqual([
      expect.objectContaining({
        kind: "next-attack-disadvantage",
        saveOutcome: "success",
        activeKey: RIDER,
      }),
    ]);
    // A failed save takes the full effect (the standing state), never the rider.
    expect(ray.summary.saveFailedEffects).toBeUndefined();
  });

  it("the rider is not a status the cast lights on the caster", () => {
    expect(ray.activatesKey).toBeUndefined();
    expect(ray.standingEffect?.activeKey).toBe("spell-ray-of-enfeeblement");
  });
});

describe("the state on the target", () => {
  it("Disadvantage on its own next attack roll, spent by that roll", () => {
    expect(resolveCombatEffectGrants(riderOn(goblin))).toEqual([
      {
        type: "disadvantage-on",
        rollType: "attack",
        scope: "all",
        vs: "next-attack-roll",
        consume: "next",
      },
    ]);
  });

  it("until the start of the caster's next turn (the next round's turn start)", () => {
    expect(riderOn(goblin, 2).duration).toEqual({
      kind: "turn-boundary",
      combatantId: "pc-me",
      round: 3,
      phase: "turn-start",
    });
  });

  it("is gone once the caster's next turn starts", () => {
    const ops = [apply(riderOn(goblin, 2))];
    const order = ["pc-me", "goblin-a"];
    const at = (round: number, current: string): EncounterPosition => ({
      round,
      currentCombatantId: current,
      phase: "turn-start",
      order,
    });
    expect(foldCombatEffectOps(ops, at(2, "goblin-a"))).toHaveLength(1);
    expect(foldCombatEffectOps(ops, at(3, "pc-me"))).toEqual([]);
  });

  it("asks no repeat save: the spell's CON repeat save is the failed target's", () => {
    expect(sourcedFightConditions([apply(riderOn(goblin))])).toEqual([]);
  });
});

describe("the DM's monster attack", () => {
  it("its next attack roll has Disadvantage, named after the spell", () => {
    const mods = monsterTurnModifiers([apply(riderOn(goblin))], "goblin-a");
    expect(mods.attack).toBe("disadvantage");
    expect(mods.attackModeSources).toEqual([
      { kind: "spell", id: "ray-of-enfeeblement" },
    ]);
  });

  it("its first attack spends it: the second attack of its turn is a straight roll", () => {
    const ops = [apply(riderOn(goblin))];
    const spent = effectIdsConsumedByRoll(ops, "goblin-a", "attack");
    expect(spent).toEqual(["rider-a"]);
    const after = [...ops, ...spent.map(revoke)];
    expect(monsterTurnModifiers(after, "goblin-a").attack).toBeNull();
  });
});

describe("the tray: a saved row takes the rider, a failed row the full effect", () => {
  beforeEach(() => {
    io.appendPersistentCombatEffect.mockClear();
    useCharacterStore.setState({ character: wizard, readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: wizard.id,
        round: 2,
        encounter: {
          effectOps: [],
          currentCombatantId: "pc-me",
          order: ["pc-me", "goblin-a", "goblin-b"],
        },
        view: {
          rows: [
            { id: "goblin-a", kind: "monster" },
            { id: "goblin-b", kind: "monster" },
          ],
          turnOrderIds: ["pc-me", "goblin-a", "goblin-b"],
        },
      } as never,
    });
  });

  it("the plan says what a saved row still takes", () => {
    const plan = damageTrayPlan(ray, ["goblin-a"], "pc-me");
    expect(plan?.savedLeaves).toEqual(["next-attack-disadvantage"]);
  });

  it("a saved row reads the rider, never «No effect»; a failed row does not", async () => {
    const plan = damageTrayPlan(ray, ["goblin-a"], "pc-me");
    if (!plan) throw new Error("no tray plan");
    const failed = initialTrayRow(plan, "goblin-a");
    const saved = toggleSaved(failed, plan);
    expect(rowSavedLeaves(plan, failed)).toEqual([]);
    const [kind] = rowSavedLeaves(plan, saved);
    expect(kind).toBe("next-attack-disadvantage");
    await i18n.changeLanguage("en");
    expect(i18n.t(`combat.damageTray.savedLeaves.${kind}`)).toBe(
      "Disadvantage on its next attack roll"
    );
    await i18n.changeLanguage("it");
    // The Italian SRD: «svantaggio al suo tiro per colpire successivo».
    expect(i18n.t(`combat.damageTray.savedLeaves.${kind}`)).toBe(
      "Svantaggio al tiro per colpire successivo"
    );
    await i18n.changeLanguage("en");
  });

  it("writes the rider on the saved Goblin and the weakened state on the failed one", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const plan = damageTrayPlan(ray, ["goblin-a", "goblin-b"], "pc-me");
    if (!plan) throw new Error("no tray plan");
    const onSaved = saveSuccessWriter(ray, wizard.id);
    // The same writers the cast's tray gets (TurnEconomyProvider.offerFollowUps).
    const onFailed = combineWriters(
      saveFailedWriter(ray, wizard.id),
      standingOutcomeWriter(ray, wizard, "failed-save")
    );
    expect(onSaved).toBeDefined();
    expect(onFailed).toBeDefined();
    const offer = {
      characterId: wizard.id,
      actionName: "Ray of Enfeeblement",
      source: { custom: "Ray of Enfeeblement" },
      castLogId: null,
      actionId: ray.id,
      plan,
      ...(onSaved ? { onSaved } : {}),
      ...(onFailed ? { onFailed } : {}),
    };
    const targets = [
      { id: "goblin-a", name: "Goblin A", kind: "monster" as const },
      { id: "goblin-b", name: "Goblin B", kind: "monster" as const },
    ];
    const saved = toggleSaved(initialTrayRow(plan, "goblin-a"), plan);
    const failed = initialTrayRow(plan, "goblin-b");
    applyTray(offer, targets, [saved, failed], [0, 0], ((k: string) => k) as never);
    await writesSettled();
    const written = (
      io.appendPersistentCombatEffect.mock.calls as unknown as Array<
        [string, ActiveCombatEffect]
      >
    ).map(([, effect]) => [effect.target.combatantId, effect.payload]);
    expect(written).toEqual(
      expect.arrayContaining([
        ["goblin-a", { kind: "grant-group", activeKey: RIDER }],
        ["goblin-b", { kind: "grant-group", activeKey: "spell-ray-of-enfeeblement" }],
      ])
    );
    expect(written).toHaveLength(2);
    vi.unstubAllEnvs();
  });
});
