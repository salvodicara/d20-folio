/**
 * A recorded d20 used as the roll (Portent: "When you or a creature you can see makes a
 * D20 Test, you can replace that roll with one of your foretelling rolls"). The new
 * Play's d20 entries offer each recorded roll: a tap puts that face in the d20, and
 * applying spends exactly that roll; typing another face drops the pick. A homebrew
 * «Foretelling» tracker stands in for the pack's Portent (the same recorded-roll shape).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { checkEntriesFor, skillBonusFor } from "@/domains/play/check-entry";
import { PlayCheck } from "@/domains/play/ui/PlayCheck";
import { PlayConcentrationSave } from "@/domains/play/ui/PlayConcentrationSave";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { concentrationSaveDc } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import { resolveActions, resolveTrackers } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
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

function seer(): CharacterDoc {
  const base = makeCharacterDoc(
    { classes: [{ classId: "rogue", level: 3 }], features: [foretelling as never] },
    { concentration: concentrationValue("bless") }
  );
  trackerId = resolveTrackers(base).find((t) => t.recordedRolls)?.id ?? "";
  return {
    ...base,
    session: { ...base.session, trackers: { [trackerId]: { used: 0, rolls: [17, 3] } } },
  };
}

const tracker = () => useCharacterStore.getState().character?.session.trackers[trackerId];

function LiveSave() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayConcentrationSave doc={doc} /> : null;
}

describe("a recorded d20 used as the roll", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    useCharacterStore.getState().setCharacter(seer());
    useCharacterStore.setState({
      readonly: false,
      combatPendingConcentrationSaves: [
        {
          id: "save-1",
          spell: concentrationValue("bless"),
          damage: 22,
          difficultyClass: concentrationSaveDc(22),
        },
      ],
    });
  });

  it("a Concentration save: a tap fills the d20, confirming spends that roll", () => {
    render(<LiveSave />);
    fireEvent.click(screen.getByRole("button", { name: "Roll the die" }));
    expect(screen.getByRole("button", { name: / 3$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: / 17$/ }));
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("17");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(tracker()).toMatchObject({ used: 1, rolls: [3] });
  });

  it("typing another face drops the pick: nothing is spent", () => {
    render(<LiveSave />);
    fireEvent.click(screen.getByRole("button", { name: "Roll the die" }));
    fireEvent.click(screen.getByRole("button", { name: / 17$/ }));
    fireEvent.change(screen.getAllByRole("textbox")[0] as HTMLElement, {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(tracker()?.used ?? 0).toBe(0);
    expect(tracker()?.rolls).toEqual([17, 3]);
  });

  it("a check: the recorded roll is the d20, and applying spends it", () => {
    const doc = useCharacterStore.getState().character as CharacterDoc;
    const raw = resolveActions(doc).find((a) => a.id === "base-search");
    if (!raw) throw new Error("missing in test");
    const action = localizeAction(raw, "en");
    render(
      <MemoryRouter>
        <TurnEconomyProvider renderPrompts={false}>
          <PlayCheck
            action={action}
            entries={checkEntriesFor(action, skillBonusFor(doc))}
            onClose={() => {}}
          />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: / 3$/ }));
    expect(screen.getByRole("textbox", { name: "The d20 you rolled" })).toHaveProperty(
      "value",
      "3"
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(tracker()).toMatchObject({ used: 1, rolls: [17] });
  });
});
