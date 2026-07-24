/**
 * Party — the unified team surface (thin WIRING tests).
 *
 * The unified Party section is ONE live surface; combat is an optional LAYER (no
 * overlay). These tests pin that it reflects the engine across the member / DM split:
 *
 *   • DASHBOARD (no encounter): EVERY member — DM AND player — gets LIVE per-member
 *     cards (AC + passive Perception from the real sheet, saves on demand, Open sheet),
 *     since C5's `campaignReaders` ACL authorizes the peer read. Only the DM gets the
 *     Run-encounter action that promotes the party via `startEncounter`.
 *   • COMBAT (running): the SAME cards reorder by initiative; the DM gets the editable
 *     structure controls (Next turn steps `currentCombatantId`, monster HP steppers
 *     clamp to `[0, maxHp]`, add monster, hidden toggle, End); a player gets the SAME
 *     read-only view (order · HP · whose turn) with NO edit controls, and HIDDEN
 *     combatants are filtered out of the player view.
 *
 * The heavy reducer/derive math is covered purely in `encounter.test.ts` +
 * `encounter-view.test.ts` + `party-stats.test.ts`; here we assert the surface mirrors
 * the engine. `@/lib/firebase` is mocked (reached transitively via the stores); every
 * member's full doc resolves to the mock hero via `getFullCharacter`; the live
 * `combat/state` subdoc is mocked absent (→ full HP); the seeded campaign is the dev
 * fixture.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const {
  authUid,
  isAdminState,
  applyHpDeltaMock,
  setEncounterInitiativeMock,
  rosterRef,
  listSharedCampaignsMock,
  setMemberCharacterMock,
  attachMemberCharacterMock,
  advanceEncounterTurnMock,
} = vi.hoisted(() => ({
  authUid: { value: "mock-uid" },
  isAdminState: { value: false },
  // The PC combat editor's HP-delta write — controllable per test (resolve / reject
  // permission-denied) to exercise the DM self-heal recovery path.
  applyHpDeltaMock: vi.fn<typeof import("@/lib/combat-state-io").applyHpDelta>(() =>
    Promise.resolve()
  ),
  // The INIT write — a campaign-doc `encounterInit` row (the initiative SSOT);
  // asserted to store the RAW d20 roll (never the total).
  setEncounterInitiativeMock: vi.fn<
    typeof import("@/features/campaigns/campaign-io").setEncounterInitiative
  >(() => Promise.resolve()),
  // The attach picker's roster — controllable so the one-campaign-per-character guard
  // test can offer a hero to (try to) attach.
  rosterRef: { value: [] as import("@/lib/character-cache").RosterCharacterDoc[] },
  // The two campaign-io seams the attach guard touches: the membership read it checks,
  // and the write it must NOT issue when the hero is attached elsewhere.
  listSharedCampaignsMock: vi.fn<
    typeof import("@/features/campaigns/campaign-io").listSharedCampaigns
  >(() => Promise.resolve([])),
  setMemberCharacterMock: vi.fn<
    typeof import("@/features/campaigns/campaign-io").setMemberCharacter
  >(() => Promise.resolve()),
  // B07 — the user-initiated attach now routes through the atomic D9 claim; resolve
  // "attached" (the happy outcome) so the Party wiring proceeds to the ACL recompute.
  attachMemberCharacterMock: vi.fn<
    typeof import("@/features/campaigns/campaign-io").attachMemberCharacter
  >(() => Promise.resolve("attached")),
  // INIT-6 — both the DM and a player now route the turn-advance through this ONE
  // transaction (mocked here to replay the pure reducer onto the campaign store, so the
  // wiring tests still observe the resulting pointer/round without a real Firestore txn).
  advanceEncounterTurnMock: vi.fn<
    typeof import("@/features/campaigns/campaign-io").advanceEncounterTurn
  >(() => Promise.resolve()),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
// Pin dev-bypass OFF regardless of a local `.env.local` (VITE_DEV_BYPASS_AUTH=true):
// under bypass `useMemberCharacterDocs` / `usePartyCombatStates` resolve dev fixtures
// instead of the mocked `getFullCharacter` / `subscribeCombatState` below, so the live
// hero (and thus the InitVital roll aria "...for Lyra Voss") would diverge from the mock.
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string; photoURL: null } }) => unknown) =>
    sel({ user: { uid: authUid.value, photoURL: null } }),
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => isAdminState.value }));
// The attach picker reads the current user's roster via useCharacters — mock it so
// these CI-pure tests never touch Firestore.
vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: () => ({ characters: rosterRef.value, loading: false, error: null }),
}));
// Spy the two campaign-io seams the attach guard uses (membership read + the write);
// the rest of campaign-io stays real.
vi.mock("@/features/campaigns/campaign-io", async (orig) => {
  const actual = await orig<typeof import("@/features/campaigns/campaign-io")>();
  return {
    ...actual,
    listSharedCampaigns: listSharedCampaignsMock,
    setMemberCharacter: setMemberCharacterMock,
    attachMemberCharacter: attachMemberCharacterMock,
    advanceEncounterTurn: advanceEncounterTurnMock,
    setEncounterInitiative: setEncounterInitiativeMock,
    persistStartEncounter: vi.fn(() => Promise.resolve()),
    persistEndEncounter: vi.fn(() => Promise.resolve()),
  };
});
// Resolve every member's full doc to the mock hero (no Firestore round-trip), so the
// live cards settle deterministically to a populated card.
vi.mock("@/lib/firestore", async (orig) => {
  const actual = await orig<typeof import("@/lib/firestore")>();
  const { MOCK_CHARACTER } = await import("@/lib/mock");
  return {
    ...actual,
    getFullCharacter: (_uid: string, id: string) =>
      Promise.resolve({ ...MOCK_CHARACTER, id }),
  };
});
// The live `combat/state` listener is mocked ABSENT (cb(null) → full HP) so the live
// derive runs without Firebase. The cockpit is the sole writer elsewhere; here we only
// read.
vi.mock("@/lib/combat-state-io", () => ({
  subscribeCombatState: (
    _uid: string,
    _id: string,
    cb: (state: null) => void
  ): (() => void) => {
    cb(null);
    return () => {};
  },
  writeCombatState: () => {},
  // The PC editor's write primitives — applyHpDelta is the controllable spy; the
  // others resolve (they are not exercised by these wiring tests).
  applyHpDelta: applyHpDeltaMock,
  setCombatCondition: () => Promise.resolve(),
  setCombatTempHp: () => Promise.resolve(),
  tickDeathSave: () => Promise.resolve(),
}));
// Keep `charsAffectedByAttach` real (the attach picker uses it); spy the eager DM-grant
// End-encounter goes through a confirm dialog; auto-confirm it.
vi.mock("@/stores/confirmStore", () => ({
  useConfirmStore: { getState: () => ({ confirm: () => Promise.resolve(true) }) },
}));

import { Party } from "@/features/campaigns/Party";
import { advanceTurn, prevTurn } from "@/features/campaigns/encounter";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useToastStore } from "@/stores/toastStore";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";
import type { CampaignDoc } from "@/types/campaign";

/** Seed a campaign whose Party rests on the live dashboard (the fixture default). */
function overviewCampaign(): CampaignDoc {
  return makeDevCampaign("c1");
}

