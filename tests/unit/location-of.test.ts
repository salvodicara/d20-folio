/**
 * Where a character is (edge-case M19, docs/architecture/2026-11-dm-state-and-roster.md):
 * an optional plane or extradimensional space on its session, the same tag a roster
 * entry carries. It round-trips the stored play state, a malformed one reads as
 * absent, and `sharesPlane` answers from it (untagged: "yes", today's behaviour).
 */
import { describe, expect, it } from "vitest";

import { locationOf, parseCreatureLocation } from "@/lib/familiar-ids";
import { sharesPlane } from "@/lib/familiar";
import {
  parsePersistedPlayStateV1,
  sessionToPlayStateV1,
} from "@/lib/session-state-codec";
import { makeCharacterDoc } from "./_helpers";

const session = (location?: unknown) =>
  makeCharacterDoc({}, location === undefined ? {} : ({ location } as never)).session;

describe("a character's location", () => {
  it("is absent until set", () => {
    expect(locationOf(session())).toBeUndefined();
  });

  it("round-trips the stored play state", () => {
    const stored = sessionToPlayStateV1(session({ plane: "feywild" }));
    expect(stored.state.location).toEqual({ plane: "feywild" });
    const read = parsePersistedPlayStateV1(stored);
    expect(read.ok && locationOf(read.session)).toEqual({ plane: "feywild" });
  });

  it("inside a container is on no plane", () => {
    expect(parseCreatureLocation({ inside: "bag-1", plane: "material" })).toEqual({
      plane: "material",
      inside: "bag-1",
    });
    const inBag = locationOf(session({ inside: "bag-1" }));
    expect(sharesPlane(inBag, { plane: "material" })).toBe(false);
    expect(sharesPlane(inBag, { inside: "bag-1" })).toBe(true);
  });

  it("a malformed location reads as absent", () => {
    expect(parseCreatureLocation({ plane: 7 })).toBeUndefined();
    expect(parseCreatureLocation({ plane: "x".repeat(129) })).toBeUndefined();
    expect(parseCreatureLocation("feywild")).toBeUndefined();
  });

  it("untagged on either side: the same plane, as today", () => {
    expect(sharesPlane(locationOf(session()), { plane: "feywild" })).toBe(true);
  });
});
