/**
 * A save spell's result is written on the cast's own log line (owner, 2026-11-11, from
 * live play): Faerie Fire on two creatures that both succeed still spent its slot, and
 * the session report says all targets saved, no effect. Marked with the tray's existing
 * per-row «Successo» and Apply; nothing marked, nothing changes. Through the real
 * entry point (`applyTray`), with its undo.
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
import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CombatEvent } from "@/types/combat-log";
import { makeCharacterDoc } from "./_helpers";

const druid = makeCharacterDoc({ classId: "druid", level: 3 });
const goblin = { id: "m-1", name: "Goblin", kind: "monster" } as const;
const orc = { id: "m-2", name: "Orc", kind: "monster" } as const;
const faerieFire = {
  effect: null,
  save: { ability: "DEX", dc: 13, onSave: "none" },
  targets: ["m-1", "m-2"],
} as DamageTrayPlan;

/** Log the cast line the way a cast does, and return its id. */
function castLine(): string {
  const id = useCharacterStore.getState().logEvent({
    kind: "action-use",
    action: { srd: { kind: "spell", key: "faerie-fire", field: "name" } },
    effect: "spell-cast",
    slot: "action",
    targets: ["m-1", "m-2"],
  });
  if (!id) throw new Error("no cast line");
  return id;
}

function lineOf(id: string): CombatEvent | undefined {
  return useCharacterStore
    .getState()
    .character?.session.logEntries.find((entry) => entry.id === id)?.event;
}

function apply(castLogId: string, saved: [boolean, boolean]): void {
  applyTray(
    {
      characterId: druid.id,
      actionName: "Faerie Fire",
      source: { srd: { kind: "spell", key: "faerie-fire", field: "name" } },
      castLogId,
      actionId: "cast",
      plan: faerieFire,
      onFailed: () => [],
    },
    [goblin, orc],
    [
      { ...initialTrayRow(faerieFire, "m-1"), saved: saved[0] },
      { ...initialTrayRow(faerieFire, "m-2"), saved: saved[1] },
    ],
    [0, 0],
    ((key: string) => key) as never
  );
}

describe("a save spell's result on its cast line", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    useCharacterStore.setState({ character: druid, readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: druid.id,
        round: 1,
        encounter: { effectOps: [] },
        view: {
          rows: [
            { id: "m-1", kind: "monster" },
            { id: "m-2", kind: "monster" },
          ],
        },
      } as never,
    });
  });

  it("every target saved: the line says so, with the save, though nothing was applied", async () => {
    const id = castLine();
    apply(id, [true, true]);
    await writesSettled();
    expect(lineOf(id)).toMatchObject({
      saves: { "m-1": "saved", "m-2": "saved" },
      noEffect: true,
    });
  });

  it("everyone saved against a save for half: the saves are said, «no effect» is not", async () => {
    const id = castLine();
    const fireball = {
      effect: "damage",
      damageType: "fire",
      save: { ability: "DEX", dc: 13, onSave: "half" },
      targets: ["m-1", "m-2"],
    } as DamageTrayPlan;
    applyTray(
      {
        characterId: druid.id,
        actionName: "Fireball",
        source: { srd: { kind: "spell", key: "fireball", field: "name" } },
        castLogId: id,
        actionId: "cast",
        plan: fireball,
      },
      [goblin, orc],
      [
        { ...initialTrayRow(fireball, "m-1"), saved: true },
        { ...initialTrayRow(fireball, "m-2"), saved: true },
      ],
      [14, 14],
      ((key: string) => key) as never
    );
    await writesSettled();
    const line = lineOf(id);
    expect(line).toMatchObject({ saves: { "m-1": "saved", "m-2": "saved" } });
    expect(line).not.toHaveProperty("noEffect");
  });

  it("a mixed result keeps each target's own result", async () => {
    const id = castLine();
    apply(id, [false, true]);
    await writesSettled();
    const line = lineOf(id);
    expect(line).toMatchObject({ saves: { "m-1": "failed", "m-2": "saved" } });
    expect(line).not.toHaveProperty("noEffect");
  });

  it("undo puts the line back as it was", async () => {
    const id = castLine();
    const before = lineOf(id);
    apply(id, [true, true]);
    await writesSettled();
    useUndoStore.getState().undo();
    expect(lineOf(id)).toEqual(before);
  });
});
