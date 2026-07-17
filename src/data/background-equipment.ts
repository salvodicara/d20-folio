/**
 * Background starting-equipment data + the SHARED pure resolver.
 *
 * The 2024 PHB gives every background an "Equipment: Choose A or B" line: a
 * gear-heavy Option A (items + leftover gold) and an all-gold Option B (50 GP).
 * Classes carry the SAME `BackgroundEquipmentOption[]` shape (Fighter offers
 * three: A / B / C), so {@link resolveStartingEquipment} below is the SINGLE,
 * source-agnostic resolver both feed through (one option type, one resolver, one
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
import type { SrdEquipmentRef, SrdWeaponRef, CustomEquipment } from "@/types/character";
import { getEquipment } from "./equipment";
import { ARTISAN_TOOL_IDS, type ToolCategory } from "@/lib/tools";
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

// ── Resolver (the creation consumer's pure seam) ──────────────────────────────

/** The character-facing payload a chosen package resolves into. */
export interface ResolvedStartingEquipment {
  /** SRD weapon refs to merge into `character.weapons`. */
  weapons: SrdWeaponRef[];
  /**
   * Equipment refs to merge into `character.equipment` — every real pack member
   * resolves to a localized `SrdEquipmentRef`. The `CustomEquipment` arm is the
   * never-throw safety net for an UNRESOLVABLE id only (unreachable for real
   * data — the build-time guard pins every pack id to a modeled catalogue row).
   */
  equipment: (SrdEquipmentRef | CustomEquipment)[];
  /** Gold pieces (GP) to add to `character.currency.gp`. */
  gold: number;
}

const EMPTY_RESULT: ResolvedStartingEquipment = {
  weapons: [],
  equipment: [],
  gold: 0,
};

// ── Chosen-tool pack member (the `fromToolChoice` marker) ────────────────────
//
// A few classes' Option-A packs list "the tool chosen for the tool proficiency
// above" as an explicit member (Monk: Artisan's Tools OR Musical Instrument;
// Bard: a Musical Instrument of your choice). The pack carries a `fromToolChoice`
// MARKER rather than a hardcoded tool id; this ONE expansion drives BOTH the
// wizard preview AND the created character's inventory (golden rule 6 — the
// chosen tool appears EXACTLY once, never double-added).

/**
 * The kind of choice a `choice-tool-proficiency` grant offers, derived purely
 * from its option ids (never a locale string) — drives the placeholder wording
 * shown before the player picks. Monk's options span Artisan's Tools ∪ Musical
 * Instruments; Bard's are instruments only.
 */
/**
 * Canonical runtime list of the tool-choice placeholder kinds — source of truth
 * for the `create.equipToolChoice_<kind>` i18n keys. The {@link ToolChoiceKind}
 * union is derived from this tuple, so a new kind widens both at once and the i18n
 * coverage guard sees it (golden rule 6).
 */
export const ALL_TOOL_CHOICE_KINDS = [
  "artisan-or-instrument",
  "instrument",
  "artisan",
] as const;
export type ToolChoiceKind = (typeof ALL_TOOL_CHOICE_KINDS)[number];

const ARTISAN_TOOL_ID_SET = new Set(ARTISAN_TOOL_IDS);

/** Classify a grant's option ids into the placeholder kind (id-driven). */
export function toolChoiceKind(options: ReadonlyArray<string>): ToolChoiceKind {
  const hasArtisan = options.some((id) => ARTISAN_TOOL_ID_SET.has(id));
  const hasNonArtisan = options.some((id) => !ARTISAN_TOOL_ID_SET.has(id));
  if (hasArtisan && hasNonArtisan) return "artisan-or-instrument";
  if (hasArtisan) return "artisan";
  return "instrument";
}

/**
 * The representative {@link ToolCategory} for a placeholder kind — drives the seal
 * glyph on an un-picked `fromToolChoice` line. EXHAUSTIVE (a new kind is a compile
 * error here): a pure instrument choice reads the instrument note, everything that
 * includes Artisan's Tools (artisan-only OR the artisan-or-instrument union) reads
 * the artisan hammer. No "default" branch — the kind→category map is total.
 */
export function toolChoiceKindCategory(kind: ToolChoiceKind): ToolCategory {
  switch (kind) {
    case "instrument":
      return "instrument";
    case "artisan":
    case "artisan-or-instrument":
      return "artisan";
  }
}

/**
 * The context a `fromToolChoice` marker resolves against: the source's
 * `choice-tool-proficiency` grant options (for the placeholder wording) and the
 * player's CURRENT picks for that slot (the single source — the SAME picks drive
 * the derived proficiency). Built by the caller from the class grant + the
 * creation tool picks; threaded through the resolver and the preview presenter
 * so render AND create agree by construction.
 */
export interface ToolChoiceContext {
  /** The grant's pickable option ids — classifies the placeholder kind. */
  options: ReadonlyArray<string>;
  /** The player's chosen tool ids (empty before a pick → placeholder). */
  pickedIds: ReadonlyArray<string>;
}