/** Seed a campaign with the fixture's mid-combat encounter (turns BEGUN — the order is
 *  frozen, the initiative chips lock, the DM gets drag-to-reorder grips). */
function encounterCampaign(): CampaignDoc {
  window.localStorage.setItem("d20-dev-encounter", "1");
  const c = makeDevCampaign("c1");
  window.localStorage.removeItem("d20-dev-encounter");
  return c;
}

/** Seed a campaign in the GATHERING phase (no current turn / frozen order yet) — the
 *  initiative chips stay editable so the table can roll, and Begin-turns is gated. */
function gatheringEncounterCampaign(): CampaignDoc {
  window.localStorage.setItem("d20-dev-encounter", "gathering");
  const c = makeDevCampaign("c1");
  window.localStorage.removeItem("d20-dev-encounter");
  return c;
}

/**
 * Seed a MONSTER-ONLY gathering encounter (no PC refs, so the Begin-turns gate is driven
 * purely by the typed monster initiatives — the unit harness mocks PC combat absent, so a
 * PC can never read as "rolled"). `allRolled` decides whether the second monster has a typed
 * initiative, toggling the gate between disabled (a partial set) and enabled.
 */
function monstersOnlyGathering(allRolled: boolean): CampaignDoc {
  const c = makeDevCampaign("c1");
  return {
    ...c,
    encounter: {
      round: 1,
      currentCombatantId: null,
      epoch: 1,
      status: "active",
      combatants: [
        {
          kind: "monster",
          id: "monster-1",
          name: "Goblin",
          ac: 13,
          initiative: 14,
          conditions: [],
          maxHp: 7,
          tokens: [7],
        },
        {
          kind: "monster",
          id: "monster-2",
          name: "Orc",
          ac: 13,
          initiative: allRolled ? 9 : null,
          conditions: [],
          maxHp: 15,
          tokens: [15],
        },
      ],
    },
  };
}

function setCampaign(c: CampaignDoc): void {
  useCampaignStore.setState({ campaign: c, loading: false, error: null });
}

function renderParty() {
  return render(
    <MemoryRouter>
      <Party />
    </MemoryRouter>
  );
}

beforeEach(() => {
  authUid.value = "mock-uid"; // the fixture DM
  isAdminState.value = false;
  applyHpDeltaMock.mockReset();
  applyHpDeltaMock.mockResolvedValue(undefined);
  setEncounterInitiativeMock.mockReset();
  setEncounterInitiativeMock.mockResolvedValue(undefined);
  rosterRef.value = [];
  listSharedCampaignsMock.mockReset();
  listSharedCampaignsMock.mockResolvedValue([]);
  setMemberCharacterMock.mockReset();
  setMemberCharacterMock.mockResolvedValue(undefined);
  attachMemberCharacterMock.mockReset();
  attachMemberCharacterMock.mockResolvedValue("attached");
  advanceEncounterTurnMock.mockReset();
  // Replay the pure reducer onto the live campaign store (what the real transaction does),
  // honouring the gathering + caller guards, so the wiring tests observe the new pointer.
  advanceEncounterTurnMock.mockImplementation((_campId, dir, caller) => {
    const enc = useCampaignStore.getState().campaign?.encounter;
    if (enc && enc.currentCombatantId !== null) {
      const ownsTurn = enc.currentCombatantId === `pc-${caller.uid}`;
      if (caller.isDm || ownsTurn) {
        // The reducer reads the FROZEN `order` off the encounter doc (no caller-supplied
        // orderedIds any more), exactly as the real transaction does.
        const next = dir === "next" ? advanceTurn(enc) : prevTurn(enc);
        useCampaignStore.getState().setEncounter(next);
      }
    }
    return Promise.resolve();
  });
  useToastStore.setState({ toasts: [], timers: {} });
});
afterEach(() => {
  window.localStorage.removeItem("d20-dev-encounter");
});

// ─── Dashboard · DM ───────────────────────────────────────────────────────────

