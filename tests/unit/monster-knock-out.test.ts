/**
 * Knocking a monster out (2024): a melee attacker may choose to knock out instead of
 * kill. The player's hit is an intent (`effect-given.knockOut`); whoever applies it
 * to the monster (the DM's device) resolves it: a hit that would drop it to 0 leaves
 * it at 1 HP and Unconscious; any other hit is ordinary damage.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { addMonster, damageMonster } from "@/features/campaigns/encounter";
import i18n from "@/i18n";
import { localizeCombatEvent } from "@/lib/views/combat-log-view";
import type { EncounterState } from "@/types/campaign";

function goblin(current = 7, temp = 0): EncounterState {
  const empty: EncounterState = {
    combatants: [],
    nextMonsterOrdinal: 1,
    round: 1,
    currentCombatantId: null,
    epoch: 1,
    status: "active",
  };
  const state = addMonster(empty, {
    name: "Goblin",
    ac: 15,
    maxHp: 7,
    count: 1,
    initiative: null,
  });
  return {
    ...state,
    combatants: state.combatants.map((c) =>
      c.kind === "pc" ? c : { ...c, hp: { ...c.hp, current, temp } }
    ),
  };
}

const row = (state: EncounterState) => {
  const c = state.combatants[0];
  if (!c || c.kind === "pc") throw new Error("no goblin");
  return c;
};

describe("damageMonster", () => {
  it("a knock-out hit that would drop it to 0 leaves 1 HP and Unconscious", () => {
    const { state, knockedOut } = damageMonster(goblin(), "monster-1", 12, {
      knockOut: true,
    });
    expect(knockedOut).toBe(true);
    expect(row(state).hp.current).toBe(1);
    expect(row(state).conditions).toContain("unconscious");
  });

  it("a knock-out hit that doesn't drop it is ordinary damage", () => {
    const { state, knockedOut } = damageMonster(goblin(), "monster-1", 3, {
      knockOut: true,
    });
    expect(knockedOut).toBe(false);
    expect(row(state).hp.current).toBe(4);
    expect(row(state).conditions).not.toContain("unconscious");
  });

  it("without it, the hit drops it to 0; Temporary HP go first", () => {
    expect(row(damageMonster(goblin(), "monster-1", 12).state).hp.current).toBe(0);
    const shielded = row(damageMonster(goblin(7, 5), "monster-1", 6).state);
    expect(shielded.hp).toMatchObject({ temp: 0, current: 6 });
  });
});

describe("the player's line says the hit was nonlethal", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("it");
  });

  it("«Non letale: Goblin, 12 danni»", () => {
    const loc = (r: unknown) => String(r);
    expect(
      localizeCombatEvent(
        {
          kind: "effect-given",
          effect: "damage",
          target: "monster-1",
          targetName: "Goblin",
          amount: 12,
          knockOut: true,
        },
        i18n.t.bind(i18n) as never,
        loc,
        loc,
        loc,
        loc as never,
        loc as never
      )
    ).toBe("Non letale: Goblin, 12 danni");
    expect(i18n.t("combatLog.knockedOut", { target: "Goblin" })).toBe("Messo KO: Goblin");
  });
});