/**
 * Expand a `fromToolChoice` marker against its context — the STRUCTURAL core
 * shared by the engine resolver (`resolveStartingEquipment`, builds inventory)
 * and the localizing preview presenter (`resolveStartingItems`, builds the wizard
 * VM). Returns either the resolved picked tool ids (sliced to `count`) or a
 * PLACEHOLDER descriptor (count + kind) when nothing is picked yet — each layer
 * then localizes per its own seam (engine = a custom row label, presenter = a
 * placeholder string). i18n-free: this core deals only in ids.
 */
export function expandToolChoiceItem(
  count: number,
  ctx: ToolChoiceContext | undefined
):
  | { kind: "resolved"; toolIds: string[] }
  | { kind: "placeholder"; count: number; choiceKind: ToolChoiceKind } {
  const picked = ctx?.pickedIds ?? [];
  if (picked.length > 0) {
    return { kind: "resolved", toolIds: picked.slice(0, count) };
  }
  return {
    kind: "placeholder",
    count,
    choiceKind: toolChoiceKind(ctx?.options ?? []),
  };
}

/**
 * Resolve a chosen starting-equipment option into character weapons / equipment
 * / gold. SOURCE-AGNOSTIC — the single resolver shared by CLASS and BACKGROUND
 * starting equipment (both carry the same `BackgroundEquipmentOption[]` shape).
 * OVERRIDE-FIRST creation seam:
 *
 *   1. an explicit `optionLabel` matching one of the options (the player picked
 *      "A" / "B" / "C");
 *   2. otherwise the FIRST option (Option A — the suggested gear default) when
 *      packages exist;
 *   3. an empty result when there is no `startingEquipment` data (an unknown
 *      source) or `options` is empty — never throws, never fabricates gear. A
 *      label that doesn't match any option still falls back to Option A rather
 *      than dropping to empty.
 *
 * SRD-backed `srdId` items route to `weapons` (weapon category) or `equipment`
 * (everything else) as typed SRD refs that LOCALIZE — every pack member is one
 * (there is no name-only form). A `fromToolChoice` MARKER expands against
 * `toolChoice` (the source's tool-proficiency grant + the player's pick) to the
 * chosen tool item(s) — the SAME expansion the wizard preview uses, so the chosen
 * tool lands in the new character EXACTLY once (golden rule 6; the creation
 * wizard no longer appends it separately). The returned arrays are fresh (callers
 * may mutate them); the source data is never touched.
 */
export function resolveStartingEquipment(
  options: ReadonlyArray<BackgroundEquipmentOption> | undefined,
  optionLabel?: string,
  toolChoice?: ToolChoiceContext
): ResolvedStartingEquipment {
  if (!options || options.length === 0) return { ...EMPTY_RESULT };

  const picked = optionLabel?.trim();
  const chosen =
    (picked ? options.find((o) => o.label === picked) : undefined) ?? options[0];
  if (!chosen) return { ...EMPTY_RESULT };

  const weapons: SrdWeaponRef[] = [];
  const equipment: (SrdEquipmentRef | CustomEquipment)[] = [];

  /** Route ONE resolved SRD id (qty 1) into weapons / equipment / custom row. */
  const routeSrdId = (srdId: string): void => {
    const srdItem = getEquipment(srdId);
    if (srdItem?.category === "weapon") {
      weapons.push({ srdId, quantity: 1 });
    } else if (srdItem) {
      equipment.push({ srdId });
    } else {
      // Unresolvable SRD id — keep a labelled custom row instead of dropping it
      // (mirrors the wizard's STARTEQ-LOSS handling), surfacing it for manual fix.
      equipment.push({ custom: true, name: srdId });
    }
  };

  for (const item of chosen.items) {
    if (item.fromToolChoice) {
      // The chosen tool pack member — expand to the picked tool(s). Pre-pick (no
      // context/pick) this stays unresolved; at creation the pick is always made.
      const expanded = expandToolChoiceItem(item.quantity ?? 1, toolChoice);
      if (expanded.kind === "resolved") {
        for (const toolId of expanded.toolIds) routeSrdId(toolId);
      }
      // No `else` — an unpicked marker contributes no inventory row (the wizard
      // preview shows the placeholder; a created character has always picked).
      continue;
    }
    // Every explicit pack member is an `srdId` (the name-only form is gone).
    const quantity = item.quantity ?? 1;
    const srdItem = getEquipment(item.srdId);
    if (srdItem?.category === "weapon") {
      weapons.push({ srdId: item.srdId, quantity });
    } else if (srdItem) {
      equipment.push({
        srdId: item.srdId,
        ...(quantity > 1 ? { quantity } : {}),
      });
    } else {
      // Unresolvable SRD id — keep a labelled custom row instead of dropping it
      // (the build-time guard makes this unreachable for real data; this is the
      // never-throw safety net for an unknown source).
      equipment.push({
        custom: true,
        name: item.srdId,
        ...(quantity > 1 ? { quantity } : {}),
      });
    }
  }

  return { weapons, equipment, gold: chosen.gold };
}
