/**
 * Setting, swapping or clearing Concentration as a pure play transition: the
 * character in, the next character out. Concentration is a flag on the statuses it
 * holds, so ending or swapping it ends every status the dropped spell holds (one
 * `endStatuses` patch) and, when the dropped spell sustains a self Beast form, the
 * form too (body restored, Beast Temp HP retracted).
 */
import { revertBuildFromPrior } from "@/lib/polymorph";
import { concentrationTimerKey } from "@/lib/spell-duration";
import { concentrationStatusKeys, endStatuses } from "@/lib/status";
import { concentrationValue } from "@/lib/concentration";
import {
  boundaryCommitFacts,
  characterWorldState,
  commitCharacterAction,
  engineConcentrationHandle,
  persistedWorldUid,
  planEngineConcentrationEnd,
} from "@/lib/mechanics-world-store";
import type { CharacterData, CharacterDoc, SessionState } from "@/types/character";
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
  const prev = doc.session.concentration;
  // A readied spell lives only as long as the concentration holding it.
  const { readiedSpell, ...withoutReadied } = doc.session;
  const session = prev === spell || !readiedSpell ? doc.session : withoutReadied;
  const form = session.polymorphForm;
  // A self form ends when its sustaining spell is dropped or swapped (never on a
  // self-assume, which sets concentration before stamping the form).
  const retractForm = form !== undefined && prev === form.spellId && prev !== spell;
  const revertBuild = retractForm ? revertBuildFromPrior(form.prior) : undefined;
  // The dropped spell's statuses end, and its own countdown with them.
  const droppedActiveKeys =
    prev && prev !== spell
      ? [...concentrationStatusKeys(prev), concentrationTimerKey(prev)]
      : [];
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

/**
 * End the ENGINE-held concentration occurrence when the sheet drops the same spell:
 * the world-side twin of {@link changeConcentration}'s teardown, through the canonical
 * kernel end (`planEngineConcentrationEnd`: the root, the concentration effect and
 * every standing it sourced end in one wave), committed as one journal action whose
 * mirror keeps `session.concentration` coherent. The caller mints `actionId` and keeps
 * it, so an undo can reverse that very action. Null when the
 * world holds no matching engine concentration (the sheet's teardown is then complete).
 */
export function endEngineConcentration(
  doc: CharacterDoc,
  droppedSpell: StoredConcentration,
  actionId: string
): SessionState | null {
  if (doc.session.world === undefined) return null;
  const uid = persistedWorldUid(doc.session.world);
  if (uid === null) return null;
  const world = characterWorldState(doc, uid, doc.character.hp.max);
  if (!world) return null;
  const handle = engineConcentrationHandle(world);
  if (!handle || handle.spellId === null) return null;
  if (concentrationValue(handle.spellId) !== droppedSpell) return null;
  const action = planEngineConcentrationEnd(doc, uid, world, actionId);
  if (!action) return null;
  return (
    commitCharacterAction(doc, uid, world, action, boundaryCommitFacts(action))
      ?.session ?? null
  );
}

/**
 * The whole concentration change as one sheet transition: the sheet's teardown, then
 * the engine's when the dropped spell was engine-held.
 */
export function setConcentration(
  doc: CharacterDoc,
  spell: StoredConcentration,
  engineActionId: string,
  opts: { castLevel?: number; retractedFormTempHp?: number } = {}
): CharacterDoc {
  const prev = doc.session.concentration;
  const changed = changeConcentration(doc, spell, opts).doc;
  if (!prev || prev === spell) return changed;
  const ended = endEngineConcentration(changed, prev, engineActionId);
  return ended ? { ...changed, session: ended } : changed;
}
