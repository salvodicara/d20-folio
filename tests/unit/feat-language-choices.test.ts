/**
 * L3 — `choice-language` resolution. ID-FIRST (golden rule 7): the roster is
 * STABLE IDS only (the bilingual names live in `src/i18n/{en,it}/srd/languages.json`
 * keyed by id), and picks land on `character.languageIds` as IDS, idempotently —
 * never a localized display string (the "gnomico" leak). The full standard list is
 * the fallback when a slot's options are empty.
 */
import { describe, expect, it } from "vitest";
import {
  SRD_LANGUAGE_IDS,
  isLanguageId,
  pendingLanguageSlotsForFeat,
  isLanguagePicksComplete,
  listAvailableForLanguageSlot,
  applyLanguagePicks,
} from "@/lib/feat-language-choices";
import type { Grant } from "@/lib/grants";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("SRD_LANGUAGE_IDS roster", () => {
  it("is the COMPLETE 19-entry 2024 standard+rare list of IDS (incl. the two secret languages)", () => {
    expect(SRD_LANGUAGE_IDS).toHaveLength(19);
    expect(SRD_LANGUAGE_IDS).toContain("common");
    expect(SRD_LANGUAGE_IDS).toContain("draconic");
    expect(SRD_LANGUAGE_IDS).toContain("undercommon");
    // The two secret class-languages are in the roster (so they localize) and —
    // override-first — are freely pickable like any other.
    expect(SRD_LANGUAGE_IDS).toContain("druidic");
    expect(SRD_LANGUAGE_IDS).toContain("thieves-cant");
    // The roster carries NO display names — they're resolved by id in the presenter.
    expect(isLanguageId("gnomish")).toBe(true);
    expect(isLanguageId("gnomico")).toBe(false); // a localized LABEL is NOT an id
  });
});

describe("pendingLanguageSlotsForFeat", () => {
  it("emits one slot per choice-language grant", () => {
    const grants: Grant[] = [
      { type: "choice-language", options: [], amount: 2 },
      { type: "choice-language", options: ["draconic", "abyssal"], amount: 1 },
    ];
    const slots = pendingLanguageSlotsForFeat({ grants });
    expect(slots).toHaveLength(2);
    expect(slots[0]?.amount).toBe(2);
    expect(slots[0]?.slotId).toBe("slot-0");
    expect(slots[1]?.options).toEqual(["draconic", "abyssal"]);
  });

  it("returns [] for a source with no language grant", () => {
    expect(pendingLanguageSlotsForFeat({ grants: [] })).toEqual([]);
    expect(pendingLanguageSlotsForFeat({})).toEqual([]);
  });
});

describe("listAvailableForLanguageSlot", () => {
  it("offers the FULL roster of IDS when options are empty (override-first — secret tongues included)", () => {
    const all = listAvailableForLanguageSlot({ amount: 1, slotId: "s", options: [] });
    expect(all).toHaveLength(19); // the COMPLETE roster, nothing excluded
    expect(all).toContain("druidic");
    expect(all).toContain("thieves-cant");
  });

  it("restricts to the listed ids when constrained", () => {
    const some = listAvailableForLanguageSlot({
      amount: 1,
      slotId: "s",
      options: ["draconic", "abyssal"],
    });
    expect(some).toEqual(["draconic", "abyssal"]);
  });
});

describe("isLanguagePicksComplete", () => {
  it("requires every slot filled to its amount", () => {
    const slots = [{ amount: 2, slotId: "slot-0", options: [] }];
    expect(isLanguagePicksComplete(slots, {})).toBe(false);
    expect(isLanguagePicksComplete(slots, { "slot-0": ["draconic"] })).toBe(false);
    expect(isLanguagePicksComplete(slots, { "slot-0": ["draconic", "abyssal"] })).toBe(
      true
    );
  });
});

describe("applyLanguagePicks", () => {
  const base = MOCK_CHARACTER.character; // languageIds: ["common","elvish","draconic","thieves-cant"]

  it("appends a newly chosen language by ID", () => {
    const next = applyLanguagePicks(base, { "slot-0": ["abyssal"] });
    expect(next.languageIds).toContain("abyssal");
    expect(next.languageIds).toContain("common"); // existing preserved
  });

  it("is idempotent for a language the character already knows", () => {
    const next = applyLanguagePicks(base, { "slot-0": ["draconic"] });
    // Draconic id already present — not duplicated.
    expect(next.languageIds.filter((id) => id === "draconic")).toHaveLength(1);
  });

  it("dedupes repeated picks within the same apply", () => {
    const next = applyLanguagePicks(base, {
      "slot-0": ["abyssal"],
      "slot-1": ["abyssal"],
    });
    expect(next.languageIds.filter((id) => id === "abyssal")).toHaveLength(1);
  });

  it("skips an unknown id (only catalogue ids are real picks)", () => {
    const next = applyLanguagePicks(base, { "slot-0": ["not-a-language"] });
    expect(next).toBe(base); // nothing added → same reference
  });

  it("no-ops when there are no picks", () => {
    expect(applyLanguagePicks(base, {})).toBe(base);
  });
});
