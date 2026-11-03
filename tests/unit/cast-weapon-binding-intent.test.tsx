/**
 * The weapon a cast names reaches the state it lights (Coordinator, lane A seam):
 * `executeAction(action, { weapon })` binds Shillelagh to the Quarterstaff, Magic
 * Weapon to the Longsword, and the picker's list says which weapons may be named,
 * in hand or in the pack, and what the binding does to them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { getSpellById } from "@/data/spells";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { bindingWeaponChoices } from "@/lib/weapon-binding";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function druid(): CharacterDoc {
  return makeCharacterDoc({
    classId: "druid",
    level: 5,
    spells: [{ srdId: "shillelagh", prepared: true }],
    weapons: [{ srdId: "dagger" }, { srdId: "quarterstaff" }] as never,
    spellcasting: { ability: "WIS" } as never,
    equipment: [
      { srdId: "quarterstaff", equipped: true },
      { srdId: "dagger", equipped: false },
    ] as never,
  });
}

afterEach(() => {
  useCharacterStore.setState({ character: null });
  useUndoStore.getState().clear(null);
});

describe("the weapons a binding cast may name", () => {
  it("Shillelagh: only the Club or Quarterstaff, in hand, with its die and ability", () => {
    const spell = getSpellById("shillelagh");
    if (!spell) throw new Error("no shillelagh");
    const choices = bindingWeaponChoices(spell, druid(), 0);
    expect(choices.map((c) => c.address)).toEqual([
      { kind: "srd", index: 1, srdId: "quarterstaff" },
    ]);
    expect(choices[0]?.wielded).toBe(true);
    expect(choices[0]?.preview.damageDie).toBe("1d10"); // a level-5 caster
    expect(choices[0]?.preview.attackAbility).toBe("WIS");
  });

  it("Magic Weapon: +1 at level 2, +2 at level 4", () => {
    const spell = getSpellById("magic-weapon");
    if (!spell) throw new Error("no magic weapon");
    expect(bindingWeaponChoices(spell, druid(), 2)[0]?.preview.bonus).toBe(1);
    expect(bindingWeaponChoices(spell, druid(), 4)[0]?.preview.bonus).toBe(2);
  });
});

describe("executeAction carries the named weapon", () => {
  it("casting Shillelagh on the Quarterstaff binds it", async () => {
    useCharacterStore.setState({
      character: druid(),
      readonly: false,
      loading: false,
      error: null,
    });
    let api: ReturnType<typeof useTurnEconomy> | null = null;
    function Probe() {
      api = useTurnEconomy();
      return null;
    }
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <Probe />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const action = localizeActions(druid(), "en").find(
      (a) => a.spellId === "shillelagh"
    ) as ResolvedAction;
    expect(action).toBeDefined();
    act(() => {
      api?.executeAction(action, {
        weapon: { kind: "srd", index: 1, srdId: "quarterstaff" },
      });
    });
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.grantBundleChoices?.[
          "spell-shillelagh:weapon"
        ]
      ).toBe("srd:1:quarterstaff")
    );
  });
});