describe("Party dashboard — DM (live cards)", () => {
  beforeEach(() => setCampaign(overviewCampaign()));

  it("renders a live per-member card with AC at rest + passive Perception on demand (CARD-6)", async () => {
    renderParty();
    // Two attached members (Mara + Bren) → two live cards, both resolving to the mock.
    // The minimal resting card (CARD-6) shows the AC/HP cluster; the shared StatBadge
    // atom's aria-label is the FULL term (Armor Class), not the visible acronym.
    expect(await screen.findAllByLabelText(/^Armor Class:/)).toHaveLength(2);
    // The at-a-glance summary: the party count EXCLUDES the DM (single-source
    // `campaignPartySize`), so the 3-member fixture (DM + Mara + Bren) reads "2
    // adventurers", not 3. A UNIFORM party reads singular ("level 8" — the fixture
    // heroes are both level 8), never the ranged "levels 8".
    expect(screen.getByText(/2 adventurers · level 8/)).toBeInTheDocument();
    // Passives are NOT at rest — they live in the disclosure body now.
    expect(screen.queryByText(/passives/i)).not.toBeInTheDocument();
    const card = screen.getByText("Coralino di Sanvaldo").closest(".party-card");
    if (!(card instanceof HTMLElement)) throw new Error("no card");
    const scope = within(card);
    fireEvent.click(scope.getByRole("button", { expanded: false, name: /coralino/i }));
    // Expanded → the live-computed passives group (perception) reads from the sheet.
    expect(scope.getByText(/passives/i)).toBeInTheDocument();
    expect(scope.getByText(/perception/i)).toBeInTheDocument();
  });

  it("reveals the saving throws + Open sheet on demand", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // OWNER-10 — the card's predominant title is the CHARACTER name ("Coralino di
    // Sanvaldo"), so scope by it; the whole HEADER is the disclosure toggle (OWNER-4).
    const maraCard = screen.getByText("Coralino di Sanvaldo").closest(".party-card");
    if (!(maraCard instanceof HTMLElement)) throw new Error("no card");
    const scope = within(maraCard);
    // The header toggle's accessible name carries the hero name; the HP-tile popover
    // trigger ALSO reports aria-expanded, so disambiguate the toggle by that name.
    const toggle = scope.getByRole("button", {
      expanded: false,
      name: /coralino di sanvaldo/i,
    });
    expect(scope.queryByText(/saving throws/i)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(scope.getByText(/saving throws/i)).toBeInTheDocument();
    // Open sheet appears in the expanded detail (a member who is not me).
    expect(scope.getByRole("button", { name: /open sheet/i })).toBeInTheDocument();
  });

  it("Run encounter promotes the party into the combat layer (pure-ref PCs)", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    fireEvent.click(screen.getByRole("button", { name: /run encounter/i }));
    await waitFor(() =>
      expect(useCampaignStore.getState().campaign?.encounter).not.toBeNull()
    );
    const enc = useCampaignStore.getState().campaign?.encounter;
    expect(enc?.round).toBe(1);
    expect(enc?.combatants.map((c) => c.id).sort()).toEqual([
      "pc-member-bren",
      "pc-member-mara",
    ]);
    // Pure references — no copied statline; starts in the GATHERING phase (the DM begins
    // turns once players roll), and the per-encounter epoch is stamped.
    expect(enc?.combatants.every((c) => c.kind === "pc")).toBe(true);
    expect(enc?.currentCombatantId).toBeNull();
    expect(typeof enc?.epoch).toBe("number");
  });
});

// ─── Attach guard · one campaign per character ──────────────────────────────────

describe("Party attach — one-campaign-per-character guard", () => {
  beforeEach(() => {
    authUid.value = "mock-uid"; // the DM, whose card carries the attach picker (no char)
    setCampaign(overviewCampaign()); // id "c1"
    rosterRef.value = [
      // A roster PROJECTION (`projection: true`) so the allowed-attach path can build
      // the member snapshot off its stamped `ac`/`hp.max` (never `effectiveAC`); the
      // rejection path short-circuits before that and ignores the extra fields.
      {
        id: "hero1",
        portraitUrl: null,
        portraitCrop: null,
        character: {
          projection: true,
          name: "Hero",
          race: "human",
          classes: [{ classId: "fighter", level: 1 }],
          ac: 15,
          hp: { max: 10 },
        },
      },
    ] as unknown as import("@/lib/character-cache").RosterCharacterDoc[];
  });

  it("rejects attaching a hero already attached to ANOTHER campaign (a toast NAMING it, no write)", async () => {
    // The hero is attached to a DIFFERENT campaign (c2) for this same user.
    listSharedCampaignsMock.mockResolvedValue([
      {
        id: "c2",
        name: "Shadows over Thornhollow",
        memberDetails: { "mock-uid": { characterId: "hero1" } },
      } as unknown as CampaignDoc,
    ]);
    renderParty();
    // OWNER-12 — the DM's compact tile reveals the optional attach picker on demand.
    fireEvent.click(await screen.findByRole("button", { name: /attach a character/i }));
    const select = await screen.findByLabelText(/attach your character/i);
    fireEvent.change(select, { target: { value: "hero1" } });

    // The membership check ran…
    await waitFor(() => expect(listSharedCampaignsMock).toHaveBeenCalledWith("mock-uid"));
    // …a friendly toast fired, NAMING the blocking campaign (owner-reported 2026-07-02:
    // a nameless "another campaign" read like corrupted data)…
    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.some((tt) =>
            /already in “Shadows over Thornhollow”/i.test(tt.message ?? "")
          )
      ).toBe(true)
    );
    // …and NOTHING was written (the attach is blocked).
    expect(attachMemberCharacterMock).not.toHaveBeenCalled();
  });

  it("allows attaching when the hero is attached NOWHERE else (no toast)", async () => {
    listSharedCampaignsMock.mockResolvedValue([
      // Only the CURRENT campaign (c1) — no other-campaign attachment.
      {
        id: "c1",
        memberDetails: { "mock-uid": { characterId: null } },
      } as unknown as CampaignDoc,
    ]);
    renderParty();
    fireEvent.click(await screen.findByRole("button", { name: /attach a character/i }));
    const select = await screen.findByLabelText(/attach your character/i);
    fireEvent.change(select, { target: { value: "hero1" } });

    await waitFor(() => expect(attachMemberCharacterMock).toHaveBeenCalled());
    expect(
      useToastStore.getState().toasts.some((tt) => /already in “/i.test(tt.message ?? ""))
    ).toBe(false);
  });
});

