/**
 * chronicle-reconcile — the PURE correlation layer of the auto-narrated combat epic
 * (Phase 1). It fuses two independent streams the DM already holds into reconciled
 * chronicle lines:
 *
 *   (a) the players' DECLARED attacks — each PC's `combat/state` `recentActions` ring
 *       (target + HIT/MISS + round), read LIVE off the party combat-state subdocs the
 *       hub already subscribes to (`usePartyCombatStates` — NO new subscription);
 *   (b) the DM's observed HP deltas — already recorded as un-attributed `hp-damage`
 *       {@link CombatChronicleEvent}s on the encounter when the DM applies monster HP
 *       (Phase 0).
 *
 * The fusion, keyed on (target, round) — deterministic, NEVER fabricated (golden rule 21):
 *   • a declared HIT + a matching pending HP drop on that target ⇒ that damage line is
 *     AUTO-ATTRIBUTED to the declaring PC (amount = the DM's real delta). When more than
 *     one player could account for the deltas on the same target/round, the pairing is
 *     ambiguous → the line is marked UNCERTAIN (a subtle marker), never dropped, never
 *     invented;
 *   • a declared MISS ⇒ a CERTAIN synthesized `attack-miss` line (no HP needed);
 *   • a declared hit with NO matching delta ⇒ NO line (we never invent an amount — it
 *     pairs once the DM applies the HP);
 *   • a delta with NO declaration ⇒ stays PENDING for the DM's Phase-0 one-tap
 *     attribution (paper play / undeclared damage — the fallback is untouched).
 *
 * This is a feature-layer composition (it reads campaign + chronicle aggregates), not
 * engine core, and it is PURE: no React, no Firebase, no `Date.now()`. It writes NOTHING
 * back — the reconciled view is derived every render, so the correlation costs no extra
 * Firestore write (the DM's manual override still writes the stored event's `attackerId`).
 */

import type { CombatChronicleEvent } from "@/types/combat-chronicle";
import type { CombatState } from "@/types/combat-state";

/** One player-declared attack, flattened to a single (attacker, target) pair with a
 *  stable global id (the correlation input unit). */
export interface DeclaredAttack {
  /** Stable id across all members' rings — `${uid}:${recentActionId}:${targetId}`. */
  id: string;
  /** The declaring PC's combatant id (`pc-<uid>`). */
  attackerId: string;
  /** The declared target's combatant id (`monster-<n>`). */
  targetId: string;
  outcome: "hit" | "miss";
  round: number;
}

/** A reconciled chronicle line: the (possibly auto-attributed or synthesized) event plus
 *  the correlation provenance the feed renders as subtle markers. */
export interface ReconciledEvent {
  event: CombatChronicleEvent;
  /** The attribution / miss line was DERIVED from a player's declaration (not a DM tap). */
  auto?: boolean;
  /** The 1:1 delta↔declaration match was ambiguous (>1 possible attacker) — mark it. */
  uncertain?: boolean;
}

/**
 * Flatten every attached member's `recentActions` ring into a single ordered
 * {@link DeclaredAttack} list. `combatStates` is the hub's live per-uid combat-state map
 * (`usePartyCombatStates`); a `null`/`undefined` entry (absent/loading subdoc) contributes
 * nothing. The attacker id is derived from the uid (`pc-<uid>`) — the SAME id the encounter
 * view uses (golden rule 6/7), never stored on the declaration.
 */
export function flattenDeclarations(
  combatStates: Readonly<Record<string, CombatState | null | undefined>>
): DeclaredAttack[] {
  const out: DeclaredAttack[] = [];
  for (const [uid, state] of Object.entries(combatStates)) {
    if (!state) continue;
    for (const ra of state.recentActions) {
      for (const targetId of ra.targetIds) {
        out.push({
          id: `${uid}:${ra.id}:${targetId}`,
          attackerId: `pc-${uid}`,
          targetId,
          outcome: ra.outcome,
          round: ra.round,
        });
      }
    }
  }
  return out;
}

/** `true` when a stored damage event is still awaiting attribution (unattributed AND not
 *  deliberately skipped) — the only events auto-attribution may claim. */
function isPendingDamage(
  e: CombatChronicleEvent
): e is Extract<CombatChronicleEvent, { kind: "hp-damage" }> {
  return (
    e.kind === "hp-damage" && e.attackerId === undefined && e.attackerSkipped !== true
  );
}

/** Group a list by a string key, preserving input order within each bucket. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/**
 * Reconcile the stored chronicle `events` with the players' `declarations` into the
 * derived feed. Total + deterministic (stable, side-effect-free): re-running it over the
 * same inputs yields the identical output, so it is safe to call every render.
 *
 * @param events        the encounter's stored {@link CombatChronicleEvent}s (append order).
 * @param declarations  every member's flattened {@link DeclaredAttack}s.
 */
export function reconcileChronicle(
  events: ReadonlyArray<CombatChronicleEvent>,
  declarations: ReadonlyArray<DeclaredAttack>
): ReconciledEvent[] {
  // 1) Auto-attribution: pair pending damage deltas with HIT declarations, keyed on
  //    (target, round), 1:1 in stable order. The attribution id set + uncertain flags are
  //    computed here; the stored events are then mapped into reconciled lines.
  const key = (targetId: string, round: number): string => `${targetId}::${round}`;
  const pendingByKey = groupBy(events.filter(isPendingDamage), (e) =>
    key(e.targetId, e.round)
  );
  const hitsByKey = groupBy(
    // Stable declaration order = ascending global id (ids are namespaced monotonic).
    [...declarations]
      .filter((d) => d.outcome === "hit")
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    (d) => key(d.targetId, d.round)
  );

  /** eventId → { attackerId, uncertain } for each auto-attributed delta. */
  const attribution = new Map<string, { attackerId: string; uncertain: boolean }>();
  for (const [k, deltas] of pendingByKey) {
    const hits = hitsByKey.get(k);
    if (!hits || hits.length === 0) continue;
    const uncertain = hits.length > 1; // >1 possible attacker for these deltas
    const pairs = Math.min(deltas.length, hits.length);
    for (let i = 0; i < pairs; i++) {
      const delta = deltas[i];
      const hit = hits[i];
      if (!delta || !hit) continue;
      attribution.set(delta.id, { attackerId: hit.attackerId, uncertain });
    }
  }

  const reconciled: ReconciledEvent[] = events.map((event) => {
    const attr = event.kind === "hp-damage" ? attribution.get(event.id) : undefined;
    if (attr) {
      return {
        event: { ...event, attackerId: attr.attackerId },
        auto: true,
        ...(attr.uncertain ? { uncertain: true } : {}),
      };
    }
    return { event };
  });

  // 2) Miss lines: one synthesized `attack-miss` per MISS declaration (certain, no HP).
  for (const d of declarations) {
    if (d.outcome !== "miss") continue;
    reconciled.push({
      event: {
        kind: "attack-miss",
        id: `miss-${d.id}`,
        round: d.round,
        attackerId: d.attackerId,
        targetId: d.targetId,
      },
      auto: true,
    });
  }

  // 3) Round-group the feed: a STABLE sort by round keeps stored events (in append order)
  //    ahead of the synthesized misses within the same round, and never reorders a round.
  return reconciled
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.event.round - b.r.event.round || a.i - b.i)
    .map(({ r }) => r);
}
