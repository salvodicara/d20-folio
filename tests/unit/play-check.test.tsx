/**
 * The check dialog (board 2b, D5b; BG3's check screen): «Usa» on Hide, Escape a
 * grapple or Search asks the d20 rolled at the table, adds the sheet's bonus, says the
 * verdict live, and «Applica» uses the action and applies the outcome.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

/** The value, or the test fails here. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("missing in test");
  return value;
}

const doc = () => must(useCharacterStore.getState().character);

function open(actionId: string) {
  const raw = must(resolveActions(doc()).find((a) => a.id === actionId));
  const action = localizeAction(raw, "en");
  const entries = checkEntriesFor(action, skillBonusFor(doc()));
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        <PlayCheck action={action} entries={entries} onClose={onClose} />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  return { entries, onClose };
}

const face = (n: number) =>
  fireEvent.change(screen.getByRole("textbox", { name: "The d20 you rolled" }), {
    target: { value: String(n) },
  });

describe("PlayCheck", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    const d = makeCharacterDoc({ classId: "rogue", level: 3 });
    useCharacterStore.setState({ character: d, readonly: false, loading: false });
  });
  afterEach(() => {
    useCharacterStore.setState({ character: null });
    useUndoStore.getState().clear(null);
  });

  it("Hide: DC 15 on the badge; a passing total makes you Invisible", () => {
    const { entries, onClose } = open("base-hide");
    const hide = must(entries[0]);
    expect(hide.kind).toBe("hide");
    expect(screen.getByText("15")).toBeTruthy();
    const roll = 15 - (hide.kind === "hide" ? hide.bonus : 0);
    face(roll);
    expect(screen.getByRole("status").textContent).toMatch(/Invisible/);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(doc().session.conditions).toContain("invisible");
    expect(onClose).toHaveBeenCalled();
  });

  it("Hide: a short total says it fails and changes nothing", () => {
    open("base-hide");
    face(1);
    expect(screen.getByRole("status").textContent).toMatch(/fail/i);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(doc().session.conditions).not.toContain("invisible");
  });

  it("no face yet: Apply waits", () => {
    open("base-hide");
    expect(
      screen.getByRole("button", { name: "Apply" }).getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("Search: pick the skill and the DC; the verdict uses that skill's bonus", () => {
    const { entries } = open("base-search");
    const check = must(entries.find((e) => e.kind === "check"));
    const { skills } = check;
    const second = must(skills[1]);
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${second.id}`, "i") })
    );
    fireEvent.click(screen.getByRole("button", { name: "20" }));
    face(10);
    expect(screen.getByRole("status").textContent).toContain(String(10 + second.bonus));
  });
});
