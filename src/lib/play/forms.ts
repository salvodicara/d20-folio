/**
 * Pure play transitions for a self-transformation into a Beast form (Polymorph on
 * yourself): the character in, the transformed (or restored) character out. The
 * form's body patches are `lib/polymorph`'s; this composes them with the temporary
 * HP the form brings (WORLD-FIRST: the world's temp pool moves with it). The
 * Concentration that sustains the form stays the store's orchestration.
 */
import type { BeastStatBlock } from "@/data/types";
import { revertBuildFromPrior, selfFormRule, type PolymorphPrior } from "@/lib/polymorph";
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
 * Assume a Beast form (edge-case family M2): record it as `activeForm`, which the sheet
 * reads when it derives scores, AC and speeds; nothing is stamped into the build. Take
 * Temporary HP equal to the Beast's HP (max-wins), remembering the caster's own.
 *
 * The spell's rule (`selfFormRule`) shapes it: Shapechange keeps the caster's INT /
 * WIS / CHA, carries its bestiary block on the session, and a second form while the
 * spell lasts (a reshift) keeps the first form's Temporary HP. A form a v0.25 client
 * stamped (`polymorphForm`) is reverted first.
 */
export function assumeBeastForm(
  doc: CharacterDoc,
  beast: BeastStatBlock,
  spellId: string,
  /** Unused since forms stopped stamping (M2): accepted until the pack's own tests
   *  drop the argument, then removed. */
  legacyPrior?: PolymorphPrior
): { doc: CharacterDoc; tempHp: number; reshift: boolean } {
  void legacyPrior;
  const rule = selfFormRule(spellId);
  // A stamped form: give the build back first, then read the new form as a layer.
  const base = doc.session.polymorphForm ? (dropBeastForm(doc) ?? doc) : doc;
  const active = base.session.activeForm;
  const reshift = rule.reshift && active?.sourceId === spellId;
  const tempHpBefore = reshift
    ? active.tempHpBefore
    : (doc.session.polymorphForm?.prior.tempHp ?? doc.session.hp.temp);
  const tempHp = reshift
    ? base.session.hp.temp
    : Math.max(base.session.hp.temp, beast.hp);
  return {
    doc: {
      ...base,
      session: {
        ...withTemp(base, tempHp),
        activeForm: {
          sourceId: spellId,
          beastId: beast.id,
          ...(rule.pool === "bestiary" ? { statBlock: beast } : {}),
          tempHpBefore,
        },
      },
    },
    tempHp,
    reshift,
  };
}

/** Drop the active Beast form and restore the caster's own Temporary HP. Null without
 *  a form. `tempHp` keeps what a form that ran out of its Temporary HP was left with,
 *  instead of the caster's own pool. A form a v0.25 client stamped also gets its
 *  build back from `prior`. */
export function dropBeastForm(doc: CharacterDoc, tempHp?: number): CharacterDoc | null {
  const active = doc.session.activeForm;
  if (active) {
    const { activeForm: _dropped, ...restSession } = withTemp(
      doc,
      tempHp ?? active.tempHpBefore
    );
    void _dropped;
    return { ...doc, session: restSession };
  }
  const form = doc.session.polymorphForm;
  if (!form) return null;
  const { polymorphForm: _stamped, ...restSession } = withTemp(
    doc,
    tempHp ?? form.prior.tempHp
  );
  void _stamped;
  return {
    ...doc,
    character: { ...doc.character, ...revertBuildFromPrior(form.prior) },
    session: restSession,
  };
}
