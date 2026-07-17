/**
 * Re-render measurement for SpellsTab (#59 Batch B / F4 — #72-safe proof).
 *
 * The spell cards are React.memo'd and the parent now passes STABLE callbacks
 * (ref-backed wrappers) + identity props. So a SEARCH KEYSTROKE — which changes
 * only the parent's `search` state, never a card's props — must NOT re-render the
 * spell cards that stay visible.
 *
 * Measurement: `resolveSpellAbility` is called exactly once per SRD spell while
 * the `buildSpellsViewModel` presenter assembles the (stable) card view-models —
 * which runs ONLY in SpellsTab's `view` memo (keyed on character/class/locale/
 * edit), never on `search`. We spy on it (call-through) as a per-card BUILD
 * counter: it fires at mount for every spell, then a search keystroke (which
 * recreates neither the VM list nor any card's props) must NOT re-invoke it. The
 * still-visible memo'd cards likewise bail. Without the stable VM + stable props
 * the keystroke would rebuild/re-render every visible card — the regression this
 * guards against.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/resolve-spell-ability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resolve-spell-ability")>();
  return { ...actual, resolveSpellAbility: vi.fn(actual.resolveSpellAbility) };
});

import { SpellsTab } from "@/features/character/center/tabs/SpellsTab";
import { resolveSpellAbility } from "@/lib/resolve-spell-ability";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";

const spy = vi.mocked(resolveSpellAbility);

describe("SpellsTab — search keystroke does not re-render still-visible cards (F4)", () => {
  beforeEach(() => {
    useCharacterStore.setState({
      character: structuredClone(MOCK_CHARACTER),
      loading: false,
      error: null,
    });
    useUIStore.setState({ sheetMode: "play" });
    spy.mockClear();
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
  });

  it("typing a query that keeps spells visible re-renders ZERO of the visible cards", () => {
    render(
      <MemoryRouter>
        <SpellsTab />
      </MemoryRouter>
    );
    // Sanity: the mock's 16 spells each rendered a card → the counter fired.
    expect(spy.mock.calls.length).toBeGreaterThan(5);

    const search = screen.getByPlaceholderText(/Search spells/i);
    // "h" keeps several spells (Healing Word, Hypnotic Pattern, Hold Monster, …).
    spy.mockClear();
    fireEvent.change(search, { target: { value: "h" } });

    // Still-visible cards keep identical props (callbacks are stable, character +
    // spell refs unchanged) → React.memo bails → the per-render counter never fires.
    expect(screen.getByText("Healing Word")).toBeInTheDocument();
    expect(spy.mock.calls.length).toBe(0);
  });
});
