/**
 * A state a spell leaves only on a failed save (Bane): the tray's outcome writes it
 * on each target that failed, with the caster's modifier, and never on the caster.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { standingOutcomeWriter } from "@/features/character/center/outcome-offer";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "firebase/auth";

import { makeCharacterDoc } from "./_helpers";

afterEach(() => {
  vi.unstubAllEnvs();
  useCombatStatusStore.setState({ status: null });
});

describe("standingOutcomeWriter", () => {
  it("puts Bane's state on a target that failed its save", () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const doc = makeCharacterDoc({
      classId: "cleric",
      level: 5,
      spells: [{ srdId: "bane", prepared: true }],
      spellSlots: [{ level: 1, total: 4 }],
    });
    useAuthStore.setState({ user: { uid: "u1" } as User });
    useCombatStatusStore.setState({
      status: {
        campaignId: "camp-1",
        encounter: {
          round: 1,
          currentCombatantId: "pc-u1",
          status: "active",
          combatants: [],
        },
        view: {
          rows: [
            { id: "pc-u1", kind: "pc", name: "Me" },
            { id: "goblin", kind: "monster", name: "Goblin" },
          ],
          turnOrderIds: ["pc-u1", "goblin"],
          currentId: "pc-u1",
        },
        myId: "pc-u1",
        characterId: doc.id,
        round: 1,
      },
    } as never);
    const bane = localizeActions(doc, "en").find(
      (a) => a.spellId === "bane"
    ) as ResolvedAction;
    const write = standingOutcomeWriter(bane, doc, "failed-save");
    expect(write).toBeDefined();
    const [effect] = write?.("goblin") ?? [];
    expect(effect).toMatchObject({
      target: { combatantId: "goblin" },
      payload: { kind: "grant-group" },
      duration: { kind: "concentration", actorId: "pc-u1", sourceId: "bane" },
    });
    expect(typeof effect?.bindings?.spellcastingModifier).toBe("number");
    expect(write?.("pc-u1")).toEqual([]);
    // Bane is a save: a hit doesn't write it.
    expect(standingOutcomeWriter(bane, doc, "hit")).toBeUndefined();
  });
});
