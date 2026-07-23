/**
 * i18n EN ↔ IT parity + no-empty + no-English-in-IT (#35; i18n completeness LOCK 4,
 * `docs/ARCHITECTURE.md` §2.5). The bilingual constraint (no English-only string
 * ships) is enforced here:
 *  - key-set EQUALITY in BOTH directions — a key in one locale's catalogue MUST
 *    exist in the other (catches EN-added-but-not-IT and orphan IT keys);
 *  - NO EMPTY VALUE in either locale — an empty/whitespace-only string is an
 *    untranslated placeholder, which (with LOCK 3 removing inline defaults) would
 *    render nothing; it must be a real translation;
 *  - NO English-in-IT leak — an IT value byte-identical to its EN counterpart that
 *    still reads as English (R3, beyond parity).
 *
 * DRY (golden rule 6): the parity / empty / English-in-IT logic is the SAME
 * detector set the BUILD-TIME leak-lock runs (`scripts/i18n/leak-detectors.ts` →
 * `vite build` via `vite.config.ts`'s `i18nLeakLock` plugin). This test and the
 * build gate import the ONE implementation, so the rules can never drift between
 * "fails the build" and "fails CI". This test asserts the catalogues are clean
 * RIGHT NOW; the build gate makes a future leak impossible to ship.
 *
 * The em-dash ban (DESIGN §7) and the `ui/` shard layout are test-only concerns
 * (not leak classes) and stay local below. Architected for a 3rd language: add
 * `src/i18n/<lng>/…` and extend `LOCALES` in `scripts/i18n/flat.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  emptyValues,
  englishInItLeaks,
  flatEntries,
  parityViolations,
} from "../../scripts/i18n/leak-detectors";
// SLICE 8: `common.json` is split into per-domain `ui/<group>.json` shards; this
// guard asserts over the WHOLE catalogue, so merge the shards from disk (same
// merge the runtime bootstrap does, synchronous — no eager bundling of both
// locales here, and any new shard is picked up automatically).
import { mergedUi } from "./__helpers__/ui-merged";

const en = mergedUi("en");
const itLocale = mergedUi("it");

// R3 (LOCK 4 over `srd/`): the SRD content catalogues are id-keyed JSON that must
// stay key-for-key parallel across locales with no empty value — exactly the
// chrome rule, extended to the lifted SRD strings.
import enSpells from "@/i18n/en/srd/spells.json";
import itSpells from "@/i18n/it/srd/spells.json";
import enFeats from "@/i18n/en/srd/feats.json";
import itFeats from "@/i18n/it/srd/feats.json";
import enRaces from "@/i18n/en/srd/races.json";
import itRaces from "@/i18n/it/srd/races.json";
import enBackgrounds from "@/i18n/en/srd/backgrounds.json";
import itBackgrounds from "@/i18n/it/srd/backgrounds.json";
import enConditions from "@/i18n/en/srd/conditions.json";
import itConditions from "@/i18n/it/srd/conditions.json";
import enEquipment from "@/i18n/en/srd/equipment.json";
import itEquipment from "@/i18n/it/srd/equipment.json";
import enMagicItems from "@/i18n/en/srd/magic-items.json";
import itMagicItems from "@/i18n/it/srd/magic-items.json";
import enManeuvers from "@/i18n/en/srd/maneuvers.json";
import itManeuvers from "@/i18n/it/srd/maneuvers.json";
import enMetamagic from "@/i18n/en/srd/metamagic.json";
import itMetamagic from "@/i18n/it/srd/metamagic.json";
import enInvocations from "@/i18n/en/srd/invocations.json";
import itInvocations from "@/i18n/it/srd/invocations.json";
import enClasses from "@/i18n/en/srd/classes.json";
import itClasses from "@/i18n/it/srd/classes.json";
import enSubclasses from "@/i18n/en/srd/subclasses.json";
import itSubclasses from "@/i18n/it/srd/subclasses.json";
import enClassFeatures from "@/i18n/en/srd/class-features.json";
import itClassFeatures from "@/i18n/it/srd/class-features.json";
import enLanguages from "@/i18n/en/srd/languages.json";
import itLanguages from "@/i18n/it/srd/languages.json";
import enProficiencies from "@/i18n/en/srd/proficiencies.json";
import itProficiencies from "@/i18n/it/srd/proficiencies.json";
import enWeaponProperties from "@/i18n/en/srd/weapon-properties.json";
import itWeaponProperties from "@/i18n/it/srd/weapon-properties.json";
import enBeasts from "@/i18n/en/srd/beasts.json";
import itBeasts from "@/i18n/it/srd/beasts.json";
// The lazy display-only bestiary catalogue (the lazy SRD-kind tier). Statically
// imported HERE for parity only — the app loads it lazily via `ensureSrdKind`.
import enMonsters from "@/i18n/en/srd/monsters.json";
import itMonsters from "@/i18n/it/srd/monsters.json";

// The frozen English-in-IT baseline for magic-items (the deferred P4 batch).
import MI_UNTRANSLATED from "./__fixtures__/i18n-magic-item-untranslated.json";

type Json = { [k: string]: string | Json | string[] };

const LOCALES: { name: string; cat: Json }[] = [
  { name: "en", cat: en as Json },
  { name: "it", cat: itLocale as Json },
];

describe("i18n EN ↔ IT key parity (#35)", () => {
  const par = parityViolations("ui", en as Json, itLocale as Json);

  it("every EN key has an IT translation", () => {
    expect(
      par.missingInB,
      `IT is missing these keys:\n${par.missingInB.join("\n")}`
    ).toEqual([]);
  });

  it("every IT key has an EN counterpart (no orphans)", () => {
    expect(
      par.missingInA,
      `EN is missing these keys:\n${par.missingInA.join("\n")}`
    ).toEqual([]);
  });

  it.each(LOCALES)("$name has no empty translation values (LOCK 4)", ({ cat }) => {
    const empty = emptyValues(cat);
    expect(empty, `these keys have an empty value:\n${empty.join("\n")}`).toEqual([]);
  });

  // DESIGN.md §7 hard ban: "No em dashes … in UI copy." Chrome copy uses a
  // colon / comma / full stop instead (each locale reworded natively, not by
  // glyph-swap). SRD catalogues are rules prose and stay out of scope.
  it.each(LOCALES)("$name UI copy carries no em dashes (DESIGN §7)", ({ cat }) => {
    const offenders = [...flatEntries(cat).entries()]
      .filter(([, v]) => typeof v === "string" && v.includes("—"))
      .map(([k]) => k)
      .sort();
    expect(offenders, `em dash in UI copy:\n${offenders.join("\n")}`).toEqual([]);
  });
});

// ── SLICE 8: the `ui/` shard layout is well-formed ───────────────────────────
//
// Each `ui/<group>.json` shard must hold EXACTLY its one top-level group, named
// after the file (`character.json` → `{ "character": { … } }`). This keeps the
// runtime merge a plain object-assign (no key rewriting) and the split boring +
// predictable, and pins EN ↔ IT shard parity at the FILE level too.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

describe("i18n ui/ shard layout (SLICE 8)", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../src/i18n");
  const shards = (loc: "en" | "it") =>
    readdirSync(join(root, loc, "ui"))
      .filter((f) => f.endsWith(".json"))
      .sort();

  it("EN and IT have the SAME set of ui/ shards", () => {
    expect(shards("it")).toEqual(shards("en"));
  });

  it.each(["en", "it"] as const)(
    "%s: every shard holds exactly its filename-named group",
    (loc) => {
      const offenders: string[] = [];
      for (const file of shards(loc)) {
        const group = file.replace(/\.json$/, "");
        const obj = JSON.parse(
          readFileSync(join(root, loc, "ui", file), "utf-8")
        ) as Record<string, unknown>;
        const keys = Object.keys(obj);
        if (keys.length !== 1 || keys[0] !== group) {
          offenders.push(`${loc}/ui/${file}: top-level keys = [${keys.join(", ")}]`);
        }
      }
      expect(
        offenders,
        `these shards don't hold exactly their filename group:\n${offenders.join("\n")}`
      ).toEqual([]);
    }
  );

  it("the old common.json monolith is gone (replaced by ui/ shards)", () => {
    for (const loc of ["en", "it"] as const) {
      expect(
        readdirSync(join(root, loc)).includes("common.json"),
        `${loc}/common.json should be deleted — it is split into ui/*.json`
      ).toBe(false);
    }
  });
});

// ── R3: the SRD content catalogues (LOCK 4 extended over `srd/`) ──────────────

const SRD_CATALOGUES: { file: string; en: Json; it: Json }[] = [
  { file: "spells", en: enSpells, it: itSpells },
  { file: "feats", en: enFeats, it: itFeats },
  { file: "races", en: enRaces, it: itRaces },
  { file: "backgrounds", en: enBackgrounds, it: itBackgrounds },
  { file: "conditions", en: enConditions, it: itConditions },
  { file: "equipment", en: enEquipment, it: itEquipment },
  { file: "magic-items", en: enMagicItems, it: itMagicItems },
  { file: "maneuvers", en: enManeuvers, it: itManeuvers },
  { file: "metamagic", en: enMetamagic, it: itMetamagic },
  { file: "invocations", en: enInvocations, it: itInvocations },
  { file: "classes", en: enClasses, it: itClasses },
  { file: "subclasses", en: enSubclasses, it: itSubclasses },
  { file: "class-features", en: enClassFeatures, it: itClassFeatures },
  { file: "languages", en: enLanguages, it: itLanguages },
  { file: "proficiencies", en: enProficiencies, it: itProficiencies },
  { file: "weapon-properties", en: enWeaponProperties, it: itWeaponProperties },
  { file: "beasts", en: enBeasts, it: itBeasts },
  { file: "monsters", en: enMonsters, it: itMonsters },
];

describe("SRD content i18n EN ↔ IT parity + no-empty (R3, LOCK 4 over srd/)", () => {
  it.each(SRD_CATALOGUES)(
    "$file: key-for-key parity both directions",
    ({ file, en, it: itCat }) => {
      const par = parityViolations(`srd/${file}`, en, itCat);
      expect(par.missingInB, `IT missing:\n${par.missingInB.join("\n")}`).toEqual([]);
      expect(par.missingInA, `EN missing:\n${par.missingInA.join("\n")}`).toEqual([]);
    }
  );

  it.each(SRD_CATALOGUES)(
    "$file: no empty value in either locale",
    ({ en, it: itCat }) => {
      for (const cat of [en, itCat]) {
        const empty = emptyValues(cat);
        expect(empty, `empty values:\n${empty.join("\n")}`).toEqual([]);
      }
    }
  );
});

// ── English-in-IT leak guard (owner audit 2026-06-10, Part 1) ─────────────────
//
// Parity (above) catches a MISSING IT key; it cannot catch an IT value that is
// PRESENT but still English — a string byte-identical to its EN counterpart that
// the R3 codemod placeholder-copied because the IT was never authored at the data
// layer. `englishInItLeaks` flags a value ONLY when EN == IT *and* it contains
// strong English-only words (function words / giveaway phrasing that are NOT
// Italian cognates) — so legit-identical proper nouns ("Blackrazor"), loanwords
// adopted into IT D&D ("Warlock", "Ranger", "Round", "Bonus") and abbreviations
// ("INT") never trip it.
//
// The audit found the leak isolated to `magic-items.json`: the DMG items (NOT in
// the CC-BY SRD 5.2.1) were unauthored English. P4 translated them, so the frozen
// baseline (`__fixtures__/i18n-magic-item-untranslated.json`) is now empty and may
// only SHRINK; ANY new English-in-IT leak — in any catalogue, or a new magic item —
// fails here AND fails the build gate (the SAME `englishInItLeaks` detector).
describe("no English-in-IT leak (R3, beyond parity)", () => {
  it.each(SRD_CATALOGUES.filter((c) => c.file !== "magic-items"))(
    "$file: no untranslated English value in IT",
    ({ en, it: itCat }) => {
      const found = englishInItLeaks(en, itCat)
        .map((l) => `${l.id}.${l.field}`)
        .sort();
      expect(
        found,
        "these IT values are byte-identical to English and read as English — " +
          "translate via the SRD 5.2.1 cascade:\n" +
          found.join("\n")
      ).toEqual([]);
    }
  );

  it("magic-items: the English-in-IT leak set only ever SHRINKS (P4 batch)", () => {
    const found = englishInItLeaks(enMagicItems, itMagicItems);
    const foundByField = (field: string) =>
      new Set(found.filter((l) => l.field === field).map((l) => l.id));
    const desc = foundByField("description");
    const name = foundByField("name");
    // P4 emptied the frozen baseline (every DMG magic-item now translated), so the
    // JSON arrays infer as `never[]` — annotate the Sets as string sets explicitly.
    const baselineDesc = new Set<string>(MI_UNTRANSLATED.description);
    const baselineName = new Set<string>(MI_UNTRANSLATED.name);

    // No NEW leak may appear (a new untranslated magic item / field).
    const newDesc = [...desc].filter((id) => !baselineDesc.has(id)).sort();
    const newName = [...name].filter((id) => !baselineName.has(id)).sort();
    expect(
      newDesc,
      `new untranslated magic-item description(s):\n${newDesc.join("\n")}`
    ).toEqual([]);
    expect(
      newName,
      `new untranslated magic-item name(s):\n${newName.join("\n")}`
    ).toEqual([]);

    // The baseline must not list an id P4 has already translated (keep it honest).
    const staleDesc = [...baselineDesc].filter((id) => !desc.has(id)).sort();
    const staleName = [...baselineName].filter((id) => !name.has(id)).sort();
    expect(
      staleDesc,
      "translated — remove from baseline `description`:\n" + staleDesc.join("\n")
    ).toEqual([]);
    expect(
      staleName,
      "translated — remove from baseline `name`:\n" + staleName.join("\n")
    ).toEqual([]);
  });
});
