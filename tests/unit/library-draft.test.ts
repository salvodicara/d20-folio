import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryDraftController, localLibraryDrafts } from "@/features/library/draft";
import { SessionController } from "@/lib/identity/session";

function setup() {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const saved = {
    schema: 1,
    ownerUid: "owner",
    id: "one",
    revision: 3,
    stableVersion: 1,
    draft: {
      schema: 1,
      family: "equipment",
      name: "Lantern",
      description: "Original",
      tags: [],
      payload: { schema: 1, data: {} },
    },
    provenance: null,
    lastOperation: { uid: "owner", opId: "initial" },
  };
  let finishLoad!: (value: typeof saved) => void;
  const writes: unknown[] = [];
  const repository = {
    load: vi.fn(
      () =>
        new Promise<typeof saved>((resolve) => {
          finishLoad = resolve;
        })
    ),
    saveIntent: (base: typeof saved | null, draft: typeof saved.draft, id: string) => ({
      kind: "library-save",
      uid: "owner",
      opId: "intent",
      scope: session.scope(),
      baseRevision: base?.revision ?? 0,
      targetId: id,
      draft,
    }),
    commit: (operation: unknown) => {
      writes.push(operation);
      return Promise.resolve({ operation, revision: 4 });
    },
    reconcile: () => Promise.resolve(null),
  };
  const storage = new Map<string, string>();
  const store = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, v);
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
  };
  const editor = new LibraryDraftController(
    repository as never,
    session,
    "one",
    "equipment",
    store
  );
  return {
    editor,
    repository,
    session,
    saved,
    writes,
    finish: (value: typeof saved | null = saved) => finishLoad(value as typeof saved),
    storage,
    store,
  };
}
afterEach(() => vi.useRealTimers());
describe("loaded library autosave", () => {
  it("never writes default values while loading; edits keep the loaded original CAS base", async () => {
    vi.useFakeTimers();
    const x = setup();
    const loading = x.editor.load();
    x.editor.edit({ name: "Premature" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(x.writes).toHaveLength(0);
    x.finish();
    await loading;
    expect(x.editor.state.draft?.name).toBe("Lantern");
    x.editor.edit({ name: "Storm lantern" });
    await vi.advanceTimersByTimeAsync(700);
    expect(x.writes).toHaveLength(1);
    expect(x.writes[0]).toMatchObject({
      baseRevision: 3,
      draft: { name: "Storm lantern" },
    });
    expect(x.editor.state.operation?.status).toBe("acknowledged");
    x.editor.dispose();
  });
  it("preserves an offline draft without automatic reconnect replay", async () => {
    vi.useFakeTimers();
    const x = setup();
    const loading = x.editor.load();
    x.finish();
    await loading;
    x.editor.setOnline(false);
    x.editor.edit({ description: "Offline idea" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(x.writes).toHaveLength(0);
    expect([...x.storage.values()].join()).toContain("Offline idea");
    x.editor.setOnline(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(x.writes).toHaveLength(0);
    await x.editor.save();
    expect(x.writes).toHaveLength(1);
    x.editor.dispose();
  });
  it("invalidates unsent autosave and clears the visible draft even after A→B→A", async () => {
    vi.useFakeTimers();
    const x = setup();
    const loading = x.editor.load();
    x.finish();
    await loading;
    x.editor.edit({ description: "Private idea" });
    x.session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
    x.session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
    await vi.advanceTimersByTimeAsync(1000);
    expect(x.writes).toHaveLength(0);
    expect(x.editor.state.draft).toBeNull();
    expect([...x.storage.values()].join()).toContain("Private idea");
    x.editor.dispose();
  });
});

it("retains the exact malformed recovery bytes instead of replacing them with server content", async () => {
  const x = setup();
  const raw = '{"draft":{"schema":99,"private":"recover me"}}';
  x.storage.set("folio-library:owner:one", raw);
  const loading = x.editor.load();
  x.finish();
  await loading;
  expect(x.editor.state.recoveryOriginals).toContain(raw);
  expect([...x.storage.values()].some((v) => v === raw || v.includes("recover me"))).toBe(
    true
  );
  x.editor.dispose();
});
it("reports save validation failure and retains the unsent draft", async () => {
  vi.useFakeTimers();
  const x = setup();
  const loading = x.editor.load();
  x.finish();
  await loading;
  x.repository.saveIntent = () => {
    throw new Error("incompatible-library");
  };
  x.editor.setOnline(false);
  x.editor.edit({ name: "Retained idea" });
  x.editor.setOnline(true);
  await expect(x.editor.save()).resolves.toBeUndefined();
  expect(x.editor.state.validationFailed).toBe(true);
  expect([...x.storage.values()].join()).toContain("Retained idea");
  x.editor.dispose();
});

it("makes incompatible bytes downloadable again after closing and reopening", async () => {
  const x = setup();
  const raw = '{"draft":{"schema":99,"private":"recover later"}}';
  x.storage.set("folio-library:owner:one", raw);
  const first = x.editor.load();
  x.finish();
  await first;
  x.editor.dispose();
  const reopened = new LibraryDraftController(
    x.repository as never,
    x.session,
    "one",
    "equipment",
    x.store
  );
  const second = reopened.load();
  x.finish();
  await second;
  expect(reopened.state.recoveryOriginals).toContain(raw);
  reopened.dispose();
});

it("does not replace newer local editing when a publication refresh arrives", async () => {
  const x = setup();
  const loading = x.editor.load();
  x.finish();
  await loading;
  x.editor.setOnline(false);
  x.editor.edit({ description: "New thought after publication" });
  x.editor.acceptBase({ ...x.saved, revision: 4, stableVersion: 2 } as never);
  expect(x.editor.state.draft?.description).toBe("New thought after publication");
  expect(x.editor.state.dirty).toBe(true);
  x.editor.dispose();
});
it("adopts new remote content after an acknowledged autosave without a local edit", async () => {
  const x = setup();
  const loading = x.editor.load();
  x.finish();
  await loading;
  x.editor.edit({ description: "My previous edit" });
  await x.editor.save();
  x.saved.revision = 5;
  x.saved.draft.description = "Other client edit";
  const refreshed = x.editor.load();
  x.finish();
  await refreshed;
  expect(x.editor.state.draft?.description).toBe("Other client edit");
  expect(x.editor.state.base?.revision).toBe(5);
  x.editor.dispose();
});

it("keeps a never-uploaded draft discoverable after navigating to another entry", async () => {
  const x = setup();
  const loading = x.editor.load();
  x.finish(null);
  await loading;
  x.editor.setOnline(false);
  x.editor.edit({ name: "Local compass" });
  x.editor.dispose();
  expect(localLibraryDrafts(x.store, "owner")).toMatchObject([
    { id: "one", draft: { name: "Local compass", family: "equipment" } },
  ]);
});

it("reloads a resolved clean draft in a new scope without requiring a conflict review", async () => {
  const x = setup();
  const loading = x.editor.load();
  x.finish();
  await loading;
  x.session.transition({ uid: "owner", campaignId: "next", activeCharacterId: null });
  x.editor.dispose();
  const reopened = new LibraryDraftController(
    x.repository as never,
    x.session,
    "one",
    "equipment",
    x.store
  );
  const next = reopened.load();
  x.finish();
  await next;
  expect(reopened.state.invalidated).toBe(false);
  expect(reopened.state.dirty).toBe(false);
  reopened.dispose();
});

it("ignores an older publication refresh after a newer autosave is acknowledged", async () => {
  const x = setup();
  const loading = x.editor.load();
  x.finish();
  await loading;
  x.editor.edit({ description: "Saved newer revision" });
  await x.editor.save();
  x.editor.acceptBase(x.saved as never);
  expect(x.editor.state.base?.revision).toBe(4);
  expect(x.editor.state.draft?.description).toBe("Saved newer revision");
  x.editor.dispose();
});
