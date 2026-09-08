import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Bestiary } from "@/features/library/Bestiary";
import { CampaignHomebrew } from "@/features/library/CampaignHomebrew";
import { SessionController } from "@/lib/identity/session";
import { initializeDefinition } from "@/lib/homebrew/model";
import type { FolioCampaign } from "@/lib/identity/model";
import type {
  PreparedCopy,
  PreparationOperation,
  PreparationRepository,
  PreparedState,
} from "@/lib/homebrew/preparation";
vi.mock("@/features/library/homebrew-labels", () => ({
  useHomebrewLabel: () => (key: string) => key,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/library/HomebrewReader", () => ({ HomebrewReader: () => null }));
vi.mock("@/features/library/HomebrewPortable", () => ({ HomebrewExport: () => null }));
vi.mock("@/features/library/LibraryComparison", () => ({
  LibraryComparison: () => null,
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
function setup() {
  const session = new SessionController();
  session.transition({ uid: "dm", campaignId: "camp", activeCharacterId: null });
  const campaign: FolioCampaign = {
    schema: 1,
    id: "camp",
    name: "Camp",
    dmUid: "dm",
    members: ["dm"],
    revision: 1,
    archived: false,
    joinOpen: true,
  };
  const item: PreparedCopy = {
    schema: 1,
    id: "wolf",
    campaignId: "camp",
    preparationId: "encounter",
    revision: 1,
    snapshot: {
      schema: 1,
      ownerUid: "dm",
      entryId: "source",
      version: 1,
      definition: initializeDefinition("monster"),
      provenance: null,
      operationId: "publish",
    },
    state: {
      kind: "monster",
      label: "Wolf",
      currentHp: 10,
      tempHp: 0,
      conditions: [],
      resources: {},
    },
    lastOperation: { uid: "dm", opId: "add" },
  };
  let notify: (copies: PreparedCopy[]) => void = () => {};
  const stateIntent = vi.fn(
    (c: FolioCampaign, b: PreparedCopy, state: PreparedState): PreparationOperation => ({
      kind: "preparation-state",
      opId: "save",
      uid: "dm",
      scope: session.scope(),
      baseRevision: b.revision,
      authority: {
        characterRevision: null,
        assignment: null,
        campaignRevision: c.revision,
      },
      campaignId: c.id,
      preparationId: b.preparationId,
      targetId: b.id,
      base: b,
      snapshot: b.snapshot,
      state,
    })
  );
  const repo = {
    watch: vi.fn(
      (_c: string, prep: string | null, onData: (copies: PreparedCopy[]) => void) => {
        if (prep) {
          notify = onData;
          onData([item]);
        } else onData([]);
        return () => {};
      }
    ),
    watchIssues: () => () => {},
    stateIntent,
    commit: vi.fn((operation: PreparationOperation) =>
      Promise.resolve({
        operation,
        revision: operation.baseRevision + 1,
      })
    ),
    reconcile: vi.fn(
      (): Promise<{ operation: PreparationOperation; revision: number } | null> =>
        Promise.resolve(null)
    ),
  };
  const mount = () =>
    render(
      <CampaignHomebrew
        campaign={campaign}
        repository={repo as unknown as PreparationRepository}
        library={{} as never}
        session={session}
        canManage
        preparationId="encounter"
        onPreparationChange={() => {}}
      />
    );
  return {
    session,
    campaign,
    item,
    repo,
    mount,
    notify: (i: PreparedCopy) => act(() => notify([i])),
    key: "folio-prepared-draft:dm:camp:encounter:wolf",
  };
}
it("keeps the loaded edit base on refresh and requires review before saving local state", async () => {
  const x = setup();
  x.mount();
  fireEvent.change(screen.getByRole("spinbutton", { name: "currentHp" }), {
    target: { value: "7" },
  });
  x.notify({
    ...x.item,
    revision: 2,
    state: {
      ...x.item.state,
      ...{
        kind: "monster",
        label: "Wolf",
        currentHp: 8,
        tempHp: 0,
        conditions: [],
        resources: {},
      },
    },
  });
  expect(screen.getByRole("spinbutton", { name: "currentHp" })).toHaveValue(7);
  expect(screen.queryByRole("button", { name: "saveCopyState" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "reviewCopy" }));
  fireEvent.click(screen.getByRole("button", { name: "saveCopyState" }));
  await vi.waitFor(() => expect(x.repo.commit).toHaveBeenCalledTimes(1));
  expect(x.repo.stateIntent.mock.calls[0]?.[1].revision).toBe(2);
  expect(x.repo.stateIntent.mock.calls[0]?.[2]).toMatchObject({ currentHp: 7 });
  await vi.waitFor(() => expect(sessionStorage.getItem(x.key)).toBeNull());
});
it("reconciles unknown after reload and clears only the acknowledged draft", async () => {
  const x = setup();
  const state = { ...x.item.state, currentHp: 6 } as PreparedState;
  const operation = x.repo.stateIntent(x.campaign, x.item, state);
  sessionStorage.setItem(
    x.key,
    JSON.stringify({ base: x.item, campaign: x.campaign, state })
  );
  sessionStorage.setItem(
    "folio-library-operation:dm:prepared:camp:encounter:wolf",
    JSON.stringify({ envelope: operation, invalidated: false })
  );
  x.repo.reconcile.mockResolvedValue({ operation, revision: 2 });
  x.mount();
  fireEvent.click(screen.getByRole("button", { name: "reconcileCopy" }));
  await vi.waitFor(() => expect(sessionStorage.getItem(x.key)).toBeNull());
  expect(x.repo.commit).not.toHaveBeenCalled();
});
it("preserves a draft with mismatching target as an exact recoverable original", () => {
  const x = setup();
  const raw = JSON.stringify({
    base: { ...x.item, id: "other" },
    campaign: x.campaign,
    state: x.item.state,
  });
  sessionStorage.setItem(x.key, raw);
  x.mount();
  expect(screen.getByRole("button", { name: "recoverOriginal" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "startFreshCopyDraft" }));
  expect(sessionStorage.getItem(x.key)).toBeNull();
  const archive = Object.keys(sessionStorage).find((k) =>
    k.startsWith(x.key + ":original:")
  );
  expect(archive && sessionStorage.getItem(archive)).toBe(raw);
});
it("does not submit when the pending operation cannot be durably stored", async () => {
  const x = setup();
  x.mount();
  fireEvent.change(screen.getByRole("spinbutton", { name: "currentHp" }), {
    target: { value: "7" },
  });
  const originalSet = sessionStorage.setItem.bind(sessionStorage);
  const spy = vi
    .spyOn(Object.getPrototypeOf(sessionStorage) as Storage, "setItem")
    .mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith("folio-library-operation:")) throw new Error("quota");
      originalSet(k, v);
    });
  try {
    fireEvent.click(screen.getByRole("button", { name: "saveCopyState" }));
    await screen.findByRole("alert");
    expect(x.repo.commit).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(x.key)).not.toBeNull();
  } finally {
    spy.mockRestore();
  }
});
it("lets the current DM remove a prior DM's copy while source updates stay unavailable", () => {
  const x = setup();
  x.mount();
  x.notify({ ...x.item, snapshot: { ...x.item.snapshot, ownerUid: "previous-dm" } });
  expect(screen.getByRole("button", { name: "removeCopy" })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "compareCopyVersion" })).toBeDisabled();
});
it("reports resource capacity and removed-resource mismatches without clamping remaining amounts", () => {
  const x = setup();
  x.mount();
  x.notify({
    ...x.item,
    state: {
      kind: "monster",
      label: "Wolf",
      currentHp: 0,
      tempHp: 0,
      conditions: [],
      resources: { removed: 3 },
    },
  });
  expect(screen.getByText("capacityMismatch")).toBeTruthy();
  expect(
    screen.getByRole("spinbutton", { name: "resourceRemaining · removed" })
  ).toHaveValue(3);
});

