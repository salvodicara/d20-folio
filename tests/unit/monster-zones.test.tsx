/**
 * Monster zones on the DM's Scontro (#752): casting writes the zone; a turn question's
 * «Inside» lands the rolled damage (a monster through the encounter, undoable; a
 * character through its sheet, half on a save that halves); «Outside» lets it go.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  writeCampaignCombatEffect: vi.fn(() =>
    Promise.resolve({ before: {}, after: {}, spends: [] })
  ),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);
const damage = vi.hoisted(() => ({
  applyAdversaryDamageParts: vi.fn((enc: unknown) => ({
    ...(enc as object),
    damaged: true,
  })),
  undoAdversaryHit: vi.fn((enc: unknown) => ({
    ...(enc as object),
    damaged: undefined,
  })),
}));
vi.mock("@/features/campaigns/encounter-world-command", () => damage);
// The DM's edit log, applied straight to the store (its sending is tested on its own).
vi.mock("@/features/campaigns/encounter-edit-sync", async () => {
  const { useCampaignStore: store } = await import("@/features/campaigns/campaignStore");
  return {
    editEncounter: (_campaignId: string, apply: (fight: never) => unknown) => {
      const fight = store.getState().campaign?.encounter;
      if (fight) store.getState().setEncounter(apply(fight as never) as never);
    },
  };
});
vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { MonsterZoneCast, MonsterZoneHits } from "@/domains/combat/ui/MonsterZones";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import { useZoneHitStore } from "@/features/campaigns/zone-hit-store";
import { activeZones } from "@/lib/zones";
import { monsterZoneEffect } from "@/lib/zones";
import type { CampaignDoc } from "@/types/campaign";

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
  { id: "m-gob", kind: "monster", name: "Goblin", maxHp: 7 },
  {
    id: "pc-mara",
    kind: "pc",
    name: "Bard",
    memberUid: "mara",
    characterId: "c1",
    maxHp: 24,
  },
] as EncounterCombatantView[];
const theZone = () => {
  if (!zone) throw new Error("no zone");
  return zone;
};
const ask = (creatureId: string, name: string) =>
  useZoneHitStore.getState().turnChanged([
    {
      zone: theZone(),
      creatureId,
      kind: "end-turn",
      key: `z1:${creatureId}`,
      creatureName: name,
    },
  ]);

describe("monster zones", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    vi.clearAllMocks();
    useZoneHitStore.setState({ hits: [] });
    useCampaignStore.setState({
      campaign: { id: "c1", encounter: { combatants: [] } } as unknown as CampaignDoc,
    });
  });

  it("casting writes the monster's zone with the stat block's DC", () => {
    const onToast = vi.fn();
    render(
      <MonsterZoneCast
        campaignId="c1"
        monsterId="m-cultist"
        monsterName="Cultist"
        defaultDc={15}
        locale="en"
        onToast={onToast}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cast an area spell" }));
    fireEvent.click(screen.getByRole("button", { name: "Spirit Guardians" }));
    fireEvent.click(screen.getByRole("button", { name: "Cast" }));
    expect(io.appendPersistentCombatEffect).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ bindings: { saveDc: 15 } })
    );
    expect(onToast.mock.calls[0]?.[0]).toBe("Cultist casts Spirit Guardians");
  });

  it("inside, on a monster: the rolled damage lands through the encounter, undoable", () => {
    ask("m-gob", "Goblin");
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
    expect(
      screen.getByText("Wisdom save, DC 14 · 3d8 Radiant · half on a success")
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Rolled total"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(damage.applyAdversaryDamageParts).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "m-gob",
      [{ amount: 13, type: "radiant" }],
      "z1:m-gob"
    );
    expect(useCampaignStore.getState().campaign?.encounter).toEqual({
      combatants: [],
      damaged: true,
    });
    const [message, undo] = onToast.mock.calls[0] as [string, () => void];
    expect(message).toBe("13 damage to Goblin");
    undo();
    expect(useCampaignStore.getState().campaign?.encounter).toEqual({ combatants: [] });
    expect(useZoneHitStore.getState().hits).toEqual([]);
  });

  it("inside, on a character who saved: half lands through the sheet", async () => {
    ask("pc-mara", "Bard");
    render(
      <MonsterZoneHits
        campaignId="c1"
        casterIds={["m-cultist"]}
        rows={rows}
        locale="en"
        onToast={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    fireEvent.change(screen.getByLabelText("Rolled total"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(io.writeCampaignCombatEffect).toHaveBeenCalledWith("mara", "c1", null, 24, {
        kind: "hp",
        operation: { kind: "damage", amount: 6 },
      })
    );
  });

  it("outside lets the question go; another caster's questions stay away", () => {
    ask("m-gob", "Goblin");
    const { container } = render(
      <MonsterZoneHits
        campaignId="c1"
        casterIds={["m-other"]}
        rows={rows}
        locale="en"
        onToast={vi.fn()}
      />
    );
    expect(container.textContent).toBe("");
    render(
      <MonsterZoneHits
        campaignId="c1"
        casterIds={["m-cultist"]}
        rows={rows}
        locale="en"
        onToast={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(useZoneHitStore.getState().hits).toEqual([]);
  });
});
