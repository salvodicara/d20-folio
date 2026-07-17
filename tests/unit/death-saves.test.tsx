/**
 * DeathSaves — the markable death-save track, rebuilt slim + frameless on the
 * folio pip vocabulary (Phase-6 cockpit triage). Shown only at 0 HP; tapping a
 * gem socket sets the track count, tapping the current top pip clears it. Three
 * successes = stabilised, three failures = dead. Drives the real `characterStore`
 * (CI-pure, no firebase) seeded from the bundled mock.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeathSaves } from "@/features/character/molecules/DeathSaves";
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

const down = (extra?: Partial<(typeof MOCK_CHARACTER)["session"]>) =>
  load({
    hp: { ...MOCK_CHARACTER.session.hp, current: 0 },
    deathSucc: 0,
    deathFail: 0,
    ...extra,
  });

const session = () => useCharacterStore.getState().character?.session;

beforeEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("DeathSaves", () => {
  it("renders nothing while the character is above 0 HP", () => {
    load(); // mock current 38
    const { container } = render(<DeathSaves />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the title + both tracks at 0 HP", () => {
    down();
    render(<DeathSaves />);
    expect(screen.getByText(/death saves/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /successes/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /failures/i })).toBeInTheDocument();
    // Three pips per track.
    expect(screen.getAllByRole("button", { name: /successes \d/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /failures \d/i })).toHaveLength(3);
  });

  it("tapping an empty pip fills the track up to it", () => {
    down();
    render(<DeathSaves />);
    fireEvent.click(screen.getByRole("button", { name: /successes 2/i }));
    expect(session()?.deathSucc).toBe(2);
  });

  it("tapping the current top pip clears it (reversible)", () => {
    down({ deathFail: 1 });
    render(<DeathSaves />);
    // The 1st failure is the current top → clicking it decrements to 0.
    fireEvent.click(screen.getByRole("button", { name: /failures 1/i }));
    expect(session()?.deathFail).toBe(0);
  });

  it("marks pips as pressed to convey state to assistive tech", () => {
    down({ deathSucc: 2 });
    render(<DeathSaves />);
    const pips = screen.getAllByRole("button", { name: /successes \d/i });
    expect(pips[0]).toHaveAttribute("aria-pressed", "true");
    expect(pips[1]).toHaveAttribute("aria-pressed", "true");
    expect(pips[2]).toHaveAttribute("aria-pressed", "false");
  });

  it("every pip carries the oversized invisible hit area (the app's tappable-pip idiom)", () => {
    down();
    render(<DeathSaves />);
    // A 20px gem alone is a fiddly touch target at the table — every tappable pip
    // in the app grows its hit box with an oversized pseudo (`button.trk-pip::before`
    // / `button.sc-pip::before`); the death-save pips ride the same mechanism via
    // the Tailwind pseudo utilities (relative + before:-inset-2).
    for (const pip of screen.getAllByRole("button", { pressed: false })) {
      expect(pip.className).toContain("before:-inset-2");
      expect(pip.className).toContain("relative");
    }
  });

  it("three successes lock the unmarked pips (the banner label announces Stable)", () => {
    down({ deathSucc: 3 });
    render(<DeathSaves />);
    // The verdict text moved to the DyingBanner's state label (RA-11) — the
    // molecule carries no duplicate announcement, only the locked track.
    expect(screen.queryByText(/stabilized/i)).not.toBeInTheDocument();
    // Failure pips can no longer be marked once resolved.
    for (const pip of screen.getAllByRole("button", { name: /failures \d/i })) {
      expect(pip).toBeDisabled();
    }
  });

  it("three failures lock the unmarked pips (the banner label announces Dead)", () => {
    down({ deathFail: 3 });
    render(<DeathSaves />);
    expect(screen.queryByText(/has died/i)).not.toBeInTheDocument();
    for (const pip of screen.getAllByRole("button", { name: /successes \d/i })) {
      expect(pip).toBeDisabled();
    }
  });

  it("offers reset only once the track has marks, and reset clears both", () => {
    down();
    const { rerender } = render(<DeathSaves />);
    // Nothing to reset at a fresh 0/0.
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();

    down({ deathSucc: 2, deathFail: 1 });
    rerender(<DeathSaves />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(session()?.deathSucc).toBe(0);
    expect(session()?.deathFail).toBe(0);
  });

  // ── B16 — Reset must persist through the combat/state seam ──────────────────
  it("B16 — Reset routes through setDeathSaves (the persisting combat-trio seam), not a bare in-memory updateSession", () => {
    down({ deathSucc: 2, deathFail: 1 });
    // Spy on the ONE seam every other death-save mutation persists through
    // (`setDeathSaves` → `persistCombat` → the `combat/state` subdoc writer).
    // `updateSession` mutates only in-memory session state and never reaches the
    // subdoc — reset must NOT depend on it for the trio to survive a reload / be
    // seen by another client (DM view / other device).
    const realSetDeathSaves = useCharacterStore.getState().setDeathSaves;
    let calledWith: [number, number] | null = null;
    useCharacterStore.setState({
      setDeathSaves: (successes, failures) => {
        calledWith = [successes, failures];
        realSetDeathSaves(successes, failures);
      },
    });
    render(<DeathSaves />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(calledWith).toEqual([0, 0]);
    expect(session()?.deathSucc).toBe(0);
    expect(session()?.deathFail).toBe(0);
  });

  // ── S5 — the lowered death-save crit threshold (Champion Survivor) ──────────
  /** Drop the loaded character to 0 HP AND give it the Champion Survivor feature. */
  function downSurvivor(): void {
    const base = structuredClone(MOCK_CHARACTER);
    base.character.classes = [{ classId: "fighter", level: 18, subclassId: "champion" }];
    base.character.features = [{ srdId: "fighter-champion-survivor" }];
    useCharacterStore.setState({
      character: {
        ...base,
        session: {
          ...base.session,
          hp: { ...base.session.hp, current: 0 },
          deathSucc: 0,
          deathFail: 0,
        },
      },
      loading: false,
      error: null,
    });
  }

  it("S5 — a Champion Survivor surfaces the lowered crit threshold (a roll of 18+)", () => {
    downSurvivor();
    render(<DeathSaves />);
    // The line interpolates the NUMERIC threshold (18) — never a source name.
    expect(screen.getByText(/18\+/)).toBeInTheDocument();
  });

  it("S5 — a non-Champion (default mock) shows NO threshold line (default 20 stays silent)", () => {
    down(); // Bard mock — no death-save-crit-range grant
    render(<DeathSaves />);
    // No "N+" threshold chip for a character at the RAW default.
    expect(screen.queryByText(/\d+\+/)).not.toBeInTheDocument();
  });
});
