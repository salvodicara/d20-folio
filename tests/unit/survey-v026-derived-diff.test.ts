/**
 * The read-only v0.26 derived-sheet diff: the probe reads the sheet's numbers from the
 * stored documents, the comparison counts identical and differing characters, tags a
 * diff «expected» when a named rules fix explains it, and never writes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import { asRaceId } from "@/data/srd-names";
import type { CharacterDoc } from "@/types/character";
import { probeCorpus, type ProbeSource } from "../../scripts/lib/derived-probe";
import {
  fieldPattern,
  readOnlyFirestore,
  surveyDerivedDiff,
} from "../../scripts/survey-v026-derived-diff";
import { makeCharacterDoc } from "./_helpers";

function family(doc: CharacterDoc, path: string): ProbeSource[] {
  const envelope = serializeCharacterEnvelope(doc);
  return [
    { path, data: { schema: 3, build: envelope.build, state: {} } },
    {
      path: `${path}/combat/state`,
      data: { playState: sessionToPlayStateV1(doc.session), round: 1 },
    },
  ];
}

const drow = (level: number) =>
  makeCharacterDoc(
    { race: asRaceId("elf"), classId: "bard", level, savingThrows: ["DEX", "CHA"] },
    { grantBundleChoices: { "elf-lineage": "drow" } }
  );

describe("the probe reads the sheet's numbers from the stored documents", () => {
  it("AC, max HP, saves, skills, resources and spells, for each character", async () => {
    const results = await probeCorpus([
      ...family(drow(3), "users/u1/characters/a"),
      ...family(
        makeCharacterDoc({ classId: "fighter", level: 5 }),
        "users/u1/characters/b"
      ),
    ]);
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(typeof result.stats.ac).toBe("number");
      expect(typeof result.stats.hpMax).toBe("number");
      expect(Object.keys(result.stats).some((k) => k.startsWith("checks."))).toBe(true);
    }
    const [bard] = results;
    if (!bard?.ok) throw new Error("bard unreadable");
    expect(
      Object.keys(bard.stats).some((k) => /^resources\..*faerie-fire\.total$/.test(k))
    ).toBe(true);
    expect(Object.keys(bard.stats).some((k) => k.startsWith("spells.bard."))).toBe(true);
  });

  it("a family with no play state is unreadable, not a crash", async () => {
    const parentOnly = family(drow(1), "users/u1/characters/a").slice(0, 1);
    const [result] = await probeCorpus(parentOnly);
    expect(result).toEqual({ ok: false, reason: "play-state" });
  });
});

describe("the comparison", () => {
  it("the same engine twice: every character identical", async () => {
    const corpus = [
      ...family(drow(3), "users/u1/characters/a"),
      ...family(drow(5), "users/u2/characters/b"),
    ];
    const survey = surveyDerivedDiff(
      await probeCorpus(corpus),
      await probeCorpus(corpus)
    );
    expect(survey).toMatchObject({
      characters: 2,
      identical: 2,
      differing: 0,
      withUnexpected: 0,
    });
  });

  it("a rules fix shows as an expected diff, named; any other change as unexpected", async () => {
    const [current] = await probeCorpus(family(drow(1), "users/u1/characters/a"));
    if (!current?.ok) throw new Error("unreadable");
    // The deployed release showed a level-1 Drow's Faerie Fire charge (#905 took it away).
    const faerie = "resources.elf-elven-lineage:faerie-fire.total";
    const baselineFixed = { ok: true as const, stats: { ...current.stats, [faerie]: 1 } };
    const expected = surveyDerivedDiff([baselineFixed], [current]);
    expect(expected.byFix).toEqual({ "#905": 1 });
    expect(expected.withUnexpected).toBe(0);
    expect(expected.byField).toEqual({
      "resources.*.total": { removed: { expected: 1, unexpected: 0 } },
    });

    const baselineAc = {
      ok: true as const,
      stats: { ...current.stats, ac: Number(current.stats.ac) + 1 },
    };
    const unexpected = surveyDerivedDiff([baselineAc], [current]);
    expect(unexpected.withUnexpected).toBe(1);
    expect(unexpected.byField).toEqual({
      ac: { changed: { expected: 0, unexpected: 1 } },
    });
  });

  it("reports counts and folded field patterns only: no ids, no values", () => {
    expect(fieldPattern("resources.elf-elven-lineage:faerie-fire.total")).toBe(
      "resources.*.total"
    );
    expect(fieldPattern("actions.weapon-longsword.toHit")).toBe("actions.*.toHit");
    const survey = surveyDerivedDiff(
      [{ ok: true, stats: { ac: 14, "actions.weapon-dagger.toHit": 4 } }],
      [{ ok: true, stats: { ac: 15, "actions.weapon-dagger.toHit": 5 } }]
    );
    const text = JSON.stringify(survey);
    expect(text).not.toMatch(/dagger|\b1[45]\b/);
  });
});

describe("it never writes", () => {
  it("the Firestore it gets answers one read and refuses everything else", async () => {
    const reads: string[] = [];
    const db = readOnlyFirestore({
      collectionGroup: (name: string) => ({
        get: () => {
          reads.push(name);
          return Promise.resolve({ docs: [] });
        },
      }),
    }) as {
      collectionGroup: (n: string) => Record<string, () => unknown>;
      [k: string]: unknown;
    };
    await db.collectionGroup("characters").get?.();
    expect(reads).toEqual(["characters"]);
    for (const write of [
      "doc",
      "batch",
      "runTransaction",
      "bulkWriter",
      "collection",
      "recursiveDelete",
    ]) {
      expect(() => db[write]).toThrow(/read-only/);
    }
    expect(() => db.collectionGroup("characters").where).toThrow(/read-only/);
  });

  it("the survey and its probe never reach a document reference, a batch or a transaction", () => {
    // Every Firestore write needs one of these; the survey only reads snapshots' data.
    for (const file of [
      "scripts/survey-v026-derived-diff.ts",
      "scripts/lib/derived-probe.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /\.doc\(|\.collection\(|\.ref\b|writeBatch|runTransaction|bulkWriter|\.batch\(|recursiveDelete/
      );
    }
  });
});
