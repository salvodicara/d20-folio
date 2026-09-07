import { StrictMode } from "react";
import { act, fireEvent, render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomebrewSheet } from "@/features/library/HomebrewSheet";
import { SessionController } from "@/lib/identity/session";
import type { FolioCharacter } from "@/lib/identity/model";
import {
  blankDefinition,
  type LibraryRepository,
  type LibraryVersion,
} from "@/lib/library/model";
import {
  DEFAULT_INSTANCE_STATE,
  type HomebrewInstance,
  type InstanceIssue,
  type InstanceOperation,
  type InstanceReceipt,
  type InstanceRepository,
} from "@/lib/homebrew/instances";
vi.mock("@/features/library/homebrew-labels", () => ({
  useHomebrewLabel: () => (key: string) => key,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/homebrew/conformance", () => ({ conformDefinition: () => [] }));
vi.mock("@/features/library/HomebrewReader", () => ({ HomebrewReader: () => null }));
vi.mock("@/features/library/HomebrewPortable", () => ({ HomebrewExport: () => null }));
vi.mock("@/features/library/homebrew-files", () => ({ downloadText: vi.fn() }));
vi.mock("@/features/library/LibraryComparison", () => ({
  LibraryComparison: () => null,
}));
const character: FolioCharacter = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "test",
  classId: "test",
  level: 1,
  revision: 1,
  currentAssignment: null,
  sheet: { build: {}, state: {} },
  portraitPath: null,
};
const version: LibraryVersion = {
  schema: 1,
  ownerUid: "owner",
  entryId: "blade",
  version: 1,
  definition: {
    ...blankDefinition("equipment"),
    name: "Blade",
    payload: { schema: 1, data: { maxCharges: 0 } },
  },
  provenance: null,
  operationId: "publish",
};
const item: HomebrewInstance = {
  schema: 1,
  id: "copy",
  character: { ownerUid: "owner", id: "hero" },
  snapshot: version,
  state: { ...DEFAULT_INSTANCE_STATE, remainingCharges: 2 },
  revision: 1,
  lastOperation: { uid: "owner", opId: "add" },
};
function setup() {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  let emit: (items: HomebrewInstance[]) => void = () => {};
  let fail: (error: Error) => void = () => {};
  let issue: (issues: InstanceIssue[]) => void = () => {};
  const stop = vi.fn();
  const envelope = (
    kind: InstanceOperation["kind"],
    c: FolioCharacter,
    b: HomebrewInstance,
    s: typeof item.state
  ): InstanceOperation => ({
    kind,
    opId: crypto.randomUUID(),
    uid: "owner",
    scope: session.scope(),
    character: b.character,
    targetId: b.id,
    base: b,
    snapshot: b.snapshot,
    state: s,
    baseRevision: b.revision,
    authority: {
      characterRevision: c.revision,
      assignment: c.currentAssignment,
      campaignRevision: null,
    },
  });
  const repo = {
    watch: vi.fn<InstanceRepository["watch"]>((_c, cb, error) => {
      emit = cb;
      fail = error;
      return stop;
    }),
    watchIssues: vi.fn<InstanceRepository["watchIssues"]>((cb) => {
      issue = cb;
      return () => {};
    }),
    list: vi.fn<InstanceRepository["list"]>(),
    addIntent: vi.fn<InstanceRepository["addIntent"]>(),
    updateIntent: vi.fn<InstanceRepository["updateIntent"]>((c, b, v) => ({
      ...envelope("homebrew-update", c, b, b.state),
      snapshot: v,
    })),
    stateIntent: vi.fn<InstanceRepository["stateIntent"]>((c, b, s) =>
      envelope("homebrew-state", c, b, s)
    ),
    commit: vi.fn<InstanceRepository["commit"]>((op) =>
      Promise.resolve({ operation: op, revision: op.baseRevision + 1 })
    ),
    reconcile: vi.fn<InstanceRepository["reconcile"]>(() => Promise.resolve(null)),
  };
  const libraryLoad = vi.fn<LibraryRepository["load"]>(() =>
    Promise.resolve({
      schema: 1,
      ownerUid: "owner",
      id: "blade",
      revision: 2,
      stableVersion: 2,
      draft: version.definition,
      provenance: null,
      lastOperation: { uid: "owner", opId: "publish" },
    })
  );
  const library = {
    load: libraryLoad,
    readVersion: vi.fn<LibraryRepository["readVersion"]>(() =>
      Promise.resolve({ ...version, version: 2 })
    ),
  } as unknown as LibraryRepository;
  const props = { character, repository: repo, library, session };
  const view = render(<HomebrewSheet {...props} />);
  act(() => emit([item]));
  return {
    repo,
    session,
    library,
    libraryLoad,
    props,
    view,
    emit: (values: HomebrewInstance[]) => act(() => emit(values)),
    fail: () => act(() => fail(new Error("late"))),
    issues: (values: InstanceIssue[]) => act(() => issue(values)),
    stop,
  };
}
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const edit = (value: string) =>
  fireEvent.change(screen.getByRole("spinbutton", { name: "quantity" }), {
    target: { value },
  });
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
}
it("retains the captured edit base and requires explicit comparison before saving against a remote revision", async () => {
  const a = setup();
  edit("3");
  a.emit([{ ...item, revision: 2, state: { ...item.state, quantity: 7 } }]);
  expect(screen.getByRole("button", { name: "saveState" })).toBeDisabled();
  expect(screen.getByText("stateConflict")).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "stateLocal" })).toBeTruthy();
  await click("reviewLatestState");
  await click("saveState");
  expect(a.repo.stateIntent).toHaveBeenCalledWith(
    character,
    expect.objectContaining({ revision: 2 }),
    expect.objectContaining({ quantity: 3 })
  );
});
it("persists state and exact base through unmount/reload and isolates equal instance IDs in a second character", () => {
  const a = setup();
  edit("4");
  a.view.unmount();
  const b = setup();
  expect(screen.getByRole("spinbutton", { name: "quantity" })).toHaveValue(4);
  b.view.rerender(
    <HomebrewSheet {...b.props} character={{ ...character, id: "second" }} />
  );
  b.emit([{ ...item, character: { ownerUid: "owner", id: "second" } }]);
  expect(screen.getByRole("spinbutton", { name: "quantity" })).toHaveValue(1);
});
it("blocks template update while dirty and warns even at zero capacity; quantity stays non-null", async () => {
  const a = setup();
  expect(screen.getByText("capacityMismatch")).toBeTruthy();
  edit("4");
  expect(screen.getByRole("button", { name: "checkUpdate" })).toBeDisabled();
  edit("");
  await click("saveState");
  expect(a.repo.stateIntent).toHaveBeenCalledWith(
    character,
    item,
    expect.objectContaining({ quantity: 0 })
  );
});
it("exposes only current-character malformed originals and rejects late watch errors after scope change", async () => {
  const a = setup();
  a.issues([
    {
      path: "folioAccounts/owner/characters/hero/homebrew/bad",
      original: '{"schema":9}',
      error: "incompatible-instance",
    },
    {
      path: "folioAccounts/owner/characters/other/homebrew/bad",
      original: "other-secret",
      error: "incompatible-instance",
    },
  ]);
  expect(screen.getByText("recoveryUnavailable")).toBeTruthy();
  const { downloadText } = await import("@/features/library/homebrew-files");
  fireEvent.click(
    within(screen.getByRole("region", { name: "recoveryUnavailable" })).getByRole(
      "button",
      { name: "recoverOriginal" }
    )
  );
  expect(downloadText).toHaveBeenCalledWith('{"schema":9}', expect.any(String));
  act(() =>
    a.session.transition({ uid: "other", campaignId: null, activeCharacterId: null })
  );
  a.fail();
  expect(screen.queryByText("Blade · version 1")).toBeNull();
});
it("StrictMode cleanup keeps the sheet subscribed", () => {
  const a = setup();
  a.view.unmount();
  const b = setup();
  b.view.unmount();
  let emit: (items: HomebrewInstance[]) => void = () => {};
  const repo = {
    ...b.repo,
    watch: vi.fn<InstanceRepository["watch"]>((_c, cb) => {
      emit = cb;
      return () => {};
    }),
  } as InstanceRepository;
  render(
    <StrictMode>
      <HomebrewSheet {...b.props} repository={repo} />
    </StrictMode>
  );
  act(() => emit([item]));
  expect(screen.getByRole("spinbutton", { name: "quantity" })).not.toBeDisabled();
});
it("unknown receipt reload retains state and reconciles before clearing only the matching draft", async () => {
  const a = setup();
  const commit = vi.mocked(a.repo.commit);
  commit.mockRejectedValueOnce(new Error("unavailable"));
  edit("5");
  await click("saveState");
  expect(screen.getByText("libraryV2.unknown")).toBeTruthy();
  const sent = commit.mock.calls[0]?.[0];
  expect(sent).toBeTruthy();
  a.view.unmount();
  const b = setup();
  vi.mocked(b.repo.reconcile).mockResolvedValue({
    operation: required(sent),
    revision: 2,
  } satisfies InstanceReceipt);
  expect(screen.getByRole("spinbutton", { name: "quantity" })).toHaveValue(5);
  await click("identity.operationCheck");
  expect(b.repo.reconcile).toHaveBeenCalledWith(sent);
  expect(b.repo.commit).not.toHaveBeenCalled();
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing-fixture");
  return value;
}
it("ignores a rejected old character library lookup after selection changes", async () => {
  const a = setup();
  let reject: (error: Error) => void = () => {};
  a.libraryLoad.mockReturnValue(
    new Promise((_resolve, no) => {
      reject = no;
    })
  );
  await click("checkUpdate");
  a.view.rerender(
    <HomebrewSheet {...a.props} character={{ ...character, id: "second" }} />
  );
  a.emit([{ ...item, character: { ownerUid: "owner", id: "second" } }]);
  await act(async () => {
    reject(new Error("late"));
    await Promise.resolve();
  });
  expect(screen.queryByText("unavailable")).toBeNull();
});
it("retains a rejected state's original authority and requires review before issuing a fresh intent", async () => {
  const a = setup();
  a.repo.commit.mockRejectedValueOnce(new Error("stale-base"));
  edit("6");
  await click("saveState");
  expect(screen.getByRole("button", { name: "saveState" })).toBeDisabled();
  expect(screen.getByText("stateConflict")).toBeTruthy();
  const nextCharacter = { ...character, revision: 2 };
  a.view.rerender(<HomebrewSheet {...a.props} character={nextCharacter} />);
  await click("reviewLatestState");
  await click("saveState");
  expect(a.repo.stateIntent).toHaveBeenLastCalledWith(
    nextCharacter,
    item,
    expect.objectContaining({ quantity: 6 })
  );
});
it("a template comparison cannot overwrite a newly dirty state or ignore a newer instance", async () => {
  const a = setup();
  await click("checkUpdate");
  expect(screen.getByRole("button", { name: "confirmUpdate" })).not.toBeDisabled();
  edit("9");
  expect(screen.getByRole("button", { name: "confirmUpdate" })).toBeDisabled();
  await click("discardStateDraft");
  a.emit([{ ...item, revision: 2, state: { ...item.state, quantity: 8 } }]);
  expect(screen.getByRole("button", { name: "confirmUpdate" })).toBeDisabled();
  expect(a.repo.updateIntent).not.toHaveBeenCalled();
});
const stateStorageKey = "folio-homebrew-state:owner:instance:owner:hero:copy";
it("archives incompatible originals before replacing a draft and offers every original after reopening", async () => {
  const original = ' { "schema": 99, "future": [1, 2] }\n';
  sessionStorage.setItem(stateStorageKey, original);
  const a = setup();
  edit("3");
  a.view.unmount();
  const b = setup();
  expect(screen.getByRole("spinbutton", { name: "quantity" })).toHaveValue(3);
  const { downloadText } = await import("@/features/library/homebrew-files");
  fireEvent.click(
    within(screen.getByRole("region", { name: "recoveryUnavailable" })).getByRole(
      "button",
      { name: "recoverOriginal" }
    )
  );
  expect(downloadText).toHaveBeenCalledWith(original, "homebrew-state-recovery.json");
  b.view.unmount();
  const second = "future bytes without JSON";
  sessionStorage.setItem(stateStorageKey, second);
  const c = setup();
  edit("4");
  c.view.unmount();
  setup();
  const recoveries = screen.getAllByRole("region", { name: "recoveryUnavailable" });
  expect(recoveries).toHaveLength(2);
  for (const recovery of recoveries)
    fireEvent.click(within(recovery).getByRole("button", { name: "recoverOriginal" }));
  expect(downloadText).toHaveBeenCalledWith(original, "homebrew-state-recovery.json");
  expect(downloadText).toHaveBeenCalledWith(second, "homebrew-state-recovery.json");
});
it("blocks draft replacement when the incompatible original cannot be archived", () => {
  const original = '{"schema":99,"keep":"exact"}';
  sessionStorage.setItem(stateStorageKey, original);
  setup();
  const nativeSet = Storage.prototype.setItem.bind(sessionStorage);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string
  ) {
    if (key.startsWith(stateStorageKey + ":original:"))
      throw new DOMException("full", "QuotaExceededError");
    nativeSet(key, value);
  });
  edit("8");
  expect(sessionStorage.getItem(stateStorageKey)).toBe(original);
  expect(screen.getByRole("spinbutton", { name: "quantity" })).toHaveValue(1);
  expect(screen.getByRole("button", { name: "saveState" })).toBeDisabled();
  expect(screen.getByText("unavailable")).toBeTruthy();
});
