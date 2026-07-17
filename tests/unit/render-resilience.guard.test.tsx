/**
 * Render-resilience guardrail (the guard that SHOULD have caught both prod crashes).
 *
 * The unified-codec reshape (#106) RESHAPED stored/derived data — a minimal SRD-free
 * roster projection (`cacheToRosterDoc`, no abilityScores/equipment) and denormalized
 * party-member snapshots that can lack fields old writers never set. Two live-user
 * crashes followed because consumers assumed the FULL `CharacterDoc` shape and the
 * tests only used clean fixtures:
 *
 *   1. PORTRAIT crash — a party-member snapshot lacked a `name` → `name.trim()`
 *      threw `Cannot read properties of undefined` → the whole campaign hub
 *      white-screened.
 *   2. ATTACH-PICKER crash (#115) — attaching from the roster picker fed the SRD-free
 *      PROJECTION to `buildMemberSnapshot`, which re-derived AC via `effectiveAC`
 *      over the omitted `abilityScores`/`equipment` → it threw → the picker crashed.
 *
 * This guard MOUNTS the real surfaces with ADVERSE / torture data (nameless/blank
 * name, the minimal projection, partial snapshots, empty arrays) and asserts NO
 * THROW and NO error-boundary fallback. It is fail-before/pass-after for BOTH bugs:
 * against the pre-fix code, mounting `Party` with a nameless member threw (bug 1)
 * and firing the attach picker over a projection threw (bug 2). The structural fixes
 * (the distinct, non-`effectiveAC`-callable `RosterCharacterDoc` projection type +
 * the per-section ErrorBoundary fault isolation) make both unreachable.
 *
 * NON-NULLABILITY (owner directive 2026-06-15): a CHARACTER name is now a branded
 * `NonEmptyString` — "an unnamed character" is UNREPRESENTABLE. A stale corrupt
 * (empty/whitespace) snapshot is REJECTED at the SINGLE read boundary (`toCampaignDoc`
 * → `conformCampaignMembers` drops its `character` to `null`; a corrupt roster cache →
 * `cacheToRosterDoc` returns `null`, SKIPPED), never coerced to a placeholder name.
 * That conform is the SOLE source of truth (proven by `campaign-io.test.ts`); Party
 * does NOT re-conform — it reads the already-conformed members from the store and
 * branches only on the resulting `null` character. These tests therefore feed Party
 * the conformed state a corrupt member ACTUALLY reaches it as (`character: null`) and
 * pin: it renders the quiet "no character attached" empty state (the null-branch),
 * never a fake/English placeholder name, never a crash.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "@/i18n";
import type { CampaignDoc, MemberCharacterSnapshot } from "@/types/campaign";

vi.mock("@/lib/firebase", () => ({ db: {} }));
// Party now opens a live `combat/state` listener per attached member (the in-hub live
// read); mock it absent so this pure render test never touches Firestore.
vi.mock("@/lib/combat-state-io", () => ({
  subscribeCombatState: (_uid: string, _id: string, cb: (s: null) => void) => {
    cb(null);
    return () => {};
  },
  writeCombatState: () => {},
}));
// The attach picker reads the current user's roster via useCharacters; the
// `attachRosterRef` holder lets a single test seed the projection the picker emits.
const { attachRosterRef, attachMemberCharacterMock } = vi.hoisted(() => ({
  attachRosterRef: { docs: [] as unknown[] },
  attachMemberCharacterMock: vi.fn(() => Promise.resolve("attached" as const)),
}));
vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: () => ({
    characters: attachRosterRef.docs,
    loading: false,
    error: null,
  }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string; photoURL: null } }) => unknown) =>
    sel({ user: { uid: "u1", photoURL: null } }),
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));
// The attach write is fire-and-forget; stub it so the onChange never touches io.
// Party reads ALREADY-conformed members from the store (the single boundary is
// `subscribeToCampaign` → `toCampaignDoc` → `conformCampaignMembers`, covered by
// `campaign-io.test.ts`), so it never re-conforms — `attachMemberCharacter` is the attach
// symbol it accesses on the resting dashboard, and stubbing it keeps this a pure render test.
vi.mock("@/features/campaigns/campaign-io", () => ({
  attachMemberCharacter: attachMemberCharacterMock,
  // The one-campaign-per-character guard reads this before writing; return no other
  // attachment so the attach proceeds to `attachMemberCharacter`.
  listSharedCampaigns: () => Promise.resolve([]),
}));
vi.mock("@/features/campaigns/dm-readers", () => ({
  charsAffectedByAttach: () => [],
  recomputeDmReadersForChars: vi.fn(() => Promise.resolve()),
}));

import { Party } from "@/features/campaigns/Party";
import { CharacterCard } from "@/features/roster/CharacterCard";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { cacheToRosterDoc, type RosterCharacterDoc } from "@/lib/character-cache";

// We mock useRosterActions so the CharacterCard mount stays a pure VIEW test.
vi.mock("@/features/roster/use-roster-actions", () => ({
  useRosterActions: () => ({
    exportJson: vi.fn(),
    exportPdf: vi.fn(),
    clone: vi.fn(),
    retire: vi.fn(),
    restore: vi.fn(),
    remove: vi.fn(),
  }),
}));

const META = {
  createdAt: new Date(0),
  updatedAt: new Date(0),
  portraitUrl: null,
  portraitCrop: null,
  shareId: null,
  status: "active" as const,
};

/** The SRD-free roster projection (the exact shape the attach picker reads). The
 *  callers pass a real (non-empty) name, so `cacheToRosterDoc` always yields a doc. */
