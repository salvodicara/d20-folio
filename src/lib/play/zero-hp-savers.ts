/**
 * The zero-HP savers (edge-case family M7, docs/architecture/2026-11-edge-cases.md):
 * every "when you drop to 0 Hit Points but aren't killed outright" feature, as one
 * grant (`at-zero-hp-interrupt`). A saver may spend a use (Relentless Endurance), ask
 * a saving throw the player rolls (Relentless Rage, DC 10 + 5 per use since the last
 * rest) and sets the Hit Points it leaves (1, or twice the Barbarian level).
 *
 * The drop records which states were on when the character fell
 * (`session.zeroHpDrop`), because falling unconscious ends some of them (Rage) while
 * the saver they enable still applies. The player tries the savers in any order;
 * each one is offered once per drop.
 */
import { evaluateGrants, type AtZeroHpSaverGrant } from "@/lib/grants";
import { isCharacterAlive } from "@/lib/character-status";
import { getClasses, totalLevel } from "@/lib/classes";
import { proficiencyBonus } from "@/lib/proficiency";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import { resolveScalar, SCALAR_BINDINGS, type Scalar } from "@/lib/scalar";
import { resolveActiveStatesEndingOn, resolveTrackers } from "@/lib/smart-tracker";
import { sessionActiveKeys } from "@/lib/world-standing-grants";
import type { AbilityCode } from "@/types/ability";
import type { CharacterDoc, SessionState } from "@/types/character";

import { UNCONSCIOUS_CONDITION_ID, zeroHpDropOf } from "./vitals";

/** A saver the character may try right now. */
export interface ZeroHpSaver {
  sourceId: string;
  /** The use it spends. */
  trackerId?: string;
  /** The saving throw the player rolls; absent when it simply works. */
  save?: { ability: AbilityCode; dc: number };
  /** The Hit Points it leaves the character at. */
  hitPoints: number;
}

/** How a save-gated saver went; a saver without a save takes none. */
export type ZeroHpSaveResult = "success" | "failure";

function grantedSavers(doc: CharacterDoc): readonly AtZeroHpSaverGrant[] {
  const drop = doc.session.zeroHpDrop;
  return evaluateGrants(
    resolveAllGrantSources(doc.character, doc.session.itemResources),
    drop ? new Set(drop.activeKeys) : sessionActiveKeys(doc.session),
    new Map(Object.entries(doc.session.grantBundleChoices ?? {}))
  ).atZeroHpInterrupts;
}

function bindingsFor(doc: CharacterDoc, sourceId: string): Record<string, number> {
  const level = totalLevel(doc.character);
  return {
    [SCALAR_BINDINGS.totalLevel]: level,
    [SCALAR_BINDINGS.proficiencyBonus]: proficiencyBonus(level),
    ...Object.fromEntries(
      getClasses(doc.character).map((entry) => [
        SCALAR_BINDINGS.classLevel(entry.classId),
        entry.level,
      ])
    ),
    [SCALAR_BINDINGS.zeroHpSaverUses(sourceId)]:
      doc.session.zeroHpSaverUses?.[sourceId] ?? 0,
  };
}

function resolved(
  scalar: Scalar | undefined,
  fallback: number,
  bindings: Record<string, number>
): number | null {
  return scalar === undefined
    ? fallback
    : (resolveScalar(scalar, bindings)?.value ?? null);
}

/** The savers the character may try now: at 0 HP, alive, each once per drop. */
export function zeroHpSavers(doc: CharacterDoc): ZeroHpSaver[] {
  if (doc.session.hp.current !== 0 || !isCharacterAlive(doc.status, doc.session))
    return [];
  const tried = new Set(doc.session.zeroHpDrop?.tried ?? []);
  const trackers = resolveTrackers(doc);
  return grantedSavers(doc).flatMap((grant): ZeroHpSaver[] => {
    if (tried.has(grant.sourceId)) return [];
    if (grant.trackerId !== undefined) {
      const tracker = trackers.find((t) => t.id === grant.trackerId);
      if (!tracker || tracker.total - tracker.used <= 0) return [];
    }
    const bindings = bindingsFor(doc, grant.sourceId);
    const hitPoints = resolved(grant.hitPoints, 1, bindings);
    const dc = grant.save ? resolved(grant.save.dc, 0, bindings) : undefined;
    if (hitPoints === null || hitPoints < 1 || dc === null) return [];
    return [
      {
        sourceId: grant.sourceId,
        ...(grant.trackerId !== undefined ? { trackerId: grant.trackerId } : {}),
        ...(grant.save && dc !== undefined
          ? { save: { ability: grant.save.ability, dc } }
          : {}),
        hitPoints,
      },
    ];
  });
}

/** One saver used: what it changes. `hitPoints` is null when the save failed. */
export interface ZeroHpSaverUse {
  saver: ZeroHpSaver;
  hitPoints: number | null;
  session: SessionState;
  /** States the fall ended that come back, because the character never stayed down. */
  restoredStates: string[];
}

/**
 * Use a saver. A save-gated one needs the result the player rolled; a failed save
 * leaves the character dying but still counts as a use. Null when the saver is not
 * on offer (spent, already tried this drop, not at 0 HP) or the result is missing.
 */
export function spendZeroHpSaver(
  doc: CharacterDoc,
  sourceId: string,
  result?: ZeroHpSaveResult
): ZeroHpSaverUse | null {
  const saver = zeroHpSavers(doc).find((s) => s.sourceId === sourceId);
  if (!saver || (saver.save !== undefined) !== (result !== undefined)) return null;
  const session = doc.session;
  const stands = result !== "failure";
  const drop = session.zeroHpDrop ?? zeroHpDropOf(doc);
  const next: SessionState = {
    ...session,
    ...(saver.trackerId !== undefined
      ? {
          trackers: {
            ...session.trackers,
            [saver.trackerId]: {
              used: (session.trackers[saver.trackerId]?.used ?? 0) + 1,
            },
          },
        }
      : {}),
    ...(saver.save
      ? {
          zeroHpSaverUses: {
            ...session.zeroHpSaverUses,
            [sourceId]: (session.zeroHpSaverUses?.[sourceId] ?? 0) + 1,
          },
        }
      : {}),
    zeroHpDrop: { ...drop, tried: [...(drop.tried ?? []), sourceId] },
    ...(stands
      ? {
          hp: { ...session.hp, current: saver.hitPoints },
          // RAW the character never stays down: the dying state goes with it.
          deathSucc: 0,
          deathFail: 0,
          conditions: session.conditions.filter((c) => c !== UNCONSCIOUS_CONDITION_ID),
        }
      : {}),
  };
  const now = sessionActiveKeys(session);
  const restoredStates = stands
    ? resolveActiveStatesEndingOn(
        { ...doc, session: { ...session, activeFeatures: drop.activeKeys } },
        "incapacitated"
      ).filter((key) => !now.has(key))
    : [];
  return {
    saver,
    hitPoints: stands ? saver.hitPoints : null,
    session: next,
    restoredStates,
  };
}
