/**
 * Combat page — action derivation regressions (D4 + D8 + D9).
 *
 * Driven through the rendered PlayTab with MOCK_CHARACTER (Lyra Voss, Elf
 * Bard 9 — a prepared caster carrying weapons + cantrips + leveled spells +
 * cross-class features, the single mock that exercises every card type):
 *
 *  - D4 — committing a live combat action logs it with the action's REAL
 *    `LogType` (weapon → "attack", spell → "spell-cast", feature →
 *    "tracker-use") so each action-log row gets its own icon, NOT the fallback
 *    "generic" dot. (Commits are async since the D24 concentration-break gate
 *    became a promise, so the assertions await the microtask flush.)
 *  - D8 — the board WIRES its economy-slot groups to the ONE `sortActions`
 *    comparator. The comparator's full contract (tier order, ascending leveled
 *    spells, alpha tie-break, weapon alpha order) is pinned purely against the
 *    producing function in `combat-action-log-type.test.ts`; here we keep just the
 *    two facts that only the render proves: the Actions group's order reflects the
 *    comparator (wiring witness) and the dual-wield off-hand reveal is STATEFUL —
 *    it surfaces only after a Light-weapon attack commits.
 *  - D9 — a leveled spell's "At Higher Levels" upcast section renders in the
 *    expanded card (mirrors the Spells page); a cantrip shows none.
 *
 * MOCK_CHARACTER is a fixture (no Firebase env needed); the stores read in CI
 * without `VITE_FIREBASE_API_KEY` (mirrors spells-page.test.tsx).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
// PlayTab now mounts the shared InitVital (TB4) → `combat-state-io` → Firebase; mock the
// firebase module so this unit stays CI-pure (the env keys are unset in CI).
vi.mock("@/lib/firebase", () => ({}));
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useCombatStore } from "@/stores/combatStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MOCK_CHARACTER } from "@/lib/mock";
import { buildDevScenario } from "@/lib/dev-scenarios";

function load(): void {
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    error: null,
  });
}

function renderPage() {
  // PlayTab's action cards commit through the shared TurnEconomyProvider (which
  // also renders the cast-level / pool-spend modals), so wrap the page in it —
  // exactly as the cockpit does. The branded ConfirmDialog is normally mounted
  // once at the router root; mount it alongside so the D24 promise-confirm flow
  // can render.
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <PlayTab />
      </TurnEconomyProvider>
      <ConfirmDialog />
    </MemoryRouter>
  );
}

/** Newest log entry's effect after a commit (the entry the click just appended).
 *  An action/reaction-use event carries the semantic `effect` (the glyph axis);
 *  any other kind has none. */
function lastLogType(): string | undefined {
  const log = useCharacterStore.getState().character?.session.logEntries ?? [];
  const event = log[log.length - 1]?.event;
  return event && (event.kind === "action-use" || event.kind === "reaction-use")
    ? event.effect
    : undefined;
}

/** The commit CTAs (Cast/Attack/Use) of a named group, in DOM order. The ALL
 *  board renders economy groups as `<section.agroup>`; the Pinned group is a
 *  `<div.agroup>` — match either container. */
function groupActionNames(title: string): string[] {
  const head = screen.getByRole("heading", { name: title });
  const group = head.closest(".agroup");
  if (!group) throw new Error(`group section "${title}" not found`);
  return Array.from(group.querySelectorAll("button[aria-label]"))
    .map((b) => b.getAttribute("aria-label") ?? "")
    .filter((l) => /^(Cast|Attack|Use): /.test(l))
    .map((l) => l.replace(/^(Cast|Attack|Use): /, ""));
}

