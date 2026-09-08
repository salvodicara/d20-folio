/**
 * Background starting-equipment source declarations.
 *
 * The 2024 PHB gives every background an "Equipment: Choose A or B" line: a
 * gear-heavy Option A (items + leftover gold) and an all-gold Option B (50 GP).
 * Classes carry the SAME `BackgroundEquipmentOption[]` shape (Fighter offers
 * three: A / B / C); `lib/background-equipment.ts` owns the SINGLE,
 * source-agnostic resolver they feed through (one option type, one resolver, one
 * picker recipe). This is CREATION-CONSUMED data — a one-time snapshot the
 * creation wizard writes onto the new character's `weapons` / `equipment` /
 * `currency`, NOT a `Grant` re-aggregated every render. Override-first: once
 * written, the player edits the gear freely and the engine never re-derives it.
 *
 * TWO item forms (see `BackgroundEquipmentItem`):
 *   - `srdId` — a resolvable SRD weapon/armor/gear row (dagger, leather-armor,
 *     thieves-tools, smiths-tools, bagpipes, perfume, robe, pouch, parchment,
 *     iron-pot, …). The resolver routes it to the character's `weapons` (weapon
 *     category) or `equipment` (everything else) as a typed SRD ref so it
 *     LOCALIZES through the id→`localizeSrd` seam. EVERY explicit pack member uses
 *     this form — the craft tools, gaming sets, kits, named gear, AND every former
 *     "flavour" item (each is a real 2024 adventuring-gear row now). There is NO
 *     inline-BiText escape hatch: an EN-baked custom string can never reach the IT
 *     inventory. A parametric count ("Parchment (10 sheets)") is `quantity`, never
 *     a baked string; a decorative annotation ("Book (prayers)") is dropped (the
 *     `book` row, localized "Libro"/"Book").
 *   - `fromToolChoice` — the "(same as above)" chosen-tool marker (a Monk/Bard class
 *     pack member; a "Choose one kind of <X>" background's instrument/set/tool). It
 *     resolves against the source's `choice-tool-proficiency` grant + the player's
 *     pick to the CONCRETE tool — never the umbrella.
 *
 * Facts verified against each `dnd2024.wikidot.com/background:<slug>` page —
 * each background's literal "Choose A or B" line. The 2024 backgrounds all use
 * the same B = 50 GP all-gold option.
 *
 * Pure module — no React / store / Firebase deps (safe for the CI lib gate).
 */
import type { BackgroundEquipmentItem, BackgroundEquipmentOption } from "./types";
import { mergePackRecord } from "@/lib/pack-merge";
import { packBackgroundEquipment } from "@pack";

// ── Item builders ───────────────────────────────────────────────────────────

/**
 * A resolvable SRD item line — the ONLY explicit item form a package carries
 * (besides the structural `fromToolChoice` marker). Every pack member is a real
 * SRD catalogue id, so it resolves to a LOCALIZED row through the same
 * id→`localizeSrd` seam as every other item — there is NO inline-BiText "flavour"
 * bypass any more (the escape hatch is deleted; a parametric count is `quantity`).
 */
function srd(srdId: string, quantity = 1): BackgroundEquipmentItem {
  return quantity === 1 ? { srdId } : { srdId, quantity };
}

// ── Pack-item catalog ──────────────────────────────────────────────────────────
//
// The recurring items across the 2024 background equipment lines, each a stable
// SRD catalogue id (modeled in `gear.ts` + named in `i18n/<l>/srd/equipment.json`).
// Centralised as tiny id shorthands so a pack reads declaratively. Every one
// resolves to a LOCALIZED row — never an EN-baked custom string.

// Concrete CRAFT tools a fixed-tool background lists in its pack ("(same as
// above)" for a fixed proficiency). The umbrella ids are the ONLY tools that are
// NOT concrete (they're choice placeholders — see `chosenTool`).
const calligraphersSupplies = () => srd("calligraphers-supplies");

