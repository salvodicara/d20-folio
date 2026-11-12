/**
 * The step after a Long Rest on the new Play screen: a High Elf sees its lineage
 * cantrip pressed among the Wizard cantrips, and a tap replaces it on the sheet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { asRaceId } from "@/data/srd-names";
import { PlayCantripSwap } from "@/domains/play/ui/PlayCantripSwap";
import { HIGH_ELF_CANTRIP_KEY } from "@/lib/rest-cantrip-swap";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";
import "@/i18n";

const highElf = makeCharacterDoc(
  { race: asRaceId("elf"), classes: [{ classId: "fighter", level: 3 }] },
  { grantBundleChoices: { "elf-lineage": "high-elf" } }
);

describe("PlayCantripSwap", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: highElf, readonly: false, loading: false });
  });
  afterEach(() => {
    useCharacterStore.setState({ character: null });
  });

  it("presses the cantrip now, and a tap replaces it", () => {
    render(<PlayCantripSwap doc={highElf} locale="en" />);
    expect(
      screen
        .getByRole("button", { name: "Prestidigitation" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    const doc = useCharacterStore.getState().character;
    expect(doc?.session.grantBundleChoices?.[HIGH_ELF_CANTRIP_KEY]).toBe("light");
  });

  it("says nothing for a character with no such cantrip", () => {
    const wood = makeCharacterDoc(
      { race: asRaceId("elf"), classes: [{ classId: "fighter", level: 3 }] },
      { grantBundleChoices: { "elf-lineage": "wood-elf" } }
    );
    useCharacterStore.setState({ character: wood });
    const { container } = render(<PlayCantripSwap doc={wood} locale="en" />);
    expect(container.textContent).toBe("");
  });
});
