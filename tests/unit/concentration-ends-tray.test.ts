/**
 * A state that ends Concentration, through the real tray (`applyTray`): the Ogre that
 * failed loses the effects it held by Concentration (revoked, reinstated on undo); Bren,
 * another PC, gets the end in his spends ledger (inverted on undo); my own Concentration
 * ends on my sheet when I'm in the area too, and comes back on undo. A Saved row ends
 * nothing. The catalogue spell is a stand-in: the public SRD has none.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  reinstatePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  endPeerConcentration: vi.fn(() =>
    Promise.resolve([{ id: "s1", kind: "concentration-end", spell: "haste" }])
  ),
  appendPeerSpendsInverse: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);
vi.mock("@/data/spells", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/data/spells")>();
  const tune = {
    id: "test-tune",
    grants: [
      {
        type: "while-active",
        activeKey: "spell-test-tune",
        recipient: "selected",
        grants: [{ type: "ends-concentration" }],
      },
    ],
  };
  return {
    ...real,
    getSpellById: (id: string) => (id === "test-tune" ? tune : real.getSpellById(id)),
  };
});

beforeAll(loadCampaignIo);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const bard = makeCharacterDoc(
  {
    classes: [{ classId: "bard", level: 5 }],
    spells: [{ srdId: "haste", prepared: true }],
  },
  { concentration: "haste" as never }
);
const me: CombatantRef = {
  kind: "pc",
  combatantId: "pc-me",
  memberUid: "me",
  characterId: bard.id,
};
const bren: CombatantRef = {
  kind: "pc",
  combatantId: "pc-bren",
  memberUid: "bren",
  characterId: "c-bren",
};
const ogre: CombatantRef = { kind: "monster", combatantId: "m-ogre" };
const refs: Record<string, CombatantRef> = {
  "pc-me": me,
  "pc-bren": bren,
  "m-ogre": ogre,
};
const tuneOn = (targetId: string): ActiveCombatEffect[] => [
  {
    id: `fx-${targetId}`,
    actor: me,
    target: refs[targetId] ?? ogre,
    source: { kind: "spell", id: "test-tune", actionId: "cast" },
    payload: { kind: "grant-group", activeKey: "spell-test-tune" },
    duration: { kind: "concentration", actorId: "pc-me", sourceId: "test-tune" },
  },
];
// The Ogre holds Hold Person on Bren by Concentration.
const ogreHolds: CombatEffectOp = {
  id: "op-hold",
  kind: "apply",
  effect: {
    id: "fx-hold",
    actor: ogre,
    target: bren,
    source: { kind: "spell", id: "hold-person", actionId: "m-cast" },
    payload: { kind: "condition", conditionId: "paralyzed" },
    duration: { kind: "concentration", actorId: "m-ogre", sourceId: "hold-person" },
  },
};

describe("a state that ends Concentration, through the tray", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    vi.clearAllMocks();
    useUndoStore.setState({ characterId: null, past: [], future: [] });
    useCharacterStore.setState({ character: bard, readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: bard.id,
        round: 2,
        encounter: { effectOps: [ogreHolds] },
        view: {
          rows: [
            { id: "m-ogre", kind: "monster" },
            { id: "pc-bren", kind: "pc", memberUid: "bren", characterId: "c-bren" },
            { id: "pc-me", kind: "pc", memberUid: "me", characterId: bard.id },
          ],
        },
      } as never,
    });
  });

  function apply(saved: ReadonlyArray<string> = []) {
    const plan = {
      effect: null,
      save: { ability: "CON", dc: 14, onSave: "none" },
      targets: ["m-ogre", "pc-bren", "pc-me"],
    } as DamageTrayPlan;
    const rows = plan.targets.map((id) => ({
      ...initialTrayRow(plan, id),
      ...(saved.includes(id) ? { saved: true } : {}),
    }));
    applyTray(
      {
        characterId: bard.id,
        actionName: "Tune",
        source: { custom: "Tune" },
        castLogId: null,
        actionId: "cast",
        plan,
        onFailed: tuneOn,
      },
      [
        { id: "m-ogre", name: "Ogre", kind: "monster" },
        {
          id: "pc-bren",
          name: "Bren",
          kind: "pc",
          row: { memberUid: "bren", characterId: "c-bren" },
        } as never,
        { id: "pc-me", name: "Me", kind: "pc" } as never,
      ],
      rows,
      [0, 0, 0],
      ((key: string) => key) as never
    );
  }

  it("ends the Ogre's, Bren's and mine; the undo brings each back", async () => {
    apply();
    await writesSettled();
    expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", "fx-hold");
    expect(io.endPeerConcentration).toHaveBeenCalledWith("bren", "c-bren");
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");

    expect(useUndoStore.getState().undo()).toBe(true);
    await writesSettled();
    expect(io.reinstatePersistentCombatEffect).toHaveBeenCalledWith("c1", "fx-hold");
    expect(io.appendPeerSpendsInverse).toHaveBeenCalledWith("bren", "c-bren", [
      { id: "s1", kind: "concentration-end", spell: "haste" },
    ]);
    expect(useCharacterStore.getState().character?.session.concentration).toBe("haste");
  });

  it("a Saved row ends nothing", async () => {
    apply(["m-ogre", "pc-bren", "pc-me"]);
    await writesSettled();
    expect(io.revokePersistentCombatEffect).not.toHaveBeenCalled();
    expect(io.endPeerConcentration).not.toHaveBeenCalled();
    expect(useCharacterStore.getState().character?.session.concentration).toBe("haste");
  });
});
