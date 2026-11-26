/**
 * «Sensi» on the new sheet (#1230, gap map item 6; D&D Beyond's Senses box under the
 * skills): the three passive scores, each opening its number pane, and the senses
 * with their range in the player's units.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen, within } from "@testing-library/react";

import { playNumberView } from "@/domains/play/play-number-view";
import { PlaySenses } from "@/domains/play/ui/PlaySenses";
import { MOCK_CHARACTER } from "@/lib/mock";
import { deriveCharacter } from "@/lib/views/derive-character";
import { useCharacterStore } from "@/stores/characterStore";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    error: null,
    readonly: false,
  });
});

describe("PlaySenses", () => {
  it("lists the three passives with the sheet's numbers and each sense with its range", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    render(<PlaySenses doc={doc} locale="en" readonly={false} />);
    const box = screen.getByRole("heading", { name: "Senses" }).closest("section");
    if (!box) throw new Error("no Senses panel");
    const pp = playNumberView(doc, "en", { kind: "passive", id: "perception" }).total;
    expect(
      within(box).getByRole("button", { name: `Passive Perception ${String(pp)}` })
    ).toBeTruthy();
    expect(
      within(box).getByRole("button", { name: /^Passive Insight \d+$/ })
    ).toBeTruthy();
    expect(
      within(box).getByRole("button", { name: /^Passive Investigation \d+$/ })
    ).toBeTruthy();
    const senses = deriveCharacter(doc).senses;
    expect(senses.length).toBeGreaterThan(0);
    expect(box.textContent).toContain("Darkvision");
    expect(box.textContent).toContain(`${String(senses[0]?.rangeFt)} ft`);
  });

  it("a passive opens its number pane", () => {
    render(
      <PlaySenses doc={structuredClone(MOCK_CHARACTER)} locale="en" readonly={false} />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Passive Perception/ }));
    expect(screen.getByRole("dialog", { name: "Passive Perception" })).toBeTruthy();
  });
});
