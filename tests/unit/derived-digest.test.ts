/**
 * The before/after derived-sheet harness (ADR-0010, M0): a stored sheet goes through
 * the real read path and the real derived sheet, and comes out as one hash per derived
 * section. The same engine twice gives the same digest; a moved rule names the sheet
 * and the section; the counts-only report never carries a sheet path or a hash.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canonical,
  compareDigests,
  countsReport,
  digestDocuments,
  hasChanges,
  namedReport,
  parseDigest,
  readStoredDocuments,
  SECTIONS,
  stableText,
  type Digest,
  type StoredDocument,
} from "../../scripts/lib/derived-digest";

const FIXTURES = "tests/fixtures/derived-sheets";
const PINNED = "tests/fixtures/derived-sheets.digest.json";
const REGENERATE =
  "node --import ./scripts/alias-loader.mjs scripts/derived-digest.ts digest " +
  `${FIXTURES} --out ${PINNED}`;

const fixtures = (): Promise<StoredDocument[]> => readStoredDocuments(FIXTURES);

function fighter(documents: StoredDocument[]): StoredDocument[] {
  return documents.filter((d) => d.path.includes("/fighter-5-armoured"));
}

/** A deep copy of `documents` with the fighter's parent build changed by `edit`. */
function editFighterBuild(
  documents: StoredDocument[],
  edit: (build: Record<string, unknown>) => void
): StoredDocument[] {
  const copy = structuredClone(documents);
  const parent = copy.find((d) => d.path.endsWith("/fighter-5-armoured"));
  if (!parent) throw new Error("no fighter fixture");
  edit(parent.data.build as Record<string, unknown>);
  return copy;
}

describe("the canonical form", () => {
  it("sorts keys, sorts Sets, keys id rows, drops display text and Dates", () => {
    expect(
      canonical({
        b: 1,
        a: new Set(["z", "y"]),
        label: "Longsword",
        nameKey: "x",
        when: new Date(0),
        rows: [
          { id: "two", total: 2 },
          { id: "one", total: 1 },
        ],
        missing: undefined,
      })
    ).toEqual({
      a: ["y", "z"],
      b: 1,
      nameKey: "x",
      rows: { one: { id: "one", total: 1 }, two: { id: "two", total: 2 } },
    });
    expect(JSON.stringify(canonical({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}');
  });
});

describe("the digest of the fixture sheets", () => {
  // One fixture (the barbarian) carries the Firestore-only fields a live dump has:
  // timestamps as plain JSON objects, the roster cache, the share and status flags.
  it("covers every fixture, readable, with every section", async () => {
    const digest = await digestDocuments(await fixtures(), false);
    const sheets = Object.values(digest.sheets);
    expect(sheets).toHaveLength(5);
    for (const sheet of sheets) {
      if ("unreadable" in sheet) throw new Error(`unreadable: ${sheet.unreadable}`);
      expect(Object.keys(sheet.sections)).toEqual([...SECTIONS]);
    }
  });

  it("the same engine twice: identical digests, zero changes", async () => {
    const documents = await fixtures();
    const first = await digestDocuments(documents, false);
    const second = await digestDocuments(structuredClone(documents), false);
    expect(stableText(second)).toBe(stableText(first));
    const comparison = compareDigests(first, second);
    expect(hasChanges(comparison)).toBe(false);
    expect(countsReport(comparison).changed).toBe(0);
  });

  it("matches the pinned digest (a moved derived rule shows here)", async () => {
    const pinned = parseDigest(JSON.parse(readFileSync(PINNED, "utf8")));
    const current = await digestDocuments(await fixtures(), pinned.composed);
    const comparison = compareDigests(pinned, current);
    // The SRD fixtures digest the same with and without the pack.
    expect(
      hasChanges(comparison),
      `${namedReport(comparison)}If the change is intended, regenerate:\n  ${REGENERATE}`
    ).toBe(false);
  });
});

describe("the comparison names the sheet and the section", () => {
  it("armour taken off moves the fighter's AC and its explanation, nothing else", async () => {
    const documents = await fixtures();
    const before = await digestDocuments(documents, false);
    const after = await digestDocuments(
      editFighterBuild(documents, (build) => {
        build.equipment = [];
      }),
      false
    );
    const comparison = compareDigests(before, after);
    expect(comparison.changed).toEqual({
      "users/fixtures/characters/fighter-5-armoured": ["ac", "breakdowns"],
    });
    expect(namedReport(comparison)).toContain(
      "changed      users/fixtures/characters/fighter-5-armoured: ac, breakdowns"
    );
  });

  it("a sheet on one side only, and a sheet that stops reading", async () => {
    const documents = await fixtures();
    const before = await digestDocuments(documents, false);
    const after = await digestDocuments(
      documents.filter(
        (d) =>
          !d.path.includes("/multiclass") &&
          d.path !== "users/fixtures/characters/fighter-5-armoured/combat/state"
      ),
      false
    );
    const comparison = compareDigests(before, after);
    expect(comparison.onlyBefore).toEqual(["users/fixtures/characters/multiclass"]);
    expect(comparison.unreadable).toEqual({
      "users/fixtures/characters/fighter-5-armoured": {
        before: null,
        after: "missing-combat-state",
      },
    });
    expect(hasChanges(comparison)).toBe(true);
  });

  it("a sheet unreadable on both sides is not a pass", async () => {
    const documents = fighter(await fixtures()).filter((d) => !d.path.endsWith("/state"));
    const digest = await digestDocuments(documents, false);
    const comparison = compareDigests(digest, digest);
    expect(comparison).toMatchObject({ sheets: 1, compared: 0, unchanged: 0 });
    expect(hasChanges(comparison)).toBe(true);
    expect(countsReport(comparison)).toMatchObject({
      unreadableBefore: 1,
      unreadableAfter: 1,
      unreadableChanged: 0,
    });
  });

  it("refuses two digests taken with different pack composition", async () => {
    const documents = fighter(await fixtures());
    const srd = await digestDocuments(documents, false);
    const composed: Digest = { ...srd, composed: true };
    expect(() => compareDigests(srd, composed)).toThrow(/composed/);
  });
});

describe("the counts-only report for live sheets", () => {
  it("counts sheets per section and never prints a sheet path or a hash", async () => {
    const documents = await fixtures();
    const before = await digestDocuments(documents, false);
    const after = await digestDocuments(
      editFighterBuild(documents, (build) => {
        build.equipment = [];
      }),
      false
    );
    const report = countsReport(compareDigests(before, after));
    expect(report).toMatchObject({ sheets: 5, compared: 5, unchanged: 4, changed: 1 });
    expect(report.bySection.ac).toBe(1);
    expect(report.bySection.spells).toBe(0);
    expect(Object.keys(report.bySection)).toEqual([...SECTIONS]);
    const text = stableText(report);
    for (const [key, sheet] of Object.entries({ ...before.sheets, ...after.sheets })) {
      expect(text).not.toContain(key);
      expect(text).not.toContain(key.split("/").at(-1));
      if ("sheet" in sheet) {
        expect(text).not.toContain(sheet.sheet);
        for (const hash of Object.values(sheet.sections))
          expect(text).not.toContain(hash);
      }
    }
  });
});
