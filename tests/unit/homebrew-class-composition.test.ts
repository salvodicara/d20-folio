import { describe, expect, it } from "vitest";
import { initializeDefinition } from "@/lib/homebrew/model";
import { blankClassLevel } from "@/lib/homebrew/classes";
import { includeOriginDependency } from "@/lib/homebrew/origins";
import { composeSubclassCasting } from "@/lib/homebrew/class-composition";
import type { LibraryVersion, JsonValue } from "@/lib/library/model";

function pair(relationship = "inherit", parentMode = "full") {
  const definition = initializeDefinition("class");
  definition.name = "Keeper";
  definition.payload.data.spellcasting = {
    mode: parentMode,
    ability: parentMode === "none" ? "none" : "wisdom",
    multiclass: {
      contributes: parentMode !== "none" && parentMode !== "pact",
      divisor: 1,
      rounding: "down",
    },
  };
  definition.payload.data.subclassLevels = [3, 6];
  definition.payload.data.progression = [1, 5].map((level) => ({
    ...blankClassLevel(level),
    spellcasting: {
      cantrips: parentMode === "none" ? 0 : 2,
      prepared: parentMode === "none" ? 0 : level + 1,
      known: 0,
      slots: parentMode === "none" || parentMode === "pact" ? [] : [level === 1 ? 2 : 4],
      pactSlots: parentMode === "pact" ? 2 : 0,
      pactLevel: parentMode === "pact" ? 1 : 0,
    },
  })) as unknown as JsonValue;
  const parent: LibraryVersion = {
    schema: 1,
    ownerUid: "owner",
    entryId: "keeper",
    version: 1,
    operationId: "published",
    provenance: null,
    definition,
  };
  const initial = initializeDefinition("subclass");
  initial.name = "Oath";
  const { definition: child, key } = includeOriginDependency(initial, parent);
  child.payload.data.parentClass = { dependency: key, mechanicId: "custom" };
  child.payload.data.castingRelationship = relationship;
  return { parent, child };
}

describe("pinned subclass casting declarations", () => {
  it("inherits the parent's contribution once and carries sparse rows forward without mutation", () => {
    const { child, parent } = pair();
    const before = structuredClone(child);
    const result = composeSubclassCasting(child, parent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.multiclass).toEqual({
      contributes: true,
      divisor: 1,
      rounding: "down",
    });
    expect(result.rows.map((r) => [r.level, r.counts.prepared, r.counts.slots])).toEqual([
      [3, 2, [2]],
      [5, 6, [4]],
    ]);
    expect(child).toEqual(before);
    expect(composeSubclassCasting(child)).toEqual(result);
  });
  it("augments learned counts without doubling slots or contribution at intermediate casting rows", () => {
    const { child } = pair("augment");
    child.payload.data.progression = [3, 4, 6].map((level) => ({
      ...blankClassLevel(level),
      spellcasting: {
        cantrips: 1,
        prepared: level,
        known: 2,
        slots: [],
        pactSlots: 0,
        pactLevel: 0,
      },
    })) as unknown as JsonValue;
    const result = composeSubclassCasting(child);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.rows.map((r) => [
        r.level,
        r.counts.cantrips,
        r.counts.prepared,
        r.counts.slots,
      ])
    ).toEqual([
      [3, 3, 5, [2]],
      [4, 3, 6, [2]],
      [5, 3, 10, [4]],
      [6, 3, 12, [4]],
    ]);
    expect(result.policy.multiclass.divisor).toBe(1);
  });
  it("replaces a noncaster with one third-caster contribution", () => {
    const { child } = pair("replace", "none");
    child.payload.data.spellcasting = {
      mode: "third",
      ability: "intelligence",
      multiclass: { contributes: true, divisor: 3, rounding: "down" },
    };
    child.payload.data.progression = [
      {
        ...blankClassLevel(3),
        spellcasting: {
          cantrips: 2,
          prepared: 0,
          known: 3,
          slots: [2],
          pactSlots: 0,
          pactLevel: 0,
        },
      },
    ] as unknown as JsonValue;
    const result = composeSubclassCasting(child);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy).toMatchObject({ mode: "third", multiclass: { divisor: 3 } });
    expect(result.rows[0]?.counts).toMatchObject({ cantrips: 2, known: 3, slots: [2] });
  });
  it("keeps Pact Magic separate from ordinary multiclass contribution", () => {
    const { child } = pair("inherit", "pact");
    const result = composeSubclassCasting(child);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.multiclass.contributes).toBe(false);
    expect(result.rows[0]?.counts).toMatchObject({
      slots: [],
      pactSlots: 2,
      pactLevel: 1,
    });
  });
  it("rejects another parent owner/version or changed copy rather than composing a lookalike", () => {
    const { child, parent } = pair();
    for (const changed of [
      { ...parent, ownerUid: "other" },
      { ...parent, version: 2 },
      { ...parent, definition: { ...parent.definition, name: "Changed" } },
    ]) {
      expect(composeSubclassCasting(child, changed)).toMatchObject({
        ok: false,
        original: child,
      });
    }
  });
  it("preserves unsupported declarations and invalid first acquisition without projecting", () => {
    const { child } = pair();
    child.payload.data.futureCasting = { secret: "untouched" };
    expect(composeSubclassCasting(child)).toMatchObject({ ok: false, original: child });
    delete child.payload.data.futureCasting;
    child.payload.data.progression = [blankClassLevel(2)] as unknown as JsonValue;
    expect(composeSubclassCasting(child)).toMatchObject({ ok: false });
  });
});

it("accepts unchanged received parent provenance but rejects a changed grant copy", () => {
  const { child, parent } = pair();
  const received = {
    ...structuredClone(parent),
    ownerUid: "recipient",
    entryId: "received",
    version: 1,
    provenance: {
      source: { ownerUid: parent.ownerUid, id: parent.entryId },
      sourceVersion: 1,
      senderUid: "owner",
      offerId: "offer",
      grantId: "grant",
    },
  };
  expect(composeSubclassCasting(child, received).ok).toBe(true);
  received.definition.description = "Changed copy";
  expect(composeSubclassCasting(child, received).ok).toBe(false);
});
it("retains malformed and future parent declarations without inventing a partial policy", () => {
  const { child } = pair();
  const dependencies = child.payload.data.dependencies as Record<
    string,
    { definition: { payload: { data: Record<string, JsonValue> } } }
  >;
  const node = Object.values(dependencies)[0];
  if (!node) throw new Error("Missing fixture parent");
  node.definition.payload.data.futurePolicy = { untouched: true };
  expect(composeSubclassCasting(child)).toMatchObject({ ok: false, original: child });
  delete node.definition.payload.data.futurePolicy;
  node.definition.payload.data.spellcasting = null;
  expect(composeSubclassCasting(child)).toMatchObject({ ok: false, original: child });
});
it("does not alias mutable output back into the pinned input and refuses non-subclasses", () => {
  const { child } = pair();
  const before = structuredClone(child);
  const result = composeSubclassCasting(child);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  result.policy.multiclass.divisor = 9;
  const first = result.rows[0];
  if (!first) throw new Error("Missing composed first level");
  first.counts.slots.push(99);
  result.parent.definition.name = "Mutated view";
  expect(child).toEqual(before);
  expect(composeSubclassCasting(initializeDefinition("class"))).toMatchObject({
    ok: false,
  });
});
