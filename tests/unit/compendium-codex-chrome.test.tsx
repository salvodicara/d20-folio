/**
 * Compendium "Illuminated Codex" chrome (OWN-5) — pins the redesign's new
 * declarative contract on the per-type specs + the shared seal atom, so a future
 * spec can't silently ship without its ribbon glyph / verdict and break the tome.
 *
 * What it guards:
 *  - EVERY registered spec declares a ribbon `icon` (the codex tab glyph).
 *  - Specs that declare a `verdict` resolve a non-empty label in BOTH locales and
 *    a tone (the row's right-aligned classifier chip is the at-a-glance signal).
 *  - The verdict is consistent with the row meta living alongside it (no throw).
 *  - `CmpSeal` renders the carved medallion, forwarding its pigment custom-props.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Award } from "lucide-react";
import { CompendiumPage } from "@/features/compendium/CompendiumPage";
import {
  COMPENDIUM_SPECS,
  spellSpec,
  magicItemSpec,
  featSpec,
  type PickerCtx,
} from "@/features/compendium/picker";
import { CmpSeal } from "@/features/compendium/picker/CmpSeal";

const t = ((key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? key) as unknown as PickerCtx["t"];

function ctx(locale: "en" | "it"): PickerCtx {
  return { t, locale, character: null, mode: "browse" };
}

describe("Compendium codex chrome — ribbon icons + row verdicts", () => {
  it("every registered spec declares a ribbon glyph (the codex tab mark)", () => {
    for (const spec of COMPENDIUM_SPECS) {
      expect(spec.icon, `spec "${spec.id}" is missing its ribbon icon`).toBeTruthy();
    }
  });

  it("a spec's verdict (when declared) resolves a label + tone in both locales", () => {
    for (const spec of COMPENDIUM_SPECS) {
      if (!spec.verdict) continue;
      // A spec whose composed list is empty has no entry to sample — the maneuver
      // facet in SRD-only mode (all maneuvers are pack content).
      // Its verdict is exercised on real data in
      // content-pack/tests/unit/compendium-codex-chrome.pack.test.tsx.
      if (spec.data.length === 0) continue;
      const entry = spec.data[0];
      for (const locale of ["en", "it"] as const) {
        const v = spec.verdict(entry, ctx(locale));
        expect(v, `spec "${spec.id}" verdict returned nothing`).toBeTruthy();
        expect(v?.label, `spec "${spec.id}" verdict has no label`).toBeTruthy();
        // A tone is what makes the chip read as a colour-coded classifier.
        expect(v?.tone, `spec "${spec.id}" verdict has no tone`).toBeTruthy();
      }
    }
  });

  it("the spell verdict carries the school in the school's OWN enamel hue (COMPENDIUM-LUX)", () => {
    // One hue vocabulary per fact: the seal speaks LEVEL (chromatic rainbow),
    // the chip speaks SCHOOL (`--school-*`) — never the level hue twice.
    for (const spell of [
      spellSpec.data.find((s) => s.level === 0),
      spellSpec.data.find((s) => s.level > 0),
    ]) {
      expect(spell).toBeDefined();
      if (!spell) continue;
      expect(spellSpec.verdict?.(spell, ctx("en"))?.tone).toBe(
        `var(--school-${spell.school})`
      );
    }
  });

  it("the magic-item verdict is the rarity, and rarer items get a louder tone", () => {
    const common = magicItemSpec.data.find((i) => i.rarity === "common");
    const legendary = magicItemSpec.data.find((i) => i.rarity === "legendary");
    if (common) {
      const v = magicItemSpec.verdict?.(common, ctx("en"));
      // common = the quiet muted tone (no loud colour).
      expect(v?.tone).toContain("muted");
    }
    if (legendary) {
      const v = magicItemSpec.verdict?.(legendary, ctx("en"));
      expect(v?.tone).toContain("gold-leaf");
    }
  });

  it("the feat verdict is the category in the amethyst feat voice", () => {
    const feat = featSpec.data[0];
    expect(feat).toBeDefined();
    if (!feat) return;
    const v = featSpec.verdict?.(feat, ctx("en"));
    expect(v?.tone).toBe("var(--amethyst-300)");
    expect(v?.label).toBeTruthy();
  });
});

describe("CmpSeal", () => {
  it("renders the carved medallion and forwards its pigment custom-props", () => {
    const { container } = render(
      <CmpSeal icon={Award} tone="var(--amethyst-300)" toneInk="var(--amethyst-ink)" />
    );
    const seal = container.querySelector(".cmp-seal");
    expect(seal).not.toBeNull();
    // The seal is decorative chrome (the name carries the meaning for AT).
    expect(seal?.getAttribute("aria-hidden")).toBe("true");
    const style = seal?.getAttribute("style") ?? "";
    expect(style).toContain("--seal");
    expect(style).toContain("--seal-ink");
    // It wraps a single glyph.
    expect(seal?.querySelector("svg")).not.toBeNull();
  });

  it("omits the pigment props when no tone is given (defaults apply via CSS)", () => {
    const { container } = render(<CmpSeal icon={Award} />);
    const seal = container.querySelector(".cmp-seal");
    expect(seal?.getAttribute("style") ?? "").not.toContain("--seal:");
  });
});

/**
 * COMPENDIUM-LUX page chrome — the collapsible facet disclosure (one model at
 * every width) and the ≥1024px two-leaf spread (index verso + reading recto).
 * The spread is a `useMediaQuery` render fork, so the tests drive it by
 * stubbing `matchMedia` per case (jsdom has no layout).
 */
