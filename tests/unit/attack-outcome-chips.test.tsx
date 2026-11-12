/**
 * An attack with no target in Folio is completed on the row just used (the app's line
 * completion pattern, Foundry's chat card): Hit · Miss · Crit under the row. Miss is
 * one tap; Hit or Crit shows the damage number, committed on Enter or when the field
 * loses focus. Ignoring it costs nothing: the chips move to the newest use and retire
 * when the turn ends. One writer: the use's own log line gets the result and the amount.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AttackOutcomeChips } from "@/features/character/center/AttackOutcomeChips";
import { useAttackOutcomeStore } from "@/features/character/center/attack-outcome-store";
import i18n from "@/i18n";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";

const store = () => useCharacterStore.getState();

function attackLine(): string {
  const id = store().logEvent({
    kind: "action-use",
    action: { custom: "Longsword" },
    effect: "attack",
    slot: "action",
  });
  if (!id) throw new Error("no log line");
  return id;
}
const lineEvent = (id: string) =>
  store().character?.session.logEntries.find((e) => e.id === id)?.event;

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
  useAttackOutcomeStore.getState().clear();
});

describe("the attack-outcome chips on the row just used", () => {
  it("show only on the row of the latest use", () => {
    const id = attackLine();
    act(() =>
      useAttackOutcomeStore.getState().offer({ logId: id, actionId: "longsword" })
    );
    const { rerender } = render(<AttackOutcomeChips actionId="dagger" />);
    expect(screen.queryByRole("group")).toBeNull();
    rerender(<AttackOutcomeChips actionId="longsword" />);
    expect(screen.getByRole("button", { name: "Miss" })).toBeTruthy();
  });

  it("Miss records at once and retires", () => {
    const id = attackLine();
    act(() =>
      useAttackOutcomeStore.getState().offer({ logId: id, actionId: "longsword" })
    );
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(screen.getByRole("button", { name: "Miss" }));
    expect(lineEvent(id)).toMatchObject({ outcome: "miss" });
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("Hit shows the damage number; Enter writes it on the line", () => {
    const id = attackLine();
    act(() =>
      useAttackOutcomeStore.getState().offer({ logId: id, actionId: "longsword" })
    );
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    expect(lineEvent(id)).toMatchObject({ outcome: "hit" });
    const field = screen.getByRole("textbox", { name: "Rolled total" });
    fireEvent.change(field, { target: { value: "9" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(lineEvent(id)).toMatchObject({ outcome: "hit", amount: 9 });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a Critical's number commits when the field loses focus (the next tap elsewhere)", () => {
    const id = attackLine();
    act(() =>
      useAttackOutcomeStore.getState().offer({ logId: id, actionId: "longsword" })
    );
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    const field = screen.getByRole("textbox", { name: "Rolled total" });
    fireEvent.change(field, { target: { value: "18" } });
    fireEvent.blur(field);
    expect(lineEvent(id)).toMatchObject({ outcome: "critical", amount: 18 });
  });

  it("a second use moves the chips to the newest line; the first keeps what it has", () => {
    const first = attackLine();
    act(() =>
      useAttackOutcomeStore.getState().offer({ logId: first, actionId: "longsword" })
    );
    const second = attackLine();
    act(() =>
      useAttackOutcomeStore.getState().offer({ logId: second, actionId: "longsword" })
    );
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(screen.getByRole("button", { name: "Miss" }));
    expect(lineEvent(second)).toMatchObject({ outcome: "miss" });
    expect(lineEvent(first)).not.toHaveProperty("outcome");
  });
});
