/**
 * DyingBanner — the global 0-HP danger strip (Phase-6 cockpit fix).
 *
 * Shown ONLY at 0 HP, it carries the dying CONTROLS the header pill no longer
 * holds: the markable `DeathSaves` pips + a one-field quick heal driving the
 * SAME shared `useHpControls` engine (so healing off 0 clears the death saves).
 * Announced assertively (`role="status"` + `aria-live="assertive"`). The store is
 * the real Zustand store hydrated with MOCK_CHARACTER.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DyingBanner } from "@/features/character/DyingBanner";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";

function load(overrides?: Partial<(typeof MOCK_CHARACTER)["session"]>): void {
  const base = structuredClone(MOCK_CHARACTER);
  useCharacterStore.setState({
    character: { ...base, session: { ...base.session, ...overrides } },
    loading: false,
    error: null,
  });
}

beforeEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("DyingBanner", () => {
  it("renders nothing while the character is above 0 HP", () => {
    load(); // mock current 38
    const { container } = render(<DyingBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the assertive dying strip at 0 HP: death saves + a reachable quick heal", () => {
    load({ hp: { ...MOCK_CHARACTER.session.hp, current: 0 } });
    render(<DyingBanner />);
    const strip = screen.getByRole("status");
    expect(strip).toHaveAttribute("aria-live", "assertive");
    expect(within(strip).getByText(/0 hp/i)).toBeInTheDocument();
    expect(within(strip).getByText(/death saves/i)).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: /^heal$/i })).toBeInTheDocument();
    expect(within(strip).getByLabelText(/healing amount/i)).toBeInTheDocument();
  });

  it("a quick heal off 0 restores HP and clears the death saves (RAW)", () => {
    load({
      hp: { ...MOCK_CHARACTER.session.hp, current: 0 },
      deathSucc: 2,
      deathFail: 1,
    });
    render(<DyingBanner />);
    const heal = screen.getByLabelText(/healing amount/i);
    fireEvent.change(heal, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /^heal$/i }));
    const session = useCharacterStore.getState().character?.session;
    expect(session?.hp.current).toBe(7);
    expect(session?.deathSucc).toBe(0);
    expect(session?.deathFail).toBe(0);
  });

  it("applies the quick heal on Enter", () => {
    load({ hp: { ...MOCK_CHARACTER.session.hp, current: 0 } });
    render(<DyingBanner />);
    const heal = screen.getByLabelText(/healing amount/i);
    fireEvent.change(heal, { target: { value: "5" } });
    fireEvent.keyDown(heal, { key: "Enter" });
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(5);
  });
});

describe("DyingBanner — RA-11 death-save roll entry + the verdict label", () => {
  it("offers the d20 roll entry while dying; applying 15 marks a success", () => {
    // The mock carries a lingering 2/1 track — pin a fresh 0/0 for the tally.
    load({
      hp: { ...MOCK_CHARACTER.session.hp, current: 0 },
      deathSucc: 0,
      deathFail: 0,
    });
    render(<DyingBanner />);
    const field = screen.getByLabelText(/death-save d20/i);
    fireEvent.change(field, { target: { value: "15" } });
    fireEvent.blur(field);
    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));
    const session = useCharacterStore.getState().character?.session;
    expect(session?.deathSucc).toBe(1);
    expect(session?.deathFail).toBe(0);
  });

  it("a natural 20 revives on the spot: 1 HP, track reset (the banner then unmounts)", () => {
    load({
      hp: { ...MOCK_CHARACTER.session.hp, current: 0 },
      deathSucc: 1,
      deathFail: 2,
    });
    render(<DyingBanner />);
    const field = screen.getByLabelText(/death-save d20/i);
    fireEvent.change(field, { target: { value: "20" } });
    fireEvent.blur(field);
    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));
    const session = useCharacterStore.getState().character?.session;
    expect(session?.hp.current).toBe(1);
    expect(session?.deathSucc).toBe(0);
    expect(session?.deathFail).toBe(0);
  });

  it("STABLE (3 successes): the verdict label reads Stable and the roll entry is gone", () => {
    load({ hp: { ...MOCK_CHARACTER.session.hp, current: 0 }, deathSucc: 3 });
    render(<DyingBanner />);
    expect(screen.getByText(/stable/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/death-save d20/i)).not.toBeInTheDocument();
  });

  it("DEAD (3 failures): the verdict label reads Dead, no roll entry, no pulse", () => {
    load({ hp: { ...MOCK_CHARACTER.session.hp, current: 0 }, deathFail: 3 });
    render(<DyingBanner />);
    expect(screen.getByText(/^dead$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/death-save d20/i)).not.toBeInTheDocument();
  });
});
