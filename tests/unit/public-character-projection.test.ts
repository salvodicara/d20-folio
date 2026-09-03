import { describe, expect, it } from "vitest";
import { makeCharacterDoc } from "@tests/unit/_helpers";
import {
  buildPublicCharacterProjection,
  buildPublicCharacterProjectionFromStoredParent,
  parsePublicCharacterProjection,
  publicPortraitPath,
} from "@/lib/public-character-projection";

function source() {
  const doc = makeCharacterDoc();
  return {
    ...doc,
    id: "hero one",
    shared: true,
    portraitUrl: "https://storage.example/private-token",
    portraitCrop: { x: 10, y: 12, width: 60, height: 70 },
    session: {
      ...doc.session,
      hp: { current: 2, temp: 7 },
      notes: "private campaign plan",
      initiative: "23",
      conditions: ["Poisoned"],
    },
  };
}

describe("public character projection", () => {
  it("constructs an exact allowlist and reconstructs default play state", async () => {
    const projection = await buildPublicCharacterProjection(
      source(),
      new Date("2026-08-12T10:00:00Z")
    );

    expect(Object.keys(projection).sort()).toEqual(
      [
        "publicSchema",
        "schema",
        "build",
        "cache",
        "status",
        "hasPortrait",
        "portraitCrop",
        "sourceUpdatedAt",
      ].sort()
    );
    expect(projection).not.toHaveProperty("state");
    expect(projection).not.toHaveProperty("shared");
    expect(projection).not.toHaveProperty("playStateVersion");
    expect(projection).not.toHaveProperty("portraitUrl");
    expect(JSON.stringify(projection)).not.toContain("private campaign plan");
    expect(JSON.stringify(projection)).not.toContain("private-token");

    const parsed = await parsePublicCharacterProjection(
      "owner/unsafe",
      "hero one",
      projection
    );
    expect(parsed.shared).toBe(true);
    expect(parsed.session.notes).toBe("");
    expect(parsed.session.initiative).toBe("");
    expect(parsed.session.conditions).toEqual([]);
    expect(parsed.session.hp).toEqual({
      current: projection.cache.hpMax,
      temp: 0,
    });
    expect(parsed.portraitUrl).toBe("/og/portrait/owner%2Funsafe/hero%20one.jpeg");
  });

  it("derives portrait presence and never accepts a persisted URL", async () => {
    const withoutPortrait = { ...source(), portraitUrl: null, portraitCrop: null };
    const projection = await buildPublicCharacterProjection(
      withoutPortrait,
      new Date("2026-08-12T10:00:00Z")
    );
    expect(projection.hasPortrait).toBe(false);
    expect(projection.portraitCrop).toBeNull();
    expect(
      (await parsePublicCharacterProjection("u1", "c1", projection)).portraitUrl
    ).toBeNull();
    expect(publicPortraitPath("u1", "c1")).toBe("/og/portrait/u1/c1.jpeg");
  });

  it("rejects extra or missing projection and cache keys", async () => {
    const projection = await buildPublicCharacterProjection(
      source(),
      new Date("2026-08-12T10:00:00Z")
    );
    await expect(
      parsePublicCharacterProjection("u1", "c1", { ...projection, state: {} })
    ).rejects.toThrow("projection shape");

    const { speed: _speed, ...missingCacheKey } = projection.cache;
    void _speed;
    await expect(
      parsePublicCharacterProjection("u1", "c1", {
        ...projection,
        cache: missingCacheKey,
      })
    ).rejects.toThrow("cache");
  });

  it("preserves session-dependent cache facts while exposing built/default play", async () => {
    const activeAid = {
      ...source(),
      character: {
        ...source().character,
        spells: [{ srdId: "aid", prepared: true }],
      },
      session: {
        ...source().session,
        activeFeatures: ["spell-aid"],
      },
    };
    const projection = await buildPublicCharacterProjection(
      activeAid,
      new Date("2026-08-12T10:00:00Z")
    );
    const parsed = await parsePublicCharacterProjection("u1", "c1", projection);

    expect(projection.cache.hpMax).toBe(activeAid.character.hp.max + 5);
    expect(parsed.session.hp.current).toBe(activeAid.character.hp.max);
  });

  it("copies exact stored exposure facts for metadata-only updates", async () => {
    const projection = await buildPublicCharacterProjection(
      source(),
      new Date("2026-08-12T10:00:00Z")
    );
    const storedCache = { ...projection.cache, hpMax: projection.cache.hpMax + 5 };
    const next = buildPublicCharacterProjectionFromStoredParent(
      {
        schema: 3,
        build: projection.build,
        state: {},
        cache: storedCache,
        status: "active",
        portraitUrl: "https://private.example/token",
        portraitCrop: projection.portraitCrop,
      },
      { status: "retired" },
      new Date("2026-08-12T11:00:00Z")
    );

    expect(next.cache).toEqual(storedCache);
    expect(next.cache).not.toBe(storedCache);
    expect(next.status).toBe("retired");
    expect(next).not.toHaveProperty("portraitUrl");
  });

  it("rejects a non-canonical stored parent", () => {
    expect(() =>
      buildPublicCharacterProjectionFromStoredParent(
        { schema: 2, build: {}, state: {}, cache: {} },
        {},
        new Date()
      )
    ).toThrow("parent envelope");
  });

  it("rejects malformed or non-canonical facts", async () => {
    const projection = await buildPublicCharacterProjection(
      source(),
      new Date("2026-08-12T10:00:00Z")
    );
    await expect(
      parsePublicCharacterProjection("u1", "c1", {
        ...projection,
        cache: { ...projection.cache, hpMax: -1 },
      })
    ).rejects.toThrow("cache");
    await expect(
      parsePublicCharacterProjection("u1", "c1", {
        ...projection,
        build: {},
      })
    ).rejects.toThrow("Invalid public character");
    await expect(
      parsePublicCharacterProjection("u1", "c1", {
        ...projection,
        portraitCrop: { x: 100, y: 0, width: 20, height: 20 },
      })
    ).rejects.toThrow("portrait crop");
  });
});
