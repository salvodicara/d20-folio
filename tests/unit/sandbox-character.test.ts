/**
 * The emulator sandbox seeds its players' characters in the SAME stored shape as live
 * data after the ADR-0009 parent cutover: a parent with `revision: 0`, an empty
 * `state` and `playStateVersion: 1`, plus the `combat/state` child that owns play.
 * The seed reaches that shape through the migration's own planner, so the sandbox can
 * never drift from what a real character looks like. Before this, the app refused to
 * open the seeded players (`invalid-revision`, then `parent-state-not-empty`).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { parseCombatState } from "@/lib/combat-state-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import { verifyParentCutoverCorpus } from "../../scripts/migrate-character-parents";
import { sandboxCharacterDocuments } from "../../scripts/lib/sandbox-character";

const STAMP = new Timestamp(1_760_000_000, 0);
const TEAM = resolve(__dirname, "../../content-pack/fixtures/team");

function check(envelope: Record<string, unknown>): void {
  const { parent, child } = sandboxCharacterDocuments(
    "dev-player",
    "sandbox-hero",
    envelope,
    { status: "active", shared: false, attachedCampaignId: "SANDBOX" },
    STAMP
  );

  expect(parent.revision).toBe(0);
  expect(parent.state).toEqual({});
  expect(parent.playStateVersion).toBe(1);
  expect(parent.attachedCampaignId).toBe("SANDBOX");
  expect(parseCombatState(child).ok).toBe(true);
  // The migration's own proof that a stored family is loadable and fully cut over.
  expect(
    verifyParentCutoverCorpus([
      { path: "users/dev-player/characters/sandbox-hero", data: parent },
      { path: "users/dev-player/characters/sandbox-hero/combat/state", data: child },
    ])
  ).toEqual([]);
}

describe("the sandbox seed's character documents", () => {
  it("store the public test character in the live ADR-0009 shape", () => {
    check(
      serializeCharacterEnvelope(MOCK_CHARACTER) as unknown as Record<string, unknown>
    );
  });

  for (const fixture of ["catalion-bard.json", "mandorlino-paladin.json"]) {
    it.skipIf(!existsSync(resolve(TEAM, fixture)))(
      `store the team fixture ${fixture} in the live ADR-0009 shape`,
      () => {
        check(
          JSON.parse(readFileSync(resolve(TEAM, fixture), "utf8")) as Record<
            string,
            unknown
          >
        );
      }
    );
  }
});
