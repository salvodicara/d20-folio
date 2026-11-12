/**
 * Aura of Protection through the campaign doc (A′): the paladin's open sheet writes
 * its aura on its own entry only on change (never on a re-render), clears it the
 * moment the paladin drops to 0 HP, and an ally's sheet takes it onto its saves, then
 * loses it as soon as the entry is cleared.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const io = vi.hoisted(() => ({ setMemberAura: vi.fn(() => Promise.resolve()) }));
vi.mock("@/features/campaigns/campaign-io", () => io);

import { usePartyAura } from "@/features/campaigns/use-party-aura";
import { useCharacterStore } from "@/stores/characterStore";
import type { CampaignDoc } from "@/types/campaign";
import { makeCharacterDoc } from "./_helpers";

const paladin = (hp = 40) =>
  makeCharacterDoc(
    {
      classes: [{ classId: "paladin", level: 6 }],
      abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 16 },
    },
    { hp: { current: hp, temp: 0 } }
  );

function campaign(aura?: { bonus: number; reachFt: number; at: number }): CampaignDoc {
  return {
    id: "camp",
    memberDetails: {
      "uid-pal": {
        displayName: "Pal",
        characterId: "char-pal",
        role: "player",
        character: { name: "Aldric" },
        ...(aura ? { aura } : {}),
      },
      "uid-ally": { displayName: "Ally", characterId: "char-ally", role: "player" },
    },
  } as unknown as CampaignDoc;
}

beforeEach(() => {
  io.setMemberAura.mockClear();
  useCharacterStore.setState({ character: null, readonly: false });
});

describe("the paladin's sheet", () => {
  it("writes its aura once, not on a re-render, and clears it at 0 HP", () => {
    useCharacterStore.setState({ character: { ...paladin(), id: "char-pal" } });
    const { rerender } = renderHook(({ c }) => usePartyAura(c, "uid-pal", "char-pal"), {
      initialProps: { c: campaign() },
    });
    expect(io.setMemberAura).toHaveBeenCalledTimes(1);
    expect(io.setMemberAura).toHaveBeenLastCalledWith(
      "camp",
      "uid-pal",
      expect.objectContaining({ bonus: 3, reachFt: 10 })
    );
    const written = (io.setMemberAura.mock.calls[0] as unknown[])[2] as {
      bonus: number;
      reachFt: number;
      at: number;
    };
    rerender({ c: campaign(written) });
    rerender({ c: campaign(written) });
    expect(io.setMemberAura).toHaveBeenCalledTimes(1);
    useCharacterStore.setState({ character: { ...paladin(0), id: "char-pal" } });
    rerender({ c: campaign(written) });
    expect(io.setMemberAura).toHaveBeenLastCalledWith("camp", "uid-pal", null);
  });
});

describe("an ally's sheet", () => {
  it("takes a fresh aura onto its saves, and loses it when the entry is cleared", () => {
    useCharacterStore.setState({
      character: { ...makeCharacterDoc({}), id: "char-ally" },
    });
    const { rerender } = renderHook(({ c }) => usePartyAura(c, "uid-ally", "char-ally"), {
      initialProps: { c: campaign({ bonus: 3, reachFt: 10, at: Date.now() }) },
    });
    expect(useCharacterStore.getState().character?.session.partyAura).toEqual({
      from: "char-pal",
      name: "Aldric",
      bonus: 3,
    });
    rerender({ c: campaign() });
    expect(useCharacterStore.getState().character?.session.partyAura).toBeUndefined();
    expect(io.setMemberAura).not.toHaveBeenCalled();
  });
});
