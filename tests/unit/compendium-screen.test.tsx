/**
 * The new UI's Compendium: the type's entries as rows that each open with the entry's
 * painted icon, a search that narrows them, and the open entry read beside the list.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { CompendiumScreen } from "@/domains/compendium/ui/CompendiumScreen";
import { ensureSrdKind } from "@/i18n";

function open(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/compendium" element={<CompendiumScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeAll(async () => {
  await ensureSrdKind("monster");
});

describe("CompendiumScreen", () => {
  it("each spell row opens with its painted icon and links to its entry", () => {
    const { container } = open("/compendium?type=spell");
    const row = container.querySelector<HTMLAnchorElement>(
      'a.f-cmp-row[href*="sel=fireball"]'
    );
    expect(row).not.toBeNull();
    expect(row?.querySelector(".f-act-slot .f-spellart")).not.toBeNull();
  });

  it("the search narrows the rows", () => {
    const { container } = open("/compendium?type=spell");
    const before = container.querySelectorAll(".f-cmp-row").length;
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "fireball" } });
    const after = container.querySelectorAll(".f-cmp-row").length;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it("an open entry reads its name and facts beside the list", () => {
    const { container } = open("/compendium?type=spell&sel=fireball");
    expect(screen.getByRole("heading", { level: 2, name: "Fireball" })).toBeTruthy();
    expect(container.querySelector(".f-cmp-detail .f-cmp-facts dt")).not.toBeNull();
    expect(container.querySelector('a.f-cmp-row[aria-current="true"]')).not.toBeNull();
  });

  it("a monster row leads with its challenge rating", () => {
    const { container } = open("/compendium?type=monster");
    const first = container.querySelector(".f-cmp-row .f-row-s");
    expect(first?.textContent).toMatch(/^CR /);
  });
});