function projection(id: string, name: string): RosterCharacterDoc {
  const doc = cacheToRosterDoc(
    id,
    {
      cache: {
        name,
        raceId: "human",
        classes: [{ classId: "monk", level: 4 }],
        ac: 16,
        hpMax: 24,
      },
    },
    META
  );
  if (!doc) throw new Error("expected a roster doc for a valid (named) cache");
  return doc;
}

/** A one-member campaign carrying the given attached-character snapshot (or `null` —
 *  the state a corrupt member reaches Party in, since the boundary `conformCampaignMembers`
 *  has already dropped a nameless snapshot's `character` to null before the store). */
function campaignWith(snapshot: Record<string, unknown> | null): CampaignDoc {
  return {
    id: "c1",
    name: "Gildenmoor",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: "u1",
    dmUid: "u1",
    members: ["u1"],
    memberDetails: {
      u1: {
        displayName: "Tav",
        characterId: snapshot ? "x" : null,
        role: "player",
        character: snapshot as MemberCharacterSnapshot | null,
      },
    },
    status: "active",
    inviteCode: "c1",
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
  };
}

function renderRouted(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  attachRosterRef.docs = [];
  attachMemberCharacterMock.mockClear();
  useCampaignStore.setState({ campaign: null, loading: false, error: null });
});

