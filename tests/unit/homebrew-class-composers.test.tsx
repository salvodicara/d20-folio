import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { initializeDefinition } from "@/lib/homebrew/model";
import { includeOriginDependency } from "@/lib/homebrew/origins";
import { blankClassLevel, type ClassData } from "@/lib/homebrew/classes";
import { blankAdvancedRow } from "@/lib/homebrew/advanced";
import { OriginFields, type OriginFieldsProps } from "@/features/library/OriginFields";
import { AdvancedFields } from "@/features/library/AdvancedFields";
import type { JsonValue, LibraryDefinition } from "@/lib/library/model";
import { mergedUi } from "./__helpers__/ui-merged";
afterEach(cleanup);
async function mount(
  definition: LibraryDefinition,
  scope?: OriginFieldsProps["scope"],
  advanced = false,
  disabled = false
) {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  function Harness() {
    const [d, set] = useState(definition);
    const props = {
      definition: d,
      disabled,
      onChange: (payload: LibraryDefinition["payload"]) => set({ ...d, payload }),
    };
    return (
      <>
        {advanced ? (
          <AdvancedFields {...props} guided />
        ) : (
          <OriginFields {...props} scope={scope} />
        )}
        <output data-testid="actual">{JSON.stringify(d.payload.data)}</output>
      </>
    );
  }
  return render(
    <I18nextProvider i18n={i18n}>
      <Harness />
    </I18nextProvider>
  );
}
const actual = () => JSON.parse(screen.getByTestId("actual").textContent) as ClassData;
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw Error("Missing test control or declaration");
  return value;
}
it.each(["starting", "multiclass", { levelId: "stable-level" }] as const)(
  "edits only the selected acquisition %j, retaining root closure and unknown siblings",
  async (scope) => {
    const feature = initializeDefinition("feature");
    feature.name = "Lantern feature";
    const included = includeOriginDependency(initializeDefinition("class"), {
      schema: 1,
      ownerUid: "owner",
      entryId: "feature",
      version: 1,
      operationId: "published",
      provenance: null,
      definition: feature,
    });
    const d = included.definition;
    const scoped = {
      prerequisites: [],
      benefits: [{ kind: "reference", dependency: included.key }],
      choices: [],
      future: { preserved: [1, 2] },
    };
    d.payload.data.starting = structuredClone(scoped);
    d.payload.data.multiclass = structuredClone(scoped);
    d.payload.data.progression = [
      { ...blankClassLevel(1), ...scoped, id: "stable-level" },
    ] as unknown as JsonValue;
    const before = structuredClone(d.payload.data);
    await mount(d, scope);
    expect(screen.getByRole("option", { name: "Lantern feature" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add requirement" }));
    const after = actual();
    const selected = required(
      typeof scope === "string" ? after[scope] : after.progression[0]
    );
    expect(selected.prerequisites).toEqual([{ kind: "level", minimum: 1 }]);
    expect(selected).toMatchObject({ future: { preserved: [1, 2] } });
    expect(after.prerequisites).toEqual([]);
    expect(after.dependencies).toEqual(before.dependencies);
    if (scope !== "starting") expect(after.starting).toEqual(before.starting);
    if (scope !== "multiclass") expect(after.multiclass).toEqual(before.multiclass);
    if (typeof scope === "string") expect(after.progression).toEqual(before.progression);
    expect(
      screen.queryByRole("button", { name: "Browse recorded creations" })
    ).toBeNull();
  }
);
it("offers only earlier parents while preserving an imported later reference", async () => {
  const d = initializeDefinition("class");
  d.payload.data.choices = [
    {
      id: "first",
      name: "First choice",
      count: 1,
      options: [],
      parent: { choiceId: "last", optionId: "future" },
    },
    { id: "second", name: "Second choice", count: 1, options: [], parent: null },
    { id: "last", name: "Last choice", count: 1, options: [], parent: null },
  ];
  await mount(d);
  const parents = screen.getAllByLabelText("Available after");
  expect(
    within(required(parents[1])).queryByRole("option", { name: "Last choice" })
  ).toBeNull();
  expect(
    within(required(parents[1])).getByRole("option", { name: "First choice" })
  ).toBeTruthy();
  expect((parents[0] as HTMLSelectElement).value).toBe("last");
  fireEvent.change(required(screen.getAllByLabelText("Choice name")[0]), {
    target: { value: "Renamed first" },
  });
  expect(actual().choices[0]?.parent).toEqual({ choiceId: "last", optionId: "future" });
});
it("selects named resources and composed programs without rewriting unknown fields or identities", async () => {
  const d = initializeDefinition("class");
  d.payload.data.resources = [
    { ...blankAdvancedRow("resource"), id: "pool", name: "Focus" },
  ];
  d.payload.data.programs = [
    {
      ...blankAdvancedRow("program"),
      id: "strike",
      name: "Focused strike",
      resourceId: "missing",
      future: ["keep"],
    },
    {
      ...blankAdvancedRow("program"),
      id: "combo",
      name: "Twin strike",
      kind: "multiattack",
      steps: [{ kind: "program", programId: "strike", count: 2 }],
    },
  ];
  const view = await mount(d, undefined, true);
  const resource = required(
    view.container.querySelector<HTMLElement>('[name="homebrew-programs-0-resourceId"]')
  );
  expect(resource.tagName).toBe("SELECT");
  expect((resource as HTMLSelectElement).value).toBe("missing");
  expect(within(resource).getByRole("option", { name: "Focus" })).toBeTruthy();
  fireEvent.change(resource, { target: { value: "pool" } });
  expect(actual().programs[0]).toMatchObject({
    id: "strike",
    resourceId: "pool",
    future: ["keep"],
  });
  const step = required(
    view.container.querySelector<HTMLElement>(
      '[name="homebrew-programs-1-steps-0-programId"]'
    )
  );
  expect(step.tagName).toBe("SELECT");
  expect(within(step).getByRole("option", { name: "Focused strike" })).toBeTruthy();
  expect(
    (
      view.container.querySelector<HTMLElement>(
        '[name="homebrew-programs-0-id"]'
      ) as HTMLInputElement
    ).readOnly
  ).toBe(true);
});
it("reorders a parent choice before its child without changing their identities or references", async () => {
  const d = initializeDefinition("class");
  d.payload.data.starting = {
    prerequisites: [],
    benefits: [],
    choices: [
      {
        id: "child",
        name: "Child",
        count: 1,
        options: [],
        parent: { choiceId: "parent", optionId: "path" },
      },
      {
        id: "parent",
        name: "Parent",
        count: 1,
        options: [{ id: "path", name: "Path", benefits: [] }],
        parent: null,
      },
    ],
  };
  const view = await mount(d, "starting");
  const parent = required(
    view.container.querySelectorAll<HTMLElement>(".origin-choice")[1]
  );
  fireEvent.click(within(parent).getByRole("button", { name: "Move earlier" }));
  expect(actual().starting.choices.map((c: { id: string }) => c.id)).toEqual([
    "parent",
    "child",
  ]);
  expect(actual().starting.choices[0]?.options[0]?.id).toBe("path");
  expect(actual().starting.choices[1]?.parent).toEqual({
    choiceId: "parent",
    optionId: "path",
  });
});
it("preserves malformed or missing acquisition data instead of offering replacement controls", async () => {
  const d = initializeDefinition("class");
  d.payload.data.starting = ["future-acquisition"];
  await mount(d, "starting");
  expect(screen.queryByRole("button", { name: "Add requirement" })).toBeNull();
  expect(actual().starting).toEqual(["future-acquisition"]);
});
it("defaults new guided program provenance and keeps generated identities read-only", async () => {
  const d = initializeDefinition("class");
  d.name = "Lantern keeper";
  const view = await mount(d, undefined, true);
  fireEvent.click(
    required(
      view.container.querySelector<HTMLElement>('[data-add-collection="programs"]')
    )
  );
  expect(actual().programs[0]?.source).toBe("Lantern keeper");
  expect(actual().programs[0]?.id).toMatch(/^[a-z0-9-]+$/);
  expect(
    (
      view.container.querySelector<HTMLElement>(
        '[name="homebrew-programs-0-id"]'
      ) as HTMLInputElement
    ).readOnly
  ).toBe(true);
});

it("keeps forward-parent origin choices selectable and future class parent metadata intact", async () => {
  const d = initializeDefinition("species");
  d.payload.data.choices = [
    {
      id: "child",
      name: "Child",
      count: 1,
      options: [],
      parent: { choiceId: "parent", optionId: "one" },
    },
    { id: "parent", name: "Parent", count: 1, options: [], parent: null },
  ];
  await mount(d);
  expect(
    within(required(screen.getAllByLabelText("Available after")[0])).getByRole("option", {
      name: "Parent",
    })
  ).toBeTruthy();
  cleanup();
  const c = initializeDefinition("class");
  c.payload.data.choices = [
    { id: "parent", name: "Parent", count: 1, options: [], parent: null },
    { id: "another", name: "Another", count: 1, options: [], parent: null },
    {
      id: "child",
      name: "Child",
      count: 1,
      options: [],
      parent: { choiceId: "parent", optionId: "one", future: { opaque: true } },
    },
  ];
  await mount(c);
  fireEvent.change(required(screen.getAllByLabelText("Available after")[2]), {
    target: { value: "another" },
  });
  expect(actual().choices[2]?.parent).toEqual({
    choiceId: "another",
    optionId: "",
    future: { opaque: true },
  });
});
