import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  next: (snapshot: unknown) => {
    void snapshot;
  },
  stop: vi.fn(),
}));
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: (_db: unknown, path: string) => path,
  onSnapshot: (_ref: unknown, next: (snapshot: unknown) => void) => {
    mock.next = next;
    return mock.stop;
  },
}));
import type { Firestore } from "firebase/firestore";
import { createClassBuildReader } from "@/lib/homebrew/class-build-repository";
import { SessionController } from "@/lib/identity/session";
import { initializeDefinition } from "@/lib/homebrew/model";
beforeEach(() => mock.stop.mockClear());
function setup() {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const reader = createClassBuildReader({} as Firestore, session, () => false),
    changed = vi.fn();
  reader.watch({ ownerUid: "owner", id: "hero" }, changed, vi.fn());
  const definition = initializeDefinition("class");
  definition.name = "Custom class";
  const value = {
    schema: 1,
    character: { ownerUid: "owner", id: "hero" },
    revision: 1,
    acquisitions: {
      class: {
        id: "class",
        ordinal: 0,
        classLevel: 1,
        snapshot: {
          schema: 1,
          ownerUid: "owner",
          entryId: "custom-class",
          version: 1,
          definition,
          provenance: null,
          operationId: "publish",
        },
        answers: {},
        exceptions: [],
      },
    },
    lastOperation: { uid: "owner", opId: "create" },
  };
  return { session, changed, value };
}
it("releases the listener and fences late class bytes across A to B to A", () => {
  const { session, changed, value } = setup();
  mock.next({ exists: () => true, data: () => value });
  expect(changed).toHaveBeenCalledOnce();
  session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  mock.next({ exists: () => true, data: () => value });
  expect(changed).toHaveBeenCalledOnce();
  expect(mock.stop).toHaveBeenCalledOnce();
});
it("quarantines an incompatible class aggregate with its original rather than an empty baseline", () => {
  const { changed, value } = setup();
  value.character.id = "other";
  mock.next({ exists: () => true, data: () => value });
  expect(changed.mock.calls[0]?.[0]).toMatchObject({ base: null });
  const loaded = changed.mock.calls[0]?.[0] as { original: string };
  expect(loaded.original).toContain("other");
  expect(loaded.original).toContain("Custom class");
});
