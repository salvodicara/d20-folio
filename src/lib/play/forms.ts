/**
 * Pure play transitions for a self-transformation into a Beast form (Polymorph on
 * yourself): the character in, the transformed (or restored) character out. The
 * form's body patches are `lib/polymorph`'s; this composes them with the temporary
 * HP the form brings (WORLD-FIRST: the world's temp pool moves with it). The
 * Concentration that sustains the form stays the store's orchestration.
 */
import type { BeastStatBlock } from "@/data/types";
import {
  polymorphBuildPatch,
  revertBuildFromPrior,
  type PolymorphPrior,
} from "@/lib/polymorph";
import type { CharacterDoc } from "@/types/character";
import { commitWorldVitals, drainedTemporary, vitalsWithTemporary } from "./world-commit";

/** The character with its temporary HP set to `temp` (world pool included). */
function withTemp(doc: CharacterDoc, temp: number): CharacterDoc["session"] {
  const engine = commitWorldVitals(doc, "temp-hp-set", (state) => {
    if (state.vitals.hitPoints.temporary.current === temp) return null;
    state.vitals = vitalsWithTemporary(
      state.vitals,
      drainedTemporary(state.vitals.hitPoints.temporary, temp)
    );
    return state;
  });
  return {
    ...(engine ? engine.session : doc.session),
    hp: { ...doc.session.hp, temp },
  };
}

/**
 * Assume a Beast form: stamp its AC, speeds and scores into the override fields, take
 * Temporary HP equal to the Beast's HP (max-wins) and record the form with the body it
 * replaced. `prior` is the caster's own snapshot (`polymorphPriorSnapshot`).
 */
export function assumeBeastForm(
  doc: CharacterDoc,
  beast: BeastStatBlock,
  spellId: string,
  prior: PolymorphPrior
): { doc: CharacterDoc; tempHp: number } {
  const tempHp = Math.max(doc.session.hp.temp, beast.hp);
  return {
    doc: {
      ...doc,
      character: { ...doc.character, ...polymorphBuildPatch(beast, prior) },
      session: {
        ...withTemp(doc, tempHp),
        polymorphForm: { beastId: beast.id, spellId, prior },
      },
    },
    tempHp,
  };
}

/** Drop the active Beast form: restore the caster's own body and Temporary HP. Null
 *  without a form. */
export function dropBeastForm(doc: CharacterDoc): CharacterDoc | null {
  const form = doc.session.polymorphForm;
  if (!form) return null;
  const { polymorphForm: _dropped, ...restSession } = withTemp(doc, form.prior.tempHp);
  void _dropped;
  return {
    ...doc,
    character: { ...doc.character, ...revertBuildFromPrior(form.prior) },
    session: restSession,
  };
}
