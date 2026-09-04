/**
 * `readLease` — shape-tolerant reader of the character parent doc's `lease` field
 * (design §5.2). Pure: no Firebase mock needed. `joinTable`/`leaveTable` are batch writers
 * proven end to end by the emulator suite (task 8); this file covers only the pure reader.
 */
import { describe, expect, it } from "vitest";
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
