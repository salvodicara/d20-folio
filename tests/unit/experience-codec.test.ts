/**
 * Optional `experience` on the stored build: round-trips when present, absent when
 * never set, and a malformed stored value is kept verbatim (never exposed, never
 * dropped). The first case also holds for a reader that predates the field: it
 * treats `build.experience` as an unknown key and writes it back unchanged.
 */
import { describe, expect, it } from "vitest";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function envelope(doc: CharacterDoc) {
  return structuredClone(serializeCharacterEnvelope(doc));
}

function reparse(build: Record<string, unknown>, state: Record<string, unknown>) {
  const parsed = parseCharacterEnvelope(build, state);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
}

function rewrite(build: Record<string, unknown>, state: Record<string, unknown>) {
  const parsed = reparse(build, state);
  return serializeCharacterEnvelope({
    ...MOCK_CHARACTER,
    character: parsed.character,
    session: parsed.session,
  });
}

describe("character codec — experience", () => {
  it("a stored build with experience round-trips byte-identically", () => {
    const env = envelope(MOCK_CHARACTER);
    env.build.experience = 2450;
    expect(JSON.stringify(rewrite(env.build, env.state))).toBe(JSON.stringify(env));
  });

  it("reads experience onto the character and writes it back", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      character: { ...MOCK_CHARACTER.character, experience: 2450 },
    };
    const env = envelope(doc);
    expect(env.build.experience).toBe(2450);
    expect(reparse(env.build, env.state).character.experience).toBe(2450);
  });

  it("a character that never set XP stores no experience key", () => {
    const env = envelope(MOCK_CHARACTER);
    expect("experience" in env.build).toBe(false);
    expect(reparse(env.build, env.state).character.experience).toBeUndefined();
  });

  it.each([-5, 1.5, "2450", null])(
    "a malformed stored value (%j) is not read as XP and survives a write",
    (bad) => {
      const env = envelope(MOCK_CHARACTER);
      env.build.experience = bad;
      expect(reparse(env.build, env.state).character.experience).toBeUndefined();
      expect(rewrite(env.build, env.state).build.experience).toEqual(bad);
    }
  );
});
