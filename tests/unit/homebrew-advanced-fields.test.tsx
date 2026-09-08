import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { initializeDefinition } from "@/lib/homebrew/model";
import { blankDefinition } from "@/lib/library/model";
import { HomebrewFields } from "@/features/library/HomebrewFields";
import { HomebrewReader } from "@/features/library/HomebrewReader";
import { mergedUi } from "./__helpers__/ui-merged";
afterEach(cleanup);
it.each(["monster", "campaign-rule"] as const)(
  "initializes and edits actual typed %s program data",
  async (family) => {
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: { en: { common: mergedUi("en") } },
      defaultNS: "common",
    });
    function Harness() {
      const [d, set] = useState(blankDefinition(family));
      return (
        <>
          <HomebrewFields
            definition={d}
            disabled={false}
            onChange={(payload) => set({ ...d, payload })}
          />
          <output data-testid="actual">{JSON.stringify(d.payload.data)}</output>
          <HomebrewReader definition={d} />
        </>
      );
    }
    const v = render(
      <I18nextProvider i18n={i18n}>
        <Harness />
      </I18nextProvider>
    );
    const setup = v.container.querySelector(".homebrew-setup button");
    expect(setup).toBeTruthy();
    if (!setup) throw Error("missing setup");
    fireEvent.click(setup);
    const add = v.container.querySelector('[data-add-collection="programs"]');
    expect(add).toBeTruthy();
    if (!add) throw Error("missing add");
    fireEvent.click(add);
    const name = v.container.querySelector('[name="homebrew-programs-0-name"]');
    expect(name).toBeTruthy();
    if (!name) throw Error("missing name");
    fireEvent.change(name, { target: { value: "Winter pulse" } });
    const note = v.container.querySelector('[name="homebrew-tableNote"]');
    expect(note?.tagName).toBe("TEXTAREA");
    if (!note) throw Error("missing note");
    fireEvent.change(note, {
      target: { value: "First paragraph.\n\nSecond paragraph." },
    });
    expect(JSON.parse(screen.getByTestId("actual").textContent)).toMatchObject({
      tableNote: "First paragraph.\n\nSecond paragraph.",
    });
    const data = JSON.parse(screen.getByTestId("actual").textContent) as {
      programs: { name: string }[];
    };
    expect(data.programs[0]?.name).toBe("Winter pulse");
    expect(v.container.querySelector(".homebrew-reader")?.textContent).toContain(
      "Winter pulse"
    );
  }
);

it.each(["en", "it"] as const)(
  "localizes every advanced field and option in %s",
  async (language) => {
    const { authoringFields } = await import("@/lib/homebrew/model");
    const { advancedRowFields } = await import("@/lib/homebrew/advanced");
    const { homebrewKey } = await import("@/features/library/homebrew-labels");
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { [language]: { common: mergedUi(language) } },
      defaultNS: "common",
    });
    const fields = [
      ...authoringFields("monster"),
      ...authoringFields("campaign-rule"),
      ...(
        [
          "resource",
          "program",
          "step",
          "policy",
          "dependency",
          "defense",
          "skill",
          "effect",
        ] as const
      ).flatMap(advancedRowFields),
    ];
    for (const f of fields) {
      expect(i18n.exists(homebrewKey("fields." + f.key)), f.key).toBe(true);
      for (const v of f.options ?? [])
        if (v) expect(i18n.exists(homebrewKey("options." + v)), v).toBe(true);
    }
  }
);
it("includes advanced names unknown to this family in the printable retained payload", async () => {
  const definition = initializeDefinition("weapon");
  definition.payload.data.resources = [{ id: "future-resource", capacity: 3 }];
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { common: mergedUi("en") } },
    defaultNS: "common",
  });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <HomebrewReader definition={definition} printable />
    </I18nextProvider>
  );
  expect(view.container.textContent).toContain("future-resource");
});

it.each(["monster", "campaign-rule"] as const)(
  "prints the identity and exact preserved future payload for %s",
  async (family) => {
    const definition = initializeDefinition(family);
    definition.name = "Future table creation";
    definition.payload.data.authoringVersion = 99;
    definition.payload.data.future = { original: ["retained", 3] };
    const original = JSON.stringify(definition.payload.data, null, 2);
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: { en: { common: mergedUi("en") } },
      defaultNS: "common",
    });
    const view = render(
      <I18nextProvider i18n={i18n}>
        <HomebrewReader definition={definition} printable />
      </I18nextProvider>
    );
    expect(screen.getByRole("heading", { name: definition.name })).toBeTruthy();
    expect(view.container.querySelector("pre")?.textContent).toBe(original);
  }
);
