// Repository transports are synthetic in this unit lane; production Firebase bootstrap stays isolated.
vi.mock("@/lib/firebase", () => ({}));
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { SessionController } from "@/lib/identity/session";
import { initializeDefinition } from "@/lib/homebrew/model";
import type { FolioCharacter } from "@/lib/identity/model";
import type { LibraryVersion, LibraryRepository } from "@/lib/library/model";
import type { OriginBuild, OriginSelection } from "@/lib/homebrew/origin-build";
import type { OriginBuildRepository } from "@/lib/homebrew/origin-build-repository";
import { OriginBuildEditor } from "@/features/library/OriginBuild";
import { persistOriginDraft } from "@/features/library/origin-draft";
import { mergedUi } from "./__helpers__/ui-merged";
const character: FolioCharacter = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "human",
  classId: "fighter",
  level: 3,
  revision: 1,
  currentAssignment: null,
  portraitPath: null,
  sheet: {
    build: {
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      speed: 12,
    },
    state: {},
  },
};
function version(id: string): LibraryVersion {
  const definition = initializeDefinition("species");
  definition.name = id;
  return {
    schema: 1,
    ownerUid: "owner",
    entryId: id.toLowerCase().replaceAll(" ", "-"),
    version: 1,
    definition,
    provenance: null,
    operationId: "publish",
  };
}
function selection(v: LibraryVersion): OriginSelection {
  return { id: "selection", ordinal: 0, snapshot: v, answers: {}, exceptions: [] };
}
const key = "folio-origin-draft:owner:origin-build:owner:hero";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
async function setup(v: LibraryVersion, base: OriginBuild | null = null) {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  const commit = vi.fn<OriginBuildRepository["commit"]>((operation) =>
    Promise.resolve({
      operation,
      revision: operation.baseRevision + 1,
    })
  );
  const repository: OriginBuildRepository = {
    read: vi.fn(() => Promise.resolve(base)),
    watch: vi.fn(() => () => {}),
    watchIssues: vi.fn(() => () => {}),
    saveIntent: vi.fn<OriginBuildRepository["saveIntent"]>((c, b, target, s) => ({
      kind: "origin-build",
      opId: "save",
      uid: "owner",
      scope: session.scope(),
      baseRevision: b?.revision ?? 0,
      authority: {
        characterRevision: c.revision,
        assignment: c.currentAssignment,
        campaignRevision: null,
      },
      character: { ownerUid: c.ownerUid, id: c.id },
      base: b,
      targetId: target,
      predecessorId: null,
      selections: s ? { ...b?.selections, [target]: s } : {},
    })),
    commit,
    reconcile: vi.fn(() => Promise.resolve(null)),
  };
  const library = {
    listVersions: vi.fn(() => Promise.resolve([v])),
  } as unknown as LibraryRepository;
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
  const onDone = vi.fn(),
    onClose = vi.fn();
  const props = {
    character,
    loaded: { base, loading: false, error: false, issues: [] },
    repository,
    library,
    session,
    version: v,
    onDone,
    onClose,
  };
  const wrap = (p: typeof props) => (
    <I18nextProvider i18n={i18n}>
      <OriginBuildEditor {...p} />
    </I18nextProvider>
  );
  const view = render(wrap(props));
  return {
    view,
    props,
    repository,
    commit,
    session,
    onDone,
    onClose,
    rerender: (b: OriginBuild) =>
      view.rerender(wrap({ ...props, loaded: { ...props.loaded, base: b } })),
  };
}
it("keeps the previous draft when explicitly switching to the newly requested creation", async () => {
  const old = selection(version("Winter Kin"));
  persistOriginDraft(sessionStorage, key, {
    schema: 1,
    character,
    base: null,
    targetId: old.id,
    selection: old,
    invalidated: false,
  });
  await setup(version("Summer Kin"));
  expect(screen.getByText("A different change is already in progress")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Keep draft and start requested change" })
  );
  expect(screen.getByRole("heading", { name: /Summer Kin ·/, level: 3 })).toBeTruthy();
  const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as {
    selection: OriginSelection;
  };
  expect(saved.selection.snapshot.definition.name).toBe("Summer Kin");
  const parked = Object.keys(sessionStorage).filter((k) => k.includes(":parked:"));
  expect(parked).toHaveLength(1);
  expect(sessionStorage.getItem(parked[0] ?? "")).toContain("Winter Kin");
});
it("compares actual concurrent answers on the same source version before rebasing", async () => {
  const v = version("Seasonal Kin");
  v.definition.payload.data.choices = [
    {
      id: "season",
      name: "Season",
      count: 1,
      parent: null,
      options: [
        { id: "winter", name: "Winter", benefits: [] },
        { id: "summer", name: "Summer", benefits: [] },
      ],
    },
  ];
  const s = { ...selection(v), answers: { "root/season": ["winter"] } };
  const base: OriginBuild = {
    schema: 1,
    character: { ownerUid: "owner", id: "hero" },
    revision: 1,
    selections: { selection: s },
    lastOperation: { uid: "owner", opId: "old" },
  };
  const { rerender } = await setup(v, base);
  const latest = {
    ...base,
    revision: 2,
    selections: { selection: { ...s, answers: { "root/season": ["summer"] } } },
    lastOperation: { uid: "owner", opId: "other" },
  };
  rerender(latest);
  expect(screen.getByRole("button", { name: "Confirm character build" })).toBeDisabled();
  const comparison = document.querySelector(".origin-build-comparison");
  expect(comparison?.textContent).toContain("Winter");
  expect(comparison?.textContent).toContain("Summer");
});
it("does not submit when the local envelope cannot be retained", async () => {
  const { commit } = await setup(version("Moon Kin"));
  vi.spyOn(
    Object.getPrototypeOf(sessionStorage) as Storage,
    "setItem"
  ).mockImplementation(() => {
    throw Error("storage unavailable");
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm character build" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(commit).not.toHaveBeenCalled();
});
it("invalidates and preserves the current draft on a real scope A→B→A transition", async () => {
  const { session, onClose, commit } = await setup(version("Moon Kin"));
  act(() => {
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: "other" });
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  });
  expect(onClose).toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem(key) ?? "null")).toMatchObject({
    invalidated: true,
  });
  expect(commit).not.toHaveBeenCalled();
});

