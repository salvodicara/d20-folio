/**
 * Setting, swapping or clearing Concentration as a pure play transition: the
 * character in, the next character out. Concentration is a flag on the statuses it
 * holds, so ending or swapping it ends every status the dropped spell holds (one
 * `endStatuses` patch) and, when the dropped spell sustains a self Beast form, the
 * form too (body restored, Beast Temp HP retracted).
 */
import { revertBuildFromPrior } from "@/lib/polymorph";
import { concentrationStatusKeys, endStatuses } from "@/lib/status";
import type { CharacterData, CharacterDoc } from "@/types/character";
import type { StoredConcentration } from "@/types/ids";

export interface ConcentrationChange {
  doc: CharacterDoc;
  /** The status keys the dropped spell held (they ended). */
  droppedActiveKeys: string[];
  /** The body fields restored when a Beast form ended with its spell. */
  revertBuild?: Partial<CharacterData>;
}

export function changeConcentration(
  doc: CharacterDoc,
  spell: StoredConcentration,
  opts: { castLevel?: number; retractedFormTempHp?: number } = {}
): ConcentrationChange {
  const { session } = doc;
  const prev = session.concentration;
  const form = session.polymorphForm;
  // A self form ends when its sustaining spell is dropped or swapped (never on a
  // self-assume, which sets concentration before stamping the form).
  const retractForm = form !== undefined && prev === form.spellId && prev !== spell;
  const revertBuild = retractForm ? revertBuildFromPrior(form.prior) : undefined;
  const droppedActiveKeys = prev && prev !== spell ? concentrationStatusKeys(prev) : [];
  const ended = endStatuses(session, droppedActiveKeys);
  return {
    doc: {
      ...doc,
      ...(revertBuild ? { character: { ...doc.character, ...revertBuild } } : {}),
      session: {
        ...session,
        concentration: spell,
        concentrationCastLevel:
          spell && opts.castLevel && opts.castLevel > 0
            ? Math.round(opts.castLevel)
            : undefined,
        activeFeatures: ended.activeFeatures,
        activeSpellCastLevels: ended.activeSpellCastLevels,
        effectTimers: ended.effectTimers,
        effectBoundaries: ended.effectBoundaries,
        concentrationConditions:
          prev && prev !== spell ? undefined : session.concentrationConditions,
        ...(retractForm
          ? {
              polymorphForm: undefined,
              hp: {
                ...session.hp,
                temp: opts.retractedFormTempHp ?? form.prior.tempHp,
              },
            }
          : {}),
      },
    },
    droppedActiveKeys,
    ...(revertBuild ? { revertBuild } : {}),
  };
}
