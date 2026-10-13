/**
 * A surface that rendered a blank pack description shows it once the prose lands:
 * `ensureEnProse` registers it and emits `languageChanged`, on which every
 * `useTranslation` surface re-renders (the language itself is unchanged).
 */
import { act, render, screen } from "@testing-library/react";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { describe, expect, it } from "vitest";
import { localizeSrd } from "@/i18n/resolver";
import { __resetEnProseForTest, registerEnProse, setEnProseLoader } from "@/i18n/srd-en";

function Description() {
  useTranslation();
  const text = localizeSrd("spell", "zz-rerender-spell", "description", "en");
  return <p>{text === "" ? "(blank)" : text}</p>;
}

describe("a late pack description re-renders into place", () => {
  it("blank first, the text after the prose lands", () => {
    registerEnProse({ spell: { "zz-rerender-spell": { name: "Late" } } });
    __resetEnProseForTest();
    setEnProseLoader(() => undefined);

    render(<Description />);
    expect(screen.getByText("(blank)")).toBeTruthy();

    act(() => {
      registerEnProse({ spell: { "zz-rerender-spell": { description: "It arrived." } } });
      i18n.emit("languageChanged", i18n.language);
    });
    expect(screen.getByText("It arrived.")).toBeTruthy();
  });
});