// ─── Dashboard · player (now ALSO live) ─────────────────────────────────────────

describe("Party dashboard — player (live cards, no DM action)", () => {
  beforeEach(() => {
    authUid.value = "member-mara"; // a player, NOT the DM
    setCampaign(overviewCampaign());
  });

  it("gets the SAME live cards (C5 peer read) but no Run-encounter action", async () => {
    renderParty();
    // The peer read is authorized now — the player sees live cards for every teammate.
    expect(await screen.findAllByLabelText(/^Armor Class:/)).toHaveLength(2);
    // No DM-only Run-encounter affordance for a player.
    expect(
      screen.queryByRole("button", { name: /run encounter/i })
    ).not.toBeInTheDocument();
  });

  it("my ATTACHED card offers swap + detach in place (owner-reported 2026-07-02)", async () => {
    // Mara's own roster: the currently-attached hero + a second one to swap to.
    listSharedCampaignsMock.mockResolvedValue([]);
    rosterRef.value = [
      {
        id: "team-catalion-bard",
        portraitUrl: null,
        portraitCrop: null,
        character: {
          projection: true,
          name: "Coralino di Sanvaldo",
          race: "human",
          classes: [{ classId: "bard", level: 8 }],
          ac: 15,
          hp: { max: 52 },
        },
      },
      {
        id: "hero2",
        portraitUrl: null,
        portraitCrop: null,
        character: {
          projection: true,
          name: "Second Hero",
          race: "human",
          classes: [{ classId: "fighter", level: 1 }],
          ac: 15,
          hp: { max: 10 },
        },
      },
    ] as unknown as import("@/lib/character-cache").RosterCharacterDoc[];
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);

    // Expand MY card (Coralino is Mara's attached hero in the fixture).
    const card = screen.getByText("Coralino di Sanvaldo").closest(".party-card");
    if (!(card instanceof HTMLElement)) throw new Error("no card");
    const scope = within(card);
    fireEvent.click(
      scope.getByRole("button", { expanded: false, name: /coralino di sanvaldo/i })
    );

    // The disclosure body carries the attach picker, seeded with the current hero,
    // with the blank option reading as an explicit DETACH.
    const select = scope.getByLabelText(/attach your character/i);
    expect((select as HTMLSelectElement).value).toBe("team-catalion-bard");
    expect(scope.getByRole("option", { name: /detach character/i })).toBeInTheDocument();

    // SWAP — pick the other hero; the one atomic attach seam CLAIMS the new hero (and
    // carries the PREVIOUS character id so its D9 claim is released).
    fireEvent.change(select, { target: { value: "hero2" } });
    await waitFor(() =>
      expect(attachMemberCharacterMock).toHaveBeenCalledWith(
        "c1",
        "member-mara",
        "team-catalion-bard",
        "hero2",
        expect.objectContaining({ name: "Second Hero" })
      )
    );

    // DETACH — the blank option clears the attachment entirely. Re-query the picker:
    // the optimistic swap re-rendered the card around the new hero.
    const select2 = await screen.findByLabelText(/attach your character/i);
    fireEvent.change(select2, { target: { value: "" } });
    await waitFor(() =>
      expect(attachMemberCharacterMock).toHaveBeenCalledWith(
        "c1",
        "member-mara",
        "hero2",
        null,
        null
      )
    );
  });

  it("mid-combat my card does NOT offer the swap/detach picker (pure-ref order stays intact)", async () => {
    setCampaign(encounterCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    const card = screen.getByText("Coralino di Sanvaldo").closest(".party-card");
    if (!(card instanceof HTMLElement)) throw new Error("no card");
    const scope = within(card);
    fireEvent.click(
      scope.getByRole("button", { expanded: false, name: /coralino di sanvaldo/i })
    );
    expect(scope.queryByLabelText(/attach your character/i)).not.toBeInTheDocument();
  });
});

// ─── Combat · DM (editable) ─────────────────────────────────────────────────────

