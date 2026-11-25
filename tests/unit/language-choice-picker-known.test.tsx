/**
 * The classic sheet's language pick (Ranger Deft Explorer, a feat, a species trait)
 * never offers a language the character already knows; its own pick stays offered.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n";

import { LanguageChoicePicker } from "@/components/sheet/LanguageChoicePicker";

const slot = { slotId: "deft-explorer", amount: 2, options: [] };

describe("LanguageChoicePicker", () => {
  it("leaves out the languages already known, keeping this slot's own pick", () => {
    render(
      <LanguageChoicePicker
        slots={[slot]}
        picks={{ "deft-explorer": ["elvish"] }}
        onChange={() => {}}
        knownLanguageIds={new Set(["common", "elvish"])}
      />
    );
    expect(screen.queryByText("Common")).toBeNull();
    expect(screen.getByText("Elvish")).toBeTruthy();
    expect(screen.getByText("Dwarvish")).toBeTruthy();
  });
});
