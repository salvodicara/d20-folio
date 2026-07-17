/**
 * Features page — DERIVED Origin feat (root-cause regression test).
 *
 * The bug: the Features page rendered only the stored `character.features[]`
 * array, so the Background's Origin feat (and the species `humanOriginFeat`)
 * only appeared if something had injected `{ srdId }` into `features[]` at
 * creation. A character that declared only `background: "criminal"` — like
 * the mock — showed NO Alert feat.
 *
 * The fix: the page derives the Origin feat from the declared `background`
 * (via `deriveOriginFeats`) and unions it onto `features[]`, deduped — so the
 * feat surfaces for ANY character, and never lists twice when an older /
 * imported doc still carries it in `features[]`.
 *
 * These assertions FAIL on the pre-fix code (no Alert feat surfaces) and
 * PASS after it. Pure test — no transitive Firebase/Firestore import.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FeaturesTab } from "@/features/character/center/tabs/FeaturesTab";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function load(doc: CharacterDoc): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FeaturesTab />
    </MemoryRouter>
  );
}

describe("FeaturesTab — derived Origin feat", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
  });

  it("surfaces the background's Origin feat with NO srdId injected into features[]", () => {
    // Declare ONLY the fact: Criminal background → Alert Origin feat.
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.background = "criminal";
    doc.character.bgFeat = "";
    doc.character.features = doc.character.features.filter(
      (f) => !("srdId" in f && f.srdId === "alert")
    );
    // Sanity: the regression target is NOT pre-injected into the stored array.
    expect(doc.character.features.some((f) => "srdId" in f && f.srdId === "alert")).toBe(
      false
    );

    load(doc);
    renderPage();

    // Alert shows up under the "Feats" section, derived from the background.
    expect(screen.getByText("Alert")).toBeInTheDocument();
    expect(screen.getByText("Feats")).toBeInTheDocument();
  });

  it("the mock (declares only background: criminal) shows the Alert feat", () => {
    // No hand-injected { srdId: "alert" } in the mock anymore — it must
    // appear purely by inference.
    const doc = structuredClone(MOCK_CHARACTER);
    expect(doc.character.features.some((f) => "srdId" in f && f.srdId === "alert")).toBe(
      false
    );
    expect(doc.character.bgFeat).toBe("");

    load(doc);
    renderPage();
    expect(screen.getByText("Alert")).toBeInTheDocument();
  });

  it("lists the Origin feat exactly ONCE when it is also present in features[] (dedup)", () => {
    // An imported / older doc that still carries the feat in features[] must not
    // double-list it (stored entry + derived twin).
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.background = "criminal";
    doc.character.bgFeat = "";
    doc.character.features = [
      ...doc.character.features.filter((f) => !("srdId" in f && f.srdId === "alert")),
      { srdId: "alert" },
    ];

    load(doc);
    renderPage();

    expect(screen.getAllByText("Alert")).toHaveLength(1);
  });

  it("an Origin feat is never deletable — it's a computed feature (stored or derived)", () => {
    // Owner rule (on-rails): computed features (class / subclass / species /
    // background / origin feats) are read-only in the Features tab. You change
    // them by editing the CHOICE in Bio, which recomputes the list — never by
    // deleting a row. Only homebrew / manually-added non-computed feats delete.
    useUIStore.setState({ sheetMode: "edit" });

    // (a) Derived-only (not in features[]): no per-row delete affordance.
    const derivedDoc = structuredClone(MOCK_CHARACTER);
    derivedDoc.character.background = "criminal";
    derivedDoc.character.bgFeat = "";
    derivedDoc.character.features = derivedDoc.character.features.filter(
      (f) => !("srdId" in f && f.srdId === "alert")
    );
    load(derivedDoc);
    const { unmount } = renderPage();
    expect(
      screen.queryByRole("button", { name: /Delete.*Alert|Alert.*Delete/i })
    ).not.toBeInTheDocument();
    unmount();

    // (b) Stored in features[] (a legacy import): STILL no delete — Alert is
    // the Criminal's computed Origin feat, so it stays read-only.
    const storedDoc = structuredClone(MOCK_CHARACTER);
    storedDoc.character.background = "criminal";
    storedDoc.character.bgFeat = "";
    storedDoc.character.features = [
      ...storedDoc.character.features.filter(
        (f) => !("srdId" in f && f.srdId === "alert")
      ),
      { srdId: "alert" },
    ];
    load(storedDoc);
    renderPage();
    expect(
      screen.queryByRole("button", { name: /Delete.*Alert|Alert.*Delete/i })
    ).not.toBeInTheDocument();
  });

  it("emits no derived feat for a background with no resolvable Origin feat", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.background = ""; // custom / blank background
    doc.character.bgFeat = "";
    doc.character.humanOriginFeat = "";
    doc.character.features = doc.character.features.filter(
      (f) => !("srdId" in f && f.srdId === "alert")
    );
    load(doc);
    renderPage();
    expect(screen.queryByText("Alert")).not.toBeInTheDocument();
  });
});

describe("FeaturesTab — fruitless search says so (P4 pass)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
  });

  it("shows the no-match empty state when the search misses everything", () => {
    load(structuredClone(MOCK_CHARACTER));
    renderPage();
    // Open the collapsible search and type a term nothing matches.
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzzzz-no-such-feature" },
    });
    expect(screen.getByText(/no features match your search/i)).toBeInTheDocument();
    // And no feature card remains.
    expect(document.querySelector("article.uc")).toBeNull();
  });
});
