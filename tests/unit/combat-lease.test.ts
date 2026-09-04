/**
 * `readLease` — shape-tolerant reader of the character parent doc's `lease` field
 * (design §5.2) — and `leaveTable`'s personal WRITE-BACK (stage 6 design §5): which document the
 * batch writes, with which verb, and with which payload.
 *
 * `readLease` itself is pure, but `@/lib/combat-lease` also exports the `joinTable`/`leaveTable`
 * batch writers (proven end to end by the emulator suite) and transitively imports
 * `./combat-io`, so the module graph reaches `firebase/firestore` at import time. Mock it here —
 * never move `readLease` to another module to dodge this — so this file stays Firebase-free in
 * CI (tests/unit/pure-modules-guard.test.ts).
 *
 * The `firebase/firestore` fake is a RECORDER, not a stub: `doc(...)` returns the joined path,
 * `writeBatch` a batch that appends every call to a list. That is enough to assert the one thing
 * a unit can assert about a write seam — WHICH document is written, with which verb and payload
 * — while the emulator lane proves the same batch against the real rules.
 */
import { describe, expect, it, vi } from "vitest";

/** Every `set`/`update` the batch under test recorded, in order. */
interface Write {
  readonly verb: "set" | "update";
  readonly path: string;
  readonly data: unknown;
}
const writes: Write[] = [];
let committed = 0;

vi.mock("firebase/firestore", () => ({
  arrayUnion: vi.fn((...values: unknown[]) => ({ arrayUnion: values })),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  deleteField: vi.fn(() => ({ deleteField: true })),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => segments.join("/")),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: (path: string, data: unknown) => writes.push({ verb: "set", path, data }),
    update: (path: string, data: unknown) => writes.push({ verb: "update", path, data }),
    commit: () => {
      committed += 1;
      return Promise.resolve();
    },
  })),
}));

import { leaveTable, readLease, type PersonalWriteBack } from "@/lib/combat-lease";
import { encodeLegacyWriteBack } from "@/lib/combat-state-writeback";
import type { CombatState } from "@/types/combat-state";
import { testEntity } from "@tests/unit/combat/__helpers__/entities";

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

// ── `leaveTable`'s personal write-back (stage 6 design §5) ──────────────────

const ENTITY = testEntity({ id: "pc-marco", kind: "pc", hp: 12, tempHp: 3 });

/** A live legacy document: the combat trio the encounter owns, plus the play session it does
 *  not. `playState` is what the sanctioned encoder refuses to write without. */
const PREVIOUS: CombatState = {
  hp: { current: 25, temp: 0 },
  conditions: ["poisoned"],
  initiativeRoll: 12,
  deathSaves: { successes: 0, failures: 0 },
  round: 4,
  recentActions: [],
  playState: { version: 1, state: { exhaustion: 2 } },
};

/** The only way to build a write-back at all: project, then encode. */
function writeBack(previous: CombatState = PREVIOUS): PersonalWriteBack {
  return { kind: "document", data: encodeLegacyWriteBack(previous, ENTITY, []) };
}

async function leave(personal: PersonalWriteBack): Promise<void> {
  writes.length = 0;
  committed = 0;
  await leaveTable({
    db: {} as never,
    uid: "u1",
    characterId: "c1",
    campaignId: "camp-1",
    encounterId: "enc-1",
    entity: ENTITY,
    leave: { id: "leave-1", seq: { ms: 1, counter: 0, by: "u1" } },
    personal,
  });
}

const PERSONAL = "users/u1/characters/c1/combat/state";
const CHARACTER = "users/u1/characters/c1";
const ENCOUNTER = "campaigns/camp-1/encounters/enc-1";

function writeTo(path: string): Write {
  const write = writes.find((candidate) => candidate.path === path);
  if (write === undefined) {
    throw new Error(`no write to ${path} (got ${writes.map((w) => w.path).join(", ")})`);
  }
  return write;
}

describe("leaveTable's personal write-back", () => {
  it("appends the leave action and clears the lease", async () => {
    await leave(writeBack());
    expect(writeTo(ENCOUNTER).verb).toBe("update");
    expect(writeTo(CHARACTER).data).toEqual({ lease: { deleteField: true } });
    expect(committed).toBe(1);
  });

  it("sets the ENCODED document VERBATIM", async () => {
    const personal = writeBack();
    await leave(personal);
    const write = writeTo(PERSONAL);
    expect(write.verb).toBe("set");
    expect(write.data).toBe(personal.data);
    // What the encoder guarantees and a hand-rolled object would not: the fight's trio, the
    // play session preserved, and the stamp every other writer emits.
    expect(write.data).toMatchObject({
      hp: { current: 12, temp: 3 },
      conditions: [],
      deathSaves: { successes: 0, failures: 0 },
      round: 4,
      playState: { version: 1, state: { exhaustion: 2 } },
      updatedAt: "SERVER_TIMESTAMP",
    });
  });

  it("cannot be built at all from a document the read edge would refuse forever", () => {
    const { playState: _playState, ...orphan } = PREVIOUS;
    void _playState;
    expect(() => writeBack(orphan as CombatState)).toThrow(
      "Invalid combat play state: missing"
    );
  });

  /**
   * The personal path ALIASES the live `CombatState` the old sheet owns, so there is no shape
   * here that could write an `Encounter` onto it — a document `parseCombatState` would refuse
   * forever. The `encounter` variant, and the `table:sync` action it would append, arrive with
   * the personal aggregate at item 8.
   */
  it("writes nothing but the encoded legacy document — never an Encounter envelope", async () => {
    await leave(writeBack());
    const written = JSON.stringify(writeTo(PERSONAL).data);
    expect(written).not.toContain("sync");
    expect(written).not.toContain("schema");
    expect(written).not.toContain("host");
    expect(writes.filter((write) => write.path === PERSONAL)).toHaveLength(1);
  });
});