describe("Party combat — DM (editable layer)", () => {
  beforeEach(() => setCampaign(encounterCampaign()));

  function currentEncounter() {
    const enc = useCampaignStore.getState().campaign?.encounter;
    if (!enc) throw new Error("no encounter seeded");
    return enc;
  }

  it("renders the PC member cards + the monster rows, INCLUDING the hidden one", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // Monsters (genuine encounter state) render by their typed names.
    expect(screen.getAllByText("Goblin").length).toBeGreaterThan(0);
    expect(screen.getByText("Goblin Chief")).toBeInTheDocument();
    // The DM sees the HIDDEN ambush monster (with its Hidden badge).
    expect(screen.getByText("Shadow")).toBeInTheDocument();
    expect(screen.getByText(/^Hidden$/)).toBeInTheDocument();
  });

  it("highlights the current combatant's card (currentCombatantId)", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    const current = document.querySelector('[aria-current="true"]');
    // The seeded current turn is Coralino's (pc-member-mara) card.
    expect(current).not.toBeNull();
    expect(current?.classList.contains("party-card")).toBe(true);
  });

  it("Next turn advances the current-id pointer through the sorted order", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // Sorted initiative DESC, blanks last with a deterministic id tiebreak (the total
    // order): Shadow(16), Goblin(14), Boss(12), then the blank-init PCs by id —
    // pc-member-bren before pc-member-mara. currentCombatantId starts on pc-member-mara
    // (now LAST), so Next WRAPS to the top (Shadow) and increments the round (2 → 3).
    fireEvent.click(screen.getByRole("button", { name: /next turn/i }));
    expect(currentEncounter().currentCombatantId).toBe("monster-3");
    expect(currentEncounter().round).toBe(3);
  });

  it("a monster token reuses the shared HP popover (no TEMP), delta-clamped to [0, maxHp]", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // Expand the Goblin Chief row (single token [21], maxHp 21). A lone token reuses the
    // PC card's `.vital-hp` chip + shared HpEditPopover and labels with the monster NAME
    // (B9a) — the chip is the one carrying `.vital-hp` (the other "Goblin Chief" control
    // is the row's disclosure toggle).
    fireEvent.click(
      screen.getByRole("button", { name: /goblin chief/i, expanded: false })
    );
    const boss = () => currentEncounter().combatants.find((c) => c.id === "monster-2");
    const bossHp = (): number => {
      const b = boss();
      return b && b.kind === "monster" ? (b.tokens[0] ?? -1) : -1;
    };
    const openHp = (): void => {
      fireEvent.click(
        screen
          .getAllByLabelText("Goblin Chief")
          .find((el) => el.classList.contains("vital-hp")) as HTMLElement
      );
    };

    // The popover is the SAME shared control, opened with `hideTemp` → DAMAGE + HEAL but
    // NO temp affordance (monsters have no temp pool).
    openHp();
    expect(screen.queryByRole("button", { name: /^Temp$/ })).toBeNull();
    // DAMAGE past 0 clamps low (delta → absolute via setHp → clampHp).
    fireEvent.change(screen.getByLabelText(/amount of damage/i), {
      target: { value: "999" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Damage$/ }));
    expect(bossHp()).toBe(0);

    // HEAL past maxHp clamps high — proving the delta bridge + engine clamp both ways.
    openHp();
    fireEvent.change(screen.getByLabelText(/amount of damage/i), {
      target: { value: "999" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Heal$/ }));
    expect(bossHp()).toBe(21);
  });

  it("adds a monster group through the inline form", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    fireEvent.click(screen.getByRole("button", { name: /add monster/i }));
    fireEvent.change(screen.getByLabelText(/monster name/i), {
      target: { value: "Dire Wolf" },
    });
    const submit = screen.getAllByRole("button", { name: /add monster/i }).at(-1);
    fireEvent.click(submit as HTMLElement);
    expect(
      currentEncounter().combatants.some(
        (c) => c.kind === "monster" && c.name === "Dire Wolf"
      )
    ).toBe(true);
  });

  it("the DM sees the EXACT monster HP and can reveal it to players (CARD-5)", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // The DM reads the exact summed HP (Goblin Chief: 21/21) — no concealed band.
    const boss = screen.getByText("Goblin Chief").closest(".party-card");
    if (!(boss instanceof HTMLElement)) throw new Error("no boss card");
    const scope = within(boss);
    expect(scope.getByTitle(/21.*21|21/)).toBeInTheDocument();
    // Expand → flip the per-monster reveal flag through the encounter writer.
    fireEvent.click(
      scope.getByRole("button", { expanded: false, name: /goblin chief/i })
    );
    fireEvent.click(scope.getByRole("button", { name: /reveal hp/i }));
    const m2 = currentEncounter().combatants.find((c) => c.id === "monster-2");
    expect(m2?.kind === "monster" && m2.revealed).toBe(true);
  });

  it("the INIT roll widget stores the RAW d20 roll in the campaign's encounterInit row (the SSOT)", async () => {
    // Rolling initiative is a GATHERING-phase action — once turns begin the chip locks
    // (C3). Re-seed the gathering encounter (overriding the begun beforeEach) so the roll
    // widget is editable.
    setCampaign(gatheringEncounterCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);

    const card = screen.getByText("Coralino di Sanvaldo").closest(".party-card");
    if (!(card instanceof HTMLElement)) throw new Error("no Coralino card");
    const scope = within(card);
    // Not yet rolled → the quiet "Roll initiative" affordance; open it, type the d20.
    // The roll aria names the LIVE hero (the test resolves the doc to the mock, Lyra).
    // The trigger lives on the card; the edit box FLOATS in a popover (portaled to the
    // document body), so the input is queried from `screen`, not the card `scope`.
    fireEvent.click(scope.getByRole("button", { name: /roll initiative/i }));
    const input = screen.getByLabelText(/your d20 roll for lyra voss/i);
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(setEncounterInitiativeMock).toHaveBeenCalledTimes(1));
    // setEncounterInitiative(campaignId, memberUid, RAW_ROLL) — a single campaign-doc
    // field-path write keyed to the TARGET member (the DM rolls for anyone; a member
    // rolls their own row — the SAME seam). Never the total; never a subdoc write.
    expect(setEncounterInitiativeMock).toHaveBeenCalledWith(
      expect.any(String),
      "member-mara",
      15
    );
  });

  it("End encounter clears the field and returns to the dashboard", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    fireEvent.click(screen.getByRole("button", { name: /end encounter/i }));
    await waitFor(() =>
      expect(useCampaignStore.getState().campaign?.encounter).toBeNull()
    );
    // Back on the dashboard — the DM Run-encounter action is present again.
    expect(
      await screen.findByRole("button", { name: /run encounter/i })
    ).toBeInTheDocument();
  });
});

// ─── Combat · C3 — begin-turns gate · initiative lock · drag-reorder ────────────

