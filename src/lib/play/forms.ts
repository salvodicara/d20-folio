/**
 * Pure play transitions for a self-transformation into a Beast form (Polymorph on
 * yourself): the character in, the transformed (or restored) character out. The
 * form's body patches are `lib/polymorph`'s; this composes them with the temporary
 * HP the form brings (WORLD-FIRST: the world's temp pool moves with it). The
 * Concentration that sustains the form stays the store's orchestration.
 */
import type { BeastStatBlock } from "@/data/types";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { revertBuildFromPrior, selfFormRule } from "@/lib/polymorph";
import { resolveTempHp } from "@/lib/smart-tracker";
import type { CharacterDoc, SessionState } from "@/types/character";
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
  spellId: string
): { doc: CharacterDoc; tempHp: number; reshift: boolean } {
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
    : Math.max(base.session.hp.temp, formTempHp(base, beast, spellId));
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

/** The Temporary HP assuming the form grants: the form's Hit Points, or (Wild Shape)
 *  the best of the character's grants for this form (Druid level; a Moon Druid's
 *  3 × level). Temporary HP don't stack: the caller keeps the larger pool. */
function formTempHp(doc: CharacterDoc, beast: BeastStatBlock, sourceId: string): number {
  if (selfFormRule(sourceId).tempHp !== "grants") return beast.hp;
  const grants = aggregateCharacterGrants(doc.character, doc.session).tempHpGrants;
  let best = 0;
  for (const g of grants) {
    if (g.sourceId !== sourceId && g.forForm !== sourceId) continue;
    best = Math.max(best, resolveTempHp(g.formula, doc));
  }
  return best;
}

/** Drop the active Beast form and restore the caster's own Temporary HP (a rule whose
 *  Temporary HP outlast the form, Wild Shape, keeps them). Null without a form.
 *  `tempHp` keeps what a form that ran out of its Temporary HP was left with,
 *  instead of the caster's own pool. A form a v0.25 client stamped also gets its
 *  build back from `prior`. */
export function dropBeastForm(doc: CharacterDoc, tempHp?: number): CharacterDoc | null {
  const active = doc.session.activeForm;
  if (active) {
    const kept = selfFormRule(active.sourceId).tempHpOutlastsForm
      ? doc.session.hp.temp
      : active.tempHpBefore;
    const { activeForm: _dropped, ...restSession } = withTemp(doc, tempHp ?? kept);
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

/**
 * The session after a play step, with the form ended when that step ends it
 * (edge-case family M2): its Temporary HP ran out and its rule ends with them
 * (Polymorph: the rest of the hit already reached the caster's HP), or the
 * character gained a condition its rule ends on, implied ones included (Wild Shape
 * ends on Incapacitated, so at 0 HP too). The play functions that apply a hit or a
 * condition (`takeDamage`, `addCondition`) call it, so every path ends the form.
 * The Concentration that may hold the form stays the store's to end. A form a v0.25
 * client stamped is left to the store, which also gives the build back.
 */
export function endFormIfDue(doc: CharacterDoc, next: SessionState): SessionState {
  // A form a v0.25 client stamped needs its build back: the store ends that one.
  const form = next.activeForm;
  if (!form) return next;
  const rule = selfFormRule(form.sourceId);
  const outOfTempHp = rule.endsWithoutTempHp && next.hp.temp === 0;
  const conditions = rule.endsOn?.length ? effectiveSessionConditions(next) : [];
  const ended = outOfTempHp || (rule.endsOn ?? []).some((c) => conditions.includes(c));
  if (!ended) return next;
  const after = { ...doc, session: next };
  return (dropBeastForm(after, outOfTempHp ? 0 : undefined) ?? after).session;
}
