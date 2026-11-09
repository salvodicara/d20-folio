/**
 * Guard: what v0.25.0 stored, v0.26 reads unchanged. Live data was written by v0.25.0
 * (9bb9a60c); every v0.26 reader must accept it as it is, never refuse it and never
 * need a rewrite. A field a parser learned since then must tolerate its absence.
 *
 * The fixtures were produced once by v0.25.0's OWN writers, run at 9bb9a60c
 * (`combatStateWriteData`, `serializeCharacterEnvelope`, the encounter builders),
 * and are frozen here: never edit them by hand. The bug this guards: #755 made the
 * turn economy parse always carry `extraMovementFt`, so every combat state a v0.25
 * turn had saved stopped matching its own parse and was refused.
 */
import { describe, expect, it, vi } from "vitest";

import { toCampaignDoc } from "@/features/campaigns/campaign-codec";
import { parseEncounterState } from "@/features/campaigns/encounter";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { hydrateStoredCharacter } from "@/lib/character-read";
import { parseCombatState } from "@/lib/combat-state-codec";
import { changedPaths, surveyV026Compat } from "../../scripts/survey-v026-compat";
import v025 from "./__fixtures__/v025/stored-shapes.json";

// The survey's engine seam loads the session-log reader, whose module holds the
// Firestore client: keep it out of CI (pure-modules guard).
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

describe("v0.26 reads what v0.25.0 stored, unchanged", () => {
  it.each([
    [
      "after a full turn (turn economy, effects, pending saves)",
      v025.combatStateFullTurn,
    ],
    ["of a fresh character", v025.combatStateFresh],
  ])("a combat state %s", (_label, stored) => {
    const parsed = parseCombatState(stored);
    expect(parsed).toMatchObject({ ok: true });
  });

  it("and what v0.26 itself writes after a turn (its new key stored) still reads", () => {
    const full = v025.combatStateFullTurn;
    const v026 = { ...full, turnEconomy: { ...full.turnEconomy, extraMovementFt: 0 } };
    expect(parseCombatState(v026)).toMatchObject({ ok: true });
  });

  it("a character: its parent and combat state load, and the build needs no rewrite", async () => {
    const doc = await hydrateStoredCharacter(
      "c1",
      v025.characterParent,
      v025.combatStateFresh
    );
    expect(
      changedPaths(v025.characterParent.build, serializeCharacterEnvelope(doc).build)
    ).toEqual([]);
  });

  it("a running fight and its campaign read as stored", () => {
    expect(
      changedPaths(v025.encounterRunning, parseEncounterState(v025.encounterRunning))
    ).toEqual([]);
    const { id: _id, ...campaign } = toCampaignDoc("camp", v025.campaign);
    void _id;
    expect(changedPaths(v025.campaign, campaign)).toEqual([]);
  });

  it("the compatibility survey finds nothing to refuse or rewrite", async () => {
    const survey = await surveyV026Compat({
      documents: [
        { path: "users/u1/characters/c1", data: v025.characterParent },
        { path: "users/u1/characters/c1/combat/state", data: v025.combatStateFullTurn },
        { path: "users/u1/characters/c2", data: v025.characterParent },
        { path: "users/u1/characters/c2/combat/state", data: v025.combatStateFresh },
        { path: "campaigns/camp", data: v025.campaign },
      ],
      accounts: [],
      catalogue: { items: [], fingerprint: "sha256:test" },
    });
    expect(survey.kinds.character.rejected).toEqual({});
    expect(survey.kinds.character).toMatchObject({ read: 2, ok: 2 });
    expect(survey.kinds.character.rewrites).toEqual({});
    expect(survey.kinds.campaign.rejected).toEqual({});
    expect(survey.kinds.campaign).toMatchObject({ read: 1, ok: 1 });
  });
});
