/**
 * #1275: a build write made before the codec modules arrive waits for them; a newer write
 * made meanwhile, once they are in, must NOT overtake it. Overtaking would hand the newer
 * edit the lower generation and the older edit the higher one, so the older content
 * would land last (or the rules would refuse a write as a conflict).
 */
import { describe, expect, it, vi } from "vitest";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "@tests/unit/_helpers";

const h = vi.hoisted(() => ({
  commits: [] as Array<{ revision: unknown; content: string }>,
  cold: true,
  release: null as null | (() => void),
}));

vi.mock("firebase/firestore", () => {
  const ops: Array<Record<string, unknown>> = [];
  return {
    collection: () => ({}),
    doc: (...args: unknown[]) => ({ path: args.slice(1).map(String).join("/") }),
    serverTimestamp: () => "server-ts",
    writeBatch: () => {
      ops.length = 0;
      return {
        set: () => undefined,
        update: (_ref: unknown, data: Record<string, unknown>) => ops.push(data),
        delete: () => undefined,
        commit: () => {
          const data = ops[0] ?? {};
          h.commits.push({
            revision: data.revision,
            content: JSON.stringify(data).includes('"newer"') ? "newer" : "older",
          });
          return Promise.resolve();
        },
      };
    },
  };
});
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/storage", () => ({
  deletePortrait: vi.fn(),
  deleteBugReportScreenshot: vi.fn(),
}));
vi.mock("@/lib/log-persistence", () => ({ clearLogFromIDB: vi.fn() }));
// The module load, held open until the test releases it: the cold path.
vi.mock("@/lib/parent-write-modules", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/parent-write-modules")>();
  const modules = await real.preloadParentWrite();
  const gate = new Promise<void>((resolve) => {
    h.release = resolve;
  });
  return {
    ...real,
    preloadParentWrite: () => gate.then(() => modules),
    loadedParentWriteModules: () => (h.cold ? null : modules),
  };
});

import { createDebouncedSave } from "@/lib/firestore";

describe("a cold build write is never overtaken (#1275)", () => {
  it("a newer write made while the older one waits for the modules leaves after it", async () => {
    let cursor = 4;
    const pending = createDebouncedSave("u1", "c1", 500, () => ++cursor);
    const base: CharacterDoc = { ...makeCharacterDoc(), id: "c1" };
    const edit = (quote: string): CharacterDoc => ({
      ...base,
      character: { ...base.character, quote },
    });

    pending.save(edit("older"));
    const first = pending.flush(); // cold: waits for the modules
    h.cold = false; // the modules are in: a new write could now go at once
    pending.save(edit("newer"));
    const second = pending.flush();
    h.release?.();
    await Promise.all([first, second]);

    expect(h.commits).toEqual([
      { revision: 5, content: "older" },
      { revision: 6, content: "newer" },
    ]);
  });
});
