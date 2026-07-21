/**
 * Economy-in-Play (Phase-6 cockpit IA revision): the turn-economy meter is
 * relocated to the top of the Play tab, sharing the SAME combatStore +
 * useTurnEconomy as the action cards. This proves the relocation kept combat
 * intact:
 *
 *  - THE TRAP — the combatStore hydrate/persist bookkeeping was lifted onto the
 *    persistent `TurnEconomyProvider` (which wraps the whole tabs region and never
 *    unmounts on a tab switch), so the in-progress turn survives leaving and
 *    returning to Play. If the bookkeeping had stayed on the meter, remounting it
 *    would re-run `endCombat()` and wipe the turn — the regression this guards.
 *  - #66 — dropping concentration fires EXACTLY ONE toast (the store action owns
 *    the with-undo toast; the meter no longer double-toasts).
 *
 * Firebase + the subscription are mocked so it stays CI-pure; the store is seeded
 * with the canonical mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/hooks/useCharacterSubscription", () => ({
  useCharacterSubscription: () => {},
}));

import { CharacterCockpit } from "@/features/character/CharacterCockpit";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { conc } from "./__helpers__/concentration";
import i18n from "@/i18n";

function renderCockpit() {
  return render(
    <MemoryRouter initialEntries={["/characters/mock-1"]}>
      <Routes>
        <Route path="/characters/:characterId" element={<CharacterCockpit />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUIStore.setState({ sheetMode: "play" });
  useCharacterStore.setState({
    character: { ...MOCK_CHARACTER },
    loading: false,
    error: null,
  });
});

describe("economy in the Play tab", () => {
  it("renders the meter (End Turn) and the solo End Combat together at the top of Play", () => {
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelector(".turn")).not.toBeNull();
    expect(within(panel).getByRole("button", { name: /end turn/i })).toBeInTheDocument();
    // Solo (no encounter mounted) → End Combat is present beside End Turn.
    expect(
      within(panel).getByRole("button", { name: /end combat/i })
    ).toBeInTheDocument();
  });

  it("THE TRAP — the in-progress turn survives leaving and returning to Play", () => {
    renderCockpit();

    // Mid-turn: a slot is committed + movement spent. combatStore is the single
    // source the meter reads (mount hydration has already run by now).
    act(() => {
      useCombatStore
        .getState()
        .selectAction({ id: "trap-strike", name: "Trap Strike", slot: "action" });
      useCombatStore.getState().setMovementUsed(10);
    });
    // The spent action's name lives on the economy disc as a tooltip (title), not an
    // inline label (it truncated long names + cluttered the strip), so assert via title.
    expect(screen.getByTitle("Trap Strike")).toBeInTheDocument();

    // Leave Play → the meter (inside the Play panel) unmounts.
    fireEvent.click(screen.getByRole("tab", { name: /spells/i }));
    expect(screen.queryByTitle("Trap Strike")).not.toBeInTheDocument();

    // Return to Combat → the meter remounts and re-reads the STILL-INTACT combat
    // state. The persistent provider never re-hydrated/reset, so the turn is
    // exactly as it was left.
    fireEvent.click(screen.getByRole("tab", { name: /combat/i }));
    expect(screen.getByTitle("Trap Strike")).toBeInTheDocument();
    expect(useCombatStore.getState().selected.action[0]?.name).toBe("Trap Strike");
    expect(useCombatStore.getState().movementUsedFt).toBe(10);
  });

  // ── B6 — multi-action count awareness (Action Surge / Haste) ────────────────
  it("default economy is single-slot: the Action token shows no count badge", () => {
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;
    // Budget 1 → no "1/2" badge (golden rule 19: it earns its place only above 1).
    expect(panel.querySelector(".econ-count")).toBeNull();
    expect(useCombatStore.getState().budget.action).toBe(1);
  });

  it("an ACTIVE Action Surge raises the budget to 2 — the meter shows a 1/2 token and a 2nd action commits", () => {
    // The mock carries `fighter-action-surge`; lighting its while-active toggle
    // makes the economy provider derive an action budget of 2.
    useCharacterStore.setState({
      character: {
        ...MOCK_CHARACTER,
        session: {
          ...MOCK_CHARACTER.session,
          activeFeatures: [
            ...(MOCK_CHARACTER.session.activeFeatures ?? []),
            "fighter-action-surge",
          ],
        },
      },
      loading: false,
      error: null,
    });

    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;

    // The provider's derive-budget effect has run → action budget is 2.
    expect(useCombatStore.getState().budget.action).toBe(2);

    // The Action token now carries a count badge reading "0/2".
    const badge = panel.querySelector(".econ-count");
    expect(badge?.textContent).toBe("0/2");

    // A FIRST action commits, then a SECOND fits the raised budget (1/2 → 2/2).
    act(() => {
      expect(
        useCombatStore
          .getState()
          .selectAction({ id: "a1", name: "Attack", slot: "action" })
      ).toBe(true);
      expect(
        useCombatStore
          .getState()
          .selectAction({ id: "a2", name: "Surge Attack", slot: "action" })
      ).toBe(true);
    });
    expect(useCombatStore.getState().selected.action.map((a) => a.id)).toEqual([
      "a1",
      "a2",
    ]);
    expect(panel.querySelector(".econ-count")?.textContent).toBe("2/2");
  });

  it("#66 — dropping concentration fires exactly one toast (with undo)", () => {
    useCharacterStore.setState({
      character: {
        ...MOCK_CHARACTER,
        session: { ...MOCK_CHARACTER.session, concentration: conc("bless") },
      },
      loading: false,
      error: null,
    });
    const showToast = vi.spyOn(useToastStore.getState(), "showToast");

    const { container } = renderCockpit();
    // The meter's own concentration-drop (the rail surfaces its own copy too — we
    // assert THIS handler fires a single toast, not a double).
    const drop = container.querySelector(
      '[role="tabpanel"]:not([inert]) .conc-banner-drop'
    );
    expect(drop).not.toBeNull();
    fireEvent.click(drop as HTMLElement);

    expect(showToast).toHaveBeenCalledTimes(1);
    // …and it carries an undo (the store generalises immediate-commit-with-undo).
    const arg = showToast.mock.calls[0]?.[0];
    expect(arg && typeof arg.onUndo).toBe("function");
  });

  // ── Item e — the economy meter is itself a board filter ─────────────────────
  it("clicking a meter economy token filters the board, sharing the fchip filter state", () => {
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;

    // The meter's Bonus caption is a filter button; its fchip counterpart starts off.
    const meterBonus = within(panel).getByRole("button", {
      name: /filter actions by bonus/i,
    });
    const fchipBonus = within(panel)
      .getAllByRole("button", { name: /^bonus/i })
      .find((b) => b.classList.contains("fchip"));
    expect(meterBonus.getAttribute("aria-pressed")).toBe("false");
    expect(fchipBonus?.getAttribute("aria-pressed")).toBe("false");

    // Click the METER token → the SAME filter state lights BOTH the meter token and
    // the fchip (one source of truth — not two independent filters).
    fireEvent.click(meterBonus);
    expect(meterBonus.getAttribute("aria-pressed")).toBe("true");
    expect(fchipBonus?.getAttribute("aria-pressed")).toBe("true");

    // Clicking the active meter token again clears back to "all".
    fireEvent.click(meterBonus);
    expect(meterBonus.getAttribute("aria-pressed")).toBe("false");
    expect(fchipBonus?.getAttribute("aria-pressed")).toBe("false");
  });

  // ── Owner-reported dead circle (2026-06-11): the coloured DISC is the perceived
  // button, so the WHOLE token (disc + caption) must be ONE filter button —
  // before the fix only the caption was interactive and clicking the circle did
  // nothing. Owner verdict 2026-06-11 ("It should behave just like them"): the
  // REACTION token is the same pure filter as Action/Bonus — its disc never
  // spends the reaction. ─────────────────────────────────────────────────────────
  it("clicking the economy CIRCLE itself filters the board — ALL THREE tokens, reaction included", () => {
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;

    for (const kind of ["action", "bonus", "reaction"] as const) {
      // Structural: the token IS a button (not a div with a caption-only target).
      const token = panel.querySelector(`button.econ-tok[data-kind="${kind}"]`);
      expect(token, `the ${kind} token must be one <button>`).not.toBeNull();
      expect(token?.getAttribute("aria-pressed")).toBe("false");

      // Click the CIRCLE element (the disc), NOT the caption — it must filter.
      const disc = token?.querySelector(".econ-disc") as HTMLElement;
      expect(disc).not.toBeNull();
      fireEvent.click(disc);
      expect(token?.getAttribute("aria-pressed")).toBe("true");
      // …and it NEVER spends the reaction (the old asymmetric toggle is gone).
      expect(useCombatStore.getState().reactionUsed).toBe(false);

      // Clicking the circle again clears back to "all".
      fireEvent.click(disc);
      expect(token?.getAttribute("aria-pressed")).toBe("false");
    }
  });

  // ── Owner verdict 2026-06-11 — SPENDING the reaction lives on the list: the
  // reaction-filtered board carries ONE "Mark used" row for off-list reactions
  // (opportunity attacks resolved verbally), committing through the SAME
  // handleUseReaction path (undo toast), and the meter disc dims like
  // Action/Bonus discs do. ───────────────────────────────────────────────────────
  it("the reaction-filtered board's Mark-used row spends the reaction with undo; the disc dims", async () => {
    const showToast = vi.spyOn(useToastStore.getState(), "showToast");
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;

    // Filter the board to reactions via the meter's reaction token.
    const reactionTok = panel.querySelector(
      'button.econ-tok[data-kind="reaction"]'
    ) as HTMLElement;
    fireEvent.click(reactionTok);
    expect(reactionTok.getAttribute("aria-pressed")).toBe("true");

    // The off-list row is present exactly once, in reaction voice.
    const markUsed = within(panel).getByRole("button", {
      name: /mark used: other reaction/i,
    });
    expect(markUsed).toBeInTheDocument();

    // Commit: the reaction is spent and the meter's disc dims (data-state).
    // (handleUseReaction awaits the promise-based concentration gate, so the
    // click resolves on a microtask — flush it inside act.)
    await act(async () => {
      fireEvent.click(markUsed);
      await Promise.resolve();
    });
    expect(useCombatStore.getState().reactionUsed).toBe(true);
    expect(reactionTok.getAttribute("data-state")).toBe("spent");
    // …and the row's CTA goes inert, reading the grammar's spent label ("Used"
    // — the accessible name mirrors the visible label).
    expect(
      within(panel).queryByRole("button", { name: /used: other reaction/i })
    ).toBeDisabled();

    // CTA grammar consistency (owner 2026-07-11) — the reaction that SPENT the
    // token keeps the occupant gold ring (`.uc.is-active`), exactly like a
    // committed Action / Bonus card. This was the reaction group's gap: it greyed
    // to "Used" but marked NO occupant, so this assertion fails on the old code.
    const usedRow = within(panel)
      .getByRole("button", { name: /used: other reaction/i })
      .closest(".uc");
    expect(usedRow).toHaveClass("is-active");

    // The commit carries the standard 5s undo toast; undo restores the reaction.
    const arg = showToast.mock.calls.at(-1)?.[0];
    expect(arg && typeof arg.onUndo).toBe("function");
    act(() => arg?.onUndo?.());
    expect(useCombatStore.getState().reactionUsed).toBe(false);
    expect(reactionTok.getAttribute("data-state")).toBe("open");
    // Undo clears the occupant with the reaction — the ring is gone.
    expect(
      within(panel)
        .getByRole("button", { name: /mark used: other reaction/i })
        .closest(".uc")
    ).not.toHaveClass("is-active");
  });

  // ── REGRESSION (SEV-1): the off-list reaction MUST build + render with ITALIAN
  // active. The old code froze the row's label by calling `i18n.getFixedT("en")`/
  // `("it")` inside PlayTab; the app loads only the active locale's `common` ns at
  // startup, so in an IT session the EN ns was unloaded → `getFixedT("en")` threw
  // (dev/test) and the Play tab white-screened behind the error boundary. The whole
  // suite mounted EN-active, which is exactly why it slipped through. This mounts
  // the cockpit with IT active and asserts the off-list row renders in IT voice —
  // it NEVER throws / shows the error boundary. (EN `common` is now also always
  // loaded as the canonical fallback, and the row's label is a `ui` LocText ref.)
  it("the off-list reaction builds + renders with ITALIAN active (no white-screen)", async () => {
    const prev = i18n.language;
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    try {
      const { container } = renderCockpit();
      const panel = container.querySelector(
        '[role="tabpanel"]:not([inert])'
      ) as HTMLElement;
      expect(panel).not.toBeNull();
      // Filter to reactions so the off-list "Mark used" row is on the board.
      const reactionTok = panel.querySelector(
        'button.econ-tok[data-kind="reaction"]'
      ) as HTMLElement;
      fireEvent.click(reactionTok);
      // The row renders in IT voice ("Segna usata: Altra reazione") — proof the
      // synthetic reaction built + localized without the cross-locale fetch crash.
      expect(
        within(panel).getByRole("button", { name: /segna usata: altra reazione/i })
      ).toBeInTheDocument();
    } finally {
      await act(async () => {
        await i18n.changeLanguage(prev);
      });
    }
  });

  // ── Coin toggle (owner-ratified 2026-07-03) — tapping a SPENT economy coin
  // re-arms that slot in place (mis-tap recovery without a button), with a 5s undo
  // toast that round-trips. An OPEN coin still filters (asserted above). ──────────
  it("coin toggle — a spent REACTION coin re-arms in place, round-tripping with undo", () => {
    const showToast = vi.spyOn(useToastStore.getState(), "showToast");
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;

    // Spend the reaction (as the board's Mark-used row does) → the coin tarnishes.
    act(() => useCombatStore.getState().useReaction("test-reaction"));
    const reactionTok = panel.querySelector(
      'button.econ-tok[data-kind="reaction"]'
    ) as HTMLElement;
    expect(reactionTok.getAttribute("data-state")).toBe("spent");

    // Tap the SPENT coin → it re-arms in place (back to available), not filters.
    act(() => {
      fireEvent.click(reactionTok);
    });
    expect(useCombatStore.getState().reactionUsed).toBe(false);
    expect(reactionTok.getAttribute("data-state")).toBe("open");

    // …carrying a 5s undo toast whose undo re-spends (the round-trip).
    const arg = showToast.mock.calls.at(-1)?.[0];
    expect(arg && typeof arg.onUndo).toBe("function");
    act(() => arg?.onUndo?.());
    expect(useCombatStore.getState().reactionUsed).toBe(true);
    expect(reactionTok.getAttribute("data-state")).toBe("spent");
  });

  it("coin toggle — a spent ACTION coin re-arms in place, round-tripping with undo", () => {
    const showToast = vi.spyOn(useToastStore.getState(), "showToast");
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;

    // Commit an action into the slot → the coin tarnishes.
    act(() => {
      useCombatStore
        .getState()
        .selectAction({ id: "fireball", name: "Fireball", slot: "action" });
    });
    const actionTok = panel.querySelector(
      'button.econ-tok[data-kind="action"]'
    ) as HTMLElement;
    expect(actionTok.getAttribute("data-state")).toBe("spent");

    // Tap the SPENT coin → re-arms the slot; undo re-commits the display.
    act(() => {
      fireEvent.click(actionTok);
    });
    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(actionTok.getAttribute("data-state")).toBe("open");
    const arg = showToast.mock.calls.at(-1)?.[0];
    expect(arg && typeof arg.onUndo).toBe("function");
    act(() => arg?.onUndo?.());
    expect(useCombatStore.getState().selected.action.map((a) => a.id)).toEqual([
      "fireball",
    ]);
  });

  // ── End Combat (solo) — behind the standard store-driven ConfirmDialog. ─────────
  it("End Combat is gated by the confirm dialog; confirming returns combat to baseline", async () => {
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;

    // Put combat mid-fight so the baseline reset is observable. The mock already
    // carries conditions + Action Log entries, so we can prove End Combat leaves them
    // untouched (it never reaches into the character store).
    act(() => {
      useCombatStore.getState().setRound(4);
      useCombatStore.getState().selectAction({ id: "x", name: "X", slot: "action" });
    });
    const before = useCharacterStore.getState().character;
    if (!before) throw new Error("character not loaded");
    const conditionsBefore = before.session.conditions;
    const logBefore = before.session.logEntries;
    expect(conditionsBefore.length).toBeGreaterThan(0);
    expect(logBefore.length).toBeGreaterThan(0);

    // Click End Combat → the ConfirmDialog opens and NOTHING has changed yet.
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: /end combat/i }));
      await Promise.resolve();
    });
    expect(useConfirmStore.getState().open).toBe(true);
    expect(useCombatStore.getState().round).toBe(4);

    // Cancel → combat is untouched (the gate holds).
    await act(async () => {
      useConfirmStore.getState().respond(false);
      await Promise.resolve();
    });
    expect(useCombatStore.getState().round).toBe(4);

    // Click again + confirm → combat returns to baseline (round 1, economy re-armed).
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: /end combat/i }));
      await Promise.resolve();
    });
    await act(async () => {
      useConfirmStore.getState().respond(true);
      await Promise.resolve();
    });
    expect(useCombatStore.getState().round).toBe(1);
    expect(useCombatStore.getState().selected.action).toEqual([]);
    // …and the Action Log + conditions are UNTOUCHED — End Combat never reaches into
    // the character store.
    const after = useCharacterStore.getState().character;
    if (!after) throw new Error("character not loaded");
    expect(after.session.conditions).toEqual(conditionsBefore);
    expect(after.session.logEntries).toEqual(logBefore);
  });

  // ── RA-12 — the Hide card's roll-entry (SRD "Hide [Action]": DC 15 Dexterity
  // (Stealth); success = Invisible + the check total is the find-DC). The player
  // enters the d20 FACE; the app folds the live Stealth bonus (from the ONE
  // shared skills derivation), judges the DC, and applies — undoably. ──────────
  it("RA-12 — the Hide roll-entry applies Invisible + the find-DC on a success (undoable); a miss applies nothing", async () => {
    const { deriveSavesAndChecks } = await import("@/lib/views/saves-checks-view");
    useToastStore.setState({ toasts: [], timers: {} });
    const { container } = renderCockpit();
    const panel = container.querySelector(
      '[role="tabpanel"]:not([inert])'
    ) as HTMLElement;

    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("character not loaded");
    const stealth = deriveSavesAndChecks(doc.character, {
      exhaustion: doc.session.exhaustion,
      activeFeatures: doc.session.activeFeatures,
      conditions: doc.session.conditions,
      grantBundleChoices: doc.session.grantBundleChoices,
    }).skills.find((r) => r.id === "stealth");
    if (!stealth) throw new Error("stealth row not derived");
    // The test needs a face-1 miss to be possible (bonus < 14 on the mock).
    expect(stealth.bonus).toBeLessThan(14);

    // Expand the Hide base action card → the roll-entry + end-conditions hint show.
    fireEvent.click(within(panel).getByText("Hide"));
    const field = within(panel).getByLabelText(/your d20 roll/i);

    // A MISS (face 1): nothing applied — a plain notice, no undo entry.
    fireEvent.change(field, { target: { value: "1" } });
    fireEvent.click(within(panel).getByRole("button", { name: /^apply$/i }));
    expect(useCharacterStore.getState().character?.session.conditions).not.toContain(
      "invisible"
    );
    expect(useToastStore.getState().toasts.at(-1)?.onUndo).toBeUndefined();

    // A HIT (face 20): Invisible + the remembered find-DC (20 + Stealth bonus)…
    fireEvent.change(field, { target: { value: "20" } });
    fireEvent.click(within(panel).getByRole("button", { name: /^apply$/i }));
    const total = 20 + stealth.bonus;
    const session = useCharacterStore.getState().character?.session;
    expect(session?.conditions).toContain("invisible");
    expect(session?.hiddenDc).toBe(total);
    // …the rail's Invisible chip carries the find-DC suffix…
    const chips = Array.from(container.querySelectorAll(".co-chip"));
    expect(chips.some((c) => c.textContent.includes(`DC ${total}`))).toBe(true);
    // …and the whole outcome is ONE undo entry (the reversal contract).
    const toast = useToastStore.getState().toasts.at(-1);
    expect(typeof toast?.onUndo).toBe("function");
    act(() => toast?.onUndo?.());
    const restored = useCharacterStore.getState().character?.session;
    expect(restored?.conditions).not.toContain("invisible");
    expect(restored?.hiddenDc).toBeUndefined();
  });
});
