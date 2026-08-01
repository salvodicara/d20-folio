/**
 * chronicle-reconcile — the PURE correlation layer of the auto-narrated combat epic
 * (Phase 1 + Phase 2). It fuses two independent streams the DM already holds into
 * reconciled chronicle lines:
 *
 *   (a) the players' DECLARED actions — each PC's `combat/state` `recentActions` ring
 *       (target SET + HIT/MISS + round, plus a multi-instance drop bound), read LIVE off
 *       the party combat-state subdocs the hub already subscribes to
 *       (`usePartyCombatStates` — NO new subscription);
 *   (b) the DM's observed HP deltas — already recorded as un-attributed `hp-damage`
 *       {@link CombatChronicleEvent}s on the encounter when the DM applies monster HP
 *       (Phase 0).
 *
 * The fusion, keyed on (target, round) — deterministic, NEVER fabricated (golden rule 21):
 *
 *   SINGLE-target declaration (one target):
 *     • a declared HIT + a matching pending HP drop on that target ⇒ that damage line is
 *       AUTO-ATTRIBUTED to the declaring PC (amount = the DM's real delta). When more than
 *       one player could account for the deltas on the same target/round, the pairing is
 *       ambiguous → the line is marked UNCERTAIN (a subtle marker), never dropped, never
 *       invented;
 *     • a declared MISS ⇒ a CERTAIN synthesized `attack-miss` line (no HP needed);
 *     • a declared hit with NO matching delta ⇒ NO line (never invent an amount).
 *
 *   MULTI-target declaration (a set of targets — Phase 2, Magic Missile / Scorching Ray /
 *   an AoE): ONE `attack-multi` line summarizes the SEVERAL drops the DM applied across
 *   the declared set, bounded by the action's `instances` count:
 *     • a declared HIT binds the pending drops on its targets in-window (up to `instances`)
 *       and renders ONE line with each struck target's REAL amount ("A hits G (22), the
 *       Chief (22) and the Ogre (11)"); a declared target with NO in-window drop is simply
 *       OMITTED (never given an invented number). The bound drops are FUSED — they no
 *       longer render as individual lines. If the drops can't cleanly match the set (more
 *       matching drops than the action can own, or a competing declaration on a shared
 *       target) the line is UNCERTAIN;
 *     • a declared MISS ⇒ ONE `attack-multi` line naming the whole set with no amounts;
 *     • a declared hit that has landed NO drop yet ⇒ NO line (never fabricate).
 *
 *   And, for both classes: a delta with NO declaration stays PENDING for the DM's Phase-0
 *   one-tap attribution (paper play / undeclared damage — the fallback is untouched).
 *
 * This is a feature-layer composition (it reads campaign + chronicle aggregates), not
 * engine core, and it is PURE: no React, no Firebase, no `Date.now()`. It writes NOTHING
 * back — the reconciled view is derived every render, so the correlation costs no extra
 * Firestore write (the DM's manual override still writes the stored event's `attackerId`).
 */

import type { CombatChronicleEvent } from "@/types/combat-chronicle";
import type { CombatState } from "@/types/combat-state";

/** One player-declared action, flattened from a single member's ring with a stable global
 *  id (the correlation input unit). `targetIds` is the FULL declared set: one for a
 *  single-target swing, several for a multi-target action. */
export interface DeclaredAction {
  /** Stable id across all members' rings — `${uid}:${recentActionId}`. */
  id: string;
  /** The declaring PC's combatant id (`pc-<uid>`). */
  attackerId: string;
  /** The declared target combatant ids (`monster-<n>`) — the set the player struck. */
  targetIds: string[];
  outcome: "hit" | "miss";
  round: number;
  /** The multi-instance drop bound (Magic Missile 3, …) — how many observed HP drops a
   *  multi-target fusion may claim. Absent for a single-target swing. */
  instances?: number;
}

/** A reconciled chronicle line: the (possibly auto-attributed, fused, or synthesized)
 *  event plus the correlation provenance the feed renders as subtle markers. */
export interface ReconciledEvent {
  event: CombatChronicleEvent;
  /** The line was DERIVED from a player's declaration (auto-attribution / fusion / miss),
   *  not a DM tap. */
  auto?: boolean;
  /** The delta↔declaration match was ambiguous — mark it (never dropped, never invented). */
  uncertain?: boolean;
}

/**
 * Flatten every attached member's `recentActions` ring into a single ordered
 * {@link DeclaredAction} list (ONE entry per declared action — the target SET stays
 * together). `combatStates` is the hub's live per-uid combat-state map
 * (`usePartyCombatStates`); a `null`/`undefined` entry (absent/loading subdoc) contributes
 * nothing. The attacker id is derived from the uid (`pc-<uid>`) — the SAME id the encounter
 * view uses (golden rule 6/7), never stored on the declaration.
 */
export function flattenDeclarations(
  combatStates: Readonly<Record<string, CombatState | null | undefined>>
): DeclaredAction[] {
  const out: DeclaredAction[] = [];
  for (const [uid, state] of Object.entries(combatStates)) {
    if (!state) continue;
    for (const ra of state.recentActions) {
      out.push({
        id: `${uid}:${ra.id}`,
        attackerId: `pc-${uid}`,
        targetIds: ra.targetIds,
        outcome: ra.outcome,
        round: ra.round,
        ...(ra.instances !== undefined ? { instances: ra.instances } : {}),
      });
    }
  }
  return out;
}

/** A stored `hp-damage` event narrowed to its variant. */
type DamageEvent = Extract<CombatChronicleEvent, { kind: "hp-damage" }>;

/** `true` when a stored damage event is still awaiting attribution (unattributed AND not
 *  deliberately skipped) — the only events auto-attribution / fusion may claim. */
