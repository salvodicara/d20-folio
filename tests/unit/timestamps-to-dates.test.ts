/**
 * timestampsToDates — the generic deep `Timestamp → Date` read-boundary
 * normalizer (the campaign-dates hotfix). Asserts EVERY Timestamp anywhere in a
 * tree (top-level, array-nested, map-nested, deeply nested) becomes a `Date`,
 * that `Date`s/primitives/null pass through, and that the input is not mutated.
 */
import { describe, it, expect } from "vitest";
import { timestampsToDates } from "@/lib/timestamps-to-dates";

/** A faithful Firestore `Timestamp` double: an object with a `toDate()` method
 *  whose constructor name is "Timestamp" (matches the duck-typed detector). */
class FakeTimestamp {
  ms: number;
  constructor(ms: number) {
    this.ms = ms;
  }
  toDate(): Date {
    return new Date(this.ms);
  }
}

/** Walk a value and collect anything still carrying a `toDate` method (a leaked
 *  Timestamp). Used to assert ZERO survive. */
function findTimestampLike(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (value instanceof Date) return [];
  if (typeof (value as { toDate?: unknown }).toDate === "function") return [path];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findTimestampLike(v, `${path}[${i}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    findTimestampLike(v, `${path}.${k}`)
  );
}

describe("timestampsToDates", () => {
  it("converts a top-level Timestamp to a Date", () => {
    const out = timestampsToDates({ createdAt: new FakeTimestamp(1000) }) as unknown as {
      createdAt: Date;
    };
    expect(out.createdAt).toBeInstanceOf(Date);
    expect(out.createdAt.getTime()).toBe(1000);
  });

  it("converts Timestamps nested in arrays AND maps (what Firestore does NOT)", () => {
    const wire = {
      createdAt: new FakeTimestamp(1),
      sharedNotes: [
        { id: "n1", updatedAt: new FakeTimestamp(2) },
        { id: "n2", updatedAt: new FakeTimestamp(3) },
      ],
      treasuryLog: [{ at: new FakeTimestamp(4) }],
      logs: { uidA: { syncedAt: new FakeTimestamp(5) } },
      deep: { a: { b: [{ c: new FakeTimestamp(6) }] } },
    };
    // The output's static type echoes the (Timestamp-bearing) input, but at
    // runtime every Timestamp is a Date — read through a plain shape to assert it.
    const out = timestampsToDates(wire) as unknown as {
      sharedNotes: Array<{ updatedAt: Date }>;
      treasuryLog: Array<{ at: Date }>;
      logs: { uidA: { syncedAt: Date } };
      deep: { a: { b: Array<{ c: Date }> } };
    };
    // ZERO Timestamp-like values survive anywhere in the tree.
    expect(findTimestampLike(out)).toEqual([]);
    expect(out.sharedNotes[0]?.updatedAt.getTime()).toBe(2);
    expect(out.treasuryLog[0]?.at.getTime()).toBe(4);
    expect(out.logs.uidA.syncedAt.getTime()).toBe(5);
    expect(out.deep.a.b[0]?.c.getTime()).toBe(6);
  });

  it("passes Dates, primitives, null, and missing fields through untouched", () => {
    const d = new Date(42);
    const out = timestampsToDates({
      d,
      s: "x",
      n: 7,
      b: true,
      nul: null,
    }) as Record<string, unknown>;
    expect(out.d).toBeInstanceOf(Date);
    expect((out.d as Date).getTime()).toBe(42);
    expect(out.s).toBe("x");
    expect(out.n).toBe(7);
    expect(out.b).toBe(true);
    expect(out.nul).toBeNull();
  });

  it("does not mutate the input (returns fresh containers)", () => {
    const wire = { notes: [{ at: new FakeTimestamp(9) }] };
    const out = timestampsToDates(wire) as unknown as { notes: Array<{ at: Date }> };
    expect(wire.notes[0]?.at).toBeInstanceOf(FakeTimestamp); // input preserved
    expect(out).not.toBe(wire);
    expect(out.notes[0]?.at.getTime()).toBe(9);
  });
});
