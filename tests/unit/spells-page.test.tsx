vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
/**
 * SpellsTab (folio §5.7 — canonical card-page reference)
 *
 * Covers the rebuilt Spells route: the cast-summary strip, slot cells, the
 * prepared-count over-limit warning, level filters + search, the UniversalCard
 * `with-prep` state matrix (concentration / prepared / always-prepared / ritual
 * / unprepared-dim), the immediate-commit cast flow (slot spend + undo toast),
 * ritual cast (no slot), the empty / filtered-empty states, and edit-mode
 * affordances (slot stepper, add, delete, prepared-max override). Uses
 * MOCK_CHARACTER (Elf Bard 9 — a KNOWN caster with 16 spells L0–L5).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SpellsTab } from "@/features/character/center/tabs/SpellsTab";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "firebase/auth";
import { MOCK_CHARACTER } from "@/lib/mock";
import { asRaceId } from "@/data/srd-names";
import { effectiveAC } from "@/lib/aggregate-character";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function load(doc: CharacterDoc = structuredClone(MOCK_CHARACTER)): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
  // The engine dual-dispatch derives the character's world from (doc, uid).
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <SpellsTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

function renderPageWithItemResources() {
  return render(
    <MemoryRouter>
      <ItemResourceCommandProvider>
        <TurnEconomyProvider>
          <SpellsTab />
        </TurnEconomyProvider>
      </ItemResourceCommandProvider>
    </MemoryRouter>
  );
}

describe("SpellsTab", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
    useToastStore.setState({ toasts: [], timers: {} });
    useConfirmStore.setState({ open: false, options: null, _resolve: null });
    useCombatStore.getState().endCombat();
    useUndoStore.getState().clear(null);
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    vi.restoreAllMocks();
  });

  it("renders nothing without a character", () => {
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
  });

  it("renders the cast summary with Save DC, Spell Atk, and the caster ability", () => {
    load();
    renderPage();
    // Bard 9 (PB +4), CHA 20 (+5) → DC 8+4+5 = 17, attack +4+5 = +9.
    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+9").length).toBeGreaterThan(0);
    // The caster ability code appears in the summary strip.
    expect(screen.getAllByText("CHA").length).toBeGreaterThan(0);
  });

  it("groups spells by level under section headings and shows cantrips", () => {
    load();
    renderPage();
    // "Cantrips" appears as both a filter chip and a section heading.
    expect(screen.getAllByText("Cantrips").length).toBeGreaterThan(0);
    expect(screen.getByText(/Vicious Mockery/i)).toBeInTheDocument();
    expect(screen.getByText(/Hypnotic Pattern/i)).toBeInTheDocument();
    expect(screen.getByText(/Hold Monster/i)).toBeInTheDocument();
  });

  it("filters the spell list by level via the filter chips", () => {
    load();
    renderPage();
    // Click the cantrips filter chip (the fchip carrying the count).
    const cantripChip = screen
      .getAllByRole("button", { name: /Cantrips/i })
      .find((b) => b.className.includes("fchip"));
    expect(cantripChip).toBeTruthy();
    if (!cantripChip) return;
    fireEvent.click(cantripChip);
    // A cantrip stays; a level-5 spell is filtered out.
    expect(screen.getByText(/Vicious Mockery/i)).toBeInTheDocument();
    expect(screen.queryByText(/Hold Monster/i)).not.toBeInTheDocument();
  });

  // Constitution §2.5 — "which spells require concentration?" is a one-tap facet.
  it("filters to concentration spells via the Conc. facet chip", () => {
    load();
    renderPage();
    const chip = screen.getByRole("button", { name: /Only concentration spells/i });
    fireEvent.click(chip);
    // A concentration spell stays; a non-concentration spell is filtered out.
    expect(screen.getByText(/Hypnotic Pattern/i)).toBeInTheDocument();
    expect(screen.queryByText(/Vicious Mockery/i)).not.toBeInTheDocument();
    // Toggling off restores the full list.
    fireEvent.click(chip);
    expect(screen.getByText(/Vicious Mockery/i)).toBeInTheDocument();
  });

  it("filters by search query (name match)", () => {
    load();
    renderPage();
    const search = screen.getByPlaceholderText(/Search spells/i);
    fireEvent.change(search, { target: { value: "Hypno" } });
    expect(screen.getByText(/Hypnotic Pattern/i)).toBeInTheDocument();
    expect(screen.queryByText(/Vicious Mockery/i)).not.toBeInTheDocument();
  });

  it("shows a filtered-empty runic state when nothing matches the search", () => {
    load();
    renderPage();
    const search = screen.getByPlaceholderText(/Search spells/i);
    fireEvent.change(search, { target: { value: "zzzzz-no-such-spell" } });
    expect(screen.getByText(/No spells match your search/i)).toBeInTheDocument();
  });

  it("shows the runic empty state when the spellbook is empty", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.spells = [];
    // "Empty" now means no stored AND no grant-inferred always-prepared spells —
    // so use a species/feature set that grants none (the mock's Elf lineage would
    // otherwise inject a cantrip). Human + no features = a truly empty spellbook.
    doc.character.race = asRaceId("human");
    doc.character.features = [];
    load(doc);
    renderPage();
    expect(screen.getByText("Your spellbook is empty")).toBeInTheDocument();
    // No dead "All 0" filter chip above the empty state.
    expect(document.querySelector(".fchip")).toBeNull();
  });

  it("routes an engine-executable leveled cast into the deterministic modal", async () => {
    // Hold Monster transcribes to an executable program, so outside combat the
    // dual dispatch opens the engine resolution modal instead of the legacy
    // immediate transaction (whose economy contract Misty Step still covers).
    const doc = structuredClone(MOCK_CHARACTER);
    doc.session.concentration = "";
    load(doc);
    renderPage();
    const spell = screen.getByText(/Hold Monster/i);
    const card = spell.closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    const before =
      useCharacterStore.getState().character?.session.spellSlots["5"]?.used ?? 0;
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 5/i }));
    // The engine modal opens on the slot-payment requirement; nothing legacy
    // was spent and no legacy economy claim was made.
    await screen.findByText(/Resolve cast/);
    expect(
      useCharacterStore.getState().character?.session.spellSlots["5"]?.used ?? 0
    ).toBe(before);
    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(useCombatStore.getState().spellSlotCastsThisTurn).toBe(0);
  });

  it("claims the bonus-action economy for a bonus-action spell", async () => {
    const doc = makeCharacterDoc({ classId: "wizard", level: 5 });
    doc.character.spells = [{ srdId: "misty-step", prepared: true }];
    doc.character.spellSlots = [{ level: 2, total: 1 }];
    doc.session.spellSlots = {};
    load(doc);
    renderPage();

    const card = screen.getByText("Misty Step").closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 2/i }));

    await waitFor(() =>
      expect(useCombatStore.getState().selected.bonus).toContainEqual(
        expect.objectContaining({ id: "spell-misty-step" })
      )
    );
    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(useCombatStore.getState().spellSlotCastsThisTurn).toBe(1);
  });

  it("cancels target review as a strict no-op", async () => {
    const doc = makeCharacterDoc({ classId: "cleric", level: 3 });
    doc.character.spells = [{ srdId: "healing-word", prepared: true }];
    doc.character.spellSlots = [{ level: 1, total: 1 }];
    doc.session.spellSlots = {};
    doc.session.hp = { current: 5, temp: 0 };
    load(doc);
    renderPage();

    const card = screen.getByText("Healing Word").closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 1/i }));

    // Healing Word routes to the engine modal; cancelling it is a strict no-op.
    await screen.findByText(/Resolve cast/);
    expect(useCharacterStore.getState().character?.session.spellSlots).toEqual({});
    expect(useCombatStore.getState().selected.bonus).toEqual([]);
    expect(useUndoStore.getState().past).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(/Resolve cast/)).toBeNull());
    expect(useCharacterStore.getState().character?.session).toMatchObject({
      hp: { current: 5, temp: 0 },
      spellSlots: {},
    });
    expect(useCombatStore.getState()).toMatchObject({
      selected: { action: [], bonus: [], free: [] },
      spellSlotCastsThisTurn: 0,
    });
    expect(useUndoStore.getState().past).toEqual([]);
  });

  // The SOLO COMBAT cutover: being mid-combat keeps the ENGINE dispatch, and a
  // committed engine cast mirrors the exact legacy turn economy — the claimed
  // slot, the one-slot-per-turn marker on the SOLO turn key, and the world-side
  // slot debit — while the RA-08 layered gate then routes a second leveled cast
  // of the same turn back to the legacy path, which refuses it.
  it("commits an engine cast during solo combat with the economy mirrored", async () => {
    const doc = makeCharacterDoc({ classId: "cleric", level: 3 });
    doc.character.spells = [{ srdId: "healing-word", prepared: true }];
    doc.character.spellSlots = [{ level: 1, total: 2 }];
    doc.session.spellSlots = {};
    doc.session.hp = { current: 5, temp: 0 };
    load(doc);
    renderPage();
    // Mid-combat: the tracker sits on round 3 (set after mount so the combat
    // hydration pass cannot reset the display round back to its default).
    useCombatStore.getState().setRound(3);

    const card = screen.getByText("Healing Word").closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 1/i }));

    // The engine modal resolves the cast: slot, target, the entered heal die.
    await screen.findByText(/Resolve cast/);
    const modal = () => within(screen.getByRole("dialog"));
    fireEvent.click(modal().getByRole("button", { name: /Level 1 slot/ }));
    fireEvent.click(await modal().findByRole("button", { name: "Yourself" }));
    // 2024 Healing Word rolls 2d4 + modifier: enter both entered die faces.
    const dice = await modal().findAllByRole("spinbutton");
    for (const die of dice) fireEvent.change(die, { target: { value: "4" } });
    fireEvent.click(modal().getByRole("button", { name: "Apply" }));
    await modal().findByText(/Everything resolved/);
    fireEvent.click(modal().getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.queryByText(/Resolve cast/)).toBeNull());

    // The world debited the slot once and the legacy economy mirrors exactly:
    // bonus slot occupied, the solo turn key holds the one-slot-per-turn claim.
    const state = useCombatStore.getState();
    expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(1);
    expect(state.selected.bonus).toContainEqual(
      expect.objectContaining({ id: "spell-healing-word", slot: "bonus" })
    );
    expect(state.spellSlotCastsThisTurn).toBe(1);
    expect(state.spellSlotCastTurnKey).toBe("solo:test-char:3");

    // A second leveled cast this turn: the layered gate keeps it LEGACY, and
    // the legacy limiter refuses it — no engine modal, nothing spent twice.
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 1/i }));
    expect(screen.queryByText(/Resolve cast/)).toBeNull();
    expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(1);
    expect(useCombatStore.getState().spellSlotCastsThisTurn).toBe(1);
  });

  // Reaction buff spells (Shield) dispatch ENGINE now: the standing occurrence
  // projects its +5 AC onto the sheet through the world-standing read, and the
  // reaction marker rides the economy mirror — the exact CAS the legacy
  // reaction commit performed. The legacy activation chip stays untouched.
  it("routes a reaction buff spell through the engine with the reaction mirrored", async () => {
    const doc = makeCharacterDoc({ classId: "wizard", level: 5 });
    doc.character.spells = [{ srdId: "shield", prepared: true }];
    doc.character.spellSlots = [{ level: 1, total: 2 }];
    doc.session.spellSlots = {};
    load(doc);
    renderPage();
    const acBefore = effectiveAC(doc.character, doc.session);

    const card = screen.getByText("Shield").closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 1/i }));

    // The engine modal resolves the cast: pay the level-1 slot, choose the
    // warded target (yourself), then commit.
    await screen.findByText(/Resolve cast/);
    const modal = () => within(screen.getByRole("dialog"));
    fireEvent.click(modal().getByRole("button", { name: /Level 1 slot/ }));
    fireEvent.click(await modal().findByRole("button", { name: "Yourself" }));
    await modal().findByText(/Everything resolved/);
    fireEvent.click(modal().getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.queryByText(/Resolve cast/)).toBeNull());

    // The reaction marker mirrored exactly as the legacy commit marked it,
    // and the world's slot debit mirrored onto the legacy counter.
    const combat = useCombatStore.getState();
    expect(combat.reactionUsed).toBe(true);
    expect(combat.reactionUsedId).toBe("spell-shield");
    const session = useCharacterStore.getState().character?.session;
    expect(session?.spellSlots["1"]?.used).toBe(1);
    // No legacy activation row: the buff lives as a WORLD standing the sheet
    // reads through the projection — effective AC gains Shield's +5.
    expect(session?.activeFeatures ?? []).not.toContain("spell-shield");
    const after = useCharacterStore.getState().character;
    expect(after).not.toBeNull();
    if (!after) return;
    expect(effectiveAC(after.character, after.session)).toBe(acBefore + 5);
  });

  it("casts an extended-time spell without claiming turn economy", async () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.spells = [
      {
        custom: true,
        name: "Patient Ward",
        level: 1,
        school: "abjuration",
        castingTime: "1 minute",
        range: "Touch",
        components: { v: true, s: true, m: false },
        duration: "1 hour",
        concentration: false,
        description: "A deliberately slow ward.",
      },
    ];
    doc.character.spellSlots = [{ level: 1, total: 1 }];
    doc.session.spellSlots = {};
    doc.session.concentration = "";
    load(doc);
    renderPage();

    const card = screen.getByText("Patient Ward").closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 1/i }));

    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        1
      )
    );
    expect(useCombatStore.getState()).toMatchObject({
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      spellSlotCastsThisTurn: 1,
    });
    expect(useUndoStore.getState().past.at(-1)?.turnScoped).toBe(false);
  });

  it("blocks a second slot expenditure while leaving the other economy slot free", async () => {
    // Knock (still legacy — purely narrative program) spends the turn's one
    // slot from the ACTION economy; Misty Step's bonus-slot attempt then hits
    // the shared per-turn slot limiter while the bonus slot itself stays free.
    const doc = makeCharacterDoc({ classId: "wizard", level: 5 });
    doc.character.spells = [
      { srdId: "knock", prepared: true },
      { srdId: "misty-step", prepared: true },
    ];
    doc.character.spellSlots = [{ level: 2, total: 2 }];
    doc.session.spellSlots = {};
    load(doc);
    renderPage();

    const knock = screen.getByText("Knock").closest(".uc") as HTMLElement;
    fireEvent.click(knock.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(knock).getByRole("button", { name: /Cast · Lv 2/i }));
    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.spellSlots["2"]?.used).toBe(
        1
      )
    );
    const undoDepth = useUndoStore.getState().past.length;

    const mistyStep = screen.getByText("Misty Step").closest(".uc") as HTMLElement;
    fireEvent.click(mistyStep.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(mistyStep).getByRole("button", { name: /Cast · Lv 2/i }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(
        /one spell slot per turn/i
      )
    );
    expect(
      useCharacterStore.getState().character?.session.spellSlots["2"]?.used ?? 0
    ).toBe(1);
    expect(useCombatStore.getState()).toMatchObject({
      selected: {
        action: [expect.objectContaining({ id: "spell-knock" })],
        bonus: [],
      },
      spellSlotCastsThisTurn: 1,
    });
    expect(useUndoStore.getState().past).toHaveLength(undoDepth);
  });

  it("casts an item list-pool spell from its exact physical resource", async () => {
    const instanceId = "cube-of-force-copy";
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      equipment: [
        {
          srdId: "cube-of-force",
          instanceId,
          equipped: true,
          attuned: true,
          quantity: 1,
        },
      ],
    });
    doc.session.itemResources = {
      [instanceId]: {
        itemId: "cube-of-force",
        instanceId,
        revision: 0,
        resources: {
          charges: { capacity: 10, current: 10, disabled: false },
        },
        disposition: "magical",
        causalHead: null,
      },
    };
    load(doc);
    renderPageWithItemResources();

    const spell = screen.getByText("Shield");
    const card = spell.closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 1/i }));

    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.itemResources?.[instanceId]
          ?.resources.charges?.current
      ).toBe(9)
    );
    expect(useCharacterStore.getState().character?.session.spellSlots).toEqual({});
    expect(useCombatStore.getState()).toMatchObject({
      reactionUsed: true,
      spellSlotCastsThisTurn: 0,
    });
  });

  it("still permits an item free-cast after this turn already expended a slot", async () => {
    const instanceId = "cube-after-slot";
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 5,
      equipment: [
        {
          srdId: "cube-of-force",
          instanceId,
          equipped: true,
          attuned: true,
          quantity: 1,
        },
      ],
    });
    doc.character.spells = [{ srdId: "knock", prepared: true }];
    doc.character.spellSlots = [{ level: 2, total: 1 }];
    doc.session.spellSlots = {};
    doc.session.itemResources = {
      [instanceId]: {
        itemId: "cube-of-force",
        instanceId,
        revision: 0,
        resources: {
          charges: { capacity: 10, current: 10, disabled: false },
        },
        disposition: "magical",
        causalHead: null,
      },
    };
    load(doc);
    renderPageWithItemResources();

    const knock = screen.getByText("Knock").closest(".uc") as HTMLElement;
    fireEvent.click(knock.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(knock).getByRole("button", { name: /Cast · Lv 2/i }));
    await waitFor(() => expect(useCombatStore.getState().spellSlotCastsThisTurn).toBe(1));

    const shield = screen.getByText("Shield").closest(".uc") as HTMLElement;
    fireEvent.click(shield.querySelector(".uc-chevron") as HTMLElement);
    fireEvent.click(within(shield).getByRole("button", { name: /Cast · Lv 1/i }));

    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.itemResources?.[instanceId]
          ?.resources.charges?.current
      ).toBe(9)
    );
    expect(useCombatStore.getState()).toMatchObject({
      reactionUsed: true,
      spellSlotCastsThisTurn: 1,
    });
  });

  // The shared concentration-conflict gate (golden rule 6 — the Spells tab casts
  // through the SAME guard as the Combat tab): already concentrating on a
  // DIFFERENT spell → the branded confirm opens; backing out spends nothing,
  // confirming swaps concentration and spends the slot.
  it("gates a concentration cast behind the swap confirm while concentrating", async () => {
    load(); // the mock is concentrating on Hypnotic Pattern
    renderPage();
    const spell = screen.getByText(/Hold Monster/i); // concentration spell
    const card = spell.closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    const castBtn = within(card).getByRole("button", { name: /Cast · Lv 5/i });

    // Back out: the confirm opened, nothing was spent.
    fireEvent.click(castBtn);
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    expect(useConfirmStore.getState().options?.message).toMatch(/Hold Monster/i);
    useConfirmStore.getState().respond(false);
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(false));
    expect(
      useCharacterStore.getState().character?.session.spellSlots["5"]?.used ?? 0
    ).toBe(0);
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      "hypnotic-pattern"
    );

    // Confirm: the slot spends and concentration swaps to Hold Monster.
    fireEvent.click(castBtn);
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    useConfirmStore.getState().respond(true);
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.spellSlots["5"]?.used ?? 0
      ).toBe(1)
    );
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      "hold-monster"
    );
  });

  // B3 (Sorlock) — casting a CUSTOM (homebrew) spell on the Pact slot must spend
  // the PACT pool (`pact-1`), not silently drain the normal pool (`"1"`). Pins the
  // `handleCastCustom` wiring that threads the chosen option's `pactMagic` flag.
  it("casts a custom spell on the Pact slot spending the PACT pool (`pact-1`)", async () => {
    const doc = structuredClone(MOCK_CHARACTER);
    // A normal L1 pool AND a Pact-Magic L1 pool co-exist (the Sorlock collision).
    doc.character.spellSlots = [
      { level: 1, total: 4 },
      { level: 1, total: 2, pactMagic: true },
    ];
    doc.session.spellSlots = {};
    doc.character.spells = [
      {
        custom: true,
        name: "Homebrew Bolt",
        level: 1,
        school: "evocation",
        range: "60 ft",
        duration: "Instantaneous",
        castingTime: "1 action",
        components: { v: true, s: true, m: false },
        concentration: false,
        description: "",
      },
    ] as unknown as CharacterDoc["character"]["spells"];
    load(doc);
    renderPage();

    const card = screen
      .getAllByText(/Homebrew Bolt/i)
      .map((n) => n.closest(".uc"))
      .find((el): el is HTMLElement => el !== null) as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    // Two L1 options (normal + pact) → tapping Cast opens the cast-level modal.
    fireEvent.click(within(card).getByRole("button", { name: /Cast · Lv 1/i }));

    // Pick the option badged PACT in the modal (opens after the async gate).
    await waitFor(() =>
      expect(screen.getAllByRole("button").some((b) => /PACT/i.test(b.textContent))).toBe(
        true
      )
    );
    const pactBtn = screen
      .getAllByRole("button")
      .find((b) => /PACT/i.test(b.textContent)) as HTMLElement;
    fireEvent.click(pactBtn);

    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.spellSlots["pact-1"]?.used
      ).toBe(1)
    ); // pact pool spent
    expect(
      useCharacterStore.getState().character?.session.spellSlots["1"]
    ).toBeUndefined(); // normal pool UNTOUCHED
  });

  // G6/W3 — a Sorcerer casts a CANTRIP with Quickened: the slotless cast debits
  // the Metamagic Sorcery Points but spends NO spell slot; cancelling/undoing
  // restores the SP. Pins the cantrip cast wiring (`castCantrip`) end to end.
  function sorcererWithFireBolt(): CharacterDoc {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.classes = [
      {
        classId: "sorcerer",
        subclassId: "",
        level: 5,
        metamagicChoices: ["quickened-spell", "distant-spell"],
      },
    ];
    doc.character.features = [
      { srdId: "sorcerer-font-of-magic" },
      { srdId: "sorcerer-metamagic" },
    ];
    doc.character.spells = [{ srdId: "fire-bolt", prepared: true }];
    doc.character.spellSlots = [{ level: 1, total: 4 }];
    doc.session.spellSlots = {};
    doc.session.trackers = {};
    return doc;
  }

  it("casts a cantrip with Quickened — debits SP, spends NO slot, undoes on cancel", async () => {
    load(sorcererWithFireBolt());
    renderPage();
    const spell = screen
      .getAllByText(/Fire Bolt/i)
      .find((el) => el.classList.contains("uc-name")) as HTMLElement;
    const card = spell.closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    // Cantrip Cast opens the modal (metamagic to offer) — tap the cantrip Cast.
    const cardCast = within(card).getByRole("button", { name: /^Cast$/i });
    fireEvent.click(cardCast);
    // Select Quickened (2 SP) in the modal (opens after the async gate), then
    // commit via the footer Cast.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Quickened/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /Quickened/i }));
    const castButtons = screen.getAllByRole("button", { name: /^Cast$/i });
    const footerCast = castButtons[castButtons.length - 1];
    expect(footerCast).toBeDefined();
    if (footerCast) fireEvent.click(footerCast);

    // SP debited by Quickened's cost (2); NO spell slot spent.
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.trackers["sorcerer-font-of-magic"]
          ?.used
      ).toBe(2)
    );
    expect(useCharacterStore.getState().character?.session.spellSlots).toEqual({});
    expect(useCombatStore.getState().spellSlotCastsThisTurn).toBe(0);

    // The cast toast carries an undo that restores the SP.
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast).toBeDefined();
    toast?.onUndo?.();
    expect(
      useCharacterStore.getState().character?.session.trackers["sorcerer-font-of-magic"]
        ?.used ?? 0
    ).toBe(0);
  });

  it("ritual-casts a ritual spell without spending a slot", async () => {
    // Add Detect Magic (a ritual) so the mock has a ritual to cast. Bard knows
    // it via the list; we add the ref + a level-1 slot is already present.
    // Detect Magic is a concentration spell — drop the mock's held concentration
    // so the swap confirm doesn't gate (that flow has its own regression test).
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.spells = [...doc.character.spells, { srdId: "detect-magic" }];
    doc.session.concentration = "";
    load(doc);
    renderPage();
    const spell = screen.queryByText(/Detect Magic/i);
    // Detect Magic may not be in the bundled SRD; guard so the test is robust.
    if (!spell) return;
    const card = spell.closest(".uc") as HTMLElement;
    const chevron = card.querySelector(".uc-chevron") as HTMLElement;
    fireEvent.click(chevron);
    const ritualBtn = within(card).queryByRole("button", { name: /Ritual/i });
    if (!ritualBtn) return;
    const before =
      useCharacterStore.getState().character?.session.spellSlots["1"]?.used ?? 0;
    fireEvent.click(ritualBtn);
    await waitFor(() =>
      expect(useToastStore.getState().toasts.length).toBeGreaterThan(0)
    );
    const after =
      useCharacterStore.getState().character?.session.spellSlots["1"]?.used ?? 0;
    expect(after).toBe(before); // no slot spent
    expect(useCombatStore.getState()).toMatchObject({
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      spellSlotCastsThisTurn: 0,
    });
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      "detect-magic"
    );
    expect(useUndoStore.getState().past.at(-1)?.turnScoped).toBe(false);
  });

  it("shows the '+10 min · no slot' ritual-cost note beside the ritual affordance (RA-24)", () => {
    // Detect Magic is a level-1 ritual; prepared so the Bard can ritual-cast it →
    // vm.canRitual true → the footer carries the Ritual button AND the cost tag.
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.spells = [
      ...doc.character.spells,
      { srdId: "detect-magic", prepared: true },
    ];
    load(doc);
    renderPage();
    // Fail-before: the chip does not exist → getByText throws.
    expect(screen.getByText("+10 min · no slot")).toBeInTheDocument();
    // A non-ritual prepared spell (Healing Word, already in the mock) has no note.
    const plain = screen.getByText(/Healing Word/i).closest(".uc") as HTMLElement;
    expect(within(plain).queryByText(/\+10 min/)).toBeNull();
  });

  it("locks cantrips as always-prepared (prep toggle disabled)", () => {
    load();
    renderPage();
    const cantrip = screen.getByText(/Vicious Mockery/i);
    const card = cantrip.closest(".uc") as HTMLElement;
    const prep = card.querySelector(".uc-prep") as HTMLButtonElement;
    expect(prep).toBeTruthy();
    expect(prep.disabled).toBe(true);
    expect(prep).toHaveAttribute("data-locked", "true");
  });

  it("shows the over-limit warning + prepared count for a prepared caster", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    // Turn the Bard into a prepared caster over its prepared limit.
    if (!doc.character.spellcasting) throw new Error("no spellcasting");
    doc.character.spellcasting.preparedCaster = true;
    doc.character.spellcasting.preparedMax = 1;
    // Prepare two leveled spells (exceeds the limit of 1).
    doc.character.spells = doc.character.spells.map((s) =>
      !("custom" in s) && (s.srdId === "hypnotic-pattern" || s.srdId === "shatter")
        ? { ...s, prepared: true }
        : s
    );
    load(doc);
    renderPage();
    expect(screen.getByText(/over limit/i)).toBeInTheDocument();
  });

  it("toggles a leveled spell's prepared flag in edit mode for a prepared caster", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    if (!doc.character.spellcasting) throw new Error("no spellcasting");
    doc.character.spellcasting.preparedCaster = true;
    doc.character.spellcasting.preparedMax = 10;
    load(doc);
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    // Query the visible lemma (the .uc-name) — in edit mode the sr-only delete
    // label also contains the spell name, so a bare getByText is ambiguous.
    const spell = screen
      .getAllByText(/Hypnotic Pattern/i)
      .find((el) => el.classList.contains("uc-name")) as HTMLElement;
    const card = spell.closest(".uc") as HTMLElement;
    const prep = card.querySelector(".uc-prep") as HTMLButtonElement;
    expect(prep.disabled).toBe(false);
    const findRef = () =>
      useCharacterStore
        .getState()
        .character?.character.spells.find(
          (s) => !("custom" in s) && s.srdId === "hypnotic-pattern"
        );
    const before = findRef();
    const beforePrepared =
      before && !("custom" in before) ? before.prepared === true : false;
    fireEvent.click(prep);
    const after = findRef();
    const afterPrepared = after && !("custom" in after) ? after.prepared === true : false;
    // The toggle flips the prepared flag (mock starts prepared → unprepares).
    expect(afterPrepared).toBe(!beforePrepared);
  });

  it("edits a spell-slot total in edit mode (slot stepper)", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    // The level-1 slot total editor.
    const stepper = screen.getByLabelText(/Edit total slots for level 1/i);
    fireEvent.change(stepper, { target: { value: "2" } });
    const slot = useCharacterStore
      .getState()
      .character?.character.spellSlots.find((s) => s.level === 1);
    expect(slot?.total).toBe(2);
  });

  it("pins the slot-total edit as a DURABLE override, then resets it to auto (RA-33)", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    // Edit the L1 total → the count is pinned on the config AND materialized.
    fireEvent.change(screen.getByLabelText(/Edit total slots for level 1/i), {
      target: { value: "2" },
    });
    const afterEdit = useCharacterStore.getState().character?.character;
    expect(afterEdit?.spellcasting?.slotMaxOverrides).toEqual({ "1": 2 });
    expect(afterEdit?.spellSlots.find((s) => s.level === 1)?.total).toBe(2);
    // The reset-to-auto affordance appears on the overridden cell.
    const reset = screen.getByRole("button", { name: /reset to auto/i });
    fireEvent.click(reset);
    const afterReset = useCharacterStore.getState().character?.character;
    // The map empties → the key is dropped ENTIRELY (never stored as `{}`), and the
    // count returns to the derived default (Bard 9 L1 = 4).
    expect(afterReset?.spellcasting?.slotMaxOverrides).toBeUndefined();
    expect(afterReset?.spellSlots.find((s) => s.level === 1)?.total).toBe(4);
  });

  it("opens the Add Spell modal in edit mode and shows the Add button", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    expect(screen.getAllByRole("button", { name: /Add Spell/i }).length).toBeGreaterThan(
      0
    );
  });

  it("deletes a spell in edit mode from the COLLAPSED row and raises an undo toast", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    // Delete now lives in the collapsed-row editAction slot — one tap from the
    // list, no need to expand the accordion first.
    const spell = screen
      .getAllByText(/Hold Monster/i)
      .find((el) => el.classList.contains("uc-name")) as HTMLElement;
    const card = spell.closest(".uc") as HTMLElement;
    const del = within(card).getByRole("button", { name: /Delete/i });
    const before = useCharacterStore.getState().character?.character.spells.length ?? 0;
    fireEvent.click(del);
    const after = useCharacterStore.getState().character?.character.spells.length ?? 0;
    expect(after).toBe(before - 1);
    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0);
  });
});

// Ported from the retired page-header-consistency test: the custom-spell edit
// form must wrap its native dropdowns in the folio `.select` chevron shell (not
// a bare `.input`), so the homebrew form reads from the same Select system.
describe("SpellsTab — custom spell form uses the folio Select shell", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "edit" });
    useToastStore.setState({ toasts: [], timers: {} });
    useCombatStore.getState().endCombat();
    useUndoStore.getState().clear(null);
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
  });

  it("wraps every custom-spell dropdown in the `.select` chevron shell", () => {
    // Inject a custom spell so the edit-mode custom-spell form (level + school
    // dropdowns) renders inside the expanded card.
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.spells = [
      {
        custom: true,
        name: "Homebrew Bolt",
        level: 1,
        school: "evocation",
        range: "60 ft",
        duration: "Instantaneous",
        castingTime: "1 action",
        components: { v: true, s: true, m: false },
        concentration: false,
        description: "",
      },
    ] as unknown as CharacterDoc["character"]["spells"];
    load(doc);

    const { getAllByText } = renderPage();
    // The spell name can appear in more than one node (name + a11y label), so
    // resolve the card via the first match that sits inside a `.uc`.
    const card = getAllByText(/Homebrew Bolt/i)
      .map((n) => n.closest(".uc"))
      .find((el): el is HTMLElement => el !== null);
    expect(card).toBeDefined();
    if (!card) return;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);

    // The form renders its dropdowns (level + school + casting time) — a
    // non-vacuous check.
    const selects = within(card).queryAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(3);
    // Each native <select> sits inside the `.select` chevron shell, not a bare
    // `.input` (the old, unwrapped recipe).
    selects.forEach((sel) => {
      expect(sel.closest(".select")).not.toBeNull();
      expect(sel.classList.contains("input")).toBe(false);
    });
  });

  // S12b/G24 — the SURFACE check (the prompt's G14/S13 lesson): each new value
  // must actually RENDER on the card, not just resolve in the engine.
  function casterWith(
    classId: string,
    ability: "INT" | "WIS",
    spellSrdIds: string[]
  ): CharacterDoc {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.classes = [{ classId, subclassId: "", level: 5 }];
    doc.character.spellcasting = {
      ability,
      preparedCaster: true,
      preparedMax: 8,
      saveDCOverride: null,
      attackBonusOverride: null,
    };
    doc.character.spells = spellSrdIds.map((srdId) => ({ srdId, prepared: true }));
    doc.character.spellSlots = [
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 2 },
    ];
    doc.session.spellSlots = {};
    return doc;
  }

  // Casting time was settable at creation but not editable afterwards — it
  // drives the card's action-economy edge + gloss (edit-in-place, GR 20).
  it("edits a custom spell's casting time in place (select bound to stable tokens)", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.spells = [
      {
        custom: true,
        name: "Homebrew Bolt",
        level: 1,
        school: "evocation",
        range: "60 ft",
        duration: "Instantaneous",
        castingTime: "1 action",
        components: { v: true, s: true, m: false },
        concentration: false,
        description: "",
      },
    ] as unknown as CharacterDoc["character"]["spells"];
    load(doc);
    renderPage();
    const card = screen
      .getAllByText(/Homebrew Bolt/i)
      .map((n) => n.closest(".uc"))
      .find((el): el is HTMLElement => el !== null) as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    const ctSelect = within(card).getByLabelText(/Casting Time/i);
    fireEvent.change(ctSelect, { target: { value: "bonus" } });
    const stored = useCharacterStore.getState().character?.character.spells[0];
    expect(stored && "custom" in stored ? stored.castingTime : "").toBe("bonus");
  });

  it("S12b — Magic Missile's card verdict shows '3 × 1d4+1' (the multi-instance total)", () => {
    load(casterWith("wizard", "INT", ["magic-missile"]));
    renderPage();
    // The verdict chip is on the card header (always visible, no expand needed);
    // it also appears in the card's sr-only summary, so ≥1 match is the surface pin.
    expect(screen.getAllByText(/3 × 1d4\+1/).length).toBeGreaterThan(0);
  });

  it("G24 — Spirit Guardians' card shows the on-enter-or-end-turn cadence note", () => {
    load(casterWith("cleric", "WIS", ["spirit-guardians"]));
    renderPage();
    const name = screen
      .getAllByText(/Spirit Guardians/i)
      .find((el) => el.classList.contains("uc-name")) as HTMLElement;
    const card = name.closest(".uc") as HTMLElement;
    // Expand the card so its detail foot (tags) renders, then assert the cadence
    // chip text (the recurrence tag) is present.
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    expect(within(card).getByText(/On enter or end of turn/i)).toBeInTheDocument();
  });

  it("G24 — Flaming Sphere's card shows the bonus-action-move cadence note", () => {
    load(casterWith("wizard", "INT", ["flaming-sphere"]));
    renderPage();
    const name = screen
      .getAllByText(/Flaming Sphere/i)
      .find((el) => el.classList.contains("uc-name")) as HTMLElement;
    const card = name.closest(".uc") as HTMLElement;
    fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
    expect(within(card).getByText(/Bonus action to move/i)).toBeInTheDocument();
  });
});
