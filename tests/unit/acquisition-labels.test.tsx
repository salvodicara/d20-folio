import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import type { PropsWithChildren } from "react";
import { useAcquisitionLabels } from "@/features/library/acquisition-presenters";
import { catalogueSnapshot } from "@/lib/character-creation/catalogue";
import { newCreationDraft, selectCreationSource } from "@/lib/character-creation/model";
import { previewCreation } from "@/lib/character-creation/compose";
import { loadSrdCatalogues } from "@/i18n/loaders";
import { registerSrdCatalogues } from "@/i18n/srd-en";
import { mergedUi } from "./__helpers__/ui-merged";

afterEach(cleanup);
it.each([
  ["en", "Club", "Greatsword"],
  ["it", "Randello", "Spadone"],
] as const)(
  "names canonical mastery options as weapons in %s",
  async (locale, club, sword) => {
    const source = catalogueSnapshot("class:fighter");
    const draft = selectCreationSource(
      newCreationDraft("owner", "draft"),
      "class",
      source
    );
    const preview = previewCreation(draft);
    const choice = preview.composition.activeChoices.find(
      (c) => c.choice.pool?.query.kind === "mastery"
    );
    if (!choice) throw Error("Missing canonical mastery choice");
    const options = preview.options(choice);
    const i18n = createInstance();
    if (locale === "it") registerSrdCatalogues("it", await loadSrdCatalogues("it"));
    await i18n.init({
      lng: locale,
      resources: { [locale]: { common: mergedUi(locale) } },
      defaultNS: "common",
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    );
    const { result } = renderHook(useAcquisitionLabels, { wrapper });
    for (const [id, expected] of [
      ["club", club],
      ["greatsword", sword],
    ]) {
      const option = options.find((value) => value.option.id === id);
      if (!option) throw Error("Missing canonical weapon option");
      expect(option.snapshot).toBeUndefined();
      expect(
        result.current.option(option.option, source, undefined, choice.choice.id)
      ).toBe(expected);
      expect(
        result.current.option(option.option, source, undefined, "starting-equipment")
      ).toBe(i18n.t("creationV2.package", { id }));
    }
  }
);
