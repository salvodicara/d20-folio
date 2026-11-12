/**
 * A save spell with nothing for the app to apply (Command, Calm Emotions) is completed
 * on the row just used, like an attack's result (#1060): one line per picked creature,
 * «Goblin · Saved · Failed». Ignoring it costs nothing and the line stays today's; a
 * chip writes that creature's save on the use's own log line, the selected chip again
 * clears it. The chips go to the next use, and with the turn.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SaveOutcomeChips } from "@/features/character/center/SaveOutcomeChips";
import { useSaveOutcomeStore } from "@/features/character/center/save-outcome-store";
import i18n from "@/i18n";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";

const store = () => useCharacterStore.getState();

function castLine(): string {
  const id = store().logEvent({
    kind: "action-use",
    action: { custom: "Command" },
    effect: "spell-cast",
    slot: "action",
    targets: ["m-gob", "m-orc"],
  });
  if (!id) throw new Error("no log line");
  return id;
}
const lineEvent = (id: string) =>
  store().character?.session.logEntries.find((e) => e.id === id)?.event;
const TARGETS = [
  { id: "m-gob", name: "Goblin" },
  { id: "m-orc", name: "Orc" },
];
const offer = (logId: string) =>
  act(() =>
    useSaveOutcomeStore
      .getState()
      .offer({ logId, actionId: "spell-command", targets: TARGETS })
  );
const row = (name: string) => within(screen.getByRole("group", { name }));

beforeEach(async () => {
  await i18n.changeLanguage("en");
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  useSaveOutcomeStore.getState().clear();
});

describe("the save chips on the row just used", () => {
  it("one line per picked creature, only on the latest use's row", () => {
    offer(castLine());
    const { rerender } = render(<SaveOutcomeChips actionId="spell-bless" />);
    expect(screen.queryByRole("group")).toBeNull();
    rerender(<SaveOutcomeChips actionId="spell-command" />);
    expect(row("Goblin").getByRole("button", { name: "Saved" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(row("Orc").getByRole("button", { name: "Failed" })).toBeTruthy();
  });

  it("ignored, the line stays as it was", () => {
    const id = castLine();
    offer(id);
    render(<SaveOutcomeChips actionId="spell-command" />);
    expect(lineEvent(id)).not.toHaveProperty("saves");
  });

  it("a chip writes that creature's save; the selected chip again clears it", () => {
    const id = castLine();
    offer(id);
    render(<SaveOutcomeChips actionId="spell-command" />);
    fireEvent.click(row("Goblin").getByRole("button", { name: "Failed" }));
    fireEvent.click(row("Orc").getByRole("button", { name: "Saved" }));
    expect(lineEvent(id)).toMatchObject({
      saves: { "m-gob": "failed", "m-orc": "saved" },
    });
    expect(row("Goblin").getByRole("button", { name: "Failed" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(row("Goblin").getByRole("button", { name: "Saved" }));
    expect(lineEvent(id)).toMatchObject({
      saves: { "m-gob": "saved", "m-orc": "saved" },
    });
    fireEvent.click(row("Goblin").getByRole("button", { name: "Saved" }));
    fireEvent.click(row("Orc").getByRole("button", { name: "Saved" }));
    expect(lineEvent(id)).not.toHaveProperty("saves");
  });

  it("the next use takes the chips; the first line keeps what it has", () => {
    const first = castLine();
    offer(first);
    render(<SaveOutcomeChips actionId="spell-command" />);
    fireEvent.click(row("Goblin").getByRole("button", { name: "Failed" }));
    const second = castLine();
    offer(second);
    expect(row("Goblin").getByRole("button", { name: "Failed" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(lineEvent(first)).toMatchObject({ saves: { "m-gob": "failed" } });
  });
});

describe("a save spell cast with nobody named (solo)", () => {
  const offerAlone = (logId: string, damage: boolean) =>
    act(() =>
      useSaveOutcomeStore.getState().offer({
        logId,
        actionId: "spell-vicious-mockery",
        targets: [],
        alone: { damage },
      })
    );
  const soloLine = () => {
    const id = store().logEvent({
      kind: "action-use",
      action: { custom: "Vicious Mockery" },
      effect: "spell-cast",
      slot: "action",
    });
    if (!id) throw new Error("no log line");
    return id;
  };

  it("one «Save» line; Failed shows the damage field, and Enter writes it", () => {
    const id = soloLine();
    offerAlone(id, true);
    render(<SaveOutcomeChips actionId="spell-vicious-mockery" />);
    const save = within(screen.getByRole("group", { name: "Save" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(save.getByRole("button", { name: "Failed" }));
    expect(lineEvent(id)).toMatchObject({ saves: { target: "failed" } });
    const field = screen.getByRole("textbox", { name: "Damage" });
    expect(field).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(field, { target: { value: "6" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(lineEvent(id)).toMatchObject({ saves: { target: "failed" }, amount: 6 });
    // The selected chip again clears the result and its damage.
    fireEvent.click(save.getByRole("button", { name: "Failed" }));
    expect(lineEvent(id)).not.toHaveProperty("saves");
    expect(lineEvent(id)).not.toHaveProperty("amount");
  });

  it("a spell with no damage asks only the save", () => {
    const id = soloLine();
    offerAlone(id, false);
    render(<SaveOutcomeChips actionId="spell-vicious-mockery" />);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Save" })).getByRole("button", {
        name: "Saved",
      })
    );
    expect(lineEvent(id)).toMatchObject({ saves: { target: "saved" } });
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
