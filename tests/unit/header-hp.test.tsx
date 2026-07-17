/**
 * HeaderHpControl — HP relocated into the header (Phase-6 cockpit IA revision).
 *
 * One engine (`useHpControls`), two states: a slim bar → popover while alive, and
 * a prominent dying affordance (death saves + a quick heal) at 0 HP. Max HP and
 * the hit-dice total stay definition values (edit-mode editors in the popover);
 * Damage / Heal / Temp stay live. The store is the real Zustand store hydrated
 * with MOCK_CHARACTER (hp.max 62, current 38, temp 5, deathSucc 2 / deathFail 1).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { HeaderHpControl } from "@/features/character/center/HeaderHpControl";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { computeCharacterMaxHp, effectiveMaxHp } from "@/lib/aggregate-character";

function load(overrides?: Partial<(typeof MOCK_CHARACTER)["session"]>): void {
  const base = structuredClone(MOCK_CHARACTER);
  useCharacterStore.setState({
    character: { ...base, session: { ...base.session, ...overrides } },
    loading: false,
    error: null,
  });
}

/**
 * Load MOCK with a live `+5` hp-flat grant (a standing Aid: prepared `aid` spell +
 * the `spell-aid` while-active chip) — the exact scenario B08 protects. Stored base
 * `hp.max` stays 62 (a hand-pin ≠ the by-the-book base 66); effective max = 62 + 5 = 67.
 */
function loadWithAid(): void {
  const base = structuredClone(MOCK_CHARACTER);
  useCharacterStore.setState({
    character: {
      ...base,
      character: {
        ...base.character,
        spells: [...base.character.spells, { srdId: "aid", prepared: true }],
      },
      session: { ...base.session, activeFeatures: ["spell-aid"] },
    },
    loading: false,
    error: null,
  });
}

beforeEach(() => {
  useUIStore.setState({ sheetMode: "play" });
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("HeaderHpControl — alive", () => {
  it("shows the slim bar trigger with current / max / temp", () => {
    load();
    render(<HeaderHpControl />);
    const trigger = screen.getByRole("button", { name: /hit points/i });
    expect(trigger.querySelector(".hp-bar")).not.toBeNull();
    expect(within(trigger).getByText("38")).toBeInTheDocument();
    expect(within(trigger).getByText(/62/)).toBeInTheDocument();
    expect(within(trigger).getByText("+5")).toBeInTheDocument();
    // Controls are progressive-disclosure — not in the DOM until the popover opens.
    expect(screen.queryByRole("button", { name: /^damage$/i })).not.toBeInTheDocument();
  });

  it("renders temp HP as the lapis overlay segment stacked after the base fill", () => {
    load();
    render(<HeaderHpControl />);
    const trigger = screen.getByRole("button", { name: /hit points/i });
    // Mock: 38/62 + 5 temp → base fill 61%, temp segment 8% starting at 61%
    // (the Liquid-Mercury recipe's lapis buffer, DESIGN.md §5 — clamped so the
    // two beads can never overflow the channel).
    const tempSeg = trigger.querySelector(".hp-fill-temp") as HTMLElement;
    expect(tempSeg).not.toBeNull();
    expect(tempSeg.style.getPropertyValue("--w")).toBe("61%");
    expect(tempSeg.style.getPropertyValue("--tw")).toBe("8%");
  });

  it("renders NO temp segment when there is no temp HP", () => {
    load({ hp: { current: 38, temp: 0 } });
    render(<HeaderHpControl />);
    const trigger = screen.getByRole("button", { name: /hit points/i });
    expect(trigger.querySelector(".hp-fill-temp")).toBeNull();
  });

  it("opens the popover with the full controls and applies damage (temp absorbs first)", () => {
    load();
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));

    const amount = screen.getByLabelText(/amount of damage/i);
    expect(screen.getByRole("button", { name: /^damage$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^heal$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^temp$/i })).toBeInTheDocument();

    // 10 damage: temp (5) absorbs first, the remaining 5 hits 38 → 33 (not 28).
    fireEvent.change(amount, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /^damage$/i }));
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(33);
  });

  it("Enter in the amount field does NOT auto-apply damage (no destructive default)", () => {
    load();
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    const amount = screen.getByLabelText(/amount of damage/i);
    fireEvent.change(amount, { target: { value: "10" } });
    fireEvent.keyDown(amount, { key: "Enter" });
    // HP is unchanged — committing is an explicit verb tap, never a reflex Enter.
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(38);
    // …and the popover stays open (Enter is a no-op in the amount field).
    expect(screen.getByRole("button", { name: /^damage$/i })).toBeInTheDocument();
  });

  it("gates the Max HP + hit-dice editors on edit mode (in the popover)", () => {
    load();
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    // Play mode: definition values are read-only (no inline editor button).
    expect(
      screen.queryByRole("button", { name: /maximum hit points/i })
    ).not.toBeInTheDocument();

    // Flip to edit mode while the popover stays open — the content re-renders the
    // override-first inline editors in place.
    act(() => {
      useUIStore.setState({ sheetMode: "edit" });
    });
    expect(
      screen.getByRole("button", { name: /maximum hit points/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /total hit dice/i })).toBeInTheDocument();
  });
});

