/**
 * The `ogImage` route is anonymously reachable (its `*.run.app` URL + the `/og/**`
 * Hosting rewrite) and does real per-request raster work, so it carries a per-function
 * `maxInstances` cap — the DoS/cost ceiling on a zero-budget project, and the belt that
 * keeps the app UP without reaching for the SAFE-01 billing kill-switch. Asserted on the
 * built endpoint manifest (`__endpoint`), which is where the option lands. The override
 * must apply to THIS route only — the sibling functions keep the package default.
 */
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  ogImage,
  ogShell,
  parsePublicPortraitPath,
  validatePublicCharacterProjection,
} from "./index";

/** The scaling config the SDK bakes onto the exported handler. */
function maxInstances(fn: unknown): unknown {
  return (fn as { __endpoint?: { maxInstances?: unknown } }).__endpoint?.maxInstances;
}

describe("ogImage endpoint carries the DoS/cost cap", () => {
  it("declares maxInstances=3 on the export", () => {
    expect(maxInstances(ogImage)).toBe(3);
  });

  it("caps ONLY ogImage — the override does not leak to sibling functions", () => {
    // `ogShell` sets no per-function cap, so it inherits the (uncapped) global — never 3.
    expect(maxInstances(ogShell)).not.toBe(3);
  });
});

function currentProjectionFixture() {
  const updatedAt = Timestamp.fromMillis(1_755_000_000_000);
  const build = {
    character: {
      name: "Lyra Voss",
      race: "elf",
      classes: [{ classId: "bard", level: 9 }],
    },
  };
  const cache = {
    name: "Lyra Voss",
    ac: 16,
    hpMax: 63,
    speed: "30",
    raceId: "elf",
    classes: [{ classId: "bard", level: 9, subclassId: "lore" }],
  };
  const crop = { x: 5, y: 10, width: 80, height: 80 };
  const parent = {
    shared: true,
    playStateVersion: 1,
    state: {},
    schema: 3,
    build,
    cache,
    status: "active",
    portraitUrl: "gs://private/portrait.jpeg",
    portraitCrop: crop,
    updatedAt,
  };
  const projection = {
    publicSchema: 1,
    schema: 3,
    build,
    cache,
    status: "active",
    hasPortrait: true,
    portraitCrop: crop,
    sourceUpdatedAt: updatedAt,
  };
  return { parent, projection };
}

describe("current public character projection gate", () => {
  it("accepts the exact current v1 projection", () => {
    const { parent, projection } = currentProjectionFixture();
    expect(validatePublicCharacterProjection(parent, projection)).toBe(projection);
  });

  it("rejects a stale projection revision", () => {
    const { parent, projection } = currentProjectionFixture();
    expect(
      validatePublicCharacterProjection(parent, {
        ...projection,
        sourceUpdatedAt: Timestamp.fromMillis(parent.updatedAt.toMillis() - 1),
      })
    ).toBeNull();
  });

  it("rejects malformed exposed values", () => {
    const { parent, projection } = currentProjectionFixture();
    expect(
      validatePublicCharacterProjection(parent, {
        ...projection,
        portraitCrop: { x: 90, y: 0, width: 20, height: 100 },
      })
    ).toBeNull();
  });

  it("rejects extra top-level or cache fields", () => {
    const { parent, projection } = currentProjectionFixture();
    expect(
      validatePublicCharacterProjection(parent, { ...projection, portraitUrl: "secret" })
    ).toBeNull();
    expect(
      validatePublicCharacterProjection(parent, {
        ...projection,
        cache: { ...projection.cache, privateNotes: "secret" },
      })
    ).toBeNull();
  });

  it("rejects an unshared parent", () => {
    const { parent, projection } = currentProjectionFixture();
    expect(
      validatePublicCharacterProjection({ ...parent, shared: false }, projection)
    ).toBeNull();
  });

  it("revokes portrait access until a no-portrait projection matches the new parent", () => {
    const { parent, projection } = currentProjectionFixture();
    const updatedAt = Timestamp.fromMillis(parent.updatedAt.toMillis() + 1);
    const revokedParent = {
      ...parent,
      portraitUrl: null,
      portraitCrop: null,
      updatedAt,
    };
    expect(validatePublicCharacterProjection(revokedParent, projection)).toBeNull();
    expect(
      validatePublicCharacterProjection(revokedParent, {
        ...projection,
        hasPortrait: false,
        portraitCrop: null,
        sourceUpdatedAt: updatedAt,
      })?.hasPortrait
    ).toBe(false);
  });

  it("normalizes an absent private crop when no portrait exists", () => {
    const { parent, projection } = currentProjectionFixture();
    const updatedAt = Timestamp.fromMillis(parent.updatedAt.toMillis() + 1);
    const noPortraitParent = { ...parent, portraitUrl: null, updatedAt } as Record<
      string,
      unknown
    >;
    delete noPortraitParent.portraitCrop;
    expect(
      validatePublicCharacterProjection(noPortraitParent, {
        ...projection,
        hasPortrait: false,
        portraitCrop: null,
        sourceUpdatedAt: updatedAt,
      })
    ).not.toBeNull();
  });
});

describe("public portrait path", () => {
  it("parses exactly one encoded owner and character identity", () => {
    expect(parsePublicPortraitPath("/og/portrait/user%20one/hero%2Eone.jpeg")).toEqual({
      uid: "user one",
      charId: "hero.one",
    });
  });

  it.each([
    "/og/portrait/user/hero.jpg",
    "/og/portrait/user/hero.jpeg/extra",
    "/og/portrait/user%2Fother/hero.jpeg",
    "/og/portrait/user/hero%2Fother.jpeg",
    "/og/portrait/user/%ZZ.jpeg",
  ])("fails shut for %s", (path) => {
    expect(parsePublicPortraitPath(path)).toBeNull();
  });
});
