import { it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { homebrewKey } from "@/features/library/homebrew-labels";
import { HomebrewFields } from "@/features/library/HomebrewFields";
import { HomebrewReader } from "@/features/library/HomebrewReader";
import {
  baseFields,
  effectFields,
  initializeDefinition,
  type BaseFamily,
} from "@/lib/homebrew/model";
import { mergedUi } from "./__helpers__/ui-merged";

it.each(["weapon", "equipment", "spell", "feature"] as const)(
  "retains typed %s edits and renders their actual saved value",
  async (family: BaseFamily) => {
    cleanup();
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: { en: { common: mergedUi("en") } },
      defaultNS: "common",
    });
    const field = {
      weapon: "damageFormula",
      equipment: "maxCharges",
      spell: "materialDescription",
      feature: "maxUses",
    }[family];
    const value = {
      weapon: "2d6+3",
      equipment: "7",
      spell: "a silver thread",
      feature: "4",
    }[family];
    function Harness() {
      const [definition, setDefinition] = useState(initializeDefinition(family));
      return (
        <>
          <HomebrewFields
            definition={definition}
            disabled={false}
            onChange={(payload) => setDefinition({ ...definition, payload })}
          />
          <output data-testid="actual">{JSON.stringify(definition.payload.data)}</output>
          <HomebrewReader definition={definition} />
        </>
      );
    }
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <Harness />
      </I18nextProvider>
    );
    const input = container.querySelector(`[name="homebrew-${field}"]`);
    expect(input).toBeTruthy();
    if (!input) throw new Error("missing field");
    fireEvent.change(input, { target: { value } });
    const data = JSON.parse(screen.getByTestId("actual").textContent) as Record<
      string,
      unknown
    >;
    expect(data[field]).toBe(
      ["maxCharges", "maxUses"].includes(field) ? Number(value) : value
    );
    expect(container.querySelector(".homebrew-reader")?.textContent).toContain(value);
  }
);

it("never overwrites an unrecognized loaded payload to initialize an editor", async () => {
  cleanup();
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  let writes = 0;
  const definition = {
    ...initializeDefinition("weapon"),
    payload: { schema: 1 as const, data: { foreign: { original: "keep" } } },
  };
  render(
    <I18nextProvider i18n={i18n}>
      <HomebrewFields
        definition={definition}
        disabled={false}
        onChange={() => writes++}
      />
    </I18nextProvider>
  );
  expect(screen.queryByRole("button", { name: "Set up weapon" })).toBeNull();
  expect(writes).toBe(0);
  expect(screen.getByRole("status").textContent).toContain("preserved");
});

it("preserves malformed effects and exposes unsupported nested effect fields", async () => {
  cleanup();
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const definition = initializeDefinition("weapon");
  definition.name = "Blade";
  definition.payload.data.effects = { future: "exact-original" };
  let writes = 0;
  const view = render(
    <I18nextProvider i18n={i18n}>
      <HomebrewFields
        definition={definition}
        disabled={false}
        onChange={() => writes++}
      />
    </I18nextProvider>
  );
  expect(screen.getByRole("button", { name: "Add effect" })).toBeDisabled();
  expect(writes).toBe(0);
  view.unmount();
  definition.payload.data.effects = [{ futureProgram: "unsupported-original" }];
  render(
    <I18nextProvider i18n={i18n}>
      <HomebrewReader definition={definition} />
    </I18nextProvider>
  );
  expect(screen.getByText(/unsupported-original/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Additional field preserved");
});

it.each(["en", "it"] as const)(
  "localizes every descriptor and option in %s",
  async (language) => {
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { [language]: { common: mergedUi(language) } },
      defaultNS: "common",
    });
    for (const family of ["weapon", "equipment", "spell", "feature"] as const)
      for (const field of [...baseFields(family), ...effectFields()]) {
        expect(i18n.exists(homebrewKey("fields." + field.key)), field.key).toBe(true);
        expect(i18n.exists(homebrewKey("groups." + field.group)), field.group).toBe(true);
        for (const option of field.options ?? [])
          if (option)
            expect(i18n.exists(homebrewKey("options." + option)), option).toBe(true);
      }
  }
);

it("shows the retained unsupported choice instead of a supported default", async () => {
  cleanup();
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const definition = initializeDefinition("spell");
  definition.name = "Time tide";
  definition.payload.data.school = "chronomancy";
  const view = render(
    <I18nextProvider i18n={i18n}>
      <HomebrewFields definition={definition} disabled={false} onChange={() => {}} />
    </I18nextProvider>
  );
  const select = view.container.querySelector<HTMLSelectElement>(
    '[name="homebrew-school"]'
  );
  expect(select?.selectedOptions[0]?.textContent).toContain("chronomancy");
});