afterEach(async () => {
  // The i18n-leak tests switch to IT; restore EN so every other test is deterministic.
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

describe("render resilience — Party renders the conformed corrupt-member state (bug 1)", () => {
  // The white-screen (bug 1) is fixed AT THE BOUNDARY: a nameless snapshot has its
  // `character` rejected to `null` by `conformCampaignMembers` BEFORE it reaches the
  // store (`campaign-io.test.ts` pins that drop). So the only state a corrupt member —
  // OR a member who never attached a hero — ACTUALLY reaches Party in is
  // `character: null`; there is no raw nameless snapshot in the store to crash on.
  // This pins Party's half: it branches on that `null` and renders the quiet empty
  // state, never crashing the hub.
  it("renders a null-character member (conformed corrupt OR never-attached) without crashing", () => {
    useCampaignStore.setState({
      campaign: campaignWith(null),
      loading: false,
      error: null,
    });
    expect(() => renderRouted(<Party />)).not.toThrow();
    // The section rendered (its heading is present) — no fallback, no blank.
    expect(screen.getByRole("heading", { name: /party/i })).toBeInTheDocument();
  });
});

describe("render resilience — a conformed corrupt member NEVER invents an English placeholder (rule 9 / non-nullability)", () => {
  // NON-NULLABILITY (owner 2026-06-15): an unnamed CHARACTER is unrepresentable, and a
  // stale corrupt snapshot is REJECTED at the SINGLE read boundary (see
  // `campaign-io.test.ts` → "drops a corrupt (nameless) member snapshot's character to
  // null"). No "Unnamed"/"Senza nome" placeholder key exists any more. Party reads the
  // ALREADY-conformed members (it never re-conforms), so the state a corrupt member
  // reaches it in is `character: null`. These pin Party's RENDER half: the null-branch
  // shows the quiet empty state and NEVER fabricates an English/placeholder name for a
  // character (the old `unnamedCharacter` leak) — in IT as well as EN.
  it("IT — a corrupt (null-character) member shows no 'Senza nome'/'Unnamed' placeholder", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    useCampaignStore.setState({
      campaign: campaignWith(null),
      loading: false,
      error: null,
    });
    // (a) no crash / no error-boundary fallback — the section heading rendered.
    expect(() => renderRouted(<Party />)).not.toThrow();
    expect(screen.getByRole("heading")).toBeInTheDocument();
    // (b) NO fabricated placeholder name (EN or IT) is shown for the character — the
    //     deleted `campaignHub.unnamedCharacter` key can never resurface.
    expect(screen.queryByText(/unnamed/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Senza nome")).not.toBeInTheDocument();
  });

  it("EN — the same null-character member shows no invented placeholder name either", () => {
    useCampaignStore.setState({
      campaign: campaignWith(null),
      loading: false,
      error: null,
    });
    expect(() => renderRouted(<Party />)).not.toThrow();
    expect(screen.queryByText(/unnamed/i)).not.toBeInTheDocument();
  });

  it("a conformed corrupt OTHER member renders the 'no character' empty state (null-branch)", () => {
    // The empty-string-sentinel CLEANUP (owner 2026-06-15): Party feeds NO
    // `char?.name ?? ""` sentinel downstream and does NOT re-conform — it branches on
    // the already-conformed `null` the boundary produced (rule 6 — one source of
    // truth). A corrupt OTHER member therefore reaches Party as `character: null` (the
    // exact output `conformCampaignMembers` stamps for a nameless snapshot — pinned in
    // `campaign-io.test.ts`), and the member renders the quiet "no character attached"
    // empty state (never a blank/placeholder hero name, never a crash).
    const base = campaignWith(null);
    useCampaignStore.setState({
      campaign: {
        ...base,
        members: [...base.members, "u2"],
        memberDetails: {
          ...base.memberDetails,
          u2: {
            displayName: "Other",
            characterId: "y",
            role: "player",
            character: null,
          },
        },
      },
      loading: false,
      error: null,
    });
    expect(() => renderRouted(<Party />)).not.toThrow();
    // The OTHER member's null character renders the empty state (NOT the current user,
    // whose empty state is the attach picker).
    expect(screen.getByText("No character attached yet")).toBeInTheDocument();
  });
});

describe("render resilience — attach picker over the SRD-free projection (bug 2 / #115)", () => {
  it("attaching a roster projection does NOT throw (effectiveAC over absent fields)", async () => {
    // The roster picker reads the SRD-free projection; selecting it fires
    // `attachMyCharacter` → `buildMemberSnapshot(projection)`. Pre-fix this called
    // `effectiveAC` over the omitted abilityScores/equipment and threw, crashing the
    // onChange. The current me is a player with an empty attach to start.
    attachRosterRef.docs = [projection("x", "Bo")];
    useCampaignStore.setState({
      campaign: campaignWith(null),
      loading: false,
      error: null,
    });
    renderRouted(<Party />);
    const picker = screen.getByLabelText(/attach your character/i);
    // Selecting the projected roster entry must not throw (it built a snapshot that
    // READ the stamped ac, never re-deriving over the absent fields).
    expect(() => fireEvent.change(picker, { target: { value: "x" } })).not.toThrow();
    // The guard awaits `listSharedCampaigns` before the snapshot build + write.
    await waitFor(() => expect(attachMemberCharacterMock).toHaveBeenCalled());
  });
});

describe("render resilience — roster CharacterCard on the minimal projection", () => {
  it("a nameless/partial cache is REJECTED at the projection boundary (no card to render)", () => {
    // NON-NULLABILITY (owner 2026-06-15): a cache with no valid name yields `null`
    // from `cacheToRosterDoc` — the subscription SKIPS it, so a corrupt doc never
    // reaches the card (no fake name, no crash). The card itself only ever receives a
    // valid, named projection.
    expect(cacheToRosterDoc("broken", { cache: {} }, META)).toBeNull();
    expect(cacheToRosterDoc("broken", { cache: { name: "   " } }, META)).toBeNull();
  });

  it("renders a card from a fully-populated projection", () => {
    expect(() =>
      renderRouted(<CharacterCard character={projection("ok", "Bo")} />)
    ).not.toThrow();
    expect(screen.getByText("Bo")).toBeInTheDocument();
  });
});
