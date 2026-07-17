/**
 * global-combat-context — the topbar pip's PURE reducers (spec §5): primary selection,
 * the PipState reduction, and the turn-start-toast guard. No React, no Firebase — a plain
 * unit suite that pins the pip's display logic (the rendering is a trivial lookup over this).
 */
import { describe, it, expect } from "vitest";
import {
  overlayOpenCampaign,
  pickPrimaryCampaignId,
  buildPipModel,
  turnStartKey,
  shouldToastTurnStart,
  type GlobalCombat,
  type PipModel,
} from "@/features/campaigns/global-combat-context";
import {
  startEncounter,
  beginEncounterTurns,
  viewerActiveEncounters,
  type ViewerEncounter,
} from "@/features/campaigns/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

/** A ViewerEncounter with sensible defaults, overridable per case. */
function ve(over: Partial<ViewerEncounter> = {}): ViewerEncounter {
  return {
    campaignId: "camp-1",
    campaignName: "The Starless Keep",
    role: "pc",
    myCombatantId: "pc-mara",
    characterId: "char-mara",
    heroName: "Mara Quill",
    round: 1,
    epoch: 100,
    gathering: false,
    notRolled: false,
    isMyTurn: false,
    actorName: null,
    ...over,
  };
}

/** A minimal CampaignDoc (one DM `u1`, one player `u2` with a hero), overridable. */
function camp(over: Partial<CampaignDoc> = {}): CampaignDoc {
  const at = new Date(0);
  return {
    id: "camp-1",
    name: "The Starless Keep",
    createdAt: at,
    updatedAt: at,
    createdBy: "u1",
    dmUid: "u1",
    members: ["u1", "u2"],
    memberDetails: {
      u1: { displayName: "Tav", characterId: null, role: "dm" },
      u2: { displayName: "Mara", characterId: "char-mara", role: "player" },
    },
    status: "active",
    inviteCode: "camp-1",
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
    ...over,
  };
}

/** The viewer u2's PC seed for a fresh encounter. */
const SEEDS = { u2: { characterId: "char-mara" } } as const;

describe("overlayOpenCampaign — the pip's optimistic snappiness seam", () => {
  it("is a no-op (cloned list) when no campaign is open", () => {
    const synced = [camp()];
    expect(overlayOpenCampaign(synced, null)).toEqual(synced);
  });

  it("prefers the optimistic open copy over its stale synced twin (same id)", () => {
    const stale = camp({ encounter: undefined }); // no echo yet
    const fresh = camp({ encounter: startEncounter(SEEDS, ["u2"], 100) });
    const [merged] = overlayOpenCampaign([stale], fresh);
    expect(merged).toBe(fresh); // the LOCAL copy wins, in place — no dup
    expect(overlayOpenCampaign([stale], fresh)).toHaveLength(1);
  });

  it("appends the open campaign when the synced list hasn't echoed the membership", () => {
    const fresh = camp({ id: "brand-new" });
    const merged = overlayOpenCampaign([camp({ id: "other" })], fresh);
    expect(merged.map((c) => c.id)).toEqual(["other", "brand-new"]);
  });
});