/**
 * The "(same as above)" pack member — "the tool chosen for the tool proficiency
 * above". A background printing "Choose one kind of <Musical Instrument / Gaming
 * Set / Artisan's Tools>" lists that SAME chosen tool in its Option-A package
 * (the 2024 Entertainer's "Musical Instrument (same as above)", the Guard's
 * "Gaming Set (same as above)", …). It is the `fromToolChoice` STRUCTURAL marker
 * — NOT a hardcoded tool id, never a baked locale string — that resolves against
 * the background's own `choice-tool-proficiency` grant + the player's pick, so the
 * chosen instrument/set is BOTH the proficiency AND the kit item (golden rule 6),
 * exactly like the Monk/Bard class packs. The umbrella never survives as a raw item.
 */
const chosenTool = (): BackgroundEquipmentItem => ({ fromToolChoice: true });

/**
 * A "Gaming Set (any)" gear-only umbrella — the Wayfarer's pack lists a Gaming Set
 * as GEAR with no matching tool proficiency ("any", not "same as above"). With no
 * `choice-tool-proficiency` grant to anchor a `fromToolChoice` marker, it resolves
 * to a concrete localized default (Dice Set) the player can swap in their
 * inventory (override-first), rather than an EN-baked "Gaming Set" custom string.
 */
// Concrete adventuring gear the SRD names AND the catalogue models — resolved as
// LOCALIZED `SRD_GEAR` rows (Perfume → "Profumo", Robe → "Veste", …), never an
// EN-baked custom string (the same no-EN-leak discipline as the chosen tool).
const holySymbol = () => srd("holy-symbol");
const robe = () => srd("robe");

// Parchment + Paper are sold per SHEET, so "Parchment (10 sheets)" is QUANTITY
// 10 of the `parchment` row (the ×N badge carries the count — no baked "(N
// sheets)" string). A topic-bearing "Book (prayers)" is just the `book` row —
// the topic is decorative flavour, not a mechanical fact, so it's not modeled
// (declare the LEAST; one Book item, localized "Libro"/"Book").
const parchment = (sheets: number) => srd("parchment", sheets);
const book = () => srd("book");
const pouch = (n = 1) => srd("pouch", n);

// One-off adventuring-gear pack members — each a real SRD catalogue row.
const quiver = () => srd("quiver");
// Bundle items list `quantity` as the INDIVIDUAL-unit count (weight divides by
// `bundleSize` in the inventory, mirroring the class packs' `arrows: 20`): Iron
// Spikes in tens, Arrows + Bolts in twenties — one printed bundle each.
const arrowBundle = () => srd("arrows", 20);

// Convenience SRD-id shorthands for the most common gear lines.
const travelersClothes = () => srd("clothes-travelers");

/** The 50-GP all-gold Option B that every 2024 background offers. */
const OPTION_B: BackgroundEquipmentOption = { label: "B", items: [], gold: 50 };

// ── Per-background packages ───────────────────────────────────────────────────
//
// Keyed by background id; merged into SRD_BACKGROUNDS by id in backgrounds.ts.
// Each verified against the scrape's literal "Choose A or B" line.

const PUBLIC_STARTING_EQUIPMENT_BY_BG: Readonly<
  Record<string, ReadonlyArray<BackgroundEquipmentOption>>
> = {
  // ── Core SRD backgrounds ──
  acolyte: [
    {
      label: "A",
      items: [calligraphersSupplies(), book(), holySymbol(), parchment(10), robe()],
      gold: 8,
    },
    OPTION_B,
  ],
  criminal: [
    {
      label: "A",
      items: [
        srd("dagger", 2),
        srd("thieves-tools"),
        srd("crowbar"),
        pouch(2),
        travelersClothes(),
      ],
      gold: 16,
    },
    OPTION_B,
  ],
  sage: [
    {
      label: "A",
      items: [srd("quarterstaff"), calligraphersSupplies(), book(), parchment(8), robe()],
      gold: 8,
    },
    OPTION_B,
  ],
  soldier: [
    {
      label: "A",
      items: [
        srd("spear"),
        srd("shortbow"),
        arrowBundle(),
        chosenTool(),
        srd("healers-kit"),
        quiver(),
        travelersClothes(),
      ],
      gold: 14,
    },
    OPTION_B,
  ],
};

/** Per-background starting-equipment packages — public SRD + content pack. */
export const STARTING_EQUIPMENT_BY_BG: Readonly<
  Record<string, ReadonlyArray<BackgroundEquipmentOption>>
> = mergePackRecord(
  "background-equipment",
  PUBLIC_STARTING_EQUIPMENT_BY_BG,
  packBackgroundEquipment
);
