/**
 * The v0.26.0 compatibility preflight runs every stored document through the app's
 * own v0.26 readers and reports counts only: read as stored, read with a field filled
 * or dropped, rejected (by reason), and the field paths the next v0.26 save would
 * rewrite. It reads; it never writes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

// The fixtures are built with the app's combat-state writer, whose module holds a
// Firestore ref helper: keep the client SDK out of CI (pure-modules guard).
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sessionToCombatState } from "@/lib/combat-state";
import { combatStateWriteData } from "@/lib/combat-state-io";
import { addMonster, beginEncounterTurns, startEncounter } from "@/lib/play/encounter";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyV026Compat } from "../../scripts/survey-v026-compat";
import { makeCharacterDoc } from "./_helpers";

const SCRIPT = resolve(__dirname, "../../scripts/survey-v026-compat.ts");
const catalogue = { items: [], fingerprint: "sha256:test", mode: "composed" };

/** A character as the app stores it: the parent envelope and its combat child. */
function character(
  path: string,
  session: Partial<SessionState> = {},
  parent: RawMap = {}
): { path: string; data: RawMap }[] {
  const doc: CharacterDoc = makeCharacterDoc(
    { name: assertNonEmptyString("Lyra Voss") },
    session
  );
  const envelope = serializeCharacterEnvelope(doc);
  return [
    {
      path,
      data: { schema: 3, build: envelope.build, state: {}, revision: 0, ...parent },
    },
    {
      path: `${path}/combat/state`,
      data: combatStateWriteData(sessionToCombatState(doc.session)),
    },
  ];
}

/** A v0.25 running fight: no `rosterLinks` (the field arrived with v0.26). */
function v025Encounter(): RawMap {
  const fight = beginEncounterTurns(
    addMonster(startEncounter({}, [], 1_000), {
      ac: 13,
      count: 1,
      initiative: 12,
      maxHp: 10,
      name: "Goblin",
    }),
    ["monster-1"]
  );
  expect(fight.rosterLinks).toBeUndefined();
  return JSON.parse(JSON.stringify(fight)) as RawMap;
}

function campaign(path: string, data: RawMap) {
  return {
    path,
    data: {
      name: "Lost Mine",
      dmUid: "dm-uid",
      members: ["dm-uid"],
      memberDetails: {
        "dm-uid": { displayName: "Sal", role: "dm", characterId: null },
      },
      ...data,
    } as RawMap,
  };
}

const lethargy = "potion:potion-of-speed:aftereffect";