function renderPage(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/compendium" element={<CompendiumPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** `?q=fire` on every URL keeps the rendered list small (jsdom renders all rows). */
const INDEX_URL = "/compendium?type=spell&q=fire";
const ENTRY_URL = "/compendium?type=spell&q=fire&sel=fireball";

function stubMatchMedia(spread: boolean) {
  window.matchMedia = (query: string) => ({
    matches: spread && query === "(min-width: 1024px)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

describe("CompendiumPage chrome — facet disclosure + the two-leaf spread", () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("mounts the realm's own backdrop (--app-bg-art → the Grand Library plate) and clears it on unmount", () => {
    const { unmount } = renderPage(INDEX_URL);
    expect(document.documentElement.style.getPropertyValue("--app-bg-art")).toBe(
      "var(--asset-compendium-scene)"
    );
    unmount();
    expect(document.documentElement.style.getPropertyValue("--app-bg-art")).toBe("");
  });

  it("facets start COLLAPSED behind the Filters disclosure; the toggle unfolds them", () => {
    const { container } = renderPage(INDEX_URL);
    const toggle = container.querySelector<HTMLButtonElement>(".cmp-facet-toggle");
    expect(toggle).not.toBeNull();
    if (!toggle) return;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const facets = container.querySelector(".cmp-facets");
    expect(facets?.getAttribute("data-collapsed")).toBe("true");
    // Closed = OUT of the tab order + a11y tree (the 0fr reveal alone would
    // leave the chips focusable behind a zero-height fold).
    expect(facets?.hasAttribute("inert")).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(facets?.getAttribute("data-collapsed")).toBeNull();
    expect(facets?.hasAttribute("inert")).toBe(false);
  });

  it("the open facets read as the LEDGER: rubric rail + bounded scroll valve + full a11y names on the numeral chips (COMPENDIUM-LUX v2)", () => {
    const { container } = renderPage(INDEX_URL);
    const toggle = container.querySelector<HTMLButtonElement>(".cmp-facet-toggle");
    if (!toggle) throw new Error("no facet toggle");
    fireEvent.click(toggle);
    // The bounded valve wraps every group (the owner's silent-scroll-fail fix).
    expect(container.querySelector(".cmp-facet-ledger .cmp-facet-scroll")).not.toBeNull();
    // Every group is a labelled row on the rail (aria-label mirrors the rubric),
    // including the Concentration/Ritual toggles (the "Properties" rubric).
    const groups = Array.from(container.querySelectorAll(".cmp-facet-group"));
    expect(groups.length).toBeGreaterThanOrEqual(4);
    for (const g of groups) {
      expect(g.querySelector(".cmp-facet-label")?.textContent).toBeTruthy();
      expect(g.getAttribute("aria-label")).toBeTruthy();
    }
    // The level facet renders compact seal numerals whose ACCESSIBLE names stay
    // full ("Level 3", "Cantrip") — a bare "3" never ships as the a11y name.
    const level = container.querySelector('.cmp-facet-group[data-group="level"]');
    const numerals = Array.from(level?.querySelectorAll(".fchip-sm") ?? []);
    expect(numerals.length).toBe(10); // C + 1–9
    for (const chip of numerals) {
      expect(chip.getAttribute("aria-label")).toMatch(/cantrip|level/i);
      expect(chip.textContent).toMatch(/^(C|[1-9])$/);
    }
  });

  it("phone model: the open entry REPLACES the index (Back chrome, no corner close)", () => {
    const { container } = renderPage(ENTRY_URL);
    expect(container.querySelector(".cmp-entry")).not.toBeNull();
    expect(container.querySelector(".cmp-list")).toBeNull();
    expect(container.querySelector(".cmp-entry-close")).toBeNull();
    expect(container.querySelector(".cmp-frontis")).toBeNull();
  });

  it("spread: the index leaf rests beside the FRONTISPIECE (type seal · count · hint)", () => {
    stubMatchMedia(true);
    const { container } = renderPage(INDEX_URL);
    expect(container.querySelector(".cmp-list")).not.toBeNull();
    const frontis = container.querySelector(".cmp-frontis");
    expect(frontis).not.toBeNull();
    expect(frontis?.querySelector(".cmp-frontis-hint")?.textContent).toBeTruthy();
  });

  it("spread: the open entry reads BESIDE the index — corner close, no Back, and the row is seated `aria-current`", () => {
    stubMatchMedia(true);
    const { container } = renderPage(ENTRY_URL);
    // Both leaves at once: the reading leaf never hides the index.
    expect(container.querySelector(".cmp-entry")).not.toBeNull();
    expect(container.querySelector(".cmp-list")).not.toBeNull();
    expect(container.querySelector(".cmp-entry-close")).not.toBeNull();
    // The open entry's index row wears the seated selection.
    const current = container.querySelector(".pick-row[aria-current='true']");
    expect(current?.textContent).toMatch(/fireball/i);
  });
});
