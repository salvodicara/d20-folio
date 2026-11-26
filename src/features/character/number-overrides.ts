/**
 * The hand-set numbers' write moves (#1230, gap map E2), shared by the new Play
 * screen's number panes («Personalizza», D&D Beyond's «Customize») and the classic
 * sheet's inline editors, so both UIs write a hand-set number the same way.
 *
 * Every value is the number's TOTAL as the sheet shows it (an AC of 21, a Stealth of
 * +9, an effective Strength of 19), in feet for speed. `null` resets to the computed
 * value. The stored shapes, as the classic editors write them:
 * - AC writes `acOverride` and its roster snapshot `ac` together; reset puts the
 *   computed AC back in the snapshot.
 * - initiative, speed and proficiency each have one nullable field.
 * - saves, skills and ability scores are keyed maps; reset drops the key.
 * - max HP is stored as its INPUT (#1315): `hpBonus` = typed max − derived max, so a
 *   level-up or a CON change still moves it; reset drops the bonus.
 * - each passive score has its own nullable field.
 */
import type { AbilityCode } from "@/data/types";
import {
  aggregateCharacterGrants,
  computeCharacterAC,
  deriveMaxHp,
  withMaxHpEdit,
  withoutMaxHpBonus,
} from "@/lib/aggregate-character";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterData } from "@/types/character";

import { patchCharacter } from "./patch-character";

export type SheetNumberKey =
  | { kind: "ac" }
  | { kind: "initiative" }
  | { kind: "speed" }
  | { kind: "proficiency" }
  | { kind: "maxHp" }
  | { kind: "ability"; ability: AbilityCode }
  | { kind: "save"; ability: AbilityCode }
  | { kind: "skill"; id: string }
  | { kind: "passive"; id: PassiveId };

export type PassiveId = "perception" | "insight" | "investigation";

/** The stored field of each passive score's hand-set value. */
const PASSIVE_FIELD = {
  perception: "passivePerceptionOverride",
  insight: "passiveInsightOverride",
  investigation: "passiveInvestigationOverride",
} as const satisfies Record<PassiveId, keyof CharacterData>;

/** The hand-set total stored for this number, or null when it is computed. */
export function storedOverride(c: CharacterData, key: SheetNumberKey): number | null {
  switch (key.kind) {
    case "ac":
      return c.acOverride ?? null;
    case "initiative":
      return c.initiativeBonusOverride ?? null;
    case "speed":
      return c.speedOverride ?? null;
    case "proficiency":
      return c.proficiencyBonusOverride ?? null;
    case "maxHp":
      // Hand-set when it carries a bonus or the stored max is not the derived one
      // (the breakdown's «Correzione manuale» test).
      return c.hpBonus || c.hp.max !== deriveMaxHp(c) ? c.hp.max : null;
    case "ability":
      return c.abilityScoreOverrides?.[key.ability] ?? null;
    case "save":
      return c.savingThrowBonusOverrides?.[key.ability] ?? null;
    case "skill":
      return c.skillBonusOverrides?.[key.id] ?? null;
    case "passive":
      return c[PASSIVE_FIELD[key.id]] ?? null;
  }
}

/** A keyed map with `id` set to `value`, or without `id` when `value` is null. */
function withKey<K extends string>(
  map: Partial<Record<K, number>> | undefined,
  id: K,
  value: number | null
): Partial<Record<K, number>> {
  const others = Object.entries(map ?? {}).filter(([k]) => k !== id);
  return Object.fromEntries(
    value === null ? others : [...others, [id, value]]
  ) as Partial<Record<K, number>>;
}

function overridePatch(
  doc: NonNullable<ReturnType<typeof useCharacterStore.getState>["character"]>,
  key: SheetNumberKey,
  value: number | null
): Partial<CharacterData> {
  const c = doc.character;
  switch (key.kind) {
    case "ac":
      return {
        acOverride: value,
        ac:
          value ??
          computeCharacterAC(
            c,
            aggregateCharacterGrants(c, doc.session),
            doc.session.itemResources
          ),
      };
    case "initiative":
      return { initiativeBonusOverride: value };
    case "speed":
      return { speedOverride: value };
    case "proficiency":
      return { proficiencyBonusOverride: value };
    case "maxHp": {
      const next = value === null ? withoutMaxHpBonus(c) : withMaxHpEdit(c, value);
      return { hpBonus: next.hpBonus, hp: next.hp };
    }
    case "ability": {
      const abilityScoreOverrides = withKey(c.abilityScoreOverrides, key.ability, value);
      // A CON pin moves max HP across every level (#1318): re-derive it with the pin.
      return key.ability === "CON"
        ? {
            abilityScoreOverrides,
            hp: { ...c.hp, max: deriveMaxHp({ ...c, abilityScoreOverrides }) },
          }
        : { abilityScoreOverrides };
    }
    case "save":
      return {
        savingThrowBonusOverrides: withKey(
          c.savingThrowBonusOverrides,
          key.ability,
          value
        ),
      };
    case "skill":
      return {
        skillBonusOverrides: withKey(c.skillBonusOverrides, key.id, value) as Record<
          string,
          number
        >,
      };
    case "passive":
      return { [PASSIVE_FIELD[key.id]]: value };
  }
}

/**
 * Hand-set one number (or reset it with `null`), with the 5 s undo that puts back
 * exactly the fields it changed. Inert on a read-only sheet (`patchCharacter`).
 */
export function setNumberOverride(
  key: SheetNumberKey,
  value: number | null,
  message: string
): void {
  const state = useCharacterStore.getState();
  const doc = state.character;
  if (!doc || state.readonly) return;
  const patch = overridePatch(doc, key, value);
  const before = Object.fromEntries(
    Object.keys(patch).map((k) => [k, doc.character[k as keyof CharacterData]])
  ) as Partial<CharacterData>;
  registerUndoableToast(
    { message },
    () => {
      patchCharacter(patch);
      return () => patchCharacter(before);
    },
    { turnScoped: false }
  );
}
