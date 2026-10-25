/**
 * Drinking the LAST potion keeps its effect (SRD 5.2.1: a potion's effect lasts its
 * duration once drunk; the bottle is gone). A homebrew potion reads its mechanics from
 * its own row, so the effect must light before the row goes; a catalogue potion reads
 * the catalogue and its state is never an "item at hand" state, so a later inventory
 * change leaves it lit.
 */
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { User } from "firebase/auth";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc, CustomEquipment } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const live = () => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
};

function Drink({ match }: { match: (cost: string) => boolean }) {
  const doc = useCharacterStore((s) => s.character);
  const { executeAction } = useTurnEconomy();
  const action =
    doc &&
    localizeActions(doc, "en").find((a) => a.costEquipment && match(a.costEquipment));
  return (
    <button
      onClick={() => {
        if (!action) throw new Error("no drink action");
        executeAction(action);
      }}
    >
      drink
    </button>
  );
}

async function mount(doc: CharacterDoc, match: (cost: string) => boolean) {
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <Drink match={match} />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  const lines = doc.session.logEntries.length;
  fireEvent.click(screen.getByRole("button", { name: "drink" }));
  // The bottle is used (its log line lands) before anything is read.
  await waitFor(() => expect(live().session.logEntries.length).toBeGreaterThan(lines));
}

const IVY: CustomEquipment = {
  custom: true,
  name: "Ivy Draught",
  equipped: false,
  quantity: 1,
  isPotion: true,
  isConsumable: true,
  instanceId: customInstanceId("Ivy Draught"),
  mechanics: {
    type: "potion",
    durationRounds: 600,
    grants: [
      {
        type: "while-active",
        activeKey: "potion:ivy-draught",
        duration: { kind: "timed", minutes: 60, maxRounds: 600 },
        grants: [{ type: "damage-resistance", damageType: "fire" }],
      },
    ],
  },
};

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
});

describe("drinking the last potion", () => {
  it("a homebrew potion's effect lights though its only bottle is gone", async () => {
    await mount(
      makeCharacterDoc({ classId: "fighter", level: 3, equipment: [IVY] }),
      (cost) => cost.includes(IVY.instanceId)
    );
    expect(live().session.activeFeatures).toContain(`potion:${IVY.instanceId}`);
    expect(
      live().character.equipment.some((e) => "custom" in e && e.name === "Ivy Draught")
    ).toBe(false);
  });

  it("a catalogue potion's effect stays lit after a later inventory change", async () => {
    await mount(
      makeCharacterDoc({
        classId: "fighter",
        level: 3,
        equipment: [{ srdId: "potion-of-invulnerability", quantity: 1 }] as never,
      }),
      (cost) => cost.includes("potion-of-invulnerability")
    );
    const lit = () =>
      (live().session.activeFeatures ?? []).filter((k) => k.startsWith("potion:"));
    expect(lit()).toHaveLength(1);
    const doc = live();
    useCharacterStore
      .getState()
      .setCharacter({ ...doc, character: { ...doc.character } });
    expect(lit()).toHaveLength(1);
  });
});
