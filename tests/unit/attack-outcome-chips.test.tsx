/**
 * An attack with no target in Folio is completed on the row just used (the app's line
 * completion pattern, Foundry's chat card): Hit · Miss · Critical under the row, in the
 * situation chips' style. The chips stay until the next use or the end of the turn, the
 * chosen one selected, so a mis-tap is corrected in place: another chip changes the
 * result (Miss clears the damage), the selected one again clears it. Hit or Critical
 * shows a short damage field (the number pad on a phone), written on Enter or when it
 * loses focus. Ignoring all of it costs nothing. One writer: the use's own log line.
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
const chip = (name: string) => screen.getByRole("button", { name });
const offer = (logId: string) =>
  act(() => useAttackOutcomeStore.getState().offer({ logId, actionId: "longsword" }));

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
    offer(attackLine());
    const { rerender } = render(<AttackOutcomeChips actionId="dagger" />);
    expect(screen.queryByRole("group")).toBeNull();
    rerender(<AttackOutcomeChips actionId="longsword" />);
    expect(chip("Miss")).toHaveAttribute("aria-pressed", "false");
  });

  it("Miss records at once; the chips stay with Miss selected", () => {
    const id = attackLine();
    offer(id);
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(chip("Miss"));
    expect(lineEvent(id)).toMatchObject({ outcome: "miss" });
    expect(chip("Miss")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Hit shows a short damage field with the number pad; Enter writes the damage", () => {
    const id = attackLine();
    offer(id);
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(chip("Hit"));
    expect(lineEvent(id)).toMatchObject({ outcome: "hit" });
    const field = screen.getByRole("textbox", { name: "Damage" });
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveAttribute("placeholder", "Damage");
    fireEvent.change(field, { target: { value: "9" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(lineEvent(id)).toMatchObject({ outcome: "hit", amount: 9 });
    expect(chip("Hit")).toHaveAttribute("aria-pressed", "true");
  });

  it("a Critical's damage is written when the field loses focus", () => {
    const id = attackLine();
    offer(id);
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(chip("Critical"));
    const field = screen.getByRole("textbox", { name: "Damage" });
    fireEvent.change(field, { target: { value: "18" } });
    fireEvent.blur(field);
    expect(lineEvent(id)).toMatchObject({ outcome: "critical", amount: 18 });
  });

  it("a mis-tap is corrected in place: Miss clears the damage, the selected chip clears the result", () => {
    const id = attackLine();
    offer(id);
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(chip("Hit"));
    const field = screen.getByRole("textbox", { name: "Damage" });
    fireEvent.change(field, { target: { value: "9" } });
    fireEvent.blur(field);
    fireEvent.click(chip("Miss"));
    expect(lineEvent(id)).toMatchObject({ outcome: "miss" });
    expect(lineEvent(id)).not.toHaveProperty("amount");
    fireEvent.click(chip("Miss"));
    expect(lineEvent(id)).not.toHaveProperty("outcome");
    expect(chip("Miss")).toHaveAttribute("aria-pressed", "false");
  });

  it("a second use moves the chips to the newest line; the first keeps what it has", () => {
    const first = attackLine();
    offer(first);
    render(<AttackOutcomeChips actionId="longsword" />);
    fireEvent.click(chip("Hit"));
    const second = attackLine();
    offer(second);
    expect(chip("Hit")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip("Miss"));
    expect(lineEvent(second)).toMatchObject({ outcome: "miss" });
    expect(lineEvent(first)).toMatchObject({ outcome: "hit" });
  });
});
