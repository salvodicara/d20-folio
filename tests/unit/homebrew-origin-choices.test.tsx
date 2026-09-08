import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { mergedUi } from "./__helpers__/ui-merged";
import { initializeDefinition } from "@/lib/homebrew/model";
import type { FolioCharacter } from "@/lib/identity/model";
import type { OriginSelection, OriginComposition } from "@/lib/homebrew/origin-build";
import { composeOriginBuild } from "@/lib/homebrew/origin-build";
import { OriginChoices } from "@/features/library/OriginChoices";
import { originCandidate } from "@/features/library/origin-candidate";
import { OriginProficiency } from "@/features/library/OriginProficiency";
const character: FolioCharacter = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "human",
  classId: "fighter",
  level: 1,
  revision: 1,
  currentAssignment: null,
  portraitPath: null,
  sheet: {
    build: { abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } },
    state: {},
  },
};
function selection(): OriginSelection {
  const definition = initializeDefinition("species");
  definition.name = "Seasonal kin";
  return {
    id: "selected",
    ordinal: 0,
    snapshot: {
      schema: 1,
      ownerUid: "owner",
      entryId: "kin",
      version: 1,
      definition,
      provenance: null,
      operationId: "publish",
    },
    answers: {},
    exceptions: [],
  };
}
afterEach(cleanup);
async function harness(initial: OriginSelection) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
  function App() {
    const [s, set] = useState(initial);
    const build = originCandidate(character, null, s, s.id);
    return (
      <>
        <OriginChoices
          character={character}
          build={build}
          selection={s}
          disabled={false}
          onChange={set}
        />
        <output data-testid="selection">{JSON.stringify(s)}</output>
        <output data-testid="composition">
          {JSON.stringify(composeOriginBuild(character, build))}
        </output>
      </>
    );
  }
  return render(
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  );
}
it("keeps inactive cascade answers through confirmation and restores their benefits when returning", async () => {
  const s = selection();
  s.snapshot.definition.payload.data.choices = [
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
    {
      id: "gift",
      name: "Winter gift",
      count: 1,
      parent: { choiceId: "season", optionId: "winter" },
      options: [
        {
          id: "cold",
          name: "Cold ward",
          benefits: [{ kind: "resistance", damageType: "cold" }],
        },
      ],
    },
  ];
  s.answers = { "root/season": ["winter"], "root/gift": ["cold"] };
  await harness(s);
  expect(screen.getByText("Available after: Season → Winter")).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "Summer" }));
  expect(screen.getByText("Available after: Season → Winter")).toBeVisible();
  expect(
    (JSON.parse(screen.getByTestId("selection").textContent) as OriginSelection).answers[
      "root/gift"
    ]
  ).toEqual(["cold"]);
  const current = JSON.parse(
    screen.getByTestId("composition").textContent
  ) as OriginComposition;
  expect(current.valid).toBe(true);
  expect(
    current.facts.some(
      (f: { benefit: { kind: string } }) => f.benefit.kind === "resistance"
    )
  ).toBe(false);
  expect(screen.getByText(/This answer is retained/)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Winter" }));
  expect(
    (
      JSON.parse(screen.getByTestId("composition").textContent) as OriginComposition
    ).facts.some((f: { benefit: { kind: string } }) => f.benefit.kind === "resistance")
  ).toBe(true);
});
it("explains the unmet level and requires a reason for an explicit character exception", async () => {
  const s = selection();
  s.snapshot.definition.payload.data.prerequisites = [{ kind: "level", minimum: 4 }];
  await harness(s);
  expect(
    screen.getByText("The character has not reached the required level.")
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Record this exception" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for the exception"), {
    target: { value: "Granted by the campaign introduction" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Record this exception" }));
  expect(
    (JSON.parse(screen.getByTestId("selection").textContent) as OriginSelection)
      .exceptions
  ).toEqual([
    {
      path: "root/prerequisites/0",
      code: "prerequisite-level",
      reason: "Granted by the campaign introduction",
      authorUid: "owner",
    },
  ]);
  expect(
    (JSON.parse(screen.getByTestId("composition").textContent) as OriginComposition).valid
  ).toBe(true);
});
it("selects a standard tool by name while storing its stable reference", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
  let selected = "";
  render(
    <I18nextProvider i18n={i18n}>
      <OriginProficiency
        category="tool"
        value=""
        onChange={(id) => {
          selected = id;
        }}
      />
    </I18nextProvider>
  );
  const option = screen.getByRole("option", { name: /Smith/ });
  expect(option).toHaveValue("smiths-tools");
  fireEvent.change(screen.getByLabelText("Tool name"), {
    target: { value: "smiths-tools" },
  });
  expect(selected).toBe("smiths-tools");
});
it("identifies each obsolete answer before discarding only the selected path", async () => {
  const s = selection();
  s.answers = { "root/old-season": ["winter"], "root/old-study": ["arcane"] };
  await harness(s);
  const first = screen
    .getByText("root/old-season")
    .closest<HTMLDivElement>(".origin-issue");
  if (!first) throw new Error("Missing answer review row");
  expect(first).toHaveTextContent("winter");
  expect(screen.getByText("root/old-study").closest(".origin-issue")).toHaveTextContent(
    "arcane"
  );
  fireEvent.click(within(first).getByRole("button"));
  expect(
    (JSON.parse(screen.getByTestId("selection").textContent) as OriginSelection).answers
  ).toEqual({ "root/old-study": ["arcane"] });
});
