/**
 * A zone's hit on a monster, through the DM's edit log, then undone from its toast:
 * the undo gives back only that monster's Hit Points. A change made to another monster
 * in between survives, on screen and on the server. The engine and the edit log are
 * the real ones; only the campaign's I/O is a stand-in server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const io = vi.hoisted(() => ({
  rebaseEncounterEdits: vi.fn(),
  writeWholeEncounter: vi.fn(() => Promise.resolve()),
  readServerEncounter: vi.fn(),
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  writeCampaignCombatEffect: vi.fn(() =>
    Promise.resolve({ before: {}, after: {}, spends: [] })
  ),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);
vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { MonsterZoneHits } from "@/domains/combat/ui/MonsterZones";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { replayEdits, type EncounterEdit } from "@/features/campaigns/encounter-edit-log";
import {
  closeEncounterEdits,
  editEncounter,
} from "@/features/campaigns/encounter-edit-sync";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import { applyAdversaryDamage } from "@/features/campaigns/encounter-world-command";
import { useZoneHitStore } from "@/features/campaigns/zone-hit-store";
import { addMonster, startEncounter } from "@/lib/play/encounter";
import { activeZones, monsterZoneEffect } from "@/lib/zones";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const zone = activeZones([
  monsterZoneEffect({
    effectId: "z1",
    monsterId: "m-cultist",
    spellId: "spirit-guardians",
    castLevel: 3,
    saveDc: 14,
  }),
])[0];
const rows = [
  { id: "monster-1", kind: "monster", name: "Goblin 1", maxHp: 7 },
  { id: "monster-2", kind: "monster", name: "Goblin 2", maxHp: 7 },
] as EncounterCombatantView[];

/** Two goblins, 7 HP each. */
function fight(): EncounterState {
  return addMonster(startEncounter({}, [], 1), {
    name: "Goblin",
    ac: 12,
    maxHp: 7,
    count: 2,
    initiative: null,
  });
}

const hp = (f: EncounterState | null | undefined, id: string) => {
  const c = f?.combatants.find((x) => x.id === id);
  return c?.kind === "monster" ? c.hp.current : undefined;
};
const shown = () => useCampaignStore.getState().campaign?.encounter;

let server: EncounterState | null;

beforeEach(() => {
  vi.useFakeTimers();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  vi.stubGlobal("navigator", { onLine: true });
  server = fight();
  io.rebaseEncounterEdits.mockImplementation(
    (_id: string, edits: readonly EncounterEdit[]) => {
      server = replayEdits(server, edits);
      return Promise.resolve(server);
    }
  );
  io.readServerEncounter.mockImplementation(() => Promise.resolve(server));
  useCampaignStore.setState({
    campaign: { id: "c1", encounter: server } as unknown as CampaignDoc,
  });
  if (!zone) throw new Error("no zone");
  useZoneHitStore.setState({ hits: [] });
  useZoneHitStore.getState().turnChanged([
    {
      zone,
      creatureId: "monster-1",
      kind: "end-turn",
      key: "z1:monster-1",
      creatureName: "Goblin 1",
    },
  ]);
});

afterEach(() => {
  closeEncounterEdits("c1");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a zone's hit on a monster, undone", () => {
  it("gives back only that monster's HP; a change to another monster survives", async () => {
    const onToast = vi.fn();
    render(
      <MonsterZoneHits
        campaignId="c1"
        casterIds={["m-cultist"]}
        rows={rows}
        locale="en"
        onToast={onToast}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    fireEvent.change(screen.getByLabelText("Rolled total"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(hp(shown(), "monster-1")).toBe(3);
    // The same toast as before: its words, then its undo.
    const [message, undo] = onToast.mock.calls[0] as [string, () => void];
    expect(message).toBe("4 damage to Goblin 1");

    // Meanwhile the other goblin is hit, and the zone's hit reaches the server.
    editEncounter("c1", (f) => applyAdversaryDamage(f, "c1", "monster-2", 2));
    await act(() => vi.runAllTimersAsync());
    expect(hp(server, "monster-1")).toBe(3);
    expect(hp(server, "monster-2")).toBe(5);

    act(() => undo());
    expect(hp(shown(), "monster-1")).toBe(7);
    expect(hp(shown(), "monster-2")).toBe(5);
    await act(() => vi.runAllTimersAsync());
    expect(hp(server, "monster-1")).toBe(7);
    expect(hp(server, "monster-2")).toBe(5);
  });
});
