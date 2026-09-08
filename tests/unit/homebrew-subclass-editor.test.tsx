import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { initializeDefinition } from "@/lib/homebrew/model";
import { conformClassPair } from "@/lib/homebrew/classes";
import type { LibraryDefinition, LibraryVersion } from "@/lib/library/model";
import { HomebrewFields } from "@/features/library/HomebrewFields";
import { mergedUi } from "./__helpers__/ui-merged";

afterEach(cleanup);
function parent(version = 1, ownerUid = "teacher"): LibraryVersion {
  const definition = initializeDefinition("class");
  definition.name = "Star keeper";
  definition.payload.data.mechanicId = "star-keeper";
  definition.payload.data.subclassLevels = [3, 6];
  return {
    schema: 1,
    operationId: "recorded-" + String(version),
    entryId: "keeper",
    ownerUid,
    version,
    definition,
    provenance: null,
  };
}
async function editor(initial = initializeDefinition("subclass"), sources = [parent()]) {
  initial.name ||= "Star guide";
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
  function Harness() {
    const [definition, set] = useState(initial);
    return (
      <>
        <HomebrewFields
          definition={definition}
          disabled={false}
          loadOriginSources={() => Promise.resolve(sources)}
          onChange={(payload) => set({ ...definition, payload })}
        />
        <output data-testid="definition">{JSON.stringify(definition)}</output>
      </>
    );
  }
  render(
    <I18nextProvider i18n={i18n}>
      <Harness />
    </I18nextProvider>
  );
}
const actual = () =>
  JSON.parse(screen.getByTestId("definition").textContent) as LibraryDefinition;
async function choose(index = "0") {
  const fieldset = screen.getByRole("group", { name: "Parent class" });
  fireEvent.click(
    within(fieldset).getByRole("button", { name: "Browse recorded creations" })
  );
  fireEvent.change(await within(fieldset).findByLabelText("Creation and version"), {
    target: { value: index },
  });
  fireEvent.click(
    within(fieldset).getByRole("button", { name: "Use this parent class" })
  );
}
it("authors a named exact pinned parent with the shared progression and no class-only identity", async () => {
  await editor();
  await choose();
  expect(conformClassPair(actual(), parent())).toEqual([]);
  expect(actual().payload.data.parentClass).toMatchObject({ mechanicId: "star-keeper" });
  expect(screen.queryByLabelText("Hit die")).toBeNull();
  expect(screen.getByLabelText("New class level")).toBeTruthy();
  expect(screen.getByRole("group", { name: "Parent class" }).textContent).toContain(
    "3, 6"
  );
  expect(
    conformClassPair(actual(), parent(2)).some(
      (x) => x.code === "parent-version-mismatch"
    )
  ).toBe(true);
  expect(
    conformClassPair(actual(), parent(1, "other")).some(
      (x) => x.code === "parent-version-mismatch"
    )
  ).toBe(true);
});
it("preserves parent metadata, choices and stable identities when changing parent or renumbering", async () => {
  const initial = initializeDefinition("subclass");
  initial.payload.data.parentClass = {
    dependency: "",
    mechanicId: "",
    future: { untouched: [1, 2] },
  };
  const previous = structuredClone(initial.payload.data.progression);
  await editor(initial);
  await choose();
  expect(actual().payload.data.parentClass).toMatchObject({
    future: { untouched: [1, 2] },
  });
  expect(actual().payload.data.progression).toEqual(previous);
  const row = screen.getByTestId("class-level-level-3");
  fireEvent.change(within(row).getByLabelText("Class level"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Order by level" }));
  expect(actual().payload.data.progression).toMatchObject([{ id: "level-3", level: 6 }]);
});
it("changes casting relationship without discarding authored counts or future fields", async () => {
  const initial = initializeDefinition("subclass");
  initial.payload.data.future = { preserved: true };
  await editor(initial);
  fireEvent.change(screen.getByLabelText("Relationship to parent spellcasting"), {
    target: { value: "replace" },
  });
  expect(actual().payload.data.castingRelationship).toBe("replace");
  expect(actual().payload.data.future).toEqual({ preserved: true });
  expect(actual().payload.data.progression).toEqual(initial.payload.data.progression);
});
it("keeps unknown and malformed subclass declarations recoverable", async () => {
  const initial = initializeDefinition("subclass");
  initial.payload.data.parentClass = ["future"];
  initial.payload.data.progression = { future: true };
  await editor(initial);
  expect(screen.queryByRole("button", { name: "Use this parent class" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add level" })).toBeNull();
  expect(actual()).toEqual(initial);
});

it("loads recorded parent class versions through the actual Library editor", async () => {
  const { LibraryEditor } = await import("@/features/library/LibraryEditor");
  const { SessionController } = await import("@/lib/identity/session");
  const { act } = await import("@testing-library/react");
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
  const session = new SessionController();
  session.transition({ uid: "teacher", campaignId: null, activeCharacterId: null });
  const draft = initializeDefinition("subclass");
  draft.name = "Star guide";
  const entry = {
    schema: 1,
    id: "child",
    ownerUid: "teacher",
    revision: 1,
    stableVersion: null,
    draft,
    provenance: null,
    lastOperation: { uid: "teacher", opId: "saved" },
  };
  await act(async () => {
    await Promise.resolve();
    render(
      <I18nextProvider i18n={i18n}>
        <LibraryEditor
          id="child"
          family="subclass"
          repository={
            {
              load: () => Promise.resolve(entry),
              list: () =>
                Promise.resolve([
                  {
                    ...entry,
                    id: "keeper",
                    draft: parent().definition,
                    stableVersion: 2,
                  },
                ]),
              readVersion: () => Promise.resolve(parent(2)),
              listVersions: () => Promise.resolve([parent(2), parent(1)]),
            } as never
          }
          session={session}
          revision={0}
          onShare={() => {}}
        />
      </I18nextProvider>
    );
  });
  const group = await screen.findByRole("group", { name: "Parent class" });
  fireEvent.click(
    within(group).getByRole("button", { name: "Browse recorded creations" })
  );
  const versions = await within(group).findByLabelText("Creation and version");
  expect(within(versions).getByRole("option", { name: /Star keeper.*2/ })).toBeTruthy();
  expect(within(versions).getByRole("option", { name: /Star keeper.*1/ })).toBeTruthy();
});

it("initializes an empty subclass draft with a named setup action", async () => {
  const initial = initializeDefinition("subclass");
  initial.payload.data = {};
  await editor(initial);
  fireEvent.click(screen.getByRole("button", { name: "Configure subclass" }));
  expect(actual().payload.data.authoringVersion).toBe(1);
  expect(screen.getByRole("group", { name: "Parent class" })).toBeTruthy();
});
