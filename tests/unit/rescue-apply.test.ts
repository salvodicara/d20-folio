// @vitest-environment jsdom
/**
 * #1320 — Apply / Discard a rescue copy. Apply upgrades the copy through each shape
 * step it is behind (one pure function per step, the same one its migration uses),
 * reads it through the normal codec, snapshots the current sheet first (so Apply can be
 * undone), and writes once through the whole-sheet ceremony. Discard leaves nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  snapshots: [] as unknown[],
  replaced: [] as unknown[],
  offline: false,
}));
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/firestore", () => ({
  saveCharacterSnapshot: (_uid: string, _id: string, data: unknown) => {
    h.snapshots.push(data);
    // Offline, a write settles only when the server answers: never, here.
    return h.offline ? new Promise(() => {}) : Promise.resolve("snap-1");
  },
  replaceCharacterState: (...args: unknown[]) => {
    h.replaced.push(args);
    return h.offline ? new Promise(() => {}) : Promise.resolve();
  },
}));

import {
  applyRescueCopy,
  discardRescueCopy,
  upgradeRescueCopy,
} from "@/features/character/rescue-apply";
import { keepRescueCopy, readRescueCopy, type RescueCopy } from "@/lib/local-draft";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import { CHARACTER_SCHEMA, PLAY_STATE_VERSION } from "@/lib/shape-numbers";
import type { CharacterDoc } from "@/types/character";

const server: CharacterDoc = {
  ...structuredClone(MOCK_CHARACTER),
  id: "c1",
  revision: 7,
};

function copyOf(quote: string, schema = CHARACTER_SCHEMA): RescueCopy {
  const env = serializeCharacterEnvelope({
    ...server,
    character: { ...server.character, quote },
  });
  return {
    savedAt: 1000,
    schema,
    playVersion: PLAY_STATE_VERSION,
    build: env.build,
    state: env.state,
  };
}

beforeEach(() => {
  localStorage.clear();
  h.snapshots.length = 0;
  h.replaced.length = 0;
  h.offline = false;
});

describe("the upgrade seam", () => {
  it("a copy in this client's shape passes through unchanged", () => {
    const copy = copyOf("same");
    expect(upgradeRescueCopy(copy, [])).toEqual({ build: copy.build, state: copy.state });
  });

  it("a copy one step behind runs that step's upgrade", () => {
    const copy = copyOf("old", CHARACTER_SCHEMA - 1);
    const step = {
      domain: "character" as const,
      from: CHARACTER_SCHEMA - 1,
      upgrade: (c: {
        build: Record<string, unknown>;
        state: Record<string, unknown>;
      }) => ({
        ...c,
        build: { ...c.build, upgraded: true },
      }),
    };
    expect(upgradeRescueCopy(copy, [step])?.build.upgraded).toBe(true);
  });

  it("a copy behind with no step to bring it forward cannot be applied", () => {
    expect(upgradeRescueCopy(copyOf("old", CHARACTER_SCHEMA - 1), [])).toBeNull();
  });
});

describe("Apply and Discard", () => {
  it("Apply snapshots the current sheet first, writes the kept edit once, drops the copy", async () => {
    keepRescueCopy("u1", "c1", copyOf("kept edit"));
    const kept = readRescueCopy("u1", "c1", 2000);
    if (!kept) throw new Error("no copy kept");
    const outcome = await applyRescueCopy("u1", server, kept);
    expect(outcome).toBe("applied");
    expect(h.snapshots).toHaveLength(1);
    expect((h.snapshots[0] as { reason: string }).reason).toBe("rescue");
    expect(h.replaced).toHaveLength(1);
    const [uid, id, character, , baseRevision] = h.replaced[0] as [
      string,
      string,
      CharacterDoc["character"],
      unknown,
      number,
    ];
    expect([uid, id, character.quote, baseRevision]).toEqual([
      "u1",
      "c1",
      "kept edit",
      7,
    ]);
    expect(readRescueCopy("u1", "c1", 2000)).toBeNull();
  });

  it("a copy the codec cannot read is not applied and is kept", async () => {
    const broken = { ...copyOf("x"), build: { classes: "not a list" } };
    keepRescueCopy("u1", "c1", broken);
    expect(await applyRescueCopy("u1", server, broken)).toBe("unreadable");
    expect(h.replaced).toHaveLength(0);
    expect(readRescueCopy("u1", "c1", 2000)).not.toBeNull();
  });

  it("Discard leaves nothing behind", () => {
    keepRescueCopy("u1", "c1", copyOf("x"));
    discardRescueCopy("u1", "c1");
    expect(readRescueCopy("u1", "c1", 2000)).toBeNull();
    expect(h.replaced).toHaveLength(0);
  });
});

describe("Apply and Discard retire the edit trace too", () => {
  it("Discard drops the trace, so the next gate cannot bring the edit back", async () => {
    const { keepUnackedSave, readUnackedSave } = await import("@/lib/local-draft");
    keepUnackedSave("u1", "c1", { character: {}, session: {}, revision: 9 });
    keepRescueCopy("u1", "c1", copyOf("x"));
    discardRescueCopy("u1", "c1");
    expect(readUnackedSave("u1", "c1")).toBeNull();
  });

  it("Apply drops the trace", async () => {
    const { keepUnackedSave, readUnackedSave } = await import("@/lib/local-draft");
    keepUnackedSave("u1", "c1", { character: {}, session: {}, revision: 9 });
    const copy = copyOf("applied");
    keepRescueCopy("u1", "c1", copy);
    await applyRescueCopy("u1", server, copy);
    expect(readUnackedSave("u1", "c1")).toBeNull();
  });
});

describe("a build-only copy never touches the play state", () => {
  it("Apply sets the kept build, keeps the server's play state, and writes no whole sheet", async () => {
    const { useCharacterStore } = await import("@/stores/characterStore");
    useCharacterStore.setState({ character: server, readonly: false });
    const copy = { ...copyOf("build only edit"), part: "build" as const };
    keepRescueCopy("u1", "c1", copy);
    expect(await applyRescueCopy("u1", server, copy)).toBe("applied");
    expect(h.snapshots).toHaveLength(1);
    expect(h.replaced).toHaveLength(0);
    const shown = useCharacterStore.getState().character;
    expect(shown?.character.quote).toBe("build only edit");
    expect(shown?.session).toEqual(server.session);
  });
});

describe("Apply offline", () => {
  it("queues the snapshot then the sheet and returns at once (the writes wait in order)", async () => {
    h.offline = true;
    const copy = copyOf("offline apply");
    keepRescueCopy("u1", "c1", copy);
    const outcome = await Promise.race([
      applyRescueCopy("u1", server, copy),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 3_000)),
    ]);
    expect(outcome).toBe("applied");
    expect(h.snapshots).toHaveLength(1);
    expect(h.replaced).toHaveLength(1);
  });
});