describe("pip reflects the viewer's OWN encounter edits SYNCHRONOUSLY (no echo lag)", () => {
  // The whole pip-state pipeline as a pure function — exactly what the producer runs each
  // render: overlay the optimistic campaign, derive the viewer's encounters, pick the
  // primary, reduce to the pip model. No store, no Firestore, no awaited round-trip.
  function pipFor(
    synced: ReadonlyArray<CampaignDoc>,
    open: CampaignDoc | null,
    uid: string
  ): PipModel | null {
    const merged = overlayOpenCampaign(synced, open);
    const encounters = viewerActiveEncounters(merged, uid, false);
    const primaryId = pickPrimaryCampaignId(encounters, null);
    return primaryId ? buildPipModel(encounters, primaryId) : null;
  }

  // The viewer is the player u2. The SYNCED list is permanently stale here (no encounter)
  // — standing in for the ~2 s autosave-debounce window before the shared-campaigns
  // listener echoes — so any pip state below comes PURELY from the optimistic open copy.
  const staleSynced = [camp({ encounter: undefined })];

  it("WITHOUT the overlay the pip is dark while the synced doc lags", () => {
    expect(pipFor(staleSynced, null, "u2")).toBeNull();
  });

  it("START combat → pip lights RED needs-roll in the same tick (the viewer owes a roll)", () => {
    // The fresh fight's `encounterInit` table is empty, and that fact is derivable from
    // the SAME optimistic doc — so the red prompt is instant (the old model had to wait
    // for a subdoc round-trip and heuristically flag fresh fights).
    const open = camp({
      encounter: startEncounter(SEEDS, ["u2"], 100),
      encounterInit: {},
    });
    expect(pipFor(staleSynced, open, "u2")?.entries[0]?.state).toBe("needs-roll");
  });

  it("ROLLING lands in the table → quiet `gathering` in the same tick", () => {
    const open = camp({
      encounter: startEncounter(SEEDS, ["u2"], 100),
      encounterInit: { u2: 14 },
    });
    expect(pipFor(staleSynced, open, "u2")?.entries[0]?.state).toBe("gathering");
  });

  it("BEGIN turns → pip flips to `your-turn` in the same tick", () => {
    const gathering = startEncounter(SEEDS, ["u2"], 100);
    const begun: EncounterState = beginEncounterTurns(gathering, ["pc-u2"]);
    // Begin-turns implies everyone rolled (the gate) — the table carries u2's roll.
    const open = camp({ encounter: begun, encounterInit: { u2: 14 } });
    expect(pipFor(staleSynced, open, "u2")?.entries[0]?.state).toBe("your-turn");
  });

  it("END combat → pip clears in the same tick", () => {
    const open = camp({ encounter: undefined }); // setEncounter(null) optimistic
    expect(pipFor(staleSynced, open, "u2")).toBeNull();
  });

  it("the synced echo and the optimistic copy converge to the IDENTICAL pip", () => {
    // Once the debounced write lands, the synced list carries the same encounter — the
    // overlay is then equal-or-fresher, never staler (last-write-wins preserved).
    const enc = beginEncounterTurns(startEncounter(SEEDS, ["u2"], 100), ["pc-u2"]);
    const optimistic = pipFor(
      [camp({ encounter: undefined })],
      camp({ encounter: enc }),
      "u2"
    );
    const echoed = pipFor([camp({ encounter: enc })], null, "u2");
    expect(optimistic).toEqual(echoed);
  });
});

describe("pickPrimaryCampaignId", () => {
  it("returns null for no encounters", () => {
    expect(pickPrimaryCampaignId([], null)).toBeNull();
  });

  it("defaults to the most-recently-started (max epoch)", () => {
    const out = pickPrimaryCampaignId(
      [ve({ campaignId: "a", epoch: 100 }), ve({ campaignId: "b", epoch: 300 })],
      null
    );
    expect(out).toBe("b");
  });

  it("honours an ACTIVE pin over the most-recent", () => {
    const out = pickPrimaryCampaignId(
      [ve({ campaignId: "a", epoch: 100 }), ve({ campaignId: "b", epoch: 300 })],
      "a"
    );
    expect(out).toBe("a");
  });

  it("falls back to most-recent when the pin is no longer active (ended)", () => {
    const out = pickPrimaryCampaignId(
      [ve({ campaignId: "a", epoch: 100 }), ve({ campaignId: "b", epoch: 300 })],
      "gone"
    );
    expect(out).toBe("b");
  });
});

