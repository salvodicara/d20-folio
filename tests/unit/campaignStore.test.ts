/**
 * campaignStore — the feature-scoped world-layer store + its client-side
 * derivation (NFR §4). Pure (no Firebase): the listener + writes live in
 * useCampaignSubscription / campaign-io, so this exercises only in-memory state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  useCampaignStore,
  campaignMemberCount,
  campaignPartySize,
  mergeSharedNotes,
  reverseTreasuryEntry,
  treasuryTotalCp,
  treasuryTotalGp,
} from "@/features/campaigns/campaignStore";
import type {
  CampaignDoc,
  EncounterState,
  SharedNote,
  TreasuryLogEntry,
} from "@/types/campaign";

function campaign(overrides?: Partial<CampaignDoc>): CampaignDoc {
  return {
    id: "c1",
    name: "Test Table",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "u1",
    dmUid: "u1",
    members: ["u1", "u2"],
    memberDetails: {
      u1: { displayName: "Aria", characterId: null, role: "dm" },
      u2: { displayName: "Borin", characterId: "char-2", role: "player" },
    },
    status: "active",
    inviteCode: "c1",
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
    ...overrides,
  };
}

const note = (id: string, title: string): SharedNote => ({
  id,
  title,
  content: "",
  pinned: false,
  createdBy: "u1",
  updatedAt: new Date(),
});

const logEntry = (): TreasuryLogEntry => ({
  amount: 50,
  currency: "gp",
  type: "add",
  note: "loot",
  by: "u1",
  at: new Date(),
});

beforeEach(() => {
  useCampaignStore.setState({
    campaign: null,
    loading: false,
    error: null,
    notes: [],
    notesLoading: false,
    notesError: null,
  });
});

describe("campaignStore — state + mutations", () => {
  it("setCampaign loads a document and clears any error", () => {
    useCampaignStore.setState({ error: "boom" });
    useCampaignStore.getState().setCampaign(campaign());
    expect(useCampaignStore.getState().campaign?.id).toBe("c1");
    expect(useCampaignStore.getState().error).toBeNull();
  });

  it("setTreasury replaces the treasury with a NEW reference (drives autosave)", () => {
    useCampaignStore.getState().setCampaign(campaign());
    const before = useCampaignStore.getState().campaign?.treasury;
    useCampaignStore.getState().setTreasury({ pp: 1, gp: 2, ep: 0, sp: 0, cp: 0 });
    const after = useCampaignStore.getState().campaign?.treasury;
    expect(after).toEqual({ pp: 1, gp: 2, ep: 0, sp: 0, cp: 0 });
    expect(after).not.toBe(before);
  });

  it("setName renames the campaign", () => {
    useCampaignStore.getState().setCampaign(campaign());
    useCampaignStore.getState().setName("The Starless Keep");
    expect(useCampaignStore.getState().campaign?.name).toBe("The Starless Keep");
  });

  it("addTreasuryLogEntry appends to the ledger", () => {
    useCampaignStore.getState().setCampaign(campaign());
    useCampaignStore.getState().addTreasuryLogEntry(logEntry());
    expect(useCampaignStore.getState().campaign?.treasuryLog).toHaveLength(1);
  });

  // TREASURY-UX — undoing a transaction deletes the record AND reverses its coin
  // movement in the same update (the old record-only delete left the wrong coins
  // in the pot — the owner's "broken transaction" bug).
  it.each([
    // [seed gp, entry patch, expected gp after undo]
    [145, { amount: 60, type: "remove" as const }, 205], // undo a take → coins return
    [145, { amount: 20, type: "add" as const }, 125], // undo an add → coins go back out
    [145, { amount: 200, type: "add" as const }, 0], // already spent → floors at 0
  ])(
    "cancelTreasuryLogEntry over gp %i undoes %o → gp %i, and deletes the entry",
    (seed, entry, expected) => {
      const store = useCampaignStore.getState();
      store.setCampaign(campaign({ treasury: { pp: 0, gp: seed, ep: 0, sp: 0, cp: 0 } }));
      store.addTreasuryLogEntry({ ...logEntry(), note: "keep me" });
      store.addTreasuryLogEntry({ ...logEntry(), ...entry, note: "undo me" });
      store.cancelTreasuryLogEntry(1);
      const after = useCampaignStore.getState().campaign;
      expect(after?.treasury.gp).toBe(expected);
      expect(after?.treasuryLog).toHaveLength(1);
      expect(after?.treasuryLog[0]?.note).toBe("keep me");
    }
  );

  it("cancelTreasuryLogEntry mid-history targets the right record by index", () => {
    const store = useCampaignStore.getState();
    store.setCampaign(campaign({ treasury: { pp: 0, gp: 100, ep: 0, sp: 0, cp: 0 } }));
    store.addTreasuryLogEntry({ ...logEntry(), amount: 100, note: "first" });
    store.addTreasuryLogEntry({ ...logEntry(), amount: 30, type: "remove", note: "mid" });
    store.addTreasuryLogEntry({ ...logEntry(), amount: 5, note: "last" });
    store.cancelTreasuryLogEntry(1); // the middle take → 30 gp return
    const after = useCampaignStore.getState().campaign;
    expect(after?.treasury.gp).toBe(130);
    expect(after?.treasuryLog.map((e) => e.note)).toEqual(["first", "last"]);
  });

  it("cancelTreasuryLogEntry is a no-op for an out-of-range index", () => {
    const store = useCampaignStore.getState();
    store.setCampaign(campaign());
    store.addTreasuryLogEntry(logEntry());
    store.cancelTreasuryLogEntry(7);
    const after = useCampaignStore.getState().campaign;
    expect(after?.treasuryLog).toHaveLength(1);
    expect(after?.treasury.gp).toBe(0);
  });

  // Pure reversal math — table-driven across metals, types, and the floor.
  it.each([
    [{ amount: 10, currency: "gp", type: "add" }, { gp: 50 }, 40],
    [{ amount: 10, currency: "gp", type: "remove" }, { gp: 50 }, 60],
    [{ amount: 99, currency: "gp", type: "add" }, { gp: 50 }, 0], // floors at 0
    [{ amount: 3, currency: "sp", type: "remove" }, { sp: 0 }, 3],
  ] as const)("reverseTreasuryEntry(%o) over %o → %i", (entry, seed, expected) => {
    const treasury = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0, ...seed };
    const next = reverseTreasuryEntry(treasury, entry);
    expect(next[entry.currency]).toBe(expected);
  });

  it("reverseTreasuryEntry never touches the sibling metals", () => {
    const treasury = { pp: 1, gp: 50, ep: 2, sp: 3, cp: 4 };
    const next = reverseTreasuryEntry(treasury, {
      amount: 10,
      currency: "gp",
      type: "add",
    });
    expect(next).toEqual({ pp: 1, gp: 40, ep: 2, sp: 3, cp: 4 });
  });

  it("setBanner stores the custom banner url + crop (N4)", () => {
    useCampaignStore.getState().setCampaign(campaign());
    const crop = { x: 0, y: 10, width: 100, height: 33 };
    useCampaignStore.getState().setBanner("https://example/banner.jpeg", crop);
    expect(useCampaignStore.getState().campaign?.bannerUrl).toBe(
      "https://example/banner.jpeg"
    );
    expect(useCampaignStore.getState().campaign?.bannerCrop).toEqual(crop);
    // Clearing back to the default art.
    useCampaignStore.getState().setBanner(null, null);
    expect(useCampaignStore.getState().campaign?.bannerUrl).toBeNull();
    expect(useCampaignStore.getState().campaign?.bannerCrop).toBeNull();
  });

  it("upsertNote adds, then replaces by id (not duplicate) in the notes slice", () => {
    // Notes live in their own `notes` slice now (the per-note subcollection), not on
    // the campaign doc — upsertNote is the OPTIMISTIC local mirror.
    useCampaignStore.getState().setCampaign(campaign());
    useCampaignStore.getState().upsertNote(note("n1", "Quest"));
    expect(useCampaignStore.getState().notes).toHaveLength(1);
    useCampaignStore.getState().upsertNote(note("n1", "Quest (updated)"));
    const notes = useCampaignStore.getState().notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe("Quest (updated)");
  });

  it("removeNote deletes by id from the notes slice", () => {
    useCampaignStore.getState().setNotes([note("n1", "A")]);
    useCampaignStore.getState().removeNote("n1");
    expect(useCampaignStore.getState().notes).toHaveLength(0);
  });

  it("removeNote also drops a LEGACY note from the campaign.sharedNotes read-fallback array", () => {
    // A not-yet-migrated note lives ONLY in the legacy array (not the slice); deleting
    // it must remove it there too, or the read-fallback union would resurrect it.
    useCampaignStore
      .getState()
      .setCampaign(
        campaign({ sharedNotes: [note("leg1", "Legacy"), note("leg2", "Keep")] })
      );
    useCampaignStore.getState().removeNote("leg1");
    const after = useCampaignStore.getState().campaign;
    expect(after?.sharedNotes?.map((n) => n.id)).toEqual(["leg2"]);
  });

  it("setEncounter stores a NEW campaign reference and clears with null", () => {
    useCampaignStore.getState().setCampaign(campaign());
    const before = useCampaignStore.getState().campaign;
    const encounter: EncounterState = {
      combatants: [],
      round: 1,
      currentCombatantId: null,
      epoch: 1,
      status: "active",
    };
    useCampaignStore.getState().setEncounter(encounter);
    const after = useCampaignStore.getState().campaign;
    expect(after?.encounter).toBe(encounter);
    // A new reference drives the autosave reference-diff (selectCampaignSave).
    expect(after).not.toBe(before);
    useCampaignStore.getState().setEncounter(null);
    expect(useCampaignStore.getState().campaign?.encounter).toBeNull();
  });

  it("campaign mutations are no-ops when no campaign is loaded", () => {
    // (Notes mutations are NOT campaign-doc mutations anymore — they live on the
    // independent `notes` slice — so they're exercised in their own test above.)
    useCampaignStore.getState().setTreasury({ pp: 9, gp: 9, ep: 9, sp: 9, cp: 9 });
    useCampaignStore.getState().addTreasuryLogEntry(logEntry());
    useCampaignStore.getState().setEncounter({
      combatants: [],
      round: 1,
      currentCombatantId: null,
      epoch: 1,
      status: "active",
    });
    expect(useCampaignStore.getState().campaign).toBeNull();
  });
});

describe("campaignStore — mergeSharedNotes (legacy read-fallback)", () => {
  it("surfaces legacy array notes (visible) when the subscription is empty — zero migration", () => {
    const legacy = [note("leg1", "Old quest"), { ...note("leg2", "Held"), dmOnly: true }];
    const merged = mergeSharedNotes([], legacy);
    expect(merged.map((n) => n.id)).toEqual(["leg1", "leg2"]);
    // Every legacy note is forced VISIBLE — the hide flag is net-new, so a stray
    // persisted dmOnly:true must never hide a pre-migration note.
    expect(merged.every((n) => n.dmOnly === false)).toBe(true);
  });

  it("dedupes a note present in BOTH the subcollection and the legacy array — subcollection WINS", () => {
    const sub = [{ ...note("dup", "From subcollection"), pinned: true }];
    const legacy = [note("dup", "Stale legacy twin"), note("legOnly", "Only legacy")];
    const merged = mergeSharedNotes(sub, legacy);
    // The id appears once; the subcollection copy (pinned, fresh title) wins; the
    // legacy-only note is still unioned in.
    expect(merged.map((n) => n.id)).toEqual(["dup", "legOnly"]);
    const dup = merged.find((n) => n.id === "dup");
    expect(dup?.title).toBe("From subcollection");
    expect(dup?.pinned).toBe(true);
  });

  it("returns the subscription notes untouched when there is no legacy array (post-migration)", () => {
    const sub = [note("n1", "A")];
    expect(mergeSharedNotes(sub, undefined)).toBe(sub);
    expect(mergeSharedNotes(sub, [])).toBe(sub);
  });
});

describe("campaignStore — client-side derivation", () => {
  it("campaignMemberCount counts members (0 when null)", () => {
    expect(campaignMemberCount(null)).toBe(0);
    expect(campaignMemberCount(campaign())).toBe(2);
  });

  it("campaignPartySize excludes the DM (0 when null or solo DM)", () => {
    expect(campaignPartySize(null)).toBe(0);
    // 1 DM (u1) + 2 players (u2, u3) → party of 2
    expect(campaignPartySize(campaign({ members: ["u1", "u2", "u3"] }))).toBe(2);
    // solo DM, no players → party of 0
    expect(campaignPartySize(campaign({ members: ["u1"] }))).toBe(0);
  });

  it("treasuryTotalCp / treasuryTotalGp convert across denominations", () => {
    // 1pp(1000) + 2gp(200) + 1ep(50) + 3sp(30) + 4cp(4) = 1284 cp = 12.84 gp
    const treasury = { pp: 1, gp: 2, ep: 1, sp: 3, cp: 4 };
    expect(treasuryTotalCp(treasury)).toBe(1284);
    expect(treasuryTotalGp(treasury)).toBeCloseTo(12.84, 2);
  });
});
