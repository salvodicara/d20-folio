/**
 * Portent on the classic sheet (the live Diviner plays there until the new UI is on):
 * the Concentration banner's and the dying banner's d20 entry offer each recorded roll;
 * a tap sets the d20 to it, and Apply spends exactly that roll. Moving the stepper
 * drops the pick. A homebrew «Foretelling» tracker stands in for the pack's Portent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { ConcentrationSaveBanner } from "@/features/character/ConcentrationSaveBanner";
import { DyingBanner } from "@/features/character/DyingBanner";
import { concentrationSaveDc } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import { resolveTrackers } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const foretelling = {
  custom: true as const,
  title: "Foretelling",
  emoji: "",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  trackers: [
    {
      id: "foretelling",
      label: "Foretelling",
      total: "2",
      recovery: "long-rest",
      recordedRolls: { min: 1, max: 20 },
    },
  ],
  instanceId: customInstanceId("Foretelling"),
};

let trackerId = "";

function seer(hp?: number): CharacterDoc {
  const base = makeCharacterDoc(
    { classes: [{ classId: "rogue", level: 3 }], features: [foretelling as never] },
    { concentration: concentrationValue("bless") }
  );
  trackerId = resolveTrackers(base).find((t) => t.recordedRolls)?.id ?? "";
  return {
    ...base,
    session: {
      ...base.session,
      ...(hp !== undefined ? { hp: { ...base.session.hp, current: hp } } : {}),
      trackers: { [trackerId]: { used: 0, rolls: [17, 3] } },
    },
  };
}

/** The recorded rolls' chips (the death-save pips are buttons too). */
const chip = (name: RegExp) =>
  within(screen.getByRole("group", { name: "In place of the d20" })).getByRole("button", {
    name,
  });

const tracker = () => useCharacterStore.getState().character?.session.trackers[trackerId];

describe("Portent on the classic sheet", () => {
  beforeEach(() => {
    useCharacterStore.setState({ readonly: false, combatPendingConcentrationSaves: [] });
  });

  it("the Concentration banner: a tap sets the d20, Apply spends that roll", () => {
    useCharacterStore.getState().setCharacter(seer());
    useCharacterStore.setState({
      combatPendingConcentrationSaves: [
        {
          id: "save-1",
          spell: concentrationValue("bless"),
          damage: 22,
          difficultyClass: concentrationSaveDc(22),
        },
      ],
    });
    render(
      <MemoryRouter>
        <ConcentrationSaveBanner />
      </MemoryRouter>
    );
    fireEvent.click(chip(/ 17$/));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toHaveLength(0);
    expect(tracker()).toMatchObject({ used: 1, rolls: [3] });
  });

  it("the dying banner: a tap sets the d20, Apply spends that roll", () => {
    useCharacterStore.getState().setCharacter(seer(0));
    render(
      <MemoryRouter>
        <DyingBanner />
      </MemoryRouter>
    );
    fireEvent.click(chip(/ 3$/));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(tracker()).toMatchObject({ used: 1, rolls: [17] });
  });

  it("moving the stepper after a pick spends nothing", () => {
    useCharacterStore.getState().setCharacter(seer(0));
    render(
      <MemoryRouter>
        <DyingBanner />
      </MemoryRouter>
    );
    fireEvent.click(chip(/ 17$/));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Raise roll" })[0] as HTMLElement
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(tracker()?.used ?? 0).toBe(0);
  });
});
