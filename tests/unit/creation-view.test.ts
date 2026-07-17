/**
 * The creation presenter (`lib/views/creation-view`) — R6 + R3 SLICE 3.
 *
 * Pins the contract the CreationWizard orchestrator + its `steps/` subcomponents
 * depend on: localized, render-ready option lists (class / race / background /
 * subclass / lineage) and the trait/equipment/tip VMs, with ZERO BiText left for
 * the surface to read. Covers BOTH locales, the stable-id identity (golden rule
 * 12), and the FACT that every SRD key in the catalogue resolves (a missing key
 * throws in dev/test). Fast-lane: pure, no React, no Firebase.
 */
import { describe, it, expect } from "vitest";
import {
  classOptions,
  raceOptions,
  backgroundOptions,
  subclassOptions,
  raceTraitPreview,
  lineageBundleVMs,
  classStartingEquipment,
  className,
  raceName,
  backgroundName,
  subclassName,
  featName,
  classTip,
  localizeSize,
} from "@/lib/views/creation-view";
import { classTables } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { toolChoiceContextForClass } from "@/lib/resolve-grant-sources";
import { mergedUi, type Json } from "./__helpers__/ui-merged";

const identity = (s: string) => s;

/**
 * A pure i18next-shaped `t` over the REAL `ui/*.json` shards — resolves the dotted
 * key from the merged catalogue (the same merge the runtime bootstrap does), so the
 * presenter's chrome strings (class tips, size words) are asserted against the
 * actual EN/IT JSON. Throws on a missing key, mirroring the runtime missing-key lock.
 */
function makeT(locale: "en" | "it") {
  const cat = mergedUi(locale);
  return (key: string): string => {
    const value = key
      .split(".")
      .reduce<
        string | Json | unknown[] | undefined
      >((node, seg) => (node && typeof node === "object" ? (node as Json)[seg] : undefined), cat);
    if (typeof value !== "string")
      throw new Error(`missing i18n key "${key}" (${locale})`);
    return value;
  };
}
const tEn = makeT("en");
const tIt = makeT("it");

describe("creation-view — localized names (EN/IT, stable ids)", () => {
  it("localizes class names per locale and anchors search on the EN name", () => {
    expect(className("fighter", "en")).toBe("Fighter");
    expect(className("fighter", "it")).toBe("Guerriero");
    expect(className("wizard", "it")).toBe("Mago");
    const en = classOptions("en");
    const it = classOptions("it");
    expect(en.length).toBe(classTables.length);
    // The picker binds to the stable id; the search anchor is always EN.
    const fEn = en.find((c) => c.id === "fighter");
    const fIt = it.find((c) => c.id === "fighter");
    expect(fEn?.label).toBe("Fighter");
    expect(fIt?.label).toBe("Guerriero");
    expect(fIt?.searchEn).toBe("Fighter");
  });

  it("localizes race names + carries raw speed/size for the meta line", () => {
    expect(raceName("elf", "en")).toBe("Elf");
    expect(raceName("elf", "it")).toBe("Elfo");
    const it = raceOptions("it");
    const elf = it.find((r) => r.id === "elf");
    expect(elf?.label).toBe("Elfo");
    expect(elf?.searchEn).toBe("Elf");
    // Speed/size stay RAW — the surface formats them at the edge.
    expect(typeof elf?.speed).toBe("number");
    expect(elf?.size).toBe("Medium");
  });

  it("localizes background names + the skill meta via the injected localizer", () => {
    expect(backgroundName("acolyte", "en")).toBe("Acolyte");
    const bgs = backgroundOptions("en", identity);
    const acolyte = bgs.find((b) => b.id === "acolyte");
    expect(acolyte?.label).toBe("Acolyte");
    expect(acolyte?.searchEn).toBe("Acolyte");
    // The meta is the localizer-mapped skill list (here identity → raw names).
    expect(acolyte?.meta).toBeTruthy();
  });

  it("localizes subclass names for the selected class only", () => {
    expect(subclassName("college-of-lore", "en")).toBe("College of Lore");
    const bardSubs = subclassOptions("bard", "en");
    expect(bardSubs.map((s) => s.id)).toContain("college-of-lore");
    // An unknown class id yields no options (never throws).
    expect(subclassOptions("not-a-class", "en")).toEqual([]);
  });

  it("localizes a class's beginner tip via the create UI namespace (no English-in-IT leak)", () => {
    expect(classTip("fighter", tEn)).toContain("beginners");
    expect(classTip("fighter", tIt)).toContain("principianti");
    // (The Artificer's previously-leaking tip is pinned pack-side in
    // creation-view.pack.test.ts — the class itself is pack content.)
    // A non-class id yields "" so the wizard's empty-selection state never asks
    // for a missing key.
    expect(classTip("not-a-class", tEn)).toBe("");
    // Every SRD class has a resolvable tip key in both locales.
    for (const c of classTables) {
      expect(classTip(c.id, tEn)).toBeTruthy();
      expect(classTip(c.id, tIt)).toBeTruthy();
    }
  });

  it("localizes the size word via srd.size_* tokens, composing the 'or' case", () => {
    expect(localizeSize("Small or Medium", tIt)).toBe("Piccola o Media");
    expect(localizeSize("Small or Medium", tEn)).toBe("Small or Medium");
    expect(localizeSize("Medium", tEn)).toBe("Medium");
    expect(localizeSize("Medium", tIt)).toBe("Media");
    expect(localizeSize("Small", tIt)).toBe("Piccola");
  });

  it("localizes feat names only for real feat ids", () => {
    // A real origin feat resolves; the surface guards unknown slugs before calling.
    expect(featName("alert", "en")).toBeTruthy();
  });
});

