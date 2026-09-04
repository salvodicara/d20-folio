/**
 * `readLease` — shape-tolerant reader of the character parent doc's `lease` field
 * (design §5.2). `readLease` itself is pure, but `@/lib/combat-lease` also exports the
 * `joinTable`/`leaveTable` batch writers (proven end to end by the emulator suite, task 8) and
 * transitively imports `./combat-io`, so the module graph reaches `firebase/firestore` at
 * import time. Mock it here — never move `readLease` to another module to dodge this — so this
 * file stays Firebase-free in CI (tests/unit/pure-modules-guard.test.ts).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  arrayUnion: vi.fn(),
  deleteField: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

import { readLease } from "@/lib/combat-lease";

describe("readLease", () => {
  it("reads a well-formed lease", () => {
    expect(
      readLease({ lease: { campaignId: "camp-1", encounterId: "enc-1", epoch: 3 } })
    ).toEqual({ campaignId: "camp-1", encounterId: "enc-1", epoch: 3 });
  });

  it("returns null when the field is absent", () => {
    expect(readLease({})).toBeNull();
    expect(readLease({ attachedCampaignId: "camp-1" })).toBeNull();
  });

  it("returns null for non-record top-level input", () => {
    expect(readLease(null)).toBeNull();
    expect(readLease(undefined)).toBeNull();
    expect(readLease("nope")).toBeNull();
    expect(readLease(42)).toBeNull();
  });

  it("returns null when lease itself is not a record", () => {
    expect(readLease({ lease: null })).toBeNull();
    expect(readLease({ lease: "camp-1" })).toBeNull();
    expect(readLease({ lease: 3 })).toBeNull();
  });

  it("returns null when a part is missing", () => {
    expect(
      readLease({ lease: { campaignId: "camp-1", encounterId: "enc-1" } })
    ).toBeNull();
    expect(readLease({ lease: { campaignId: "camp-1", epoch: 3 } })).toBeNull();
    expect(readLease({ lease: { encounterId: "enc-1", epoch: 3 } })).toBeNull();
  });

  it("returns null when a part has the wrong type", () => {
    expect(
      readLease({ lease: { campaignId: 1, encounterId: "enc-1", epoch: 3 } })
    ).toBeNull();
    expect(
      readLease({ lease: { campaignId: "camp-1", encounterId: 1, epoch: 3 } })
    ).toBeNull();
    expect(
      readLease({ lease: { campaignId: "camp-1", encounterId: "enc-1", epoch: "3" } })
    ).toBeNull();
  });

  it("returns null when epoch is not finite", () => {
    expect(
      readLease({
        lease: { campaignId: "camp-1", encounterId: "enc-1", epoch: Number.NaN },
      })
    ).toBeNull();
    expect(
      readLease({
        lease: {
          campaignId: "camp-1",
          encounterId: "enc-1",
          epoch: Number.POSITIVE_INFINITY,
        },
      })
    ).toBeNull();
  });

  it("accepts epoch 0", () => {
    expect(
      readLease({ lease: { campaignId: "camp-1", encounterId: "enc-1", epoch: 0 } })
    ).toEqual({ campaignId: "camp-1", encounterId: "enc-1", epoch: 0 });
  });
});
