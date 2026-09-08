import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { HomebrewReader } from "@/features/library/HomebrewReader";
import { catalogueSnapshot } from "@/lib/character-creation/catalogue";
import { loadSrdCatalogues } from "@/i18n/loaders";
import { registerSrdCatalogues } from "@/i18n/srd-en";
import { initializeDefinition } from "@/lib/homebrew/model";
import { includeOriginDependency } from "@/lib/homebrew/origins";
import type { LibraryDefinition } from "@/lib/library/model";
import type { CatalogueSnapshot } from "@/lib/homebrew/sources";
import { mergedUi } from "./__helpers__/ui-merged";
afterEach(cleanup);
it.each(["en", "it"] as const)(
  "shows authenticated partial catalogue fields without fabricated duration in %s",
  async (locale) => {
    const i18n = createInstance();
    await i18n.init({
      lng: locale,
      resources: { [locale]: { common: mergedUi(locale) } },
      defaultNS: "common",
    });
    const catalogue = catalogueSnapshot("spell:fireball");
    render(
      <I18nextProvider i18n={i18n}>
        <HomebrewReader definition={catalogue.definition} catalogue={catalogue} />
      </I18nextProvider>
    );
    expect(screen.getByText(i18n.t("homebrewV2.catalogueFields"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("homebrewV2.catalogueOriginal"))).toBeInTheDocument();
    expect(
      screen.queryByText(i18n.t("homebrewV2.diagnostics.required"))
    ).not.toBeInTheDocument();
  }
);

async function consult(
  locale: "en" | "it",
  definition: LibraryDefinition,
  catalogue?: CatalogueSnapshot
) {
  registerSrdCatalogues(locale, await loadSrdCatalogues(locale));
  const i18n = createInstance();
  await i18n.init({
    lng: locale,
    defaultNS: "common",
    resources: { [locale]: { common: mergedUi(locale) } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <HomebrewReader definition={definition} catalogue={catalogue} />
    </I18nextProvider>
  );
}
it.each([
  ["en", "Dagger", "Version"],
  ["it", "Pugnale", "Versione"],
] as const)(
  "consults a Wizard's frozen equipment with localized names and release in %s",
  async (locale, name, version) => {
    const catalogue = catalogueSnapshot("class:wizard");
    const original = JSON.stringify(catalogue);
    const { container } = await consult(locale, catalogue.definition, catalogue);
    expect(
      screen.getByRole("heading", {
        name: locale === "it" ? "Livello 1" : "Level 1",
        level: 5,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Wizard 1/, level: 5 })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: `${name} · ${version} ${catalogue.release}` })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name, level: 3 })).toBeInTheDocument();
    const headings = Array.from(container.querySelectorAll("h5")).map(
      (n) => n.textContent
    );
    expect(headings.some((value) => value.includes("undefined"))).toBe(false);
    expect(JSON.stringify(catalogue)).toBe(original);
  }
);
it.each([
  ["en", "Equipment", "Skills", "Divine Order", "Protector", "Thaumaturge"],
  ["it", "Equipaggiamento", "Abilità", "Ordine Divino", "Protettore", "Taumaturgo"],
] as const)(
  "localizes class starting and progression choices with authored option labels in %s",
  async (locale, equipment, skills, order, protector, thaumaturge) => {
    const catalogue = catalogueSnapshot("class:cleric");
    const { container } = await consult(locale, catalogue.definition, catalogue);
    const reader = container.querySelector<HTMLElement>(".class-reader");
    if (!reader) throw Error("Missing class reader");
    expect(within(reader).getByRole("heading", { name: equipment })).toBeInTheDocument();
    expect(within(reader).getByRole("heading", { name: skills })).toBeInTheDocument();
    const choice = within(reader).getByRole("heading", {
      name: order,
    }).parentElement;
    if (!choice) throw Error("Missing choice section");
    const options = Array.from(
      choice.querySelectorAll(".origin-read-option > strong")
    ).map((n) => n.textContent);
    expect(options.some((value) => value.startsWith(protector))).toBe(true);
    expect(options.some((value) => value.startsWith(thaumaturge))).toBe(true);
    const dependent = Array.from(reader.querySelectorAll(".origin-read-choice > p")).find(
      (n) => n.textContent.includes("→")
    );
    expect(dependent).toHaveTextContent(order);
    expect(dependent).toHaveTextContent(thaumaturge);
  }
);
it("preserves authored class choices and child names while localizing an authenticated included catalogue child", async () => {
  const definition = initializeDefinition("class");
  definition.name = "My English Class";
  definition.payload.data.starting = {
    prerequisites: [],
    benefits: [],
    choices: [
      {
        id: "training",
        name: "My Training",
        count: 1,
        parent: null,
        options: [
          { id: "gift", name: "My Gift", benefits: [{ kind: "size", size: "small" }] },
        ],
      },
    ],
  };
  const weapon = initializeDefinition("weapon");
  weapon.name = "My English Blade";
  const custom = includeOriginDependency(definition, {
    schema: 1,
    ownerUid: "owner",
    entryId: "blade",
    version: 7,
    provenance: null,
    operationId: "publish",
    definition: weapon,
  });
  const included = includeOriginDependency(
    custom.definition,
    catalogueSnapshot("equipment:dagger")
  );
  const frozen = JSON.stringify(included.definition);
  const { container } = await consult("it", included.definition);
  expect(screen.getByRole("heading", { name: "My English Class" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "My Training" })).toBeInTheDocument();
  expect(container.querySelector(".origin-read-option > strong")).toHaveTextContent(
    "My Gift"
  );
  expect(
    screen.getByRole("heading", { name: "My English Blade · Versione 7" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: /^Pugnale · Versione / })
  ).toBeInTheDocument();
  expect(JSON.stringify(included.definition)).toBe(frozen);
});
it("does not authenticate labels of an altered catalogue root or child", async () => {
  const catalogue = structuredClone(catalogueSnapshot("class:cleric"));
  catalogue.definition.name = "My Altered Class";
  const dependencies = catalogue.definition.payload.data
    .dependencies as unknown as Record<string, CatalogueSnapshot>;
  const child = Object.values(dependencies).find(
    (node) => node.entryId === "equipment:mace"
  );
  if (!child) throw Error("Missing included mace fixture");
  child.definition.name = "My Altered Mace";
  const { container } = await consult("it", catalogue.definition, catalogue);
  expect(screen.getByRole("heading", { name: "My Altered Class" })).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: /^My Altered Mace · Versione / })
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Ordine Divino" })).toBeNull();
  expect(container.querySelector<HTMLElement>(".class-reader")).toHaveTextContent(
    "Starting equipment"
  );
});

it.each([
  ["en", "Weapon training: Simple weapons"],
  ["it", "Addestramento nelle armi: Armi semplici"],
] as const)(
  "resolves canonical training IDs without missing UI keys in %s",
  async (locale, training) => {
    const catalogue = catalogueSnapshot("class:wizard");
    const { container } = await consult(locale, catalogue.definition, catalogue);
    expect(screen.getAllByText(training).length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("homebrewV2.origin.training.");
  }
);
