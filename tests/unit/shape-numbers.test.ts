/**
 * #1320 — the shape numbers this client knows, and the raw "is it newer?" checks the
 * subscription runs BEFORE any parse (an old parser must never read a newer shape).
 */
import { describe, expect, it } from "vitest";
import {
  CHARACTER_SCHEMA,
  PLAY_STATE_VERSION,
  characterShapeTooNew,
  playShapeTooNew,
} from "@/lib/shape-numbers";
import { SCHEMA_VERSION } from "@/lib/character-codec";

describe("shape numbers", () => {
  it("are the codecs' own numbers", () => {
    expect(CHARACTER_SCHEMA).toBe(SCHEMA_VERSION);
    expect(PLAY_STATE_VERSION).toBe(1);
  });

  it("a parent is too new only when its schema is a number above this client's", () => {
    expect(characterShapeTooNew({ schema: CHARACTER_SCHEMA + 1 })).toBe(true);
    expect(characterShapeTooNew({ schema: CHARACTER_SCHEMA })).toBe(false);
    expect(characterShapeTooNew({ schema: CHARACTER_SCHEMA - 1 })).toBe(false);
    expect(characterShapeTooNew({})).toBe(false);
    expect(characterShapeTooNew({ schema: "9" })).toBe(false);
  });

  it("a play document is too new only when playState.version is above this client's", () => {
    expect(playShapeTooNew({ playState: { version: PLAY_STATE_VERSION + 1 } })).toBe(
      true
    );
    expect(playShapeTooNew({ playState: { version: PLAY_STATE_VERSION } })).toBe(false);
    expect(playShapeTooNew({ playState: {} })).toBe(false);
    expect(playShapeTooNew({})).toBe(false);
  });
});
