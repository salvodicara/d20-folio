/**
 * library-codec — the homebrew-library document's PURE, TOTAL parser.
 *
 * Pins the fail-closed contract `library-io.ts`'s `subscribeLibrary` relies on: a
 * malformed element never trims-and-continues (that would be permanently baked in by
 * the very next unrelated full-doc `writeLibrary`); the WHOLE document quarantines
 * with a typed `CodecFailure` naming the exact path, mirroring `character-codec.ts`.
 */
import { describe, expect, it } from "vitest";
import { parseLibraryEntries } from "@/lib/library-codec";

const GOOD_EQUIPMENT = {
  id: "boots-1",
  savedAt: 1_700_000_000_000,
  kind: "equipment",
  item: { custom: true, name: "Boots", instanceId: "boots-1" },
};

const GOOD_MONSTER = {
  id: "m1",
  savedAt: 1_700_000_000_000,
  kind: "monster",
  item: { name: "Ashmaw Hound", ac: 14, maxHp: 33 },
};

describe("parseLibraryEntries — fail-closed, never a per-entry drop", () => {
  it("a good list parses", () => {
    const result = parseLibraryEntries({ entries: [GOOD_EQUIPMENT, GOOD_MONSTER] });
    expect(result).toEqual({ ok: true, entries: [GOOD_EQUIPMENT, GOOD_MONSTER] });
  });

  it("an absent `entries` field means no library saved yet (ok, empty)", () => {
    expect(parseLibraryEntries({})).toEqual({ ok: true, entries: [] });
  });

  it("a PRESENT but non-array `entries` quarantines at the `entries` path", () => {
    expect(parseLibraryEntries({ entries: "nope" })).toEqual({
      ok: false,
      failure: { code: "invalid-build", path: "entries" },
    });
    expect(parseLibraryEntries({ entries: null })).toEqual({
      ok: false,
      failure: { code: "invalid-build", path: "entries" },
    });
  });

  it("a sheet-kind entry without a valid instanceId quarantines at item.instanceId", () => {
    const result = parseLibraryEntries({
      entries: [{ ...GOOD_EQUIPMENT, item: { custom: true, name: "Boots" } }],
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[0].item.instanceId" },
    });
  });

  it("an INVALID instanceId (not just a missing one) also quarantines", () => {
    const result = parseLibraryEntries({
      entries: [
        { ...GOOD_EQUIPMENT, item: { custom: true, name: "Boots", instanceId: "" } },
      ],
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[0].item.instanceId" },
    });
  });

  it("a monster entry needs no instanceId — parses OK", () => {
    const result = parseLibraryEntries({ entries: [GOOD_MONSTER] });
    expect(result).toEqual({ ok: true, entries: [GOOD_MONSTER] });
  });

  it("a non-record entry quarantines at its own index", () => {
    expect(parseLibraryEntries({ entries: [null] })).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[0]" },
    });
    expect(parseLibraryEntries({ entries: ["nope"] })).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[0]" },
    });
  });

  it("an unknown kind quarantines at the `.kind` path", () => {
    const result = parseLibraryEntries({
      entries: [{ ...GOOD_EQUIPMENT, kind: "potion" }],
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[0].kind" },
    });
  });

  it("a missing/empty id, a non-numeric savedAt, and a missing item all quarantine", () => {
    expect(parseLibraryEntries({ entries: [{ ...GOOD_EQUIPMENT, id: "" }] })).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[0].id" },
    });
    expect(
      parseLibraryEntries({ entries: [{ ...GOOD_EQUIPMENT, savedAt: "yesterday" }] })
    ).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[0].savedAt" },
    });
    expect(
      parseLibraryEntries({ entries: [{ id: "x", savedAt: 1, kind: "spell" }] })
    ).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[0].item" },
    });
  });

  it("the FIRST malformed element in a mixed list is the one quarantine names", () => {
    const result = parseLibraryEntries({
      entries: [GOOD_EQUIPMENT, GOOD_MONSTER, { ...GOOD_EQUIPMENT, kind: "potion" }],
    });
    expect(result).toEqual({
      ok: false,
      failure: { code: "malformed-entry", path: "entries[2].kind" },
    });
  });
});
