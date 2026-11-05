/**
 * Every spell whose state lands on a failed save or a hit reaches its target through
 * the real tray (#793's writer was right and the apply dropped its rows): for each one
 * in the composed catalogue, the tray its cast opens, applied with the target failing
 * (a save) or hit (an attack), writes the state on that target.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import { spells } from "@/data/spells";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { standingOutcomeWriter } from "@/features/character/center/outcome-offer";
import { combatResolutionSpec } from "@/lib/combat-resolution";
import { damageTrayPlan, initialTrayRow } from "@/lib/play/damage-tray";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { User } from "firebase/auth";
import { makeCharacterDoc } from "./_helpers";

const COMBAT_CASTS = new Set(["action", "bonus action", "reaction"]);
const gated = spells.filter((spell) => {
  const grants = JSON.stringify(spell.grants ?? []);
  return (
    (grants.includes('"recipient":"selected"') || grants.includes('"markScope"')) &&
    COMBAT_CASTS.has(spell.castingTime) &&
    !spell.companion &&
    !spell.summonedMonsters
  );
});

describe("a state on a failed save or a hit, through the real tray", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    io.appendPersistentCombatEffect.mockClear();
    useAuthStore.setState({ user: { uid: "me" } as User });
  });

  it("covers the outcome-gated catalogue", () => {
    expect(gated.length).toBeGreaterThan(10);
  });

  for (const spell of gated) {
    it(`${spell.id}: the tray's outcome writes its state on the target`, async () => {
      const doc = makeCharacterDoc({
        classId: spell.classes[0] ?? "wizard",
        level: 20,
        spells: [{ srdId: spell.id, prepared: true }],
        spellSlots: Array.from({ length: 9 }, (_, i) => ({ level: i + 1, total: 2 })),
      });
      const action = localizeActions(doc, "en").find((a) => a.spellId === spell.id);
      if (!action) throw new Error(`${spell.id} has no cast`);
      const kind = combatResolutionSpec(action).kind;
      if (kind === "automatic") return; // written at commit (#792), not by the tray
      useCharacterStore.setState({ character: doc, readonly: false });
      useCombatStatusStore.setState({
        status: {
          campaignId: "c1",
          myId: "pc-me",
          characterId: doc.id,
          round: 1,
          encounter: { effectOps: [], currentCombatantId: "pc-me" },
          view: {
            rows: [{ id: "m-1", kind: "monster" }],
            turnOrderIds: ["pc-me", "m-1"],
          },
        } as never,
      });
      const plan = damageTrayPlan(action, ["m-1"], "pc-me");
      if (!plan) throw new Error(`${spell.id} opens no tray`);
      const row = initialTrayRow(plan, "m-1");
      const onFailed = standingOutcomeWriter(action, doc, "failed-save");
      const onHit = standingOutcomeWriter(action, doc, "hit");
      applyTray(
        {
          characterId: doc.id,
          actionName: spell.id,
          source: { custom: spell.id },
          castLogId: null,
          actionId: action.id,
          plan,
          ...(onFailed ? { onFailed } : {}),
          ...(onHit ? { onHit } : {}),
        },
        [{ id: "m-1", name: "Goblin", kind: "monster" }],
        [plan.attack ? { ...row, attack: "hit" } : { ...row, saved: false }],
        [0],
        ((key: string) => key) as never
      );
      await writesSettled();
      const written = io.appendPersistentCombatEffect.mock.calls.map(
        (call) => (call as unknown as [string, ActiveCombatEffect])[1]
      );
      expect(
        written.some((e) => e.target.combatantId === "m-1" && e.source.id === spell.id)
      ).toBe(true);
    });
  }
});
