/**
 * SrdTagPicker — ID-FIRST granted/manual/custom tokens in EDIT mode.
 *
 * The picker is now id-first (golden rule 7): the MANUAL value is `valueIds`
 * (catalogue ids) + `customLabels` (verbatim off-catalogue homebrew, the ONE label
 * home), and the effective chips come PRECOMPUTED from the presenter
 * (`effectiveToolTokens` / `effectiveLanguageTokens`) — the SAME seam the rail uses,
 * so the editor and the read view can never drift. These tests pin:
 *   - granted tokens render as LOCKED chips (non-removable, on-rails);
 *   - manual id chips + custom-label chips are removable (id from `valueIds`,
 *     label from `customLabels`);
 *   - a localized token never survives as a raw display string (only `custom*` is
 *     single-locale);
 *   - the add-dropdown rows are localized-only (no redundant EN parenthetical).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";
import { SrdTagPicker } from "@/components/shared/SrdTagPicker";
import { toolOptions } from "@/components/shared/srd-option";
import {
  effectiveToolTokens,
  effectiveLanguageTokens,
  languageOptions,
} from "@/lib/views/sheet-view";
import { emptyAggregate, type AggregatedGrants } from "@/lib/grants";

function agg(partial: Partial<AggregatedGrants>): AggregatedGrants {
  return { ...emptyAggregate(), ...partial };
}

afterEach(() => {
  void i18n.changeLanguage("en");
});

describe("SrdTagPicker — granted tokens render LOCKED in edit mode", () => {
  it("shows granted tools as locked chips ALONGSIDE the manual one", () => {
    const a = agg({ toolProficiencies: new Set(["Herbalism Kit", "Thieves' Tools"]) });
    render(
      <SrdTagPicker
        options={toolOptions()}
        effective={effectiveToolTokens(["disguise-kit"], [], a, "en")}
        valueIds={["disguise-kit"]}
        customLabels={[]}
        onChangeIds={() => {}}
        onChangeCustom={() => {}}
        label="Tools"
      />
    );
    // All three are visible: the manual id + the two granted ones.
    expect(screen.getByText("Disguise Kit")).toBeInTheDocument();
    expect(screen.getByText("Herbalism Kit")).toBeInTheDocument();
    expect(screen.getByText("Thieves' Tools")).toBeInTheDocument();
  });

  it("makes only the manual token removable; granted tokens have no remove button", () => {
    const a = agg({ toolProficiencies: new Set(["Herbalism Kit", "Thieves' Tools"]) });
    render(
      <SrdTagPicker
        options={toolOptions()}
        effective={effectiveToolTokens(["disguise-kit"], [], a, "en")}
        valueIds={["disguise-kit"]}
        customLabels={[]}
        onChangeIds={() => {}}
        onChangeCustom={() => {}}
        label="Tools"
      />
    );
    expect(
      screen.getByRole("button", { name: /Remove Disguise Kit/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove Herbalism Kit/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove Thieves' Tools/ })
    ).not.toBeInTheDocument();
  });

  it("removing a manual id chip drops only that id from valueIds (granted never stored)", () => {
    const onChangeIds = vi.fn();
    const a = agg({ toolProficiencies: new Set(["Herbalism Kit"]) });
    render(
      <SrdTagPicker
        options={toolOptions()}
        effective={effectiveToolTokens(["disguise-kit"], [], a, "en")}
        valueIds={["disguise-kit"]}
        customLabels={[]}
        onChangeIds={onChangeIds}
        onChangeCustom={() => {}}
        label="Tools"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Remove Disguise Kit/ }));
    expect(onChangeIds).toHaveBeenCalledWith([]); // the granted Herbalism Kit is untouched
  });

  it("a manual id and its EN-granted twin collapse to ONE locked chip", () => {
    const a = agg({ toolProficiencies: new Set(["Thieves' Tools"]) });
    render(
      <SrdTagPicker
        options={toolOptions()}
        effective={effectiveToolTokens(["thieves-tools"], [], a, "en")}
        valueIds={["thieves-tools"]}
        customLabels={[]}
        onChangeIds={() => {}}
        onChangeCustom={() => {}}
        label="Tools"
      />
    );
    // Shown once, and locked (no remove button) — it's granted.
    expect(screen.getAllByText("Thieves' Tools")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /Remove Thieves' Tools/ })
    ).not.toBeInTheDocument();
  });

  it("a custom (off-catalogue) homebrew label renders removable, dropping from customLabels", () => {
    const onChangeCustom = vi.fn();
    const a = agg({ languages: new Set() });
    render(
      <SrdTagPicker
        options={languageOptions()}
        effective={effectiveLanguageTokens(["common"], ["Old Tongue"], a, "en")}
        valueIds={["common"]}
        customLabels={["Old Tongue"]}
        onChangeIds={() => {}}
        onChangeCustom={onChangeCustom}
        label="Languages"
      />
    );
    expect(screen.getByText("Old Tongue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Remove Old Tongue/ }));
    expect(onChangeCustom).toHaveBeenCalledWith([]);
  });

  // B11 (GR7 — bind ids, not display strings): a search term that ambiguously
  // matches MULTIPLE catalogue entries must never fall through to a custom
  // (off-catalogue, id-less) entry — the old `searchIsCustom` used a stricter
  // exact-full-name check than the dropdown's own fuzzy `filtered`, so any
  // non-exact partial match (even with real catalogue rows showing) still
  // offered "+ Add custom" and let Enter commit a homebrew duplicate instead
  // of resolving to a real SRD id.
  it("offers no custom-add affordance while the search ambiguously matches catalogue entries", () => {
    const onChangeIds = vi.fn();
    const onChangeCustom = vi.fn();
    const options = [
      { id: "flute", name: { en: "Flute", it: "Flauto" } },
      { id: "pan-flute", name: { en: "Pan Flute", it: "Flauto di Pan" } },
    ];
    render(
      <SrdTagPicker
        options={options}
        effective={[]}
        valueIds={[]}
        customLabels={[]}
        onChangeIds={onChangeIds}
        onChangeCustom={onChangeCustom}
        label="Tools"
      />
    );
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Flu" } });
    // Both catalogue rows match — genuinely ambiguous, neither auto-picked.
    expect(screen.getByText("Flute")).toBeInTheDocument();
    expect(screen.getByText("Pan Flute")).toBeInTheDocument();
    // No off-catalogue custom-add affordance while real matches exist.
    expect(screen.queryByText(/add "flu"/i)).not.toBeInTheDocument();
    // Enter must not fall through to a homebrew custom entry either.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChangeCustom).not.toHaveBeenCalled();
    expect(onChangeIds).not.toHaveBeenCalled();
  });

  it("dropdown rows are localized-only — no redundant EN parenthetical in IT (rule 19)", async () => {
    await i18n.changeLanguage("it");
    const a = agg({ languages: new Set() });
    render(
      <SrdTagPicker
        options={languageOptions()}
        effective={effectiveLanguageTokens([], [], a, "it")}
        valueIds={[]}
        customLabels={[]}
        onChangeIds={() => {}}
        onChangeCustom={() => {}}
        label="Lingue"
      />
    );
    fireEvent.focus(screen.getByRole("textbox"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "drac" } });
    // bilingual search still works: typing the EN stem finds the IT row…
    expect(screen.getByText("Draconico")).toBeInTheDocument();
    // …but the row shows ONLY the localized name (no "(Draconic)" hint).
    expect(screen.queryByText("(Draconic)")).not.toBeInTheDocument();
  });
});