describe("HeaderHpControl — popover stability + focus (Phase-6 triage)", () => {
  it("the HP trigger keeps a keyboard focus indicator (no outline-none, K4)", () => {
    load();
    render(<HeaderHpControl />);
    const trigger = screen.getByRole("button", { name: /hit points/i });
    // The global §07 gold-halo `:focus-visible` ring must NOT be suppressed on
    // the primary HP control — there is no `focus-visible:outline-none` override.
    expect(trigger.className).not.toContain("outline-none");
  });

  it("the auto-focused amount field carries NO hover tooltip (the verbs are self-explanatory)", () => {
    load();
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    const amount = screen.getByLabelText(/amount of damage/i);
    // The prior Radix tooltip rendered an aria-describedby pointing at a tooltip
    // node; with it removed the field describes itself by its own aria-label only.
    expect(amount).not.toHaveAttribute("aria-describedby");
  });

  it("Escape inside an inline editor cancels THAT edit without dismissing the popover", () => {
    load();
    render(<HeaderHpControl />);
    act(() => {
      useUIStore.setState({ sheetMode: "edit" });
    });
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));

    // Start editing Max HP in the popover, then Escape to cancel it.
    fireEvent.click(screen.getByRole("button", { name: /maximum hit points/i }));
    const maxInput = screen.getByLabelText(/maximum hit points/i);
    fireEvent.keyDown(maxInput, { key: "Escape" });

    // The edit is cancelled (the inline editor collapses back to its button)…
    expect(
      screen.getByRole("button", { name: /maximum hit points/i })
    ).toBeInTheDocument();
    // …but the popover itself stays OPEN — the same Escape did not also dismiss it.
    expect(screen.getByRole("button", { name: /^damage$/i })).toBeInTheDocument();
  });

  it("Escape outside an inline editor still dismisses the popover as normal", () => {
    load();
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    const amount = screen.getByLabelText(/amount of damage/i);
    // Escape on the plain amount field is NOT swallowed → Radix closes the popover.
    fireEvent.keyDown(amount, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /^damage$/i })).not.toBeInTheDocument();
  });

  // B12: a non-commit dismiss (Escape / outside-click) must not leave a stale typed
  // amount lingering on the persistent per-row popover instance — the next open must
  // start clean, never carrying a value that silently concatenates with a fresh entry.
  it("resets the amount field on a non-commit Escape dismiss, so it doesn't linger into the next open", () => {
    load();
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    const amount = screen.getByLabelText(/amount of damage/i);
    fireEvent.change(amount, { target: { value: "50" } });
    expect(amount).toHaveValue(50);
    // Dismiss via Escape (never taps a verb button) — no commit occurs.
    fireEvent.keyDown(amount, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /^damage$/i })).not.toBeInTheDocument();
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(38); // untouched

    // Reopen — the amount field must be empty, not the stale "50".
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    expect(screen.getByLabelText(/amount of damage/i)).toHaveValue(null);
  });

  // B12 (GR20): the amount field must select-all on (re)open so typing replaces
  // rather than appends to whatever was last focused into it.
  it("select-alls the amount field's contents when the popover (re)opens", () => {
    load();
    render(<HeaderHpControl />);
    const selectSpy = vi.spyOn(HTMLInputElement.prototype, "select");
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockRestore();
  });
});

