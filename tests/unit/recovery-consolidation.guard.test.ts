/**
 * Recovery consolidation guard (owner 2026-06-08).
 *
 * The owner asked the genuine question: why does the tracker `Recovery` type
 * model BOTH `"short-rest"` and `"short-or-long-rest"` when they are effectively
 * the same? They ARE the same in this engine — a short rest recovers a short-rest
 * resource, and a long rest (a superset of a short rest) recovers everything — so
 * `"short-or-long-rest"` carried zero behavioural difference. We consolidated all
 * SRD data onto the canonical `"short-rest"`.
 *
 * This guard pins the consolidation two ways:
 *   1. No `src/data/**` file may declare `recovery: "short-or-long-rest"` — the
 *      canonical value is `"short-rest"`. (Fails if the alias is reintroduced.)
 *   2. The alias is STILL accepted on import (`isRecovery`) and STILL treated
 *      identically by the short-rest consumer (`getShortRestRecoveries`), because
 *      an old exported/stored document may carry it on a custom feature or a
 *      `trackerOverride`. Back-compat must never break.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { isRecovery } from "@/lib/character-io";
import { getShortRestRecoveries } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";
import { SRC_ROOT, srcFiles, readSrc } from "./__helpers__/src-files";

const DATA_DIR = resolve(SRC_ROOT, "data");

describe("recovery consolidation", () => {
  it("no src/data file declares the legacy `short-or-long-rest` recovery value", () => {
    const offenders: string[] = [];
    for (const file of srcFiles({ under: DATA_DIR, exts: [".ts"] })) {
      const src = readSrc(file);
      // Match the VALUE in a recovery position, not the (allowed) doc-comment
      // mentions in types.ts. Any `recovery: "short-or-long-rest"` is a real use.
      if (/recovery:\s*"short-or-long-rest"/.test(src)) {
        offenders.push(file.slice(file.indexOf("src/data")));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still ACCEPTS the legacy alias on import (back-compat)", () => {
    // An old exported doc can carry it on a custom feature / trackerOverride.
    expect(isRecovery("short-or-long-rest")).toBe(true);
    expect(isRecovery("short-rest")).toBe(true);
  });

  it("treats a legacy `short-or-long-rest` tracker exactly like `short-rest`", () => {
    // Drive the consumer through a per-character `trackerOverride` on a REAL SRD
    // tracker feature (Bardic Inspiration). An imported legacy doc can carry the
    // alias there; the consumer must still surface it for short-rest recovery.
    const make = (recovery: "short-rest" | "short-or-long-rest" | "long-rest") =>
      ({
        id: "t",
        character: {
          level: 1,
          features: [
            { srdId: "bard-bardic-inspiration", trackerOverrides: { recovery } },
          ],
          // `spells` is non-optional on CharacterData — the consumer now also walks
          // it for per-spell free-cast recovery, so the fixture must carry it.
          spells: [],
        },
        session: { trackers: {} },
      }) as unknown as CharacterDoc;

    const canonical = getShortRestRecoveries(make("short-rest"));
    const legacy = getShortRestRecoveries(make("short-or-long-rest"));
    const longRest = getShortRestRecoveries(make("long-rest"));

    // The legacy alias and the canonical value surface the IDENTICAL tracker set…
    expect([...legacy.keys()]).toEqual([...canonical.keys()]);
    expect(legacy.has("bard-bardic-inspiration")).toBe(true);
    // …while a genuine long-rest tracker is excluded (control: the alias is not a
    // no-op match — it genuinely means "recovers on a short rest").
    expect(longRest.has("bard-bardic-inspiration")).toBe(false);
  });
});
