/**
 * Bulk ZIP export ⇄ import round-trip (owner 2026-06-07).
 *
 * Proves the multi-character backup contract end to end: `buildCharactersZip` packs
 * each selected character as its own `.json` (de-duplicating same-named entries so
 * none clobber another), and `importCharactersFromZip` unpacks the archive and parses
 * every entry back through the SAME importer the single-file path uses — so a roster
 * export re-imports cleanly. Pure (no Firebase, no DOM): we assert on the archive
 * bytes, not a download.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { unzipSync } from "fflate";
import type { CharacterDoc } from "@/types/character";
import { MOCK_CHARACTER } from "@/lib/mock";
import {
  buildCharacterExport,
  buildCharactersZip,
  importCharactersFromZip,
} from "@/lib/character-io";

/**
 * The export's Storage-SDK portrait reader (lazy-imported by
 * `buildCharacterExport`), mocked so this file stays CI-pure (no Firebase env).
 * Portrait-less docs never trigger it; the dropped-portrait tests resolve null
 * (the genuinely unreadable case — offline / object gone).
 */
const portraitToDataUrl = vi.hoisted(() =>
  vi.fn<(url: string) => Promise<string | null>>()
);
vi.mock("@/lib/storage", () => ({ portraitToDataUrl }));

/** The embedded portrait (if any) from an export's JSON — typed so the assertions
 *  don't surface an `any`. */
function embeddedPortrait(json: string): string | undefined {
  const env = JSON.parse(json) as { meta?: { portrait?: string } };
  return env.meta?.portrait;
}

function doc(id: string, name: string): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    id,
    portraitUrl: null, // no portrait → no network fetch in the test
    character: { ...MOCK_CHARACTER.character, name: assertNonEmptyString(name) },
  };
}

describe("bulk ZIP export/import", () => {
  it("packs one .json per character (de-duplicating same-named entries)", async () => {
    const { bytes } = await buildCharactersZip([
      doc("a", "Lyra Voss"),
      doc("b", "Lyra Voss"), // same name → must NOT clobber the first
      doc("c", "Borin Stonefist"),
    ]);
    const names = Object.keys(unzipSync(bytes)).sort();
    expect(names).toEqual([
      "borin-stonefist.d20-folio.json",
      "lyra-voss-2.d20-folio.json",
      "lyra-voss.d20-folio.json",
    ]);
  });

  it("round-trips: every packed character re-imports successfully", async () => {
    const { bytes } = await buildCharactersZip([
      doc("a", "Lyra Voss"),
      doc("c", "Borin Stonefist"),
    ]);
    const file = new File([new Uint8Array(bytes)], "d20-folio-characters.zip", {
      type: "application/zip",
    });
    const results = await importCharactersFromZip(file);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    const importedNames = results
      .map((r) => (r.success ? r.doc.character.name : null))
      .sort();
    expect(importedNames).toEqual(["Borin Stonefist", "Lyra Voss"]);
  });

  it("reports an empty archive (no .json entries) as a single error", async () => {
    // A valid but character-less zip (one stray text file).
    const { zipSync, strToU8 } = await import("fflate");
    const empty = zipSync({ "readme.txt": strToU8("not a character") });
    const file = new File([new Uint8Array(empty)], "empty.zip", {
      type: "application/zip",
    });
    const [first] = await importCharactersFromZip(file);
    expect(first?.success).toBe(false);
    if (first && !first.success) {
      expect(first.error).toMatch(/no character/i);
    }
  });

  it("no portrait → portraitDropped is false (nothing was lost)", async () => {
    const exp = await buildCharacterExport(doc("a", "Lyra Voss"));
    expect(exp.portraitDropped).toBe(false);
    expect(embeddedPortrait(exp.json)).toBeUndefined();
  });

  it("ignores macOS __MACOSX resource-fork entries", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const { bytes: real } = await buildCharactersZip([doc("a", "Lyra Voss")]);
    const [realEntry] = Object.entries(unzipSync(real));
    if (!realEntry) throw new Error("expected exactly one character entry");
    const archive = zipSync({
      [realEntry[0]]: realEntry[1],
      "__MACOSX/._lyra-voss.d20-folio.json": strToU8("junk"),
    });
    const file = new File([new Uint8Array(archive)], "withfork.zip", {
      type: "application/zip",
    });
    const results = await importCharactersFromZip(file);
    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(true);
  });
});

describe("export reports a dropped portrait — never silent (the owner's bug)", () => {
  beforeEach(() => {
    // The Storage read fails (the genuinely unreadable case — offline / object
    // gone). The export must report the drop instead of silently shipping a
    // faceless file (the owner's exact report).
    portraitToDataUrl.mockReset().mockResolvedValue(null);
  });

  function withPortrait(): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      id: "p1",
      portraitUrl:
        "https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg?alt=media&token=t",
      character: { ...MOCK_CHARACTER.character, name: assertNonEmptyString("Faceful") },
    };
  }

  it("had a portraitUrl but the Storage read failed → portraitDropped, yet the file still ships", async () => {
    const exp = await buildCharacterExport(withPortrait());
    expect(exp.portraitDropped).toBe(true);
    // The JSON is still emitted (a faceless export beats a failed export), just
    // without the portrait — and the caller now knows to warn.
    expect(embeddedPortrait(exp.json)).toBeUndefined();
  });

  it("bulk export tallies every character whose portrait dropped", async () => {
    const { portraitsDropped } = await buildCharactersZip([
      withPortrait(),
      doc("b", "No Face"), // no portraitUrl → never counts
      { ...withPortrait(), id: "p2" },
    ]);
    expect(portraitsDropped).toBe(2);
  });
});
