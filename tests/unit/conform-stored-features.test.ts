/**
 * `conform-stored-features` — the read-boundary fold that undoes the legacy
 * race-trait BAKE (`{ srdId: "orc-adrenaline-rush" }` stored in `features[]`).
 *
 * One semantic mechanic must surface ONCE no matter how many paths deliver it
 * (golden rules 5/6/7): a stored ref duplicating an AUTO-GRANTED source (a race
 * trait on `character.race`, or a class/subclass feature the class table grants) is
 * DROPPED; the survivor stays the sole surfacing. Recognized by STABLE id, never a
 * display string. The companion `remapSessionTrackerIds` carries a user's spent pips
 * from the dropped id onto the survivor — never silently restoring a spent use.
 *
 * Pure / SRD-coupled / Firebase-free — exercises the helper directly (the codec
 * round-trip through it is covered end-to-end in action-decomposition.test.ts).
 */
import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import {
  conformStoredFeatures,
  remapSessionTrackerIds,
  conformRaceTraitKey,
  conformRaceTraitSessionIds,
} from "@/lib/conform-stored-features";
import type {
  CharacterData,
  ClassEntry,
  CustomFeature,
  SessionState,
  SrdFeatureRef,
  SrdSpellRef,
} from "@/types/character";

const BARBARIAN: ClassEntry[] = [{ classId: "barbarian", level: 3 }];
const custom: CustomFeature = {
  custom: true,
  title: "Homebrew",
  emoji: "x",
  source: "homebrew",
  tags: [],
  contentBlocks: [],
};

describe("conformStoredFeatures — folds auto-granted duplicates", () => {
  it("drops a stored RACE TRAIT ref + remaps its id to the race session id", () => {
    const features: Array<SrdFeatureRef> = [
      { srdId: "orc-adrenaline-rush" },
      { srdId: "orc-relentless-endurance" },
    ];
    const { features: out, trackerIdRemap } = conformStoredFeatures({
      race: asRaceId("orc"),
      classes: BARBARIAN,
      features,
    });
    expect(out).toEqual([]);
    // The surviving session id is now the trait-ID form (`race:<raceId>:<trait.id>`),
    // never the English display name (golden rule 7).
    expect(trackerIdRemap.get("orc-adrenaline-rush")).toBe("race:orc:adrenaline-rush");
    expect(trackerIdRemap.get("orc-relentless-endurance")).toBe(
      "race:orc:relentless-endurance"
    );
  });

  it("matches the doc's race case-insensitively (a doc may store 'Orc')", () => {
    const { trackerIdRemap } = conformStoredFeatures({
      race: asRaceId("orc"),
      classes: BARBARIAN,
      features: [{ srdId: "orc-adrenaline-rush" }],
    });
    expect(trackerIdRemap.get("orc-adrenaline-rush")).toBe("race:orc:adrenaline-rush");
  });

  it("never folds a race trait that is NOT the character's race (cross-race id)", () => {
    // An elf doc with an orc-trait ref is not a duplicate of any auto-granted source.
    const features: Array<SrdFeatureRef> = [{ srdId: "orc-adrenaline-rush" }];
    const { features: out, trackerIdRemap } = conformStoredFeatures({
      race: asRaceId("elf"),
      classes: BARBARIAN,
      features,
    });
    expect(out).toEqual(features); // untouched
    expect(trackerIdRemap.size).toBe(0);
  });

  it("drops a stored CLASS/SUBCLASS feature the table grants — NO remap (same id)", () => {
    // Barbarian L1 auto-grants Rage; a baked `{ srdId: "barbarian-rage" }` is a dup.
    const { features: out, trackerIdRemap } = conformStoredFeatures({
      race: asRaceId("orc"),
      classes: BARBARIAN,
      features: [{ srdId: "barbarian-rage" }],
    });
    expect(out).toEqual([]);
    // The surviving tracker keeps the SAME srdId, so no migration is needed.
    expect(trackerIdRemap.size).toBe(0);
  });

  it("KEEPS custom features and genuinely-chosen feats untouched", () => {
    const features: Array<SrdFeatureRef | CustomFeature> = [
      custom,
      { srdId: "savage-attacker" }, // a chosen feat — not auto-granted
    ];
    const { features: out, trackerIdRemap } = conformStoredFeatures({
      race: asRaceId("orc"),
      classes: BARBARIAN,
      features,
    });
    expect(out).toBe(features); // referential identity preserved (nothing dropped)
    expect(trackerIdRemap.size).toBe(0);
  });

  it("is idempotent — a second pass over conformed features is a no-op", () => {
    const features: Array<SrdFeatureRef> = [
      { srdId: "orc-adrenaline-rush" },
      { srdId: "savage-attacker" },
    ];
    const first = conformStoredFeatures({
      race: asRaceId("orc"),
      classes: BARBARIAN,
      features,
    });
    const second = conformStoredFeatures({
      race: asRaceId("orc"),
      classes: BARBARIAN,
      features: first.features,
    });
    expect(second.features).toBe(first.features); // unchanged
    expect(second.trackerIdRemap.size).toBe(0);
  });
});

