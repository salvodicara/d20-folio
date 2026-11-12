/**
 * The checks an action asks for on the new Play screen (headless), as the classic
 * action card enters them: Hide (DC 15 Stealth; success = Invisible, the total is the
 * DC to find you), escaping a grapple (the better of Athletics and Acrobatics against
 * the DM's DC), and the skill check of Search, Study or Influence (committed with the
 * action through `withCheckResult`). The player rolls the d20 at the table and enters
 * the face; the sheet adds its bonus and applies the outcome in one undoable step.
 */
import type { TFunction } from "i18next";
import { aggregateCharacterGrants, effectiveConditions } from "@/lib/aggregate-character";
import { vitalExhaustion } from "@/lib/character-vitals";
import {
  ESCAPE_GRAPPLE_ACTION_ID,
  escapeGrappleSkill,
  judgeEscapeGrapple,
} from "@/lib/play/escape-grapple";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableResult } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

function skillRows(doc: CharacterDoc) {
  return deriveSavesAndChecks(doc.character, {
    exhaustion: vitalExhaustion(doc.session),
    ...(doc.session.tableRules ? { tableRules: doc.session.tableRules } : {}),
    activeFeatures: doc.session.activeFeatures,
    conditions: effectiveConditions(doc),
    grantBundleChoices: doc.session.grantBundleChoices,
    fadingPenalties: doc.session.fadingPenalties,
    activeForm: doc.session.activeForm,
  }).skills;
}

/** A skill's bonus as the sheet shows it (the one shared skills derivation). */
export function skillBonusFor(doc: CharacterDoc): (skillId: string) => number {
  const rows = skillRows(doc);
  return (skillId) => rows.find((r) => r.id === skillId)?.bonus ?? 0;
}

/**
 * The lowest d20 face a check with this skill counts (Reliable Talent: a 9 or lower
 * counts as 10 on a skill you are proficient in; Expertise counts, half proficiency
 * does not). 1 when nothing raises it.
 */
export function skillFaceFloorFor(doc: CharacterDoc): (skillId: string) => number {
  const rows = skillRows(doc);
  const floors = aggregateCharacterGrants(doc.character, doc.session).rollFloors.filter(
    (f) => f.rollType === "check" && f.floor > 1
  );
  return (skillId) => {
    const row = rows.find((r) => r.id === skillId);
    if (!row) return 1;
    const proficient =
      row.proficiency === "proficient" || row.proficiency === "expertise";
    return floors.reduce(
      (best, f) =>
        (f.appliesTo === "all" || proficient) && (!f.ability || f.ability === row.ability)
          ? Math.max(best, f.floor)
          : best,
      1
    );
  };
}

export type CheckEntry =
  | { kind: "hide"; dc: number; skill: string; bonus: number; floor: number }
  | { kind: "escape"; skill: string; bonus: number; floor: number }
  | { kind: "check"; skills: Array<{ id: string; bonus: number; floor: number }> };

/** The check entries one action carries, in the classic card's order. */
export function checkEntriesFor(
  action: Pick<ResolvedAction, "id" | "summary">,
  bonusFor: (skillId: string) => number,
  floorFor: (skillId: string) => number = () => 1
): CheckEntry[] {
  const entries: CheckEntry[] = [];
  const { skillCheck, checkSkills } = action.summary;
  if (skillCheck)
    entries.push({
      kind: "hide",
      dc: skillCheck.dc,
      skill: skillCheck.skill,
      bonus: bonusFor(skillCheck.skill),
      floor: floorFor(skillCheck.skill),
    });
  if (checkSkills)
    entries.push({
      kind: "check",
      skills: checkSkills.map((id) => ({ id, bonus: bonusFor(id), floor: floorFor(id) })),
    });
  if (action.id === ESCAPE_GRAPPLE_ACTION_ID) {
    const escape = escapeGrappleSkill(bonusFor);
    entries.push({ kind: "escape", ...escape, floor: floorFor(escape.skill) });
  }
  return entries;
}

/** Apply an entered Hide d20 on the open sheet. False when it fails or changes
 *  nothing (a plain notice, no undo entry). */
export function applyHideCheck(
  face: number,
  check: { dc: number; bonus: number },
  t: TFunction
): boolean {
  const total = face + check.bonus;
  if (total < check.dc) {
    useToastStore.getState().showToast({
      message: t("combat.hideFailToast", { total, dc: check.dc }),
      duration: 4000,
    });
    return false;
  }
  const undo = useCharacterStore.getState().applyHiddenState(total);
  if (!undo) return false;
  registerUndoableResult({ message: t("combat.hideSuccessToast", { total }) }, undo, () =>
    applyHideCheck(face, check, t)
  );
  return true;
}

/** Apply an entered escape d20 on the open sheet: at or over the DC, Grappled ends. */
export function applyEscapeCheck(
  face: number,
  dc: number,
  bonus: number,
  t: TFunction
): boolean {
  const { total, escaped } = judgeEscapeGrapple(face, bonus, dc);
  if (!escaped) {
    useToastStore.getState().showToast({
      message: t("combat.escapeFailToast", { total, dc }),
      duration: 4000,
    });
    return false;
  }
  const undo = useCharacterStore.getState().removeConditionSilent("grappled");
  if (!undo) return false;
  registerUndoableResult(
    { message: t("combat.escapeSuccessToast", { total, dc }) },
    undo,
    () => applyEscapeCheck(face, dc, bonus, t)
  );
  return true;
}