describe("buildPipModel — PipState reduction", () => {
  it("returns null for no encounters", () => {
    expect(buildPipModel([], "x")).toBeNull();
  });

  it("an entry reads needs-roll when its OWN notRolled flag is set (PC only)", () => {
    const m = buildPipModel([ve({ notRolled: true })], "camp-1");
    expect(m?.entries[0]?.state).toBe("needs-roll");
  });

  it("your-turn beats gathering/actor when it's the viewer's turn (and rolled)", () => {
    const m = buildPipModel([ve({ isMyTurn: true })], "camp-1");
    expect(m?.entries[0]?.state).toBe("your-turn");
  });

  it("gathering when no pointer is set and not my turn", () => {
    const m = buildPipModel([ve({ gathering: true })], "camp-1");
    expect(m?.entries[0]?.state).toBe("gathering");
  });

  it("actor-turn when someone else acts", () => {
    const m = buildPipModel([ve({ actorName: "Goblin" })], "camp-1");
    expect(m?.entries[0]?.state).toBe("actor-turn");
  });

  it("a DM-without-a-PC never reads needs-roll or your-turn", () => {
    const dm = ve({
      role: "dm",
      heroName: null,
      characterId: null,
      myCombatantId: null,
      notRolled: true, // even if somehow set, a dm role can't roll
    });
    // Even if notRolled were somehow true, a dm role can't roll.
    expect(buildPipModel([dm], "camp-1")?.entries[0]?.state).toBe("actor-turn");
  });

  it("a SECONDARY entry reads needs-roll from its OWN roll-state (the fixed bleed)", () => {
    // THE MULTI-ENCOUNTER BLEED FIX: `notRolled` is PER encounter (a pure derivation off
    // each campaign doc's `encounterInit` table), applied to EVERY row — not a single
    // primary-only flag. So a needs-roll fight reads red even when it is NOT the displayed
    // primary. Reverting to a primary-only flag fails this test.
    const m = buildPipModel(
      [
        // secondary, owes a roll
        ve({
          campaignId: "camp-1",
          epoch: 100,
          gathering: true,
          notRolled: true,
        }),
        // primary, already rolled
        ve({ campaignId: "camp-2", epoch: 200, gathering: true, notRolled: false }),
      ],
      "camp-2" // primary
    );
    const camp1 = m?.entries.find((e) => e.campaignId === "camp-1");
    const camp2 = m?.entries.find((e) => e.campaignId === "camp-2");
    expect(camp1?.state).toBe("needs-roll"); // the SECONDARY row keeps its own red
    expect(camp2?.state).toBe("gathering"); // the primary is quiet (rolled)
  });

  it("each row's state is independent — swapping which id is primary never changes a row", () => {
    // The same encounters + the same per-cid map yield the SAME per-row states regardless of
    // which id is passed as `primaryId` (only the pill's `primaryId` differs). This is the
    // invariant that makes a pin switch incapable of mutating another row.
    const encs = [
      ve({
        campaignId: "camp-1",
        epoch: 100,
        gathering: true,
        notRolled: true,
      }),
      ve({ campaignId: "camp-2", epoch: 200, gathering: true, notRolled: false }),
    ];
    const stateFor = (m: PipModel | null, cid: string) =>
      m?.entries.find((e) => e.campaignId === cid)?.state;
    const a = buildPipModel(encs, "camp-1");
    const b = buildPipModel(encs, "camp-2");
    expect(stateFor(a, "camp-1")).toBe(stateFor(b, "camp-1")); // needs-roll in both
    expect(stateFor(a, "camp-2")).toBe(stateFor(b, "camp-2")); // gathering in both
    expect(a?.primaryId).toBe("camp-1");
    expect(b?.primaryId).toBe("camp-2");
  });

  it("sorts chooser rows most-recently-started first", () => {
    const m = buildPipModel(
      [ve({ campaignId: "old", epoch: 100 }), ve({ campaignId: "new", epoch: 500 })],
      "old"
    );
    expect(m?.entries.map((e) => e.campaignId)).toEqual(["new", "old"]);
    expect(m?.primaryId).toBe("old");
  });
});

describe("turn-start toast guard", () => {
  function status(over: Partial<GlobalCombat> = {}): GlobalCombat {
    return {
      campaignId: "camp-1",
      encounter: {} as GlobalCombat["encounter"],
      view: {} as GlobalCombat["view"],
      myId: "pc-mara",
      characterId: "char-mara",
      gathering: false,
      isMyTurn: true,
      initiativeBonus: 2,
      initiativeRoll: 14,
      round: 3,
      ...over,
    };
  }

  it("keys my own turn by campaign:round, null when it isn't my turn", () => {
    expect(turnStartKey(status())).toBe("camp-1:3");
    expect(turnStartKey(status({ isMyTurn: false }))).toBeNull();
    expect(turnStartKey(null)).toBeNull();
  });

  it("never fires on the first observe (prime silently)", () => {
    expect(shouldToastTurnStart(undefined, "camp-1:3")).toBe(false);
  });

  it("fires when the pointer lands on a new turn", () => {
    expect(shouldToastTurnStart(null, "camp-1:3")).toBe(true);
    expect(shouldToastTurnStart("camp-1:3", "camp-1:4")).toBe(true);
  });

  it("does not re-fire on a re-render with the same turn", () => {
    expect(shouldToastTurnStart("camp-1:3", "camp-1:3")).toBe(false);
  });

  it("does not fire when the turn leaves the viewer", () => {
    expect(shouldToastTurnStart("camp-1:3", null)).toBe(false);
  });
});