describe("creation-view — race trait preview + lineage bundles", () => {
  it("returns up to 3 localized trait names for a known race", () => {
    const human = raceTraitPreview("human", "en");
    expect(human?.name).toBe("Human");
    expect(human?.traits.length).toBeGreaterThan(0);
    expect(human?.traits.length).toBeLessThanOrEqual(3);
    // IT trait names differ from EN.
    const humanIt = raceTraitPreview("human", "it");
    expect(humanIt?.name).toBe("Umano");
    expect(raceTraitPreview("not-a-race", "en")).toBeNull();
  });

  it("derives creation-time lineage bundles when the race has them (Elf)", () => {
    const en = lineageBundleVMs("elf", "en");
    // Elf carries the Elven Lineage creation-time bundle.
    expect(en.length).toBeGreaterThan(0);
    const bundle = en[0];
    if (!bundle) throw new Error("expected an Elven lineage bundle");
    expect(bundle.bundleKey).toBeTruthy();
    expect(bundle.label).toBeTruthy();
    expect(bundle.options.length).toBeGreaterThan(0);
    // Options bind to stable ids; the EN search anchor is preserved.
    const opt = bundle.options[0];
    if (!opt) throw new Error("expected a lineage option");
    expect(opt.id).toBeTruthy();
    expect(opt.searchEn).toBeTruthy();
    // A race without a creation bundle yields none.
    expect(lineageBundleVMs("dwarf", "en").length).toBe(0);
  });
});

