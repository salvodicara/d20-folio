import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dryRunMigration, recoverMigration } from "@/lib/identity/migration";
type Source = { build: Record<string, unknown>; state: Record<string, unknown> };
const source = JSON.stringify({
  schema: 3,
  build: {
    name: "One",
    race: "elf",
    classes: [{ classId: "wizard", level: 2 }],
    abilities: { STR: 10 },
    lore: { backstory: "private story" },
    spells: [{ srdId: "light", notes: "private note", future: { secret: true } }],
    future: { private: true },
  },
  state: { currency: { gp: 20 }, notes: "private", unknown: { secret: true } },
  extension: "recover me",
});
describe("copy migration privacy boundary", () => {
  it("projects known mechanical facts, preserves all original bytes privately and is deterministic", () => {
    const result = dryRunMigration(source, { ownerUid: "owner", id: "one" });
    expect(result.character.sheet.build.spells).toEqual([{ srdId: "light" }]);
    expect(result.character.sheet.state).toEqual({ currency: { gp: 20 } });
    expect(result.character.sheet.build).not.toHaveProperty("lore");
    expect(result.character.sheet.build).not.toHaveProperty("future");
    expect(recoverMigration(result.archive)).toBe(source);
    expect(dryRunMigration(source, { ownerUid: "owner", id: "one" })).toEqual(result);
  });
  it("rejects malformed identity and preserves nested unknowns only in the recovery archive", () => {
    expect(() =>
      dryRunMigration('{"schema":3,"build":{"name":2}}', { ownerUid: "owner", id: "one" })
    ).toThrow();
  });
  it("keeps actual background ASI, species feat, tool choice, spell overrides and current resource counts", () => {
    const data = JSON.parse(source) as Source;
    data.build.asi = { background: { DEX: 2, WIS: 1 } };
    data.build.originFeats = { species: "alert" };
    data.build.toolChoices = { "class:bard::tool-slot-0": ["lute"] };
    data.build.spellcasting = {
      ability: "INT",
      saveDCOverride: 17,
      slotMaxOverrides: { "1": 5 },
    };
    data.state.grantBundleChoices = { "elf-lineage": "high-elf" };
    data.state.trackers = { "feature-one": { used: 2, rolls: [3, null] } };
    const projected = dryRunMigration(JSON.stringify(data), {
      ownerUid: "owner",
      id: "one",
    }).character.sheet;
    expect(projected.build.asi).toEqual(data.build.asi);
    expect(projected.build.originFeats).toEqual(data.build.originFeats);
    expect(projected.build.toolChoices).toEqual(data.build.toolChoices);
    expect(projected.build.spellcasting).toEqual(data.build.spellcasting);
    expect(projected.state.grantBundleChoices).toEqual(data.state.grantBundleChoices);
    expect(projected.state.trackers).toEqual(data.state.trackers);
  });
  const dir = "content-pack/fixtures/team";
  it.skipIf(!existsSync(dir))(
    "roundtrips the six supplied fixture copies byte-for-byte without changing originals",
    () => {
      const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
      expect(files).toHaveLength(6);
      for (const [index, file] of files.entries()) {
        const original = readFileSync(`${dir}/${file}`, "utf8");
        const result = dryRunMigration(original, {
          ownerUid: "fixture-owner",
          id: `fixture-${index}`,
        });
        expect(recoverMigration(result.archive)).toBe(original);
        expect(result.character.currentAssignment).toBeNull();
        expect(result.character.sheet.build.classes).toBeDefined();
        const expected = JSON.parse(original) as Source;
        delete expected.build.player;
        delete expected.build.quote;
        delete expected.build.lore;
        delete expected.state.log;
        for (const key of ["spells", "features", "weapons", "equipment"]) {
          for (const entry of (expected.build[key] ?? []) as Record<string, unknown>[])
            delete entry.notes;
        }
        // Compare structure rather than source object insertion order.
        expect(result.character.sheet.build).toEqual(expected.build);
        expect(result.character.sheet.state).toEqual(expected.state);
        expect(readFileSync(`${dir}/${file}`, "utf8")).toBe(original);
      }
    }
  );
});
