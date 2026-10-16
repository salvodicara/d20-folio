/**
 * The runtime content pack's wire format (`src/data/pack-wire.ts`).
 *
 * The production build no longer bundles the private pack: allowlisted accounts
 * download it as JSON after sign-in. These cases come from the pack itself, so a
 * pack export that does not survive the trip (a new export, a cycle, a function)
 * fails here before an allowlisted player ever sees a stripped sheet.
 */
import { describe, expect, it } from "vitest";
import * as composedPack from "@pack";
import * as packEmpty from "@/data/pack-empty";
import {
  CORE_KEYS,
  NOT_IN_RUNTIME_PACK,
  buildPackFiles,
  decodeJson,
  encodeJson,
} from "@/data/pack-wire";
import { collectPackSource as composedSource } from "../../scripts/pack/collect-pack-source";

describe("runtime pack wire format", () => {
  it("serves every pack export, or names why it stays out", () => {
    const covered = new Set<string>([...CORE_KEYS, ...NOT_IN_RUNTIME_PACK]);
    const missing = Object.keys(packEmpty).filter((key) => !covered.has(key));
    expect(missing).toEqual([]);
  });

  it("round-trips every core export of the composed pack unchanged", async () => {
    const source = await composedSource();
    const core = decodeJson(buildPackFiles(source).files["core.json"] ?? "") as Record<
      string,
      unknown
    >;
    for (const key of CORE_KEYS) expect(core[key], key).toEqual(source.exports[key]);
    expect(source.exports.packSpells).toBe(composedPack.packSpells);
  });

  it("round-trips the lazy prose and every locale's catalogues", async () => {
    const source = await composedSource();
    const { files, index } = buildPackFiles(source);
    expect(decodeJson(files["en-prose.json"] ?? "")).toEqual(source.enProse);
    for (const locale of index.srd) {
      expect(decodeJson(files[`srd-${locale}.json`] ?? "")).toEqual(source.srd[locale]);
    }
    for (const [locale, kind] of index.lazySrd) {
      expect(decodeJson(files[`lazy-${kind}-${locale}.json`] ?? "")).toEqual(
        source.lazySrd[locale]?.[kind]
      );
    }
  });

  it("keeps a self-referencing object (a companion listed among its own variants)", () => {
    const beast: { id: string; variants?: unknown[] } = { id: "land" };
    beast.variants = [beast, { id: "sea" }];
    const decoded = decodeJson(encodeJson({ features: [{ companion: beast }] })) as {
      features: Array<{ companion: { id: string; variants: unknown[] } }>;
    };
    const companion = decoded.features[0]?.companion;
    if (!companion) throw new Error("companion lost");
    expect(companion.variants[0]).toBe(companion);
    expect(companion.variants[1]).toEqual({ id: "sea" });
  });

  it("keeps an object shared by two parents as two equal copies", () => {
    const shared = { id: "x" };
    const decoded = decodeJson(encodeJson({ a: shared, b: [shared] })) as {
      a: unknown;
      b: unknown[];
    };
    expect(decoded.a).toEqual(shared);
    expect(decoded.b[0]).toEqual(shared);
  });

  it("names the pack version after its content", async () => {
    const source = await composedSource();
    const first = buildPackFiles(source);
    expect(buildPackFiles(source).version).toBe(first.version);
    expect(first.version).toMatch(/^[0-9a-f]{16}$/);
    const changed = buildPackFiles({
      ...source,
      exports: { ...source.exports, packManeuvers: [], packSpells: [] },
      enProse: { spell: { probe: { description: "changed" } } },
    });
    expect(changed.version).not.toBe(first.version);
  });
});