describe("PlayTab action derivations", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
    useToastStore.setState({ toasts: [], timers: {} });
    useCombatStore.setState({
      round: 1,
      initiative: "",
      selected: { action: [], bonus: [], free: [] },
      budget: { action: 1, bonus: 1 },
      attackBudget: 1,
      attacksUsed: 0,
      attackSwingIds: [],
      reactionUsed: false,
      reactionUsedId: null,
    });
    useConfirmStore.setState({ open: false, options: null, _resolve: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── D4 — log type derived from the action's source ──────────────────────
  it("D4 — committing a weapon attack logs it as 'attack' (not generic)", async () => {
    load();
    renderPage();
    fireEvent.click(screen.getByLabelText("Attack: Dagger"));
    await waitFor(() => expect(lastLogType()).toBe("attack"));
  });

  it("D4 — committing a cantrip logs it as 'spell-cast' (not generic)", async () => {
    load();
    renderPage();
    // Mage Hand is a cantrip → no slot, no concentration → commits directly
    // (no cast-level picker / no concentration confirm), so the click logs it.
    fireEvent.click(screen.getByLabelText("Cast: Mage Hand"));
    await waitFor(() => expect(lastLogType()).toBe("spell-cast"));
  });

  it("D4 — committing a feature action logs it as 'tracker-use' (not generic)", async () => {
    load();
    renderPage();
    // Action Surge — a free action backed by a fixed-cost short-rest tracker →
    // commits directly (no pool prompt), exercising the feature branch.
    fireEvent.click(screen.getByLabelText("Use: Action Surge"));
    await waitFor(() => expect(lastLogType()).toBe("tracker-use"));
  });

  // ── D8 — the board WIRES its groups to the comparator (witness) + stateful
  //         off-hand reveal. The comparator's full contract is pinned purely in
  //         combat-action-log-type.test.ts (sortActions describe). ───────────
  it("D8 — the dual-wield off-hand surfaces ONLY after a Light-weapon attack is committed", async () => {
    load();
    renderPage();
    // RAW 2024: the off-hand bonus attack follows the Attack action with a Light
    // weapon. Before attacking, it is hidden…
    expect(groupActionNames("Pinned")).not.toContain("Dagger (off-hand)");
    // …commit the main Dagger attack (a Light weapon) into the Action slot…
    fireEvent.click(screen.getByLabelText("Attack: Dagger"));
    // …and the off-hand bonus attack appears.
    await waitFor(() =>
      expect(groupActionNames("Pinned")).toContain("Dagger (off-hand)")
    );
  });

  it("D8 — the Actions group renders in sorted order (wiring witness: cantrips before leveled spells)", () => {
    load();
    renderPage();
    // The board routes the Actions group through `sortActions` → Mage Hand
    // (cantrip) precedes Bane (the first leveled spell). This is the WIRING proof;
    // the comparator's full order contract is unit-tested purely in
    // combat-action-log-type.test.ts (sortActions describe).
    const names = groupActionNames("Actions");
    expect(names.indexOf("Mage Hand")).toBeLessThan(names.indexOf("Bane"));
  });

  // ── D9 — "At Higher Levels" upcast callout in the expanded spell card ────
  it("D9 — renders the 'At Higher Levels' section when a leveled spell is expanded", () => {
    load();
    renderPage();
    // Thunderwave (L1, prepared) carries an upcast clause in the SRD data.
    // Expanding the card (not casting) must surface the callout.
    const expandBtn = screen.getByLabelText("Expand: Thunderwave");
    fireEvent.click(expandBtn);
    const card = expandBtn.closest("article") ?? expandBtn.parentElement;
    if (!card) throw new Error("Thunderwave card not found");
    // The callout heading + its upcast body, scoped to the Thunderwave card so
    // another row's higherLevels can't leak a false positive. The body is
    // matched on textContent — the rules-text colour grammar lifts "1d8" into
    // its own token, so the sentence spans elements.
    expect(within(card).getByText("At Higher Levels")).toBeInTheDocument();
    expect(card.textContent).toMatch(/the damage increases by 1d8 for each slot level/i);
  });

  it("D9 — a cantrip shows NO 'At Higher Levels' section when expanded", () => {
    load();
    renderPage();
    const expandBtn = screen.getByLabelText("Expand: Mage Hand");
    fireEvent.click(expandBtn);
    const card = expandBtn.closest("article") ?? expandBtn.parentElement;
    if (!card) throw new Error("Mage Hand card not found");
    expect(within(card).queryByText("At Higher Levels")).toBeNull();
  });

  // ── D24 — concentration break uses the BRANDED confirm, not window.confirm ─
  it("D24 — casting a 2nd concentration spell opens the branded confirm, never window.confirm", async () => {
    // The mock is already concentrating on Hypnotic Pattern (session.concentration).
    load();
    // Spy so we can assert the NATIVE prompt is never used (the whole point of D24).
    const nativeConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    // Bane is a concentration spell that costs a slot → opens the cast-level
    // picker first (the Bard has multiple slot levels). Pick the base level.
    fireEvent.click(screen.getByLabelText("Cast: Bane"));
    fireEvent.click(await screen.findByText(/Level 1 \(base\)/i));

    // The promise-based gate now renders the branded ConfirmDialog with the
    // bilingual concentration-break copy — NOT a native window.confirm.
    expect(await screen.findByText("Break concentration?")).toBeInTheDocument();
    expect(
      screen.getByText(
        /You are concentrating on Hypnotic Pattern\. Casting Bane will end it/i
      )
    ).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it("D24 — cancelling the concentration confirm aborts the cast (no slot spent, no log)", async () => {
    load();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    const slotBefore =
      useCharacterStore.getState().character?.session.spellSlots["1"]?.used ?? 0;
    const logBefore =
      useCharacterStore.getState().character?.session.logEntries.length ?? 0;

    fireEvent.click(screen.getByLabelText("Cast: Bane"));
    fireEvent.click(await screen.findByText(/Level 1 \(base\)/i));
    // Dismiss the branded confirm with Cancel → the gate resolves false → abort.
    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      const slotAfter =
        useCharacterStore.getState().character?.session.spellSlots["1"]?.used ?? 0;
      const logAfter =
        useCharacterStore.getState().character?.session.logEntries.length ?? 0;
      // Nothing was committed: the level-1 slot usage and the log are unchanged.
      expect(slotAfter).toBe(slotBefore);
      expect(logAfter).toBe(logBefore);
    });
  });

  // ── Phase 4 — inline advantage/disadvantage modifier (engine truth) ──────
  it("P4 — attack-roll cards show the engine-derived Disadvantage inline (Frightened)", () => {
    load();
    // Inject the CANONICAL lowercase condition id so the gate matches — the
    // mock's display-cased "Frightened" doesn't trigger CONDITION_GATES (a
    // pre-existing data nit, flagged; the UI add-condition picker uses lowercase
    // ids, so conditions added in-app resolve correctly).
    const doc = useCharacterStore.getState().character;
    if (doc) {
      useCharacterStore.setState({
        character: { ...doc, session: { ...doc.session, conditions: ["frightened"] } },
      });
    }
    renderPage();
    // Frightened imposes Disadvantage on attack rolls → every attack-roll card
    // (the pinned weapons) surfaces it inline in its gloss — display only, no roll.
    expect(screen.getAllByText(/Disadv\./i).length).toBeGreaterThan(0);
  });

  it("P4 — no advantage/disadvantage token when no condition or grant imposes one", () => {
    load();
    const doc = useCharacterStore.getState().character;
    if (doc) {
      useCharacterStore.setState({
        character: { ...doc, session: { ...doc.session, conditions: [] } },
      });
    }
    renderPage();
    // With no attack adv/dis source, the inline modifier is absent (honest blank)
    // — contrast with the Frightened case above, which surfaces "Disadv.".
    expect(screen.queryByText(/Disadv\./i)).toBeNull();
  });

  // ── Item g — two-hand wield stance for a Versatile weapon ────────────────────
  it("g — a Versatile weapon shows BOTH labelled damage rows; the stance swaps the verdict", () => {
    load();
    renderPage();
    // Expand the Quarterstaff (Versatile (1d8); one-handed 1d6). Its card carries
    // the stance toggle; a non-versatile weapon (Rapier) does not.
    const staffCard = screen
      .getByLabelText("Attack: Quarterstaff")
      .closest(".uc") as HTMLElement;
    fireEvent.click(within(staffCard).getByLabelText(/expand/i));

    const stance = within(staffCard).getByRole("group", { name: /wield/i });
    const oneH = within(stance).getByRole("button", { name: /one-handed/i });
    const twoH = within(stance).getByRole("button", { name: /two-handed/i });
    expect(oneH.getAttribute("aria-pressed")).toBe("true");
    // The unified weapon facts grid (shared with the inventory WeaponCard)
    // prints BOTH explicitly labelled rows (STR 8 → -1).
    expect(within(staffCard).getByText(/1d6-1\s+Bludgeoning/i)).toBeInTheDocument();
    expect(within(staffCard).getByText(/1d8-1\s+Bludgeoning/i)).toBeInTheDocument();
    expect(within(staffCard).getByText("Damage (one-handed)")).toBeInTheDocument();
    expect(within(staffCard).getByText("Damage (two-handed)")).toBeInTheDocument();
    // The collapsed VERDICT chip follows the stance: 1d6 one-handed…
    expect(within(staffCard).getByText(/1d6-1\s+Bldg/i)).toBeInTheDocument();

    // …and the SAME versatile die (1d8) after toggling two-handed.
    fireEvent.click(twoH);
    expect(twoH.getAttribute("aria-pressed")).toBe("true");
    expect(within(staffCard).getByText(/1d8-1\s+Bldg/i)).toBeInTheDocument();
  });

  it("g — a NON-versatile weapon (Rapier) shows no wield-stance toggle", () => {
    load();
    renderPage();
    const rapierCard = screen
      .getByLabelText("Attack: Rapier")
      .closest(".uc") as HTMLElement;
    fireEvent.click(within(rapierCard).getByLabelText(/expand/i));
    expect(within(rapierCard).queryByRole("group", { name: /wield/i })).toBeNull();
  });
});

// ── EXTRA ATTACK — BG3 grammar (owner ruling 2026-07-09): the Action coin spends
//    fully on the first swing like any action; the attacks-remaining COUNT lives on
//    the weapon cards (a "N left · no action" marker while swings remain) and the
//    board group header, not on a segmented coin ring. ────────────────────────────
describe("PlayTab Extra Attack (card-borne attacks-remaining)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
    useToastStore.setState({ toasts: [], timers: {} });
    useCombatStore.setState({
      round: 1,
      initiative: "",
      selected: { action: [], bonus: [], free: [] },
      budget: { action: 1, bonus: 1 },
      attackBudget: 1,
      attacksUsed: 0,
      attackSwingIds: [],
      reactionUsed: false,
      reactionUsedId: null,
    });
    useConfirmStore.setState({ open: false, options: null, _resolve: null });
  });

  function loadFighter(): void {
    // A PUBLIC Extra-Attack build: Fighter (Champion) 6 → 2 attacks, Longsword.
    const doc = buildDevScenario("champion-6");
    if (!doc) throw new Error("champion-6 scenario missing");
    useCharacterStore.setState({ character: doc, loading: false, error: null });
  }

  const actionCoin = (): HTMLElement =>
    document.querySelector('.econ-tok[data-kind="action"]') as HTMLElement;
  // The CTA grammar renames a spent card's accessible name to "Used: <name>",
  // so the locator matches both faces (live verb / spent "Used").
  const longswordCta = (): HTMLElement =>
    screen.getByLabelText(/^(Attack|Used): Longsword/);
  const longswordCard = (): HTMLElement => longswordCta().closest(".uc") as HTMLElement;
  // BG3 grammar carries NO standing label — a LIVE attack card wears only the
  // struck-gold CTA, and any `.cc-reason` marker line beside it must NEVER render.
  const hasGlow = (card: HTMLElement): boolean =>
    card.querySelector(".uc-cta.is-emphasis") != null;
  const reasonText = (card: HTMLElement): string | null =>
    card.querySelector(".uc-cta .cc-reason")?.textContent ?? null;
  // The count is discoverable only via the CTA's hover title (+ its sr-only status).
  const ctaTitle = (card: HTMLElement): string | null =>
    card.querySelector(".cc-btn")?.getAttribute("title") ?? null;
  // OWNER ORDER (2026-07-10) — the group headers are pure rubrics: no availability
  // label ever renders on them (the turn-meter coins alone carry that state).
  const noHeaderAvailabilityText = (): boolean =>
    document.querySelector(".ag-econ") == null &&
    document.querySelector(".reaction-status") == null;

  it("GUARD CASE — a one-attack hero (Bard) has no ring, no glow, no CTA title (zero delta)", () => {
    load(); // MOCK — Elf Bard 9, attackBudget 1
    renderPage();
    expect(document.querySelector(".atk-ring")).toBeNull();
    expect(document.querySelector(".uc-cta.is-emphasis")).toBeNull();
    expect(document.querySelector(".cc-btn[title]")).toBeNull();
  });

  it("a fresh Extra-Attack turn: coin open, no ring, weapon card LIVE with no glow yet", () => {
    loadFighter();
    renderPage();
    expect(document.querySelector(".atk-ring")).toBeNull();
    expect(actionCoin().getAttribute("data-state")).toBe("open");
    expect(longswordCta()).not.toBeDisabled();
    // No swing open yet → no emphasis glow, no count title.
    expect(hasGlow(longswordCard())).toBe(false);
    expect(ctaTitle(longswordCard())).toBeNull();
  });

  it("swing 1 spends the coin fully; the card stays LIVE (struck-gold CTA, hover-only count, NO standing label anywhere)", async () => {
    loadFighter();
    renderPage();
    const swing = () => fireEvent.click(longswordCta());

    // The headers are pure rubrics from the very start (owner order 2026-07-10).
    expect(noHeaderAvailabilityText()).toBe(true);

    // Swing 1 — the Action coin spends fully (plain action semantics, no partial).
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(1));
    expect(actionCoin().getAttribute("data-state")).toBe("spent");
    expect(lastLogType()).toBe("attack");
    const log1 = useCharacterStore.getState().character?.session.logEntries ?? [];
    const ev1 = log1[log1.length - 1]?.event;
    expect(ev1?.kind === "action-use" ? ev1.attackOf : undefined).toEqual({
      n: 1,
      total: 2,
    });

    // …but the weapon card stays LIVE, its CTA struck gold, with NO standing marker
    // text — the count lives only on the CTA hover title.
    await waitFor(() => expect(hasGlow(longswordCard())).toBe(true));
    expect(reasonText(longswordCard())).toBeNull(); // no standing label
    expect(ctaTitle(longswordCard())).toMatch(/1 of 2 attacks remaining/i);
    expect(longswordCta()).not.toBeDisabled();
    // No availability text surfaces on any group header mid-swing either.
    expect(noHeaderAvailabilityText()).toBe(true);

    // Swing 2 (the last) — the action is fully spent → the gold drops AND the CTA
    // becomes DISABLED (matching the reaction contract: a spent attack is not clickable,
    // never a tap that toasts "already used").
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(2));
    expect(useCombatStore.getState().selected.action).toHaveLength(1);
    await waitFor(() => expect(hasGlow(longswordCard())).toBe(false));
    expect(ctaTitle(longswordCard())).toBeNull();
    await waitFor(() => expect(longswordCta()).toBeDisabled());
    // The spent state lives on the coin + the disabled cards — never the header.
    expect(noHeaderAvailabilityText()).toBe(true);

    // Swing 3 — the Attack action is fully spent (no Action Surge). The CTA is disabled,
    // so a click does NOTHING (no commit) AND surfaces NO "already used" toast.
    useToastStore.setState({ toasts: [], timers: {} });
    swing();
    await new Promise((r) => setTimeout(r, 0));
    expect(useCombatStore.getState().attacksUsed).toBe(2);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("CTA occupant ring — the swung attack card keeps the gold ring once the Attack action is fully SPENT, not while live", async () => {
    loadFighter();
    renderPage();
    const swing = () => fireEvent.click(longswordCta());

    // Swing 1 — a pip remains, so the card is LIVE (struck-gold emphasis). The
    // occupant ring belongs to the SPENT state, so it must NOT show yet.
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(1));
    await waitFor(() => expect(hasGlow(longswordCard())).toBe(true));
    expect(longswordCard()).not.toHaveClass("is-active");

    // Swing 2 (last) — the Attack action is fully spent → the emphasis drops AND
    // the swung card keeps the occupant gold ring (its id rode a swing). Old code
    // ringed NOTHING here: the Action slot's only occupant was the synthetic
    // "attack-group" entry, which matches no card id — so this fails on the old code.
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(2));
    await waitFor(() => expect(longswordCta()).toBeDisabled());
    expect(hasGlow(longswordCard())).toBe(false);
    expect(longswordCard()).toHaveClass("is-active");
  });

  it("CTA occupant ring — a committed BONUS card keeps the ring (the group that already worked, held as the control)", async () => {
    load(); // MOCK — Bardic Inspiration is a bonus-action tracker use (direct commit)
    renderPage();
    fireEvent.click(screen.getByLabelText(/^Use: Bardic Inspiration/));
    await waitFor(() =>
      expect(screen.getByLabelText(/^Used: Bardic Inspiration/)).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/^Used: Bardic Inspiration/).closest(".uc")).toHaveClass(
      "is-active"
    );
  });

  it("both swings share ONE evolving undo toast (no stacking); its undo pops the LAST swing", async () => {
    loadFighter();
    renderPage();
    const liveToasts = () => useToastStore.getState().toasts.filter((t) => !t.leaving);
    const swing = () => fireEvent.click(longswordCta());

    // Swing 1 → one live toast, "attack 1 of 2".
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(1));
    await waitFor(() => expect(liveToasts()).toHaveLength(1));
    expect(liveToasts()[0]?.message).toMatch(/attack 1 of 2/i);

    // Swing 2 → STILL one live toast (replaced in place), text now "attack 2 of 2".
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(2));
    await waitFor(() => expect(liveToasts()[0]?.message).toMatch(/attack 2 of 2/i));
    expect(liveToasts()).toHaveLength(1);

    // The single toast's undo pops the LAST swing (attacksUsed 2 → 1).
    liveToasts()[0]?.onUndo?.();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(1));
  });

  it("re-arming the spent Action coin resets the swing counter; its undo restores the exact progress", async () => {
    loadFighter();
    renderPage();
    const swing = () => fireEvent.click(longswordCta());
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(1));
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(2));
    expect(actionCoin().getAttribute("data-state")).toBe("spent");

    // Re-arm the spent Action coin — slot freed AND the swing counter clears.
    fireEvent.click(screen.getByLabelText("Re-arm Action"));
    expect(useCombatStore.getState().attacksUsed).toBe(0);
    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(actionCoin().getAttribute("data-state")).toBe("open");

    // The rearm toast's undo round-trips: group re-added, counter restored to 2.
    const toasts = useToastStore.getState().toasts;
    const rearmToast = toasts[toasts.length - 1];
    rearmToast?.onUndo?.();
    expect(useCombatStore.getState().attacksUsed).toBe(2);
    expect(useCombatStore.getState().selected.action).toHaveLength(1);
    await waitFor(() => expect(actionCoin().getAttribute("data-state")).toBe("spent"));
  });

  it("a STALE rearm-undo is a no-op once the slot has been re-spent (no clobber)", async () => {
    // Regression (review pass 2): rearm → NEW swing within the 5s toast window →
    // the old rearm undo fired anyway — selectAction silently collided but the
    // counter was still overwritten (1 → 2), losing the player's new swing.
    loadFighter();
    renderPage();
    // The CTA aria-label gains a "— N of M attacks remaining" suffix once swings
    // remain, so match by prefix (not the bare exact string).
    const swing = () => fireEvent.click(longswordCta());
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(1));
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(2));

    // Re-arm, capture ITS toast, then re-spend the slot with a fresh swing.
    fireEvent.click(screen.getByLabelText("Re-arm Action"));
    const toasts = useToastStore.getState().toasts;
    const rearmToast = toasts[toasts.length - 1];
    swing();
    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(1));
    expect(useCombatStore.getState().selected.action).toHaveLength(1);

    // The stale rearm undo fires — the re-occupied slot makes it a no-op.
    rearmToast?.onUndo?.();
    expect(useCombatStore.getState().attacksUsed).toBe(1);
    expect(useCombatStore.getState().selected.action).toHaveLength(1);
  });
});

// ── EXTRA ATTACK RIM RING — Eldritch Knight War Magic (a PACK subclass) —
//    the replace-attack-with-a-cantrip interaction is exercised in
//    content-pack/tests/unit/combat-action-derivations.pack.test.tsx.
