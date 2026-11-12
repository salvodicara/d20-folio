/// <reference types="node" />
/**
 * A runtime overlay never reaches the stored play state, and never asks for a write on
 * its own. The overlays are the session fields `types/character.ts` documents as never
 * serialized (read from source, so a new one must be listed); each must stay out of the
 * codec's stored keys, out of the stored play state, and out of `storedSessionChanged`.
 * (Rehearsal 2026-11-06: re-projecting the campaign clock after every snapshot rewrote
 * the same ~25 KB `combat/state` over and over.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { KNOWN_STATE_KEYS, sessionToPlayStateV1 } from "@/lib/session-state-codec";
import { RUNTIME_SESSION_OVERLAYS, storedSessionChanged } from "@/lib/session-overlays";
import { REPO_ROOT } from "./__helpers__/static-import-graph";

/** The SessionState fields whose doc comment says the codec never serializes them. */
function documentedOverlays(): string[] {
  const src = readFileSync(join(REPO_ROOT, "src/types/character.ts"), "utf8");
  const body = src.match(/export interface SessionState \{([\s\S]*?)\n\}/)?.[1] ?? "";
  return [...body.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*\n\s*(\w+)\??:/g)]
    .filter((m) => /never serializ/i.test(m[1] ?? ""))
    .map((m) => m[2] as string);
}

const VALUES: Record<(typeof RUNTIME_SESSION_OVERLAYS)[number], unknown> = {
  partyAura: { from: "pal", name: "Aldric", bonus: 3 },
  encounterEffects: [],
  tableRules: {},
  campaignClock: { campaignId: "camp", clock: { minute: 90 } },
};

describe("runtime session overlays", () => {
  it("are exactly the fields the session type documents as never serialized", () => {
    expect([...RUNTIME_SESSION_OVERLAYS].sort()).toEqual(documentedOverlays().sort());
  });

  it.each(RUNTIME_SESSION_OVERLAYS)("%s is not a stored key", (key) => {
    expect(KNOWN_STATE_KEYS).not.toContain(key);
  });

  it.each(RUNTIME_SESSION_OVERLAYS)("%s leaves the stored play state as it is", (key) => {
    const bare = MOCK_CHARACTER.session;
    const overlaid = { ...bare, [key]: VALUES[key] };
    expect(JSON.stringify(sessionToPlayStateV1(overlaid))).toBe(
      JSON.stringify(sessionToPlayStateV1(bare))
    );
  });

  it.each(RUNTIME_SESSION_OVERLAYS)("%s alone asks for no write", (key) => {
    const prev = MOCK_CHARACTER.session;
    expect(storedSessionChanged(prev, { ...prev, [key]: VALUES[key] })).toBe(false);
  });

  it("a stored field changing does", () => {
    const prev = MOCK_CHARACTER.session;
    expect(storedSessionChanged(prev, { ...prev, exhaustion: 1 })).toBe(true);
  });
});
