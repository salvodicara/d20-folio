/**
 * The emulator sandbox (local dev, the CI rehearsal) is seeded from the private pack's
 * team fixtures: real players' characters. Every red rehearsal assertion, trace and
 * screenshot of the public repo's CI used to print their names (coordinator,
 * 2026-11-13). The seed now gives each hero a made-up name and no player name or lore,
 * and no seeded document may hold a private term. Needs the pack; skipped without it.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  identityWordPaths,
  privateTermPaths,
  sandboxEnvelope,
  teamFixturePath,
} from "../../scripts/team-fixture";
import { sandboxMemberCharacter } from "../../scripts/lib/sandbox-character";
import { DEV_HERO_NAMES } from "@/lib/dev-hero-names";

const ROOT = resolve(__dirname, "../..");
const packed = existsSync(resolve(ROOT, "content-pack/fixtures/team-roles.json"));

describe.skipIf(!packed)("the sandbox seed holds no private term", () => {
  for (const role of Object.keys(DEV_HERO_NAMES)) {
    it(`${role}: the made-up name, no player, no lore; nothing private anywhere`, () => {
      const envelope = sandboxEnvelope(ROOT, role);
      if (!envelope) throw new Error(`no fixture for ${role}`);
      expect(envelope.build.name).toBe(DEV_HERO_NAMES[role]);
      expect(envelope.build.player ?? "").toBe("");
      expect(privateTermPaths(envelope, ROOT)).toEqual([]);
      expect(privateTermPaths(sandboxMemberCharacter(envelope), ROOT)).toEqual([]);
      // Independent of the pack's term list (which misses some roles): no word of any
      // fixture's real character or player name survives anywhere in the envelope.
      expect(identityWordPaths(envelope, ROOT)).toEqual([]);
      expect(identityWordPaths(sandboxMemberCharacter(envelope), ROOT)).toEqual([]);
    });
  }

  it("the check finds a private term, in any case, and names only its path", () => {
    // A term read from the pack at run time: never written in public code.
    const [term] = JSON.parse(
      readFileSync(resolve(ROOT, "content-pack/private-terms.json"), "utf8")
    ) as string[];
    if (!term) throw new Error("no private term");
    const found = privateTermPaths(
      { build: { notes: `a ${term.toUpperCase()} b`, list: ["clean"] } },
      ROOT
    );
    expect(found).toEqual(["build/notes"]);
    expect(privateTermPaths({ build: { notes: "clean" } }, ROOT)).toEqual([]);
  });

  it("the identity check finds a real name's word in any kept field, by path only", () => {
    // A word of a real character name, read from the pack at run time.
    const file = teamFixturePath(ROOT, "rogue");
    if (!file) throw new Error("no rogue fixture");
    const fixture = JSON.parse(readFileSync(file, "utf8")) as { build: { name: string } };
    const word = fixture.build.name.split(/\s+/).find((w) => w.length >= 4);
    if (!word) throw new Error("no name word");
    expect(
      identityWordPaths({ build: { equipment: [{ notes: `x ${word} y` }] } }, ROOT)
    ).toEqual(["build/equipment/*/notes"]);
    expect(identityWordPaths({ build: { notes: "clean" } }, ROOT)).toEqual([]);
  });
});