describe("Party combat — C3 freeze / lock / reorder (DM)", () => {
  function currentEncounter() {
    const enc = useCampaignStore.getState().campaign?.encounter;
    if (!enc) throw new Error("no encounter seeded");
    return enc;
  }

  it("Begin-turns is DISABLED until every combatant has an initiative (the gate)", async () => {
    setCampaign(monstersOnlyGathering(false)); // the Orc is un-rolled → partial set
    renderParty();
    const begin = await screen.findByRole("button", { name: /begin turns/i });
    expect(begin).toBeDisabled();
    // The BLANK monster chip wears the same urgent cue an un-rolled PC does (B8), so
    // the DM can find which entry blocks the gate at a glance; the rolled one is quiet.
    const orcChip = screen.getByRole("button", { name: /initiative for orc/i });
    expect(orcChip).toHaveAttribute("data-urgent");
    const goblinChip = screen.getByRole("button", { name: /initiative for goblin/i });
    expect(goblinChip).not.toHaveAttribute("data-urgent");
  });

  it("Begin-turns enables once all have initiative and FREEZES the order onto the doc", async () => {
    setCampaign(monstersOnlyGathering(true)); // both monsters rolled
    renderParty();
    const begin = await screen.findByRole("button", { name: /^begin turns$/i });
    expect(begin).not.toBeDisabled();
    fireEvent.click(begin);
    await waitFor(() => {
      // The frozen order persists onto the encounter (sorted 14 then 9) + the turn points
      // at its top — the gathering phase is over.
      expect(currentEncounter().order).toEqual(["monster-1", "monster-2"]);
      expect(currentEncounter().currentCombatantId).toBe("monster-1");
    });
  });

  it("locks every initiative chip once turns begin (no roll / typed-init affordance)", async () => {
    setCampaign(encounterCampaign()); // begun — the order is frozen
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // A PC's roll widget is read-only (the gathering "Roll initiative" affordance is gone).
    expect(
      screen.queryByRole("button", { name: /roll initiative/i })
    ).not.toBeInTheDocument();
    // The DM's typed monster-initiative editor is locked too — the DM reorders via drag.
    expect(
      screen.queryByRole("button", { name: /^initiative for/i })
    ).not.toBeInTheDocument();
  });

  it("gives the DM a drag-to-reorder grip on each combat row that persists the new order", async () => {
    setCampaign(encounterCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // A grip per visible combatant (DM sees all, hidden included).
    expect(screen.getAllByRole("button", { name: /^reorder /i }).length).toBeGreaterThan(
      0
    );
    // Keyboard reorder: ArrowDown on the Goblin Chief grip steps it down ONE slot in the
    // frozen order (the same reorderCombatant the pointer drop calls), pointer pinned.
    fireEvent.keyDown(screen.getByRole("button", { name: /reorder goblin chief/i }), {
      key: "ArrowDown",
    });
    await waitFor(() => {
      expect(currentEncounter().order).toEqual([
        "monster-3",
        "monster-1",
        "pc-member-bren",
        "monster-2",
        "pc-member-mara",
      ]);
    });
    expect(currentEncounter().currentCombatantId).toBe("pc-member-mara"); // pinned
  });

  it("commits a POINTER lift-&-follow drag (one path for mouse + touch) to the new order", async () => {
    setCampaign(encounterCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    const grip = screen.getByRole("button", { name: /reorder goblin chief/i });
    // Lift Goblin Chief (monster-2) and follow the pointer far DOWN the list. Pointer Events
    // are ONE code path for mouse AND touch (the old native HTML5 drag never fired on
    // touch); with no real layout (jsdom rects are 0) the live preview lands the held card
    // at the END, which commits through the SAME reorderCombatant the keyboard path calls.
    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientY: 0 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 1000 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 1000 });
    await waitFor(() => {
      expect(currentEncounter().order).toEqual([
        "monster-3",
        "monster-1",
        "pc-member-bren",
        "pc-member-mara",
        "monster-2",
      ]);
    });
    expect(currentEncounter().currentCombatantId).toBe("pc-member-mara"); // pinned
  });

  it("BUG: the floating clone keeps following the pointer after a reorder re-render, even when the stream stops routing through the grip (lostpointercapture)", async () => {
    setCampaign(encounterCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    const grip = screen.getByRole("button", { name: /reorder goblin chief/i });
    const clone = () => document.querySelector<HTMLElement>(".combatant-lift-clone");

    // Lift the card → a floating clone is appended to <body> and tracks the pointer.
    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientY: 0 });
    expect(clone()).not.toBeNull();

    // The first move crosses the list → the preview reorders (a React re-render + FLIP),
    // which in a real browser repositions the lifted <li> via insertBefore and can drop
    // pointer capture. The clone follows clientY here (delivered through the grip).
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 400 });
    expect(clone()?.style.top).toBe("400px");

    // SIMULATE the capture loss the freeze bug rode on: subsequent moves are dispatched on
    // `document`, NOT the grip (a browser that released capture mid-drag routes them there).
    // The OLD grip-bound onPointerMove never fires for these → the clone freezes at 400px;
    // the document-level follow keeps it tracking clientY across the post-reorder renders.
    fireEvent.pointerMove(document, { pointerId: 1, clientY: 760 });
    expect(clone()?.style.top).toBe("760px");
    fireEvent.pointerMove(document, { pointerId: 1, clientY: 980 });
    expect(clone()?.style.top).toBe("980px");

    // Release (also off the grip) settles + commits — the drag never got stuck. With jsdom's
    // zero rects the held card lands at the END (same as the keyboard/grip path commits).
    fireEvent.pointerUp(document, { pointerId: 1, clientY: 980 });
    await waitFor(() => expect(currentEncounter().order?.at(-1)).toBe("monster-2"));
    expect(currentEncounter().currentCombatantId).toBe("pc-member-mara"); // pinned
  });

  it("auto-slots a mid-combat reinforcement into the frozen order by initiative", async () => {
    // Blank the PC roll table for THIS test: the slotting math ranks a typed newcomer
    // against BLANK-init rows (a robustness path a real begun fight can't reach — the
    // Begin gate requires everyone rolled — but a hand-seeded/legacy doc can).
    setCampaign({ ...encounterCampaign(), encounterInit: {} });
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    fireEvent.click(screen.getByRole("button", { name: /add monster/i }));
    fireEvent.change(screen.getByLabelText(/monster name/i), {
      target: { value: "Dire Wolf" },
    });
    // The form's default initiative is 10 → slots after the Boss (12), ahead of the
    // blank-init PCs (a non-blank outranks a blank), NOT appended at the very end.
    const submit = screen.getAllByRole("button", { name: /add monster/i }).at(-1);
    fireEvent.click(submit as HTMLElement);
    await waitFor(() => {
      expect(currentEncounter().order).toEqual([
        "monster-3",
        "monster-1",
        "monster-2",
        "monster-4",
        "pc-member-bren",
        "pc-member-mara",
      ]);
      expect(currentEncounter().currentCombatantId).toBe("pc-member-mara"); // pinned
    });
  });
});

