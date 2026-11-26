/**
 * A state on a creature that gives its OWN next attack roll Disadvantage, and that
 * roll spends (SRD 5.2.1): Ray of Enfeeblement on a success ("Disadvantage on the next
 * attack roll it makes until the start of your next turn"), Sap ("Disadvantage on its
 * next attack roll before the start of your next turn"). In a shared fight the player's
 * tray says it on each attack row, and the attack spends it, hit or miss.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  reinstatePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import i18n from "@/i18n";
import {
  attackRowChips,
  incomingAttackLabel,
} from "@/components/shared/damage-tray-target";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { nextAttackModes } from "@/lib/combat-effects";
import {
  initialTrayRow,
  setAttackOutcome,
  toggleSaved,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const ME = "pc-me";

function on(
  target: string,
  source: ActiveCombatEffect["source"],
  activeKey: string,
  id = `${activeKey}-${target}`
): CombatEffectOp {
  return {
    id: `op-${id}`,
    kind: "apply",
    effect: {
      id,
      actor: { kind: "monster", combatantId: "cultist" },
      target: target.startsWith("pc-")
        ? { kind: "pc", combatantId: target, memberUid: "me", characterId: "c1" }
        : { kind: "monster", combatantId: target },
      source,
      payload: { kind: "grant-group", activeKey },
      duration: { kind: "encounter" },
    },
  };
}

const ray = { kind: "spell" as const, id: "ray-of-enfeeblement", actionId: "x" };
const rider = on(ME, ray, "ray-of-enfeeblement-next-attack");
const weakened = on(ME, ray, "spell-ray-of-enfeeblement");
const sapped = on(
  "goblin-a",
  { kind: "feature", id: "mastery-sap", actionId: "x" },
  "sapped"
);

describe("nextAttackModes: the states its own next attack roll spends", () => {
  it("Ray of Enfeeblement's success rider: Disadvantage, from the spell", () => {
    expect(nextAttackModes([rider], ME)).toEqual([
      expect.objectContaining({
        sourceKind: "spell",
        sourceId: "ray-of-enfeeblement",
        mode: "disadvantage",
      }),
    ]);
  });

  it("Sap is the same one-shot state", () => {
    expect(nextAttackModes([sapped], "goblin-a")).toEqual([
      expect.objectContaining({
        sourceKind: "feature",
        sourceId: "mastery-sap",
        mode: "disadvantage",
      }),
    ]);
  });

  it("a lasting state is not one (the failed save's Strength attacks)", () => {
    expect(nextAttackModes([weakened], ME)).toEqual([]);
  });

  it("a state on another creature is not mine", () => {
    expect(nextAttackModes([sapped], ME)).toEqual([]);
  });
});

describe("my tray says it on each attack row", () => {
  const glimmer = on(
    "goblin-a",
    { kind: "spell", id: "guiding-bolt", actionId: "x" },
    "guiding-bolt-glimmer"
  );

  it("after the target's own modes, my rider, spent by this attack", () => {
    expect(attackRowChips([glimmer, rider, weakened], "goblin-a", ME)).toEqual([
      {
        sourceKind: "spell",
        sourceId: "guiding-bolt",
        mode: "advantage",
        consumed: true,
      },
      {
        sourceKind: "spell",
        sourceId: "ray-of-enfeeblement",
        mode: "disadvantage",
        consumed: true,
      },
    ]);
  });

  it("«Disadvantage (Ray of Enfeeblement, spent by this attack)», in both languages", async () => {
    const [chip] = attackRowChips([rider], "goblin-a", ME);
    if (!chip) throw new Error("no chip");
    await i18n.changeLanguage("en");
    expect(incomingAttackLabel(chip, i18n.t.bind(i18n) as never, "en")).toBe(
      "Disadvantage (Ray of Enfeeblement, spent by this attack)"
    );
    await i18n.changeLanguage("it");
    expect(incomingAttackLabel(chip, i18n.t.bind(i18n) as never, "it")).toBe(
      "Svantaggio (Raggio di Affaticamento, si consuma)"
    );
    await i18n.changeLanguage("en");
  });
});

describe("my tray spends it", () => {
  const attack = {
    effect: "damage",
    damageType: "slashing",
    attack: { onMiss: "none" },
  } as DamageTrayPlan;
  const save = {
    effect: "damage",
    damageType: "fire",
    save: { ability: "DEX", dc: 13, onSave: "half" },
  } as DamageTrayPlan;
  const target = { id: "goblin-a", name: "Goblin", kind: "monster" as const };
  const offer = (plan: DamageTrayPlan) => ({
    characterId: "c1",
    actionName: "Longsword",
    source: { custom: "Longsword" },
    castLogId: null,
    actionId: "weapon-longsword",
    plan,
  });
  const t = ((k: string) => k) as never;

  beforeEach(() => {
    io.appendPersistentCombatEffect.mockClear();
    io.revokePersistentCombatEffect.mockClear();
    io.reinstatePersistentCombatEffect.mockClear();
    useCharacterStore.setState({ character: makeCharacterDoc(), readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "camp",
        myId: ME,
        characterId: "c1",
        round: 2,
        encounter: { effectOps: [rider, weakened] },
        view: { rows: [{ id: "goblin-a", kind: "monster" }] },
      } as never,
    });
  });

  it("my attack, even a miss, revokes my rider (not the lasting state); undo reinstates it", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const row = setAttackOutcome(initialTrayRow(attack, "goblin-a"), "miss", attack);
    applyTray(offer(attack), [target], [row], [0], t);
    await writesSettled();
    expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith(
      "camp",
      "ray-of-enfeeblement-next-attack-pc-me"
    );
    expect(io.revokePersistentCombatEffect).toHaveBeenCalledTimes(1);
    useUndoStore.getState().undo();
    await writesSettled();
    expect(io.reinstatePersistentCombatEffect).toHaveBeenCalledWith(
      "camp",
      "ray-of-enfeeblement-next-attack-pc-me"
    );
    vi.unstubAllEnvs();
  });

  it("a save tray is no attack roll: the rider waits", async () => {
    const row = toggleSaved(initialTrayRow(save, "goblin-a"), save);
    applyTray(offer(save), [target], [row], [4], t);
    await writesSettled();
    expect(io.revokePersistentCombatEffect).not.toHaveBeenCalled();
  });
});
