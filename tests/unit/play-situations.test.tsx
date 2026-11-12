/**
 * The table's situations on the new Play (rules-gap board B: «In sella» and the rest;
 * parity with the classic sheet's situation chips): a tap lights one, a second clears
 * it, and a lit fight fact says the rule line the sheet cannot apply.
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

import { PlaySituations } from "@/domains/play/ui/PlaySituations";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const active = () => useCharacterStore.getState().character?.session.activeFeatures ?? [];

describe("PlaySituations", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(makeCharacterDoc({}));
    useCharacterStore.setState({ readonly: false });
  });

  it("Mounted lights with a tap and clears with a second", () => {
    render(<PlaySituations />);
    const mounted = screen.getByRole("button", { name: "Mounted" });
    fireEvent.click(mounted);
    expect(active().some((k) => k.includes("mounted"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Mounted" }));
    expect(active().some((k) => k.includes("mounted"))).toBe(false);
  });

  it("labels every chip in sentence case («Long range», «Dim light»)", () => {
    render(<PlaySituations />);
    expect(screen.getByRole("button", { name: "Long range" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dim light" })).toBeTruthy();
  });

  it("a phone opens the full set from the «Situation» disclosure", () => {
    const { container } = render(<PlaySituations />);
    const toggle = screen.getByRole("button", { name: "Situation" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".f-situations[data-open]")).toBeTruthy();
  });
});