// ─── Combat · player (read-only) ────────────────────────────────────────────────

describe("Party combat — player (read-only)", () => {
  beforeEach(() => {
    authUid.value = "member-mara"; // a player, NOT the DM
    setCampaign(encounterCampaign());
  });

  it("shows the live order + whose turn + the OWN-turn advance, hides the ambush + DM structure", async () => {
    // member-mara IS the seeded current combatant (pc-member-mara), so P2 offers them
    // the SHARED turn-advance (mandate D) — but never the DM STRUCTURE controls.
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // The shared read-only view: visible monsters + the current-turn indicator.
    expect(screen.getAllByText("Goblin").length).toBeGreaterThan(0);
    expect(screen.getByText("Goblin Chief")).toBeInTheDocument();
    // Whose turn it is reads PURELY off the lit card frame (BG3-style) — no name
    // readout. The accessible cue is a single `aria-current="true"` on the current card.
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    // The HIDDEN ambush monster is filtered out of the player view.
    expect(screen.queryByText("Shadow")).not.toBeInTheDocument();
    // P2 (mandate D) — the current-turn player MAY advance the shared turn pointer.
    expect(screen.getByRole("button", { name: /next turn/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous turn/i })).toBeInTheDocument();
    // But the DM STRUCTURE controls never reach a player.
    expect(
      screen.queryByRole("button", { name: /end encounter/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add monster/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/goblin chief, token/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/initiative for/i)).not.toBeInTheDocument();
    // C3 — the DM-only drag-to-reorder grip never reaches a player.
    expect(screen.queryByRole("button", { name: /^reorder /i })).not.toBeInTheDocument();
  });

  it("conceals enemy HP as a qualitative band, never the number (CARD-5)", async () => {
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // The Goblin group (10/21) reads Bloodied; the Boss (21/21) reads Healthy — a player
    // sees only the band, never the exact HP, a stepper, or a reveal control.
    expect(screen.getByText(/bloodied/i)).toBeInTheDocument();
    expect(screen.getByText(/healthy/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reveal hp/i })).not.toBeInTheDocument();
  });

  it("a player whose PC is NOT the current turn gets no advance controls", async () => {
    // member-bren is a PC but NOT the seeded current combatant (pc-member-mara is) —
    // so the turn-advance controls are withheld (the UI ownership gate).
    authUid.value = "member-bren";
    setCampaign(encounterCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    expect(screen.queryByRole("button", { name: /next turn/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /previous turn/i })
    ).not.toBeInTheDocument();
  });
});

// ─── PC combat editor — the multi-writer edit gate (C7) ─────────────────────────
//
// A PC's combat-mutable state (HP · temp · conditions · death saves) is editable from
// the in-hub card by the OWNER (isMe) or the DM/admin, mirroring `firestore.rules`
// `mayWriteCombat` (owner ∪ admin ∪ dmReaders); a non-DM peer card is READ-ONLY.

describe("PC combat editor — the multi-writer edit gate", () => {
  function maraScope() {
    // Mara's card title is her CHARACTER name (OWNER-10); her player name "Mara" rides
    // small top-right (no nickname/handle anymore — OWNER-11).
    const card = screen.getByText("Coralino di Sanvaldo").closest(".party-card");
    if (!(card instanceof HTMLElement)) throw new Error("no Mara card");
    return within(card);
  }

  it("the DM sees the inline HP/condition editor on EVERY member card", async () => {
    setCampaign(overviewCampaign()); // viewer = mock-uid (the fixture DM)
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // Two attached members → two editable HP wells (the shared HpEditPopover triggers;
    // a read-only peer well is a static div, not a button).
    expect(screen.getAllByRole("button", { name: /hit points/i })).toHaveLength(2);
    const scope = maraScope();
    // The condition editor now lives in the disclosure body (CARD-6) — expand to reach it.
    expect(
      scope.queryByRole("button", { name: /add condition/i })
    ).not.toBeInTheDocument();
    fireEvent.click(scope.getByRole("button", { expanded: false, name: /coralino/i }));
    expect(scope.getByRole("button", { name: /add condition/i })).toBeInTheDocument();
    // Opening Mara's HP well reveals the SHARED Damage / Heal / Temp controls.
    fireEvent.click(scope.getByRole("button", { name: /hit points/i }));
    expect(screen.getByRole("button", { name: /^Heal$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Damage$/ })).toBeInTheDocument();
  });

  it("BUG: a click that dismisses an OPEN inline editor only closes it — it never ALSO toggles the card (CARD-4 exception)", async () => {
    setCampaign(overviewCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    const card = screen.getByText("Coralino di Sanvaldo").closest(".party-card");
    if (!(card instanceof HTMLElement)) throw new Error("no card");
    const scope = within(card);
    const resting = card.querySelector(".combatant-resting");
    if (!(resting instanceof HTMLElement)) throw new Error("no resting region");

    // 1) NOTHING open — a click on the card surface toggles disclosure as before (the
    //    open-editor flag defaults false). The saving-throws group is the body tell.
    expect(scope.queryByText(/saving throws/i)).not.toBeInTheDocument();
    fireEvent.pointerDown(resting, { pointerId: 1, button: 0 });
    fireEvent.click(resting);
    expect(scope.getByText(/saving throws/i)).toBeInTheDocument(); // expanded
    // …collapse again for a clean slate.
    fireEvent.pointerDown(resting, { pointerId: 1, button: 0 });
    fireEvent.click(resting);
    expect(scope.queryByText(/saving throws/i)).not.toBeInTheDocument();

    // 2) HP editor OPEN — the shared HpEditPopover is a Radix popover whose body renders
    //    into a PORTAL on `document.body`, OUTSIDE the card's DOM subtree (the prior fix's
    //    failure: a subtree probe could never see it). The card learns it is open through
    //    the CardEditorScope count instead, so the dismissing surface click is SWALLOWED:
    //    it only closes the editor, it does NOT also expand the card.
    const hpTrigger = scope.getByRole("button", { name: /hit points/i });
    fireEvent.click(hpTrigger);
    expect(hpTrigger).toHaveAttribute("aria-expanded", "true");
    // The popover body lives in the portal — present in the document but NOT in the card.
    const amount = screen.getByLabelText(/amount of damage/i);
    expect(card.contains(amount)).toBe(false);
    fireEvent.pointerDown(resting, { pointerId: 1, button: 0 }); // snapshots open editor
    fireEvent.click(resting); // would-be toggle — suppressed
    expect(scope.queryByText(/saving throws/i)).not.toBeInTheDocument(); // still collapsed

    // 2b) The dismissing click lands on the ACCESSIBLE HEADER BUTTON (the hero name /
    //     chevron), NOT the bare surface — the owner's lingering bug: that button carried its
    //     OWN unguarded toggle, so dismissing the HP overlay by clicking the name expanded the
    //     card. Both toggle entry points now route through the same guarded toggle, so this
    //     dismiss is swallowed identically. (The HP overlay is still open from step 2 — jsdom
    //     keeps a Radix popover open through a surface pointerdown; the card's editor count is
    //     still 1, which is exactly the live condition this must survive.)
    const headToggle = scope.getByRole("button", { name: /coralino/i, expanded: false });
    fireEvent.pointerDown(headToggle, { pointerId: 1, button: 0 }); // snapshots open editor
    fireEvent.click(headToggle); // dismiss via the header — must NOT expand
    expect(scope.queryByText(/saving throws/i)).not.toBeInTheDocument(); // still collapsed

    // 3) The one-shot suppress flag CLEARS: once the editor is closed (count back to 0) a
    //    fresh surface click toggles disclosure as normal — the suppression never sticks.
    fireEvent.click(hpTrigger); // close the HP popover
    expect(hpTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.pointerDown(resting, { pointerId: 1, button: 0 });
    fireEvent.click(resting);
    expect(scope.getByText(/saving throws/i)).toBeInTheDocument(); // NOW expands
  });

  it("a player sees the editor ONLY on their own card; a teammate card is read-only", async () => {
    authUid.value = "member-mara"; // a player, not the DM
    setCampaign(overviewCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    // Exactly ONE editable HP well — the player's OWN (isMe) card; the teammate well is
    // a read-only readout (a div, not a button).
    expect(screen.getAllByRole("button", { name: /hit points/i })).toHaveLength(1);
  });

  it("an admin (non-DM) gets the editor on every card too (mirrors mayWriteCombat)", async () => {
    authUid.value = "member-bren"; // a plain player…
    isAdminState.value = true; // …but an admin
    setCampaign(overviewCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    expect(screen.getAllByRole("button", { name: /hit points/i })).toHaveLength(2);
  });

  it("a DM HP edit routes through applyHpDelta against the MEMBER's (uid, charId)", async () => {
    setCampaign(overviewCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    const scope = maraScope();
    // Open Mara's HP well → the shared popover (portaled) carries the amount + verbs.
    fireEvent.click(scope.getByRole("button", { name: /hit points/i }));
    fireEvent.change(screen.getByLabelText(/amount of damage/i), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Damage$/ }));
    await waitFor(() => expect(applyHpDeltaMock).toHaveBeenCalledTimes(1));
    // applyHpDelta(uid, charId, base, op, effectiveMaxHp) — the op moved to arg index 3.
    const [uid, , , op] = applyHpDeltaMock.mock.calls[0] as unknown as [
      string,
      string,
      unknown,
      { kind: string; amount: number },
    ];
    expect(uid).toBe("member-mara");
    expect(op).toMatchObject({ kind: "damage", amount: 6 });
  });

  it("a rejected DM write SURFACES an honest toast — no silent swallow, no retry theater", async () => {
    // There is no stale-grant machinery to "self-heal" anymore: the DM's authority
    // derives LIVE from the campaign doc in firestore.rules, so a denial is a real,
    // terminal authorization fact. The write must surface once and NOT auto-retry.
    applyHpDeltaMock.mockRejectedValueOnce({ code: "permission-denied" });
    setCampaign(overviewCampaign());
    renderParty();
    await screen.findAllByLabelText(/^Armor Class:/);
    const scope = maraScope();
    fireEvent.click(scope.getByRole("button", { name: /hit points/i }));
    fireEvent.change(screen.getByLabelText(/amount of damage/i), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Heal$/ }));

    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.some((t) => /couldn't be saved/i.test(t.message ?? ""))
      ).toBe(true)
    );
    expect(applyHpDeltaMock).toHaveBeenCalledTimes(1); // one write, no retry
  });
});