describe("creation-view — starting equipment", () => {
  it("localizes a class's A/B/C option packages per locale", () => {
    const en = classStartingEquipment("fighter", "en");
    const it = classStartingEquipment("fighter", "it");
    // Fighter is the 3-option class — A / B / C.
    expect(en.map((o) => o.label)).toEqual(["A", "B", "C"]);
    for (const option of en) {
      expect(option.gold).toBeGreaterThanOrEqual(0);
      for (const line of option.items) {
        expect(line.label).toBeTruthy();
        expect(["weapon", "armor", "gear", "unknown"]).toContain(line.category);
      }
    }
    // Same structure in IT (labels may differ, item counts identical).
    expect(it.map((o) => o.items.length)).toEqual(en.map((o) => o.items.length));
  });

  it("Monk Option A shows the chosen-tool slot as a PLACEHOLDER before a pick", () => {
    // No context (no pick) → the marker is a placeholder line. The pack box
    // visibly includes the tool slot at all times (owner: it must be visible).
    const a = classStartingEquipment("monk", "en")[0];
    const slot = a?.items.find((i) => i.placeholder);
    expect(slot).toBeDefined();
    expect(slot?.placeholder).toBe("artisan-or-instrument");
    // The label is empty (the edge supplies the localized "… — your choice").
    expect(slot?.label).toBe("");
    // The static members still resolve alongside it.
    expect(a?.items.map((i) => i.id)).toEqual(
      expect.arrayContaining(["spear", "dagger", "explorers-pack"])
    );
  });

  it("Monk Option A RESOLVES the chosen tool once picked (placeholder → real item)", () => {
    const ctx = toolChoiceContextForClass("monk", {
      "class:monk::tool-slot-0": ["smiths-tools"],
    });
    for (const locale of ["en", "it"] as const) {
      const a = classStartingEquipment("monk", locale, ctx)[0];
      // The placeholder is GONE; a real, localized Smith's Tools line is present.
      expect(a?.items.some((i) => i.placeholder)).toBe(false);
      const smiths = a?.items.filter((i) => i.id === "smiths-tools") ?? [];
      expect(smiths).toHaveLength(1);
      expect(smiths[0]?.label).toBeTruthy();
    }
    // EN/IT labels differ (Smith's Tools / Strumenti da Fabbro).
    const en = classStartingEquipment("monk", "en", ctx)[0];
    const it = classStartingEquipment("monk", "it", ctx)[0];
    const enLabel = en?.items.find((i) => i.id === "smiths-tools")?.label;
    const itLabel = it?.items.find((i) => i.id === "smiths-tools")?.label;
    expect(enLabel).toBe("Smith's Tools");
    expect(itLabel).toBe("Strumenti da Fabbro");
  });

  it("Bard Option A shows the instrument slot (placeholder) and resolves the first pick", () => {
    const placeholder = classStartingEquipment("bard", "en")[0]?.items.find(
      (i) => i.placeholder
    );
    expect(placeholder?.placeholder).toBe("instrument");
    const ctx = toolChoiceContextForClass("bard", {
      "class:bard::tool-slot-0": ["lute", "drum", "horn"],
    });
    const a = classStartingEquipment("bard", "en", ctx)[0];
    expect(a?.items.some((i) => i.placeholder)).toBe(false);
    const instruments = a?.items.filter((i) => ["lute", "drum", "horn"].includes(i.id));
    expect(instruments).toHaveLength(1);
    expect(instruments?.[0]?.id).toBe("lute"); // the first chosen
  });
});

describe("creation-view — every catalogue key resolves (EN + IT)", () => {
  // A missing SRD string throws in dev/test, so iterating the whole option set
  // across both locales is a self-enforcing completeness guard.
  for (const locale of ["en", "it"] as const) {
    it(`resolves every class/race/background/subclass/trait/lineage in ${locale}`, () => {
      expect(() => {
        classOptions(locale).forEach((c) => expect(c.label).toBeTruthy());
        raceOptions(locale).forEach((r) => expect(r.label).toBeTruthy());
        backgroundOptions(locale, identity).forEach((b) => expect(b.label).toBeTruthy());
        for (const c of classTables) {
          subclassOptions(c.id, locale).forEach((s) => expect(s.label).toBeTruthy());
          classStartingEquipment(c.id, locale).forEach((opt) =>
            opt.items.forEach((e) => {
              // A `fromToolChoice` PLACEHOLDER line (no pick yet) intentionally
              // carries an empty label — its localized "… — your choice" chrome
              // resolves at the edge (`EquipmentStep`), keyed by `placeholder`.
              // Every OTHER line must carry a real (non-empty) localized label.
              if (e.placeholder) expect(e.label).toBe("");
              else expect(e.label).toBeTruthy();
            })
          );
        }
        for (const r of SRD_RACES) {
          raceTraitPreview(r.id, locale)?.traits.forEach((t) => expect(t).toBeTruthy());
          lineageBundleVMs(r.id, locale).forEach((b) => {
            expect(b.label).toBeTruthy();
            b.options.forEach((o) => expect(o.label).toBeTruthy());
          });
        }
      }).not.toThrow();
    });
  }

  it("covers every background's localized name (no missing key)", () => {
    for (const b of SRD_BACKGROUNDS) {
      expect(backgroundName(b.id, "en")).toBeTruthy();
      expect(backgroundName(b.id, "it")).toBeTruthy();
    }
  });
});
