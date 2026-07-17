/**
 * BUILD-TIME GUARD (the i18n-close centerpiece) — EVERY item a class or
 * background starting-equipment package can put on a created character MUST be a
 * MODELED SRD catalogue id whose name localizes in BOTH en + it. Adding an
 * un-modeled or un-localized pack item FAILS CI here.
 *
 * ## Why this is the lock
 *
 * `src/data/background-equipment.ts` used to carry a `flavour(en, it)` helper
 * that produced INLINE-BiText pack items (Pouch/Borsa, Map/Mappa, …). Those
 * strings bypassed the id→`localizeSrd` system and leaked EN through the
 * `localizeCustom` passthrough in the IT inventory. That escape hatch is DELETED:
 * a pack item is now EITHER a real SRD `srdId` OR the structural `fromToolChoice`
 * marker — there is no name-only form (enforced at the type level). This guard
 * makes the discipline permanent and self-enforcing:
 *
 *   1. EVERY explicit `srdId` in EVERY class + background package resolves to a
 *      real catalogue row (`getEquipment`) AND localizes (a non-sentinel,
 *      non-empty `name`) in BOTH en + it.
 *   2. EVERY `fromToolChoice` marker's option ids (the concrete tools a player
 *      can pick) are themselves modeled + localized in both locales — so the
 *      chosen tool that lands in the pack always localizes too.
 *   3. END-TO-END: resolving every package (with a concrete tool pick) through
 *      the SAME `resolveStartingEquipment` the creation wizard uses yields ZERO
 *      `CustomEquipment` rows — the `localizeCustom` passthrough is UNREACHABLE
 *      for SRD/pack data — and every resulting `srdId` localizes in en + it.
 *
 * A `localizeSrd` miss THROWS in test (resolver lock 1), so an un-localized id
 * fails loudly. RED-before / GREEN-after proof: revert one item to a raw string
 * or drop one en/it name → this guard fails.
 */
import { describe, expect, it } from "vitest";
import { classTables } from "@/data/classes";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import {
  resolveStartingEquipment,
  type ToolChoiceContext,
} from "@/data/background-equipment";
import { resolveGrantSourcesForBackground } from "@/lib/resolve-grant-sources";
import type { BackgroundEquipmentOption } from "@/data/types";
import { getEquipment } from "@/data/equipment";
import { localizeSrd } from "@/i18n/resolver";
import { isCustomEquipment } from "@/types/character";

/** A starting-equipment source: a label + its packages + (optional) tool-choice options. */
interface EquipSource {
  /** Human label for assertion messages (`class:monk` / `bg:acolyte`). */
  label: string;
  packages: ReadonlyArray<BackgroundEquipmentOption>;
  /**
   * The concrete tool option ids a `fromToolChoice` marker in this source's
   * packages can resolve to (the `choice-tool-proficiency` grant options). Empty
   * when the source carries no marker.
   */
  toolOptions: ReadonlyArray<string>;
}

/** The concrete pick ids of a source's `choice-tool-proficiency` grant, if any. */
function toolOptionsOf(grants: ReadonlyArray<{ type: string }> | undefined): string[] {
  const grant = grants?.find((g) => g.type === "choice-tool-proficiency");
  return grant && "options" in grant && Array.isArray(grant.options)
    ? (grant.options as string[])
    : [];
}

/** Every class + background that declares a starting-equipment package. */
const SOURCES: EquipSource[] = [
  // Every class declares a required `startingEquipment` package (non-optional).
  ...classTables.map((c) => ({
    label: `class:${c.id}`,
    packages: c.startingEquipment,
    toolOptions: toolOptionsOf(c.grants),
  })),
  ...SRD_BACKGROUNDS.filter((bg) => bg.startingEquipment?.length).map((bg) => ({
    label: `bg:${bg.id}`,
    packages: bg.startingEquipment ?? [],
    // A background's tool grant is ENGINE-derived (not baked into `bg.grants`) —
    // read the resolved grant source, the seam the creation wizard reads.
    toolOptions: toolOptionsOf(resolveGrantSourcesForBackground(bg.id)[0]?.grants),
  })),
];

