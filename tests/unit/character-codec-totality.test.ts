/**
 * Codec totality (design §5.5, ADR-0007 "property: codec totality"):
 *  - parse(serialize(x)) ≡ x for generated envelopes carrying unknown keys at every level;
 *  - a hostile entry quarantines the document with a typed path — never a shorter array.
 * Seeded generator, no dependency (same approach as tests/unit/combat/fold.test.ts).
 */
import { describe, expect, it } from "vitest";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
  KNOWN_BUILD_KEYS,
} from "@/lib/character-codec";
import { KNOWN_STATE_KEYS } from "@/lib/session-state-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JSON_VALUES: unknown[] = [
  null,
  0,
  -1.5,
  "s",
  "",
  true,
  [],
  [1, "a", null],
  { deep: { k: [true] } },
];
function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)] as T;
}
function unknownKey(rng: () => number, taken: ReadonlySet<string>): string {
  let key = `zz_${Math.floor(rng() * 1e6)}`;
  while (taken.has(key)) key = `${key}_`;
  return key;
}

type Envelope = {
  schema: number;
  build: Record<string, unknown>;
  state: Record<string, unknown>;
};
const BASES: Envelope[] = [
  MOCK_CHARACTER,
  ...Object.values(DEV_SCENARIOS).map(buildScenario),
].map((doc: CharacterDoc) => structuredClone(serializeCharacterEnvelope(doc)));
const COLLECTIONS = ["spells", "weapons", "equipment"] as const;

function withUnknownKeys(rng: () => number, env: Envelope): Envelope {
  const out = structuredClone(env);
  out.build[unknownKey(rng, new Set(KNOWN_BUILD_KEYS))] = pick(rng, JSON_VALUES);
  out.state[unknownKey(rng, new Set(KNOWN_STATE_KEYS))] = pick(rng, JSON_VALUES);
  for (const coll of COLLECTIONS) {
    const list = out.build[coll];
    if (!Array.isArray(list) || list.length === 0) continue;
    const entry = list[Math.floor(rng() * list.length)] as Record<string, unknown>;
    entry[unknownKey(rng, new Set(Object.keys(entry)))] = pick(rng, JSON_VALUES);
  }
  const customs = out.build.customs as
    | { features?: Record<string, unknown>[] }
    | undefined;
  const firstCustomFeature = customs?.features?.[0];
  if (firstCustomFeature)
    firstCustomFeature[unknownKey(rng, new Set(Object.keys(firstCustomFeature)))] = pick(
      rng,
      JSON_VALUES
    );
  return out;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

describe("codec totality", () => {
  it("round-trips generated envelopes with unknown keys at every level (200 seeds)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const env = withUnknownKeys(rng, pick(rng, BASES));
      const parsed = parseCharacterEnvelope(env.build, env.state);
      expect(parsed.ok, `seed ${seed}: ${parsed.ok ? "" : parsed.error}`).toBe(true);
      if (!parsed.ok) continue;
      const again = serializeCharacterEnvelope({
        ...MOCK_CHARACTER,
        character: parsed.character,
        session: parsed.session,
      });
      expect(sortKeys(again), `seed ${seed}`).toEqual(sortKeys(env));
    }
  });

  it("the canonical fixtures carry no unknown keys (the closed worlds are complete)", () => {
    for (const env of BASES) {
      const parsed = parseCharacterEnvelope(env.build, env.state);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.character.unknown).toBeUndefined();
      expect(parsed.session.unknown).toBeUndefined();
      for (const ref of [
        ...parsed.character.spells,
        ...parsed.character.weapons,
        ...parsed.character.equipment,
        ...parsed.character.features,
      ]) {
        expect((ref as { unknown?: unknown }).unknown).toBeUndefined();
      }
    }
  });

  /** Plant `bad` at a real index of `coll` on a canonical envelope, then parse. */
  function parseWithEntry(
    coll: (typeof COLLECTIONS)[number],
    index: number,
    bad: unknown
  ): { at: number; parsed: ReturnType<typeof parseCharacterEnvelope> } {
    const env = structuredClone(BASES[0] as Envelope);
    if (!Array.isArray(env.build[coll])) env.build[coll] = [];
    const list = env.build[coll] as unknown[];
    if (list.length === 0) list.push({ srdId: "dagger", quantity: 1 });
    const at = index % list.length;
    list[at] = bad;
    return { at, parsed: parseCharacterEnvelope(env.build, env.state) };
  }

  it("a hostile entry quarantines the document with its path, never a shorter array", () => {
    // Each of these breaks a REQUIRED field (or is not an entry at all), so the
    // failure names the entry itself.
    const hostile: unknown[] = [
      null,
      7,
      "str",
      [],
      {},
      { custom: true },
      { srdId: 3 },
      { custom: true, name: 1 },
    ];
    for (const coll of COLLECTIONS) {
      for (const [i, bad] of hostile.entries()) {
        const { at, parsed } = parseWithEntry(coll, i, bad);
        expect(parsed.ok).toBe(false);
        if (parsed.ok) continue;
        expect(parsed.failure).toEqual({
          code: "malformed-entry",
          path: `build.${coll}[${at}]`,
        });
      }
    }
    const env = structuredClone(BASES[0] as Envelope);
    env.build.customs = {
      features: [
        { custom: true, title: "T", emoji: "x", source: "s", contentBlocks: [1] },
      ],
    };
    const parsed = parseCharacterEnvelope(env.build, env.state);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.failure.path).toBe("build.customs.features[0].contentBlocks[0]");
  });

  it("a wrong-typed OPTIONAL entry field fails closed at the FIELD's path", () => {
    // `notes` is optional on every SRD ref — a stored non-string is a corruption,
    // and dropping it would silently erase the player's note on the next write.
    for (const coll of COLLECTIONS) {
      const { at, parsed } = parseWithEntry(coll, 0, { srdId: "x", notes: 5 });
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.failure).toEqual({
        code: "malformed-entry",
        path: `build.${coll}[${at}].notes`,
      });
    }
  });

  it("a non-array collection is a build failure with its path", () => {
    const env = structuredClone(BASES[0] as Envelope);
    env.build.equipment = { not: "an array" };
    const parsed = parseCharacterEnvelope(env.build, env.state);
    expect(parsed).toMatchObject({
      ok: false,
      failure: { code: "invalid-build", path: "build.equipment" },
    });
  });
});
