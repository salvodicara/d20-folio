/**
 * A cast spell's own identity and data, catalogue or homebrew alike, so every cast
 * seam (material cost, weapon binding, the state's choices, the states a cast lights,
 * cast-level scaling) reads the spell the same way. A catalogue spell is its SRD id
 * and catalogue entry; a homebrew one is its stable `instanceId` (never its name) and,
 * when it declares mechanics, its catalogue-shaped data (`homebrewSpellData`).
 */
import type { SrdSpellData } from "@/data/types";
import { getSpellById } from "@/data/spells";
import type { ResolvedAction } from "@/lib/smart-tracker";

type SpellFacts = Pick<
  ResolvedAction,
  "spellId" | "customSpellInstanceId" | "homebrewSpell"
>;

export type SpellIdentity =
  | { kind: "srd"; id: string }
  | { kind: "custom"; instanceId: string };

export function spellIdentityOf(action: SpellFacts): SpellIdentity | null {
  if (action.spellId) return { kind: "srd", id: action.spellId };
  if (action.customSpellInstanceId)
    return { kind: "custom", instanceId: action.customSpellInstanceId };
  return null;
}

/**
 * The one string key of a cast spell: the SRD id, or a homebrew spell's
 * `custom-spell-<instanceId>` (its action id and its data's `id`). What a feature's
 * `activatedByCast` names.
 */
export function spellKeyOf(action: SpellFacts): string | null {
  const identity = spellIdentityOf(action);
  if (!identity) return null;
  return identity.kind === "srd" ? identity.id : `custom-spell-${identity.instanceId}`;
}

/** The spell's data: the catalogue entry, or a structured homebrew spell's own. */
export function spellDataOf(action: SpellFacts): SrdSpellData | undefined {
  return action.spellId ? getSpellById(action.spellId) : action.homebrewSpell;
}