/** Assert one item id is a MODELED catalogue row that localizes in both en + it. */
function assertModeledAndLocalized(id: string, where: string): void {
  expect(
    getEquipment(id),
    `${where}: "${id}" is a modeled SRD catalogue row`
  ).toBeDefined();
  for (const locale of ["en", "it"] as const) {
    // `localizeSrd` THROWS in test on a miss; a sentinel only appears in prod.
    const name = localizeSrd("equipment", id, "name", locale);
    expect(name, `${where}: "${id}" ${locale} name is present`).toBeTruthy();
    expect(
      name.startsWith("⟦"),
      `${where}: "${id}" ${locale} name is not a sentinel`
    ).toBe(false);
  }
}

describe("starting-equipment items are ALL modeled + localized (no inline BiText, no custom passthrough)", () => {
  it("there are sources to defend (every class + every background)", () => {
    // Every loaded class + the FULL loaded background set — not accidentally
    // empty. (The pack-mode breadth — 40+ backgrounds — is pinned in
    // content-pack/tests/unit/starting-equipment-localizes.guard.pack.test.ts.)
    expect(SOURCES.filter((s) => s.label.startsWith("class:")).length).toBe(
      classTables.length
    );
    expect(SOURCES.filter((s) => s.label.startsWith("bg:")).length).toBe(
      SRD_BACKGROUNDS.length
    );
    expect(
      SOURCES.filter((s) => s.label.startsWith("bg:")).length
    ).toBeGreaterThanOrEqual(4);
  });

  it("EVERY explicit srdId in EVERY package is a modeled, en+it-localized catalogue id", () => {
    for (const src of SOURCES) {
      for (const opt of src.packages) {
        for (const item of opt.items) {
          if (item.fromToolChoice) continue; // markers checked below
          // No name-only / inline-BiText form can exist (type-enforced) — assert it.
          expect(item.srdId, `${src.label} ${opt.label}: item is an srdId`).toBeDefined();
          assertModeledAndLocalized(item.srdId, `${src.label} ${opt.label}`);
        }
      }
    }
  });

  it("EVERY fromToolChoice marker's concrete option ids are modeled + en+it-localized", () => {
    for (const src of SOURCES) {
      const hasMarker = src.packages.some((o) => o.items.some((i) => i.fromToolChoice));
      if (!hasMarker) continue;
      expect(
        src.toolOptions.length,
        `${src.label}: a marker source declares choice-tool-proficiency options`
      ).toBeGreaterThan(0);
      for (const id of src.toolOptions) {
        assertModeledAndLocalized(id, `${src.label} tool-option`);
      }
    }
  });

  it("END-TO-END — resolving every package yields ZERO custom rows; every srdId localizes (the localizeCustom passthrough is unreachable)", () => {
    for (const src of SOURCES) {
      // A representative concrete pick for any `fromToolChoice` marker.
      const pick = src.toolOptions[0];
      const toolChoice: ToolChoiceContext | undefined = pick
        ? { options: src.toolOptions, pickedIds: [pick] }
        : undefined;
      for (const opt of src.packages) {
        const out = resolveStartingEquipment(src.packages, opt.label, toolChoice);
        // No item EVER resolves to a custom row — there is no name-only form, so
        // `localizeCustom` is never reached for pack data.
        for (const e of out.equipment) {
          expect(
            isCustomEquipment(e),
            `${src.label} ${opt.label}: "${isCustomEquipment(e) ? e.name : ""}" is custom`
          ).toBe(false);
        }
        // Every resolved ref (weapon + equipment) localizes in en + it.
        for (const ref of [...out.weapons, ...out.equipment]) {
          if (isCustomEquipment(ref)) continue; // already asserted none exist
          assertModeledAndLocalized(ref.srdId, `${src.label} ${opt.label} resolved`);
        }
      }
    }
  });
});