describe("surveyV026Compat", () => {
  it("reads v0.25 data: characters, a fight without roster links, a legacy potion key", async () => {
    const survey = await surveyV026Compat({
      documents: [
        { path: "users/u1", data: { role: "admin" } },
        ...character("users/u1/characters/a"),
        ...character("users/u1/characters/b", {
          activeFeatures: [lethargy],
          effectBoundaries: { [lethargy]: { round: 3, phase: "turn-end" } },
        }),
        campaign("campaigns/c1", { encounter: v025Encounter() }),
      ],
      accounts: [{ uid: "u1", customClaims: { role: "admin" } }],
      catalogue,
    });
    expect(survey.kinds.character).toEqual({
      read: 2,
      ok: 2,
      defaulted: 0,
      rejected: {},
      rejectedWhere: {},
      rejectedPaths: {},
      changedOnRead: {},
      rewrites: {},
    });
    expect(survey.kinds.campaign).toMatchObject({ read: 1, ok: 1, rejected: {} });
    expect(survey.legacy).toEqual({
      encountersWithoutRosterLinks: 1,
      charactersWithPotionAftereffectKeys: 1,
    });
    expect(survey.claims).toEqual({
      accounts: 1,
      userDocs: 1,
      toChange: 0,
      docsWithoutAccount: 0,
    });
    expect(survey.itemResources).toEqual({
      catalogue: "sha256:test",
      documentsToChange: 0,
      issues: {},
    });
  });

  it("a combat child carrying a started solo fight reads as stored, with no rewrite", async () => {
    const [parent, child] = character("users/u1/characters/a");
    if (!parent || !child) throw new Error("fixture");
    const survey = await surveyV026Compat({
      documents: [
        { path: "users/u1", data: {} },
        parent,
        { ...child, data: { ...child.data, soloFightStarted: true } },
      ],
      accounts: [{ uid: "u1", customClaims: {} }],
      catalogue,
    });
    expect(survey.kinds.character).toMatchObject({
      read: 1,
      ok: 1,
      defaulted: 0,
      rejected: {},
      rewrites: {},
    });
  });

  it("a spell carrying the source that granted it reads as stored, with no rewrite", async () => {
    const [parent, child] = character("users/u1/characters/a");
    if (!parent || !child) throw new Error("fixture");
    const build = parent.data.build as RawMap;
    const spells = [
      { srdId: "guidance", prepared: true, grantedBy: "magic-initiate-cleric" },
    ];
    const survey = await surveyV026Compat({
      documents: [
        { path: "users/u1", data: {} },
        { ...parent, data: { ...parent.data, build: { ...build, spells } } },
        child,
      ],
      accounts: [{ uid: "u1", customClaims: {} }],
      catalogue,
    });
    expect(survey.kinds.character).toMatchObject({
      read: 1,
      ok: 1,
      defaulted: 0,
      rejected: {},
      rewrites: {},
    });
  });

  it("counts what a reader rejects, by reason, and what it fills or drops, by field", async () => {
    const survey = await surveyV026Compat({
      documents: [
        // A parent without its compare-and-set generation; a combat child that lost
        // its play state.
        ...character("users/u1/characters/a", {}, { revision: -1 }),
        ...character("users/u1/characters/b").map((d) =>
          d.path.endsWith("/combat/state")
            ? { ...d, data: { ...d.data, playState: 7 } }
            : d
        ),
        // A member whose attached snapshot lost its name; a broken fight.
        campaign("campaigns/c1", {
          memberDetails: {
            p1: {
              displayName: "Ana",
              role: "player",
              characterId: "x",
              character: { name: "" },
            },
          },
        }),
        campaign("campaigns/c2", { encounter: { combatants: "nope" } }),
        // Roster: one fine, one over its max HP (clamped), one nameless.
        {
          path: "campaigns/c1/roster/r1",
          data: { name: "Bren", hp: { current: 9, max: 16 } },
        },
        {
          path: "campaigns/c1/roster/r2",
          data: { name: "Mira", hp: { current: 20, max: 16 } },
        },
        { path: "campaigns/c1/roster/r3", data: { hp: { current: 1, max: 1 } } },
        { path: "campaigns/c1/dmRoster/r1", data: { notes: "owes the party" } },
        {
          path: "campaigns/c1/sessionLogs/s1",
          data: {
            schema: 1,
            lastAt: 5,
            log: [{ id: "i1", by: "u1", at: 5, type: "event", event: {} }, { id: "bad" }],
          },
        },
      ],
      accounts: [],
      catalogue,
    });
    expect(survey.kinds.character.rejected).toEqual({
      "invalid-revision": 1,
      "invalid-v1-play-state": 1,
    });
    // Which check refused each: the parent's revision, the child's play state.
    expect(survey.kinds.character.rejectedWhere).toEqual({
      "invalid-revision": { parent: 1 },
      "invalid-v1-play-state": { "play-state:invalid-play-state": 1 },
    });
    expect(survey.kinds.campaign).toMatchObject({
      read: 2,
      defaulted: 1,
      changedOnRead: { "memberDetails.*.character": 1 },
    });
    expect(Object.values(survey.kinds.campaign.rejected)).toEqual([1]);
    expect(survey.kinds.roster).toEqual({
      read: 3,
      ok: 1,
      defaulted: 1,
      rejected: { "invalid-roster-entry": 1 },
      rejectedWhere: {},
      rejectedPaths: {},
      changedOnRead: { "hp.current": 1 },
      rewrites: { "hp.current": 1 },
    });
    expect(survey.kinds.dmRoster).toMatchObject({ read: 1, ok: 1 });
    expect(survey.kinds.sessionLogItem).toMatchObject({
      read: 2,
      ok: 1,
      rejected: { "invalid-log-item": 1 },
    });
  });

  it("names the field a combat state is refused for, and the keys where it differs", async () => {
    const [parent, child] = character("users/u1/characters/a");
    if (!parent || !child) throw new Error("fixture");
    const combat = {
      ...child.data,
      turnEconomy: { key: "solo:turn", unknownKey: 1 },
    };
    const survey = await surveyV026Compat({
      documents: [parent, { path: child.path, data: combat }],
      accounts: [],
      catalogue,
    });
    expect(survey.kinds.character.rejectedWhere).toEqual({
      "invalid-combat-state": { "canonical:turnEconomy": 1 },
    });
    expect(survey.kinds.character.rejectedPaths).toMatchObject({
      "turnEconomy.unknownKey": 1,
    });
  });

  it("finds an account whose claims its user doc no longer matches", async () => {
    const survey = await surveyV026Compat({
      documents: [
        { path: "users/u1", data: { role: "admin" } },
        { path: "users/gone", data: {} },
      ],
      accounts: [{ uid: "u1", customClaims: {} }],
      catalogue,
    });
    expect(survey.claims).toEqual({
      accounts: 1,
      userDocs: 2,
      toChange: 1,
      docsWithoutAccount: 1,
    });
  });

  it("reports counts only: never an id, a name or a path", async () => {
    const survey = await surveyV026Compat({
      documents: [
        { path: "users/uid-secret", data: {} },
        ...character("users/uid-secret/characters/char-secret"),
        campaign("campaigns/camp-secret", {
          memberDetails: {
            "uid-secret": {
              displayName: "Sal",
              role: "dm",
              characterId: null,
              character: { name: "" },
            },
          },
        }),
        { path: "campaigns/camp-secret/roster/r1", data: { name: "Bren" } },
      ],
      accounts: [{ uid: "uid-secret", customClaims: {} }],
      catalogue,
    });
    const text = JSON.stringify(survey);
    for (const secret of ["secret", "Lyra", "Bren", "Sal", "Lost Mine"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("the survey script", () => {
  const source = readFileSync(SCRIPT, "utf8");

  it("cannot write: no write call and no writer imported", () => {
    expect(source).not.toMatch(
      /\.(set|update|delete|create|commit|add)\(|runTransaction|batch\(|bulkWriter|recursiveDelete|setCustomUserClaims|revokeRefreshTokens|deleteUser|updateUser/
    );
    const imported = [...source.matchAll(/import\s*{([^}]*)}\s*from\s*"\.\/[^"]+"/g)]
      .flatMap((m) => (m[1] ?? "").split(","))
      .map((name) => name.replace(/\btype\b/, "").trim())
      .filter(Boolean);
    expect(
      imported.filter((name) => /^(apply|write|run|create|backfill)/i.test(name))
    ).toEqual([]);
  });

  it("caps its reads", () => {
    expect(source).toMatch(/\.limit\(READ_CAP \+ 1\)/);
    expect(source).toMatch(/listUsers\(ACCOUNT_CAP\)/);
  });

  it("the readers it runs do not depend on the v0.26 writer flag", () => {
    for (const file of [
      "src/lib/character-read.ts",
      "src/lib/character-codec.ts",
      "src/lib/combat-state-codec.ts",
      "src/lib/session-state-codec.ts",
      "src/features/campaigns/campaign-codec.ts",
      "src/lib/play/encounter.ts",
      "src/lib/play/campaign-roster.ts",
      "src/lib/session-log-io.ts",
    ]) {
      const text = readFileSync(resolve(__dirname, "../..", file), "utf8");
      expect(text, file).not.toMatch(/COMBAT_EFFECTS_V26|combatEffectsV26On/);
    }
  });
});
