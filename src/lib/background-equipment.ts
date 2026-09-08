import type { BackgroundEquipmentOption } from "@/data/types";
import type { SrdEquipmentRef, SrdWeaponRef, CustomEquipment } from "@/types/character";
import { getEquipment } from "@/data/equipment";
import { getBackgroundEquipmentOptions } from "@/data/backgrounds";
import { ARTISAN_TOOL_IDS, type ToolCategory } from "@/lib/tools";
import { createItemInstanceId } from "@/lib/item-resources";

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
      equipment.push({ custom: true, name: srdId, instanceId: createItemInstanceId() });
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
        instanceId: createItemInstanceId(),
        ...(quantity > 1 ? { quantity } : {}),
      });
    }
  }

  return { weapons, equipment, gold: chosen.gold };
}

/**
 * Resolve a background's CHOSEN starting-equipment option into character
 * weapons / equipment / gold — the single override-first creation seam (mirrors
 * `getBackgroundOriginFeat`). `value` accepts the id / EN-name / IT-name forms
 * `findBackground` does; `optionLabel` is the player's pick ("A" / "B"), falling
 * back to Option A (the suggested gear default). Returns an empty payload for an
 * unknown background — never throws.
 */
export function getBackgroundStartingEquipment(
  value: string,
  optionLabel?: string
): ResolvedStartingEquipment {
  return resolveStartingEquipment(getBackgroundEquipmentOptions(value), optionLabel);
}