function isPendingDamage(e: CombatChronicleEvent): e is DamageEvent {
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

/** Stable declaration order = ascending global id (ids are namespaced monotonic). */
function byId(a: DeclaredAction, b: DeclaredAction): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Reconcile the stored chronicle `events` with the players' `declarations` into the
 * derived feed. Total + deterministic (stable, side-effect-free): re-running it over the
 * same inputs yields the identical output, so it is safe to call every render.
 *
 * @param events        the encounter's stored {@link CombatChronicleEvent}s (append order).
 * @param declarations  every member's flattened {@link DeclaredAction}s.
 */
export function reconcileChronicle(
  events: ReadonlyArray<CombatChronicleEvent>,
  declarations: ReadonlyArray<DeclaredAction>
): ReconciledEvent[] {
  const pending = events.filter(isPendingDamage);
  const hitDecls = declarations.filter((d) => d.outcome === "hit").sort(byId);
  const singles = declarations.filter((d) => d.targetIds.length === 1);
  const multis = declarations.filter((d) => d.targetIds.length > 1);

  // Consumption ledger: an event id that a MULTI-target fusion has claimed no longer
  // renders as its own line (it is fused into the multi line) and is off-limits to the
  // single-target auto-attribution below.
  const consumed = new Set<string>();
  const fused: ReconciledEvent[] = [];

  // ── 1) MULTI-target fusion (drops-first, so single-target pairing sees the rest) ──
  for (const d of multis.slice().sort(byId)) {
    const set = new Set(d.targetIds);
    if (d.outcome === "miss") {
      // A whiffed multi-target action: ONE line naming the whole declared set, no amounts.
      fused.push({
        event: {
          kind: "attack-multi",
          id: `multi-${d.id}`,
          round: d.round,
          attackerId: d.attackerId,
          targetIds: d.targetIds,
          amounts: [],
        },
        auto: true,
      });
      continue;
    }
    // A HIT: bind this round's pending drops on the declared set, in stored order,
    // bounded by the action's instance count.
    const bound = d.instances ?? d.targetIds.length;
    const available = pending.filter(
      (e) => e.round === d.round && set.has(e.targetId) && !consumed.has(e.id)
    );
    const claimed = available.slice(0, bound);
    if (claimed.length === 0) continue; // no drop yet ⇒ no line (never fabricate)
    for (const e of claimed) consumed.add(e.id);

    // Per-target REAL amount (summed if the DM applied several drops to one target),
    // in the DECLARED target order; a target with no bound drop is OMITTED (never given
    // an invented number).
    const amounts = d.targetIds
      .filter((targetId) => claimed.some((e) => e.targetId === targetId))
      .map((targetId) => ({
        targetId,
        amount: claimed
          .filter((e) => e.targetId === targetId)
          .reduce((sum, e) => sum + e.amount, 0),
      }));

    // UNCERTAIN when the drops don't cleanly match: more matching drops than the action
    // can own, or another hit declaration in the round claims one of these same targets.
    const uncertain =
      available.length > bound ||
      hitDecls.some(
        (o) => o.id !== d.id && o.round === d.round && o.targetIds.some((t) => set.has(t))
      );

    fused.push({
      event: {
        kind: "attack-multi",
        id: `multi-${d.id}`,
        round: d.round,
        attackerId: d.attackerId,
        targetIds: d.targetIds,
        amounts,
      },
      auto: true,
      ...(uncertain ? { uncertain: true } : {}),
    });
  }

  // ── 2) SINGLE-target auto-attribution over the REMAINING pending drops (Phase 1) ──
  const key = (targetId: string, round: number): string => `${targetId}::${round}`;
  const pendingByKey = groupBy(
    pending.filter((e) => !consumed.has(e.id)),
    (e) => key(e.targetId, e.round)
  );
  const singleHitsByKey = groupBy(
    singles.filter((d) => d.outcome === "hit").sort(byId),
    // A single-target declaration has exactly one target.
    (d) => key(d.targetIds[0] ?? "", d.round)
  );

  /** eventId → { attackerId, uncertain } for each auto-attributed delta. */
  const attribution = new Map<string, { attackerId: string; uncertain: boolean }>();
  for (const [k, deltas] of pendingByKey) {
    const hits = singleHitsByKey.get(k);
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

  // ── 3) Build the feed: stored beats (fused drops dropped, single-target hits
  //       attributed), then the synthesized fused multi lines + single-target miss lines.
  const reconciled: ReconciledEvent[] = [];
  for (const event of events) {
    if (event.kind !== "hp-damage") {
      reconciled.push({ event });
      continue;
    }
    if (consumed.has(event.id)) continue; // fused into a multi line — no individual line
    const attr = attribution.get(event.id);
    if (attr) {
      reconciled.push({
        event: { ...event, attackerId: attr.attackerId },
        auto: true,
        ...(attr.uncertain ? { uncertain: true } : {}),
      });
    } else {
      reconciled.push({ event });
    }
  }
  reconciled.push(...fused);

  // Single-target MISS lines: one synthesized `attack-miss` per MISS declaration.
  for (const d of singles) {
    if (d.outcome !== "miss") continue;
    const targetId = d.targetIds[0];
    if (targetId === undefined) continue;
    reconciled.push({
      event: {
        kind: "attack-miss",
        id: `miss-${d.id}`,
        round: d.round,
        attackerId: d.attackerId,
        targetId,
      },
      auto: true,
    });
  }

  // ── 4) Round-group the feed: a STABLE sort by round keeps stored events (in append
  //       order) ahead of the synthesized lines within the same round, never reordering. ──
  return reconciled
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.event.round - b.r.event.round || a.i - b.i)
    .map(({ r }) => r);
}
