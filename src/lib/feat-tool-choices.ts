/**
 * Resolve `choice-tool-proficiency` grants on feats / classes / backgrounds.
 *
 * Crafter (3 Artisan's Tools), Musician (3 Musical Instruments), Monk
 * ("Artisan's Tools or a Musical Instrument"), Bard ("3 Musical Instruments"),
 * a "Choose one kind of <X>" background, and any future source that grants tool
 * proficiencies from a constrained pool. Separate from the Skilled-style unified
 * picker so the player only picks from the relevant tools, not the full
 * skill+tool universe.
 *
 * Pure module — no React/store deps. A pick is stored as the chosen STABLE TOOL
 * IDS in `character.toolChoices`, keyed by the namespaced choice SLOT id (the
 * SAME `Record<slotId, ids>` shape `collectChoiceSlots` produces). The tool
 * PROFICIENCY and the `fromToolChoice` pack ITEM both DERIVE from those ids
 * (golden rules 6 + 7) — never a baked locale string. See
 * `resolveAllGrantSources` (the synthetic tool-choice grant source) and
 * `toolChoiceContextForSource`.
 */
import type { Grant } from "@/lib/grants";
import { arePicksComplete } from "@/lib/feat-choices-common";
import type { CharacterData } from "@/types/character";

/** One pending tool slot derived from a feat's grants. */
export interface ToolChoiceSlot {
  amount: number;
  slotId: string;
  /** SRD tool ids the player may pick from (constrained to this slot). */
  options: ReadonlyArray<string>;
}

export type ToolChoicePicks = Record<string, ReadonlyArray<string>>;

/**
 * Walk a feat's grants and return one slot per `choice-tool-proficiency`
 * entry. The Skilled-style unified grant
 * (`choice-skill-or-tool-proficiency`) is handled by a separate picker
 * — this one only fires for pure-tool grants.
 */
export function pendingToolSlotsForFeat(feat: {
  grants?: ReadonlyArray<Grant>;
}): ToolChoiceSlot[] {
  const slots: ToolChoiceSlot[] = [];
  let idx = 0;
  for (const g of feat.grants ?? []) {
    if (g.type === "choice-tool-proficiency") {
      slots.push({ amount: g.amount, slotId: `slot-${idx++}`, options: g.options });
    }
  }
  return slots;
}

/** Each slot must be filled to its required amount. */
export function isToolPicksComplete(
  slots: ReadonlyArray<ToolChoiceSlot>,
  picks: ToolChoicePicks
): boolean {
  return arePicksComplete(slots, picks);
}

/**
 * Record the tool picks into `character.toolChoices` as STABLE IDS, keyed by the
 * namespaced choice SLOT id (the SAME `Record<slotId, ids>` shape the caller holds
 * — the picks ARE already slot→ids). This is the id-based home for a tool-choice
 * pick: the tool PROFICIENCY is derived from these ids by the synthetic grant
 * source in `resolveAllGrantSources`, and the `fromToolChoice` pack ITEM by
 * `ToolChoiceContext.pickedIds` — one pick, both surfaces (golden rule 6), no
 * baked locale string (golden rule 7).
 *
 * Idempotent + non-destructive: per slot, only ids not already recorded are
 * appended; slots the picks don't touch are left as-is. Empty picks are a no-op.
 */
export function applyToolPicks(
  character: CharacterData,
  picks: ToolChoicePicks
): CharacterData {
  const slotIds = Object.keys(picks);
  if (slotIds.length === 0) return character;

  const next: Record<string, string[]> = {};
  for (const [slotId, ids] of Object.entries(character.toolChoices ?? {})) {
    next[slotId] = [...ids];
  }
  let changed = false;
  for (const slotId of slotIds) {
    const picked = picks[slotId] ?? [];
    if (picked.length === 0) continue;
    const existing = next[slotId] ?? [];
    const merged = [...existing];
    for (const id of picked) {
      if (!merged.includes(id)) merged.push(id);
    }
    if (merged.length !== existing.length || !(slotId in next)) {
      next[slotId] = merged;
      changed = true;
    }
  }
  if (!changed) return character;
  return { ...character, toolChoices: next };
}