it("allows a fresh intent only after explicitly reviewing a rejected operation", async () => {
  const { commit } = await setup(version("Moon Kin"));
  commit.mockRejectedValueOnce(new Error("stale-base"));
  fireEvent.click(screen.getByRole("button", { name: "Confirm character build" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Review against latest build" })
    ).toBeTruthy()
  );
  fireEvent.click(screen.getByRole("button", { name: "Review against latest build" }));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", {
          name: "Confirm character build",
        })
        .hasAttribute("disabled")
    ).toBe(false)
  );
  expect(
    sessionStorage.getItem("folio-library-operation:owner:origin-build:owner:hero")
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Confirm character build" }));
  await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
});
it("adds another acquisition when reusing a repeatable feat", async () => {
  const v = version("Repeated Training");
  v.definition = initializeDefinition("feat");
  v.definition.name = "Repeated Training";
  v.definition.payload.data.repeatable = true;
  const first = selection(v);
  const base: OriginBuild = {
    schema: 1,
    character: { ownerUid: character.ownerUid, id: character.id },
    revision: 1,
    selections: { [first.id]: first },
    lastOperation: { uid: "owner", opId: "before" },
  };
  const { commit } = await setup(v, base);
  fireEvent.click(screen.getByRole("button", { name: "Confirm character build" }));
  await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  const selections = Object.values(commit.mock.calls[0]?.[0].selections ?? {});
  expect(selections).toHaveLength(2);
  expect(selections.map((s) => s.ordinal)).toEqual([0, 1]);
});
it("ignores a version result from the previously restored source after switching drafts", async () => {
  const old = selection(version("Winter Kin"));
  persistOriginDraft(sessionStorage, key, {
    schema: 1,
    character,
    base: null,
    targetId: old.id,
    selection: old,
    invalidated: false,
  });
  const next = {
    schema: 1,
    character,
    base: null,
    targetId: "summer",
    selection: { ...selection(version("Summer Kin")), id: "summer" },
    invalidated: false,
  };
  sessionStorage.setItem(key + ":parked:summer", JSON.stringify(next));
  const { props } = await setup(old.snapshot as LibraryVersion);
  let finish!: (v: LibraryVersion[]) => void;
  vi.spyOn(props.library, "listVersions").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByText("Choose another recorded version"));
  fireEvent.click(screen.getByRole("button", { name: "Load available versions" }));
  fireEvent.click(screen.getByText("Other saved drafts"));
  fireEvent.click(screen.getByRole("button", { name: /Resume saved draft: Summer Kin/ }));
  await act(async () => {
    finish([old.snapshot as LibraryVersion]);
    await Promise.resolve();
  });
  expect(screen.queryByRole("combobox", { name: "Creation and version" })).toBeNull();
});

it("confirms an already-saved selection without manufacturing a no-op write", async () => {
  const v = version("Already Current"),
    s = selection(v);
  const base: OriginBuild = {
    schema: 1,
    character: { ownerUid: character.ownerUid, id: character.id },
    revision: 1,
    selections: { [s.id]: s },
    lastOperation: { uid: "owner", opId: "saved" },
  };
  const { commit, onDone } = await setup(v, base);
  fireEvent.click(screen.getByRole("button", { name: "Confirm character build" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(commit).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(key)).toBeNull();
});
