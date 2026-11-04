/**
 * Stunning Strike on a successful save (2024): the target's Speed is halved and
 * attacks against it have Advantage until the start of the monk's next turn. The
 * action carries those states; the damage tray writes them to the fight for each
 * row marked Saved.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { saveSuccessWriter } from "@/features/character/center/outcome-offer";
import { resolveCombatEffectGrants } from "@/lib/resolve-grant-sources";
import { initialTrayRow, toggleSaved, type DamageTrayPlan } from "@/lib/play/damage-tray";
import { outcomeEffects, stateEffectsFor } from "@/lib/play/outcome-effects";
import { resolveActions } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const monk = makeCharacterDoc({
  classId: "monk",
  level: 5,
  features: [{ srdId: "monk-stunning-strike" }],
});
const strike = resolveActions(monk, "combat").find((a) =>
  a.id.includes("monk-stunning-strike")
);

describe("Stunning Strike's success rider", () => {
  it("the action carries the two states for a successful save", () => {
    expect(strike?.summary.saveSuccessSourceId).toBe("monk-stunning-strike");
    expect(strike?.summary.saveSuccessEffects?.map((e) => e.activeKey)).toEqual([
      "monk-stunning-strike-slowed",
      "monk-stunning-strike-exposed",
    ]);
    // A failed save applies Stunned, not these.
    expect(stateEffectsFor(strike?.summary.saveSuccessEffects ?? [], "hit")).toEqual([]);
  });

  it("each state resolves from the feature's target states and ends at the monk's next turn", () => {
    const [slowed, exposed] = outcomeEffects({
      source: { kind: "feature", id: "monk-stunning-strike", actionId: "x" },
      effects: strike?.summary.saveSuccessEffects ?? [],
      outcome: "save-success",
      actor: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: monk.id },
      target: { kind: "monster", combatantId: "monster-1" },
      round: 3,
      effectId: (i) => `e${i}`,
    });
    expect(slowed && resolveCombatEffectGrants(slowed)).toEqual([
      { type: "speed-multiplier", factor: 0.5 },
    ]);
    expect(exposed && resolveCombatEffectGrants(exposed)).toEqual([
      { type: "incoming-attack-advantage" },
    ]);
    expect(slowed?.duration).toEqual({
      kind: "turn-boundary",
      combatantId: "pc-me",
      round: 4,
      phase: "turn-start",
    });
  });
});

describe("the tray writes them for a Saved row", () => {
  beforeEach(() => {
    io.appendPersistentCombatEffect.mockClear();
    useCharacterStore.setState({ character: monk, readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: monk.id,
        round: 2,
        view: { rows: [{ id: "monster-1", kind: "monster" }] },
      } as never,
    });
  });

  it("before the v0.26.0 rules ship, nothing is written (the old rules refuse it)", () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "");
    if (!strike) throw new Error("no Stunning Strike");
    expect(saveSuccessWriter(strike, monk.id)).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("a saved monster gets both states; a failed one gets none", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    if (!strike) throw new Error("no Stunning Strike");
    const onSaved = saveSuccessWriter(strike, monk.id);
    expect(onSaved).toBeDefined();
    const plan = {
      effect: null,
      save: { ability: "CON", dc: 13, onSave: "none" },
      conditions: { options: ["stunned"], pickOne: false },
    } as DamageTrayPlan;
    const target = { id: "monster-1", name: "Ogre", kind: "monster" as const };
    const offer = {
      characterId: monk.id,
      actionName: "Stunning Strike",
      source: { custom: "Stunning Strike" },
      castLogId: null,
      actionId: strike.id,
      plan,
      ...(onSaved ? { onSaved } : {}),
    };
    const failed = initialTrayRow(plan, "monster-1");
    applyTray(offer, [target], [failed], [0], ((k: string) => k) as never);
    await Promise.resolve();
    expect(io.appendPersistentCombatEffect).not.toHaveBeenCalled();

    applyTray(
      offer,
      [target],
      [toggleSaved(failed, plan)],
      [0],
      ((k: string) => k) as never
    );
    await vi.waitFor(() =>
      expect(io.appendPersistentCombatEffect).toHaveBeenCalledTimes(2)
    );
    const written = io.appendPersistentCombatEffect.mock.calls.map(
      (call) =>
        (call as unknown as [string, { payload: { activeKey: string } }])[1].payload
          .activeKey
    );
    expect(written).toEqual([
      "monk-stunning-strike-slowed",
      "monk-stunning-strike-exposed",
    ]);
  });
});
