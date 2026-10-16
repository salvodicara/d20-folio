/**
 * Who gets the private pack, and how it arrives (`src/platform/pack-source.ts`).
 *
 * Owner rule (2026-10-16): an allowlisted player always plays with the full pack.
 * If the download fails they see "loading content" and the app keeps retrying; it
 * never falls back to a stripped sheet. After the first load it works offline.
 */
import { describe, expect, it, vi } from "vitest";
import { createPackSource, type PackSourceDeps } from "@/platform/pack-source";
import { buildPackFiles, type PackSource } from "@/data/pack-wire";

const SOURCE: PackSource = {
  exports: {
    packSpells: [{ id: "probe-spell" }],
    packFeats: [],
    packRaces: [],
    packBackgroundsRaw: [],
    packBackgroundEquipment: {},
    packMagicItems: [],
    packManeuvers: [],
    packBeasts: [],
    packMonsters: [],
    packMonsterArt: {},
    packItemArt: {},
    packClassTables: [],
    packClassFeatures: [],
    packSubclasses: {},
    packQuickbuildPresets: {},
    packGrantExtensions: {},
    packSrdEn: {},
    srdOverlay: {},
    uiOverlay: {},
  } as unknown as PackSource["exports"],
  enProse: { spell: { "probe-spell": { description: "Probes." } } },
  srd: { it: { spell: { "probe-spell": { name: "Sonda" } } } },
  lazySrd: { en: { monster: { probe: { name: "Probe" } } } },
};
const PACK = buildPackFiles(SOURCE);

function deps(overrides: Partial<PackSourceDeps> = {}) {
  const cache = new Map<string, string>();
  const base: PackSourceDeps = {
    version: PACK.version,
    currentUser: () =>
      Promise.resolve({ uid: "u1", hasPackClaim: () => Promise.resolve(true) }),
    download: vi.fn((name: string) => {
      const text = PACK.files[name];
      return text === undefined
        ? Promise.reject(new Error(`no file ${name}`))
        : Promise.resolve(text);
    }),
    cache: {
      get: (key) => Promise.resolve(cache.get(key)),
      put: (key, text) => {
        cache.set(key, text);
        return Promise.resolve();
      },
    },
    wait: () => Promise.resolve(),
    showWaiting: vi.fn(),
  };
  return { ...base, ...overrides, store: cache };
}

describe("runtime pack source", () => {
  it("gives a signed-out visitor no pack and downloads nothing", async () => {
    const d = deps({ currentUser: () => Promise.resolve(null) });
    expect(await createPackSource(d).loadCore()).toBeNull();
    expect(d.download).not.toHaveBeenCalled();
  });

  it("gives an account without the claim no pack, after one fresh look at its claims", async () => {
    const hasPackClaim = vi.fn(() => Promise.resolve(false));
    const d = deps({ currentUser: () => Promise.resolve({ uid: "u1", hasPackClaim }) });
    expect(await createPackSource(d).loadCore()).toBeNull();
    expect(hasPackClaim.mock.calls).toEqual([[false], [true]]);
    expect(d.download).not.toHaveBeenCalled();
  });

  it("loads the pack for an account whose claim arrives on the fresh look", async () => {
    const hasPackClaim = vi.fn((fresh: boolean) => Promise.resolve(fresh));
    const d = deps({ currentUser: () => Promise.resolve({ uid: "u1", hasPackClaim }) });
    const core = await createPackSource(d).loadCore();
    expect(core?.packSpells).toEqual([{ id: "probe-spell" }]);
  });

  it("loads and caches every pack file for an allowlisted account", async () => {
    const d = deps();
    const source = createPackSource(d);
    const core = await source.loadCore();
    expect(core?.packSpells).toEqual([{ id: "probe-spell" }]);
    await source.prefetched;
    expect([...d.store.keys()].filter((key) => key.includes("/")).sort()).toEqual(
      Object.keys(PACK.files)
        .map((name) => `${PACK.version}/${name}`)
        .sort()
    );
  });

  it("works offline from the cache after the first load", async () => {
    const first = deps();
    const online = createPackSource(first);
    await online.loadCore();
    await online.prefetched;

    const offline = deps({
      download: vi.fn(() => Promise.reject(new Error("offline"))),
    });
    for (const [key, text] of first.store) offline.store.set(key, text);
    const source = createPackSource(offline);
    expect((await source.loadCore())?.packSpells).toEqual([{ id: "probe-spell" }]);
    expect(await source.readFile("srd-it.json")).toEqual({
      spell: { "probe-spell": { name: "Sonda" } },
    });
    expect(offline.download).not.toHaveBeenCalled();
  });

  it("keeps retrying a failed download behind a loading notice, never a stripped pack", async () => {
    let failures = 3;
    const download = vi.fn((name: string) =>
      failures-- > 0
        ? Promise.reject(new Error("network"))
        : Promise.resolve(PACK.files[name] ?? "")
    );
    const d = deps({ download });
    const core = await createPackSource(d).loadCore();
    expect(core?.packSpells).toEqual([{ id: "probe-spell" }]);
    expect(d.showWaiting).toHaveBeenNthCalledWith(1, true);
    expect(d.showWaiting).toHaveBeenLastCalledWith(false);
  });

  it("ignores a cached pack from another version", async () => {
    const d = deps();
    d.store.set("0000000000000000/core.json", "{}");
    const core = await createPackSource(d).loadCore();
    expect(core?.packSpells).toEqual([{ id: "probe-spell" }]);
  });

  it("offline with an expired token, trusts what this device last learned about the account", async () => {
    const first = deps();
    const online = createPackSource(first);
    await online.loadCore();
    await online.prefetched;

    const offline = deps({
      currentUser: () =>
        Promise.resolve({
          uid: "u1",
          hasPackClaim: () => Promise.reject(new Error("network")),
        }),
      download: vi.fn(() => Promise.reject(new Error("offline"))),
    });
    for (const [key, text] of first.store) offline.store.set(key, text);
    expect((await createPackSource(offline).loadCore())?.packSpells).toEqual([
      { id: "probe-spell" },
    ]);
  });

  it("offline with an expired token, keeps an account known to lack the claim pack-free", async () => {
    const d = deps({
      currentUser: () =>
        Promise.resolve({
          uid: "u2",
          hasPackClaim: () => Promise.reject(new Error("network")),
        }),
    });
    d.store.set("claim:u2", "no");
    expect(await createPackSource(d).loadCore()).toBeNull();
  });

  it("asks again, behind the notice, when the claim is unknown and never seen here", async () => {
    let failures = 2;
    const d = deps({
      currentUser: () =>
        Promise.resolve({
          uid: "u3",
          hasPackClaim: () =>
            failures-- > 0 ? Promise.reject(new Error("network")) : Promise.resolve(true),
        }),
    });
    expect((await createPackSource(d).loadCore())?.packSpells).toEqual([
      { id: "probe-spell" },
    ]);
    expect(d.showWaiting).toHaveBeenNthCalledWith(1, true);
    expect(d.showWaiting).toHaveBeenLastCalledWith(false);
  });
});