it("bestiary reuses the immutable version instead of a newer draft", async () => {
  const x = setup();
  const snapshot = {
    ...x.item.snapshot,
    definition: { ...x.item.snapshot.definition, name: "Stable wolf" },
  };
  const readVersion = vi.fn(() => Promise.resolve(snapshot));
  const onReuse = vi.fn();
  render(
    <Bestiary
      query=""
      onQueryChange={() => {}}
      selected="source"
      onSelect={() => {}}
      session={x.session}
      repository={{ readVersion } as never}
      entries={[
        {
          schema: 1,
          ownerUid: "dm",
          id: "source",
          revision: 4,
          draft: { ...snapshot.definition, name: "Unpublished change" },
          stableVersion: 1,
          provenance: null,
          lastOperation: { uid: "dm", opId: "save" },
        },
      ]}
      onReuse={onReuse}
    />
  );
  fireEvent.click(await screen.findByRole("button", { name: /Stable wolf/ }));
  fireEvent.click(screen.getByRole("button", { name: "prepareCopy" }));
  expect(onReuse).toHaveBeenCalledWith(snapshot);
  expect(readVersion).toHaveBeenCalledWith({ ownerUid: "dm", id: "source" }, 1);
  expect(screen.queryByText("Unpublished change")).toBeNull();
});
