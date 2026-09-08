import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { blankDefinition, type LibraryDefinition } from "@/lib/library/model";
import { HomebrewReader } from "@/features/library/HomebrewReader";
import { initializeDefinition } from "@/lib/homebrew/model";
import { OriginFields } from "@/features/library/OriginFields";
import type { OriginDeclarations } from "@/lib/homebrew/origins";
import { mergedUi } from "./__helpers__/ui-merged";

afterEach(cleanup);
async function editor(data: LibraryDefinition["payload"]["data"]) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
  function Harness() {
    const [definition, set] = useState<LibraryDefinition>({
      ...blankDefinition("species"),
      payload: {
        schema: 1,
        data: {
          authoringVersion: 1,
          prerequisites: [],
          benefits: [],
          dependencies: {},
          choices: [],
          ...data,
        },
      },
    });
    return (
      <>
        <OriginFields
          definition={definition}
          disabled={false}
          onChange={(payload) => set({ ...definition, payload })}
        />
        <output data-testid="data">{JSON.stringify(definition.payload.data)}</output>
      </>
    );
  }
  return render(
    <I18nextProvider i18n={i18n}>
      <Harness />
    </I18nextProvider>
  );
}
const actual = () =>
  JSON.parse(screen.getByTestId("data").textContent) as OriginDeclarations;

it("authors a named conditional choice without asking the user for internal IDs", async () => {
  await editor({
    choices: [
      {
        id: "ancestry",
        name: "Ancestry",
        count: 1,
        parent: null,
        options: [
          { id: "winter", name: "Winter", benefits: [] },
          { id: "summer", name: "Summer", benefits: [] },
        ],
      },
    ],
  });
  fireEvent.click(screen.getByRole("button", { name: "Add choice" }));
  const choices = screen.getAllByRole("group", { name: /Choice \d/ });
  const secondChoice = choices[1];
  if (!secondChoice) throw Error("missing second choice");
  const second = within(secondChoice);
  fireEvent.change(second.getByLabelText("Choice name"), {
    target: { value: "Winter gift" },
  });
  fireEvent.change(second.getByLabelText("Available after"), {
    target: { value: "ancestry" },
  });
  fireEvent.change(second.getByLabelText("When this option is selected"), {
    target: { value: "winter" },
  });
  fireEvent.click(second.getByRole("button", { name: "Add option" }));
  fireEvent.change(second.getByLabelText("Option name"), {
    target: { value: "Cold resistance" },
  });
  const before = actual().choices[1];
  if (!before) throw Error("missing authored choice");
  expect(before).toMatchObject({
    name: "Winter gift",
    parent: { choiceId: "ancestry", optionId: "winter" },
    options: [{ name: "Cold resistance" }],
  });
  expect(before.id).toBeTruthy();
  fireEvent.change(second.getByLabelText("Available after"), { target: { value: "" } });
  expect(actual().choices[1]?.options).toEqual(before.options);
  expect(screen.queryByLabelText(/identifier/i)).toBeNull();
});

it("preserves an unknown benefit while editing a supported sibling", async () => {
  const future = { kind: "future-benefit", nested: { exact: [1, "retained"] } };
  await editor({
    benefits: [future, { kind: "ability", ability: "strength", amount: 1 }],
  });
  fireEvent.change(screen.getByLabelText("Increase by"), { target: { value: "2" } });
  expect(actual().benefits).toEqual([
    future,
    { kind: "ability", ability: "strength", amount: 2 },
  ]);
  expect(document.querySelector(".origin-preserved pre")?.textContent).toContain(
    "future-benefit"
  );
});

it("builds an alternative prerequisite group using domain controls", async () => {
  await editor({});
  fireEvent.click(screen.getByRole("button", { name: "Add requirement" }));
  fireEvent.change(screen.getByLabelText("Requirement"), { target: { value: "any" } });
  fireEvent.click(screen.getByRole("button", { name: "Add alternative" }));
  fireEvent.change(screen.getByLabelText("Minimum level"), { target: { value: "4" } });
  expect(actual().prerequisites).toEqual([
    { kind: "any", requirements: [{ kind: "level", minimum: 4 }] },
  ]);
});

it.each(["future-layout", [{ retained: "future-container" }]])(
  "prints an unrecognized dependency container exactly",
  async (dependencies) => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
    const definition = initializeDefinition("species");
    definition.name = "Future kin";
    definition.payload.data.dependencies = dependencies;
    const view = render(
      <I18nextProvider i18n={i18n}>
        <HomebrewReader definition={definition} printable />
      </I18nextProvider>
    );
    expect(
      [...view.container.querySelectorAll("pre")].some((node) =>
        node.textContent.includes(JSON.stringify(dependencies, null, 2))
      )
    ).toBe(true);
  }
);
