/**
 * The toast that announces a Concentration save («Concentration on Bless: CON save DC
 * 15») leaves once the save is answered on the Play screen: it never sits over the
 * result or the sheet (played-session walkthrough, M3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayConcentrationSave } from "@/domains/play/ui/PlayConcentrationSave";
import { concentrationSaveDc } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { makeCharacterDoc } from "./_helpers";

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayConcentrationSave doc={doc} /> : null;
}

const promptToasts = () =>
  useToastStore.getState().toasts.filter((t) => t.intent?.kind === "concentration-save");

describe("PlayConcentrationSave: the prompt toast", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    useToastStore.getState().clearAll();
    const doc = makeCharacterDoc({}, { concentration: concentrationValue("bless") });
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.setState({
      readonly: false,
      combatPendingConcentrationSaves: [
        {
          id: "save-1",
          spell: concentrationValue("bless"),
          damage: 30,
          difficultyClass: concentrationSaveDc(30),
        },
      ],
    });
    useToastStore.getState().showToast({
      intent: {
        kind: "concentration-save",
        spell: concentrationValue("bless"),
        dc: 15,
        saveBonus: 0,
        advantage: false,
      },
      duration: 5000,
    });
  });

  it("leaves once the save is answered", () => {
    expect(promptToasts()).toHaveLength(1);
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: "Roll the die" }));
    fireEvent.change(screen.getAllByRole("textbox")[0] as HTMLElement, {
      target: { value: "18" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(promptToasts().filter((t) => !t.leaving)).toHaveLength(0);
  });
});