describe("HeaderHpControl — Bloodied indicator (S5)", () => {
  it("shows the Bloodied mark when current HP is at or below half max", () => {
    // Mock max 62 → ⌊62/2⌋ = 31. Drop to 31 → Bloodied.
    load({ hp: { ...MOCK_CHARACTER.session.hp, current: 31 } });
    render(<HeaderHpControl />);
    expect(screen.getByText(/bloodied/i)).toBeInTheDocument();
  });

  it("does NOT show the Bloodied mark above half max", () => {
    // Default mock current 38 (> 31) → not Bloodied.
    load();
    render(<HeaderHpControl />);
    expect(screen.queryByText(/bloodied/i)).not.toBeInTheDocument();
  });

  it("does NOT show the Bloodied mark at 0 HP (dying owns that band)", () => {
    load({ hp: { ...MOCK_CHARACTER.session.hp, current: 0 } });
    render(<HeaderHpControl />);
    expect(screen.queryByText(/bloodied/i)).not.toBeInTheDocument();
  });
});

describe("HeaderHpControl — Max HP edits the BASE, not the effective (B08)", () => {
  it("edit mode shows the STORED BASE (62), never the grant-inflated effective (67)", () => {
    // With a +5 Aid boon the effective max is 67, but the editable field must show the
    // by-the-book BASE (62) so an edit can't bake the +5 permanently into the stored base.
    loadWithAid();
    useUIStore.setState({ sheetMode: "edit" });
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    const maxBtn = screen.getByRole("button", { name: /maximum hit points/i });
    expect(maxBtn).toHaveTextContent("62");
    expect(maxBtn).not.toHaveTextContent("67");
  });

  it("editing Max HP writes the new BASE, leaving the +5 grant to add on top", () => {
    loadWithAid();
    useUIStore.setState({ sheetMode: "edit" });
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    fireEvent.click(screen.getByRole("button", { name: /maximum hit points/i }));
    const input = screen.getByLabelText(/maximum hit points/i);
    fireEvent.change(input, { target: { value: "70" } });
    fireEvent.blur(input);
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no character");
    // The BASE is written directly (70) — never the effective (would be 75) …
    expect(doc.character.hp.max).toBe(70);
    // … and the grant is untouched: it still lifts the effective max on top (70 + 5 = 75).
    expect(effectiveMaxHp(doc.character, doc.session)).toBe(75);
  });

  it("the override round-trips: a hand-pinned base shows the reset affordance; reset recomputes base+grants", () => {
    // MOCK's stored `hp.max` (62) is already a hand-pin ≠ the by-the-book base (66), so the
    // field is overridden and the reset-to-auto affordance shows.
    loadWithAid();
    const computedBase = computeCharacterMaxHp(MOCK_CHARACTER.character); // 66
    useUIStore.setState({ sheetMode: "edit" });
    render(<HeaderHpControl />);
    fireEvent.click(screen.getByRole("button", { name: /hit points/i }));
    const reset = screen.getByRole("button", { name: /reset to auto/i });
    fireEvent.click(reset);
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no character");
    // Clearing the override recomputes the by-the-book BASE (66), NOT base+grant …
    expect(doc.character.hp.max).toBe(computedBase);
    expect(computedBase).toBe(66);
    // … and the +5 grant still rides on top of the recomputed base (66 + 5 = 71).
    expect(effectiveMaxHp(doc.character, doc.session)).toBe(71);
  });
});

describe("HeaderHpControl — dying (0 HP)", () => {
  it("collapses to a compact danger pill that stays THE HP editor (popover trigger)", () => {
    load({ hp: { ...MOCK_CHARACTER.session.hp, current: 0 } });
    render(<HeaderHpControl />);
    // The header element keeps the vital footprint, re-skinned to danger: a "0"
    // value + a "Dying" label, with the full "0 HP · Dying" on its title/hover.
    expect(screen.getByTitle(/0 hp · dying/i)).toBeInTheDocument();
    expect(screen.getByText(/dying/i)).toBeInTheDocument();
    // RA-03 — the pill remains the ONE HP editor (golden rule 6): it is a
    // popover trigger, so damage taken WHILE down can be entered (it marks
    // death-save failures; crit toggle = two).
    expect(screen.getByRole("button", { name: /hit points/i })).toBeInTheDocument();
    // …but the dying CEREMONY is NOT in the header — the death saves, quick
    // heal, and roll entry live in the global DyingBanner strip (covered by
    // dying-banner tests). No status live region here.
    expect(screen.queryByText(/death saves/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^heal$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("readonly (DM view) keeps the dying pill static — no popover trigger", () => {
    load({ hp: { ...MOCK_CHARACTER.session.hp, current: 0 } });
    useCharacterStore.setState({ readonly: true });
    render(<HeaderHpControl />);
    expect(screen.getByTitle(/0 hp · dying/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    useCharacterStore.setState({ readonly: false });
  });
});
