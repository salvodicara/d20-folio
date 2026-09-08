import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { HomebrewReader } from "@/features/library/HomebrewReader";
import { HomebrewFields } from "@/features/library/HomebrewFields";
import { blankDefinition, type JsonValue } from "@/lib/library/model";
import { mergedUi } from "./__helpers__/ui-merged";
afterEach(cleanup);
it.each(["en", "it"] as const)(
  "reads named class levels and scoped grants in %s without exposing an unfinished editor",
  async (locale) => {
    const i18n = createInstance();
    await i18n.init({
      lng: locale,
      resources: { [locale]: { common: mergedUi(locale) } },
      defaultNS: "common",
    });
    const definition = blankDefinition("class");
    definition.name = "Lantern Keeper";
    definition.payload.data = {
      authoringVersion: 1,
      hitDie: 8,
      primaryAbilities: ["wisdom"],
      savingThrows: ["wisdom", "charisma"],
      subclassLevels: [3, 6, 10, 14],
      prerequisites: [],
      benefits: [],
      choices: [],
      dependencies: {},
      starting: {
        prerequisites: [],
        benefits: [{ kind: "proficiency", category: "skill", id: "perception" }],
        choices: [],
      },
      multiclass: { prerequisites: [], benefits: [], choices: [] },
      spellcasting: {
        mode: "none",
        ability: "none",
        multiclass: { divisor: 1, rounding: "down", contributes: false },
      },
      progression: [
        {
          id: "first",
          name: "First light",
          level: 1,
          prerequisites: [],
          benefits: [],
          choices: [],
          programIds: [],
          resourceCapacities: [],
          spellcasting: null,
        },
        {
          id: "third",
          name: "Lantern oath",
          level: 3,
          prerequisites: [],
          benefits: [],
          choices: [],
          programIds: [],
          resourceCapacities: [],
          spellcasting: null,
        },
      ],
      futureLight: { color: "violet" },
    };
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <HomebrewFields
          definition={definition}
          disabled={false}
          onChange={() => {
            throw Error("read only");
          }}
        />
        <HomebrewReader definition={definition} />
      </I18nextProvider>
    );
    expect(screen.getByRole("heading", { name: /1.*First light/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /3.*Lantern oath/ })).toBeTruthy();
    expect(container.textContent).toContain(
      locale === "en" ? "Starting class" : "Classe iniziale"
    );
    expect(container.textContent).toContain("violet");
    expect(container.querySelector('[name="homebrew-hitDie"]')).toBeNull();
  }
);
it("shows the pinned parent by name and version instead of requiring its internal key", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const definition = blankDefinition("subclass"),
    parent = blankDefinition("class");
  definition.name = "Lantern Oath";
  parent.name = "Lantern Keeper";
  definition.payload.data = {
    authoringVersion: 1,
    parentClass: { dependency: '["author","keeper",2]', mechanicId: "keeper" },
    castingRelationship: "inherit",
    progression: [],
    dependencies: {
      '["author","keeper",2]': {
        source: { ownerUid: "author", id: "keeper" },
        sourceVersion: 2,
        provenance: null,
        definition: { ...parent },
      },
    },
  };
  render(
    <I18nextProvider i18n={i18n}>
      <HomebrewReader definition={definition} />
    </I18nextProvider>
  );
  expect(screen.getAllByText(/Lantern Keeper ·.*2/)[0]).toBeTruthy();
  expect(screen.getByText("Parent class")).toBeTruthy();
});

it.each(["en", "it"] as const)(
  "prints the effective parent contribution once and preserves unsupported originals in %s",
  async (locale) => {
    const { initializeDefinition } = await import("@/lib/homebrew/model");
    const { includeOriginDependency } = await import("@/lib/homebrew/origins");
    const { blankClassLevel } = await import("@/lib/homebrew/classes");
    const i18n = createInstance();
    await i18n.init({
      lng: locale,
      resources: { [locale]: { common: mergedUi(locale) } },
      defaultNS: "common",
    });
    const parent = initializeDefinition("class");
    parent.name = "Keeper";
    parent.payload.data.spellcasting = {
      mode: "half",
      ability: "wisdom",
      multiclass: { contributes: true, divisor: 2, rounding: "up" },
    };
    parent.payload.data.progression = [
      {
        ...blankClassLevel(1),
        spellcasting: {
          cantrips: 0,
          known: 0,
          prepared: 2,
          slots: [2],
          pactSlots: 0,
          pactLevel: 0,
        },
      },
    ] as unknown as JsonValue;
    const initial = initializeDefinition("subclass");
    initial.name = "Oath";
    const inclusion = includeOriginDependency(initial, {
      schema: 1,
      ownerUid: "owner",
      entryId: "keeper",
      version: 2,
      operationId: "publish",
      provenance: null,
      definition: parent,
    });
    const definition = inclusion.definition;
    definition.payload.data.parentClass = {
      dependency: inclusion.key,
      mechanicId: "custom",
    };
    const view = (d: typeof definition) => (
      <I18nextProvider i18n={i18n}>
        <HomebrewReader definition={d} printable />
      </I18nextProvider>
    );
    const { rerender } = render(view(definition));
    const composed = screen.getByTestId("class-casting-composition");
    expect(composed.textContent).toContain("Keeper");
    expect(composed.textContent).toContain("1/2");
    expect(composed.textContent.match(/1\/2/g)).toHaveLength(1);
    expect(composed.querySelectorAll("h5")).toHaveLength(1);
    definition.payload.data.futureGift = { preserved: "violet dawn" };
    rerender(view({ ...definition }));
    expect(screen.queryByTestId("class-casting-composition")).toBeNull();
    expect(screen.getAllByText(/violet dawn/).length).toBeGreaterThan(0);
  }
);