function session(trackers: Record<string, { used: number }>): SessionState {
  return {
    hp: { current: 0, max: 0, temp: 0 },
    trackers,
    pinnedActions: [],
    logEntries: [],
  } as unknown as SessionState;
}

describe("remapSessionTrackerIds — migrates spent pips onto the survivor", () => {
  const remap = new Map([["orc-adrenaline-rush", "race:orc:adrenaline-rush"]]);

  it("moves state from the dropped id to the surviving id", () => {
    const out = remapSessionTrackerIds(
      session({ "orc-adrenaline-rush": { used: 2 } }),
      remap
    );
    expect(out.trackers["orc-adrenaline-rush"]).toBeUndefined();
    expect(out.trackers["race:orc:adrenaline-rush"]?.used).toBe(2);
  });

  it("keeps the HIGHER `used` when both ids carry state (never un-spends a use)", () => {
    const out = remapSessionTrackerIds(
      session({
        "orc-adrenaline-rush": { used: 3 },
        "race:orc:adrenaline-rush": { used: 1 },
      }),
      remap
    );
    expect(out.trackers["orc-adrenaline-rush"]).toBeUndefined();
    expect(out.trackers["race:orc:adrenaline-rush"]?.used).toBe(3);
  });

  it("is a referential no-op when no dropped id carries state", () => {
    const s = session({ "barbarian-rage": { used: 1 } });
    expect(remapSessionTrackerIds(s, remap)).toBe(s);
  });

  it("is a referential no-op for an empty remap", () => {
    const s = session({ "orc-adrenaline-rush": { used: 2 } });
    expect(remapSessionTrackerIds(s, new Map())).toBe(s);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Race-trait session-id legacy-NAME → trait-ID conform (golden rules 7 + 10)
// ════════════════════════════════════════════════════════════════════════════

describe("conformRaceTraitKey — rewrites a legacy EN-name key to the id form", () => {
  it("rewrites a bare tracker id `race:orc:Relentless Endurance`", () => {
    expect(conformRaceTraitKey("race:orc:Relentless Endurance")).toBe(
      "race:orc:relentless-endurance"
    );
  });

  it("rewrites an action id with a `-actionType` suffix (carries the suffix)", () => {
    expect(conformRaceTraitKey("race:orc:Adrenaline Rush-bonus")).toBe(
      "race:orc:adrenaline-rush-bonus"
    );
  });

  it("rewrites an action id behind a `temphp-` PREFIX (carries the prefix)", () => {
    expect(conformRaceTraitKey("temphp-race:orc:Adrenaline Rush")).toBe(
      "temphp-race:orc:adrenaline-rush"
    );
  });

  it("rewrites a per-spell free-cast sourceId with a `:spellId` suffix", () => {
    // `race:<raceId>:<EN name>:<spellId>` — only the EN-name segment is rewritten.
    expect(conformRaceTraitKey("race:tiefling:Fiendish Legacy:hellish-rebuke")).toBe(
      "race:tiefling:fiendish-legacy:hellish-rebuke"
    );
  });

  it("is idempotent — a key already in the id form passes through unchanged", () => {
    const id = "race:orc:relentless-endurance";
    expect(conformRaceTraitKey(id)).toBe(id);
    expect(conformRaceTraitKey("race:orc:adrenaline-rush-bonus")).toBe(
      "race:orc:adrenaline-rush-bonus"
    );
  });

  it("leaves a non-race / unknown-race / non-`race:` key untouched", () => {
    expect(conformRaceTraitKey("weapon-longsword")).toBe("weapon-longsword");
    expect(conformRaceTraitKey("race:nonexistent:Whatever")).toBe(
      "race:nonexistent:Whatever"
    );
    expect(conformRaceTraitKey("barbarian-rage")).toBe("barbarian-rage");
  });
});

/** A full-ish session carrying race-trait state in all three session locations. */
function sessionWith(over: Partial<SessionState>): SessionState {
  return {
    hp: { current: 0, max: 0, temp: 0 },
    trackers: {},
    pinnedActions: [],
    unpinnedActions: [],
    logEntries: [],
    ...over,
  } as unknown as SessionState;
}

function characterWith(spells: SrdSpellRef[]): CharacterData {
  return { spells } as unknown as CharacterData;
}

describe("conformRaceTraitSessionIds — legacy doc round-trips with used-count PRESERVED", () => {
  it("conforms trackers + pinnedActions + freeCastSource, keeping spent uses", () => {
    const character = characterWith([
      {
        srdId: "hellish-rebuke",
        freeCastSource: {
          sourceId: "race:tiefling:Fiendish Legacy:hellish-rebuke",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ]);
    const session = sessionWith({
      // A legacy Orc Relentless Endurance tracker with a SPENT use.
      trackers: {
        "race:orc:Relentless Endurance": { used: 1 },
        "race:orc:Adrenaline Rush": { used: 2 },
      },
      pinnedActions: ["race:orc:Adrenaline Rush-bonus", "weapon-longsword"],
      unpinnedActions: ["race:orc:Adrenaline Rush-bonus"],
    });

    const out = conformRaceTraitSessionIds(character, session);

    // Trackers: rewritten to the id form, spent uses PRESERVED.
    expect(out.session.trackers["race:orc:relentless-endurance"]?.used).toBe(1);
    expect(out.session.trackers["race:orc:adrenaline-rush"]?.used).toBe(2);
    expect(out.session.trackers["race:orc:Relentless Endurance"]).toBeUndefined();
    expect(out.session.trackers["race:orc:Adrenaline Rush"]).toBeUndefined();

    // Pinned / unpinned action ids: rewritten, non-race ids untouched.
    expect(out.session.pinnedActions).toEqual([
      "race:orc:adrenaline-rush-bonus",
      "weapon-longsword",
    ]);
    expect(out.session.unpinnedActions).toEqual(["race:orc:adrenaline-rush-bonus"]);

    // Free-cast sourceId on the spell ref: only the EN-name segment rewritten.
    const fc = out.character.spells[0];
    expect(fc && !("custom" in fc) ? fc.freeCastSource?.sourceId : undefined).toBe(
      "race:tiefling:fiendish-legacy:hellish-rebuke"
    );
  });

  it("folds two legacy keys colliding on one id key via Math.max(used)", () => {
    // A doc carrying BOTH the legacy EN-name key and the already-id key (e.g. a
    // partially-conformed doc): they collapse to one, keeping the HIGHER used.
    const session = sessionWith({
      trackers: {
        "race:orc:Relentless Endurance": { used: 1 },
        "race:orc:relentless-endurance": { used: 0 },
      },
    });
    const out = conformRaceTraitSessionIds(characterWith([]), session);
    expect(out.session.trackers["race:orc:relentless-endurance"]?.used).toBe(1);
    expect(out.session.trackers["race:orc:Relentless Endurance"]).toBeUndefined();
  });

  it("is a referential no-op on an already-conformed doc (idempotent)", () => {
    const character = characterWith([]);
    const session = sessionWith({
      trackers: { "race:orc:relentless-endurance": { used: 1 } },
      pinnedActions: ["race:orc:adrenaline-rush-bonus"],
    });
    const out = conformRaceTraitSessionIds(character, session);
    expect(out.session).toBe(session);
    expect(out.character).toBe(character);
  });
});
