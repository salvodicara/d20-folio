/**
 * A hit someone else lands on a PC (the DM's monster, the DM's party card, an ally's
 * area spell), through the target's OWN damage rule — the same `takeDamage` the player's
 * own entry runs: temporary hit points first, 0 HP → Unconscious, a hit while dying is a
 * death-save failure (a critical, two), massive damage kills outright, and a concentrating
 * target still standing has a Concentration save to roll (edge-case family M1,
 * docs/architecture/2026-11-edge-cases.md).
 *
 * Pure: the target's whole sheet and its combat state in, the next combat state out. A
 * peer writes only the combat roots it may touch (HP, conditions, death saves, pending
 * Concentration saves); Concentration itself is the owner's, and the owner's sheet ends
 * it when it hydrates a 0-HP state (`characterStore.hydrateCombatState`).
 */
import { concentrationSaveDc } from "@/lib/compute";
import { damageQueuesConcentrationSave } from "@/lib/character-d20-tests";
import type { DamageRetaliation, DamageTransfer } from "@/lib/combat-transition";
import type { CharacterDoc } from "@/types/character";
import type { CombatState, PendingConcentrationSave } from "@/types/combat-state";

import { takeDamage, type DamageOptions, type DamageTaken } from "./damage";
import { foldPeerSpends, PEER_SPENDS_CAP, type PeerSpend } from "./peer-spends";

/** A hit from another device, resolved: the next combat roots, and the entries it
 *  appends to the target's spends ledger. */
export interface PeerHit {
  state: CombatState;
  spends: PeerSpend[];
  /** The hit's shared damage (Warding Bond), for the writer to hand on. */
  transfers: DamageTransfer[];
  /** What the hit sends back to its attacker (Armor of Agathys). */
  retaliations: DamageRetaliation[];
}

/**
 * Resolve a hit from another device with the spends ledger: the target's sheet is
 * read with its pending ledger folded in, every stage runs (a ward, a claimed
 * dodge), and what the hit spent comes back as ledger entries. When the ledger is
 * at its cap the hit still lands, without the spending stages, and says so.
 */
export function peerHit(
  doc: CharacterDoc,
  current: CombatState,
  ledger: ReadonlyArray<PeerSpend>,
  amount: number,
  opts: DamageOptions = {},
  newId: () => string = () => crypto.randomUUID()
): PeerHit & { ledgerFull: boolean } {
  const ledgerFull = ledger.length + 2 > PEER_SPENDS_CAP;
  const folded: CharacterDoc = { ...doc, session: foldPeerSpends(doc.session, ledger) };
  const resolved = resolvePeerHit(
    folded,
    current,
    amount,
    { ...opts, fromPeer: ledgerFull },
    newId
  );
  if (!resolved)
    return { state: current, spends: [], transfers: [], retaliations: [], ledgerFull };
  const spends: PeerSpend[] = [
    ...Object.entries(resolved.taken.spent.pools).map(
      ([trackerId, absorbed]): PeerSpend => ({
        id: newId(),
        kind: "tracker",
        trackerId,
        amount: absorbed,
      })
    ),
    ...resolved.taken.spent.endedStates.map(
      (key): PeerSpend => ({ id: newId(), kind: "state-end", key })
    ),
  ];
  return {
    state: resolved.state,
    spends,
    transfers: [...resolved.taken.transition.transfers],
    retaliations: [...resolved.taken.transition.retaliations],
    ledgerFull,
  };
}

/** A hit from another device without the ledger: the stages that would spend
 *  something on the target's sheet are left out (it couldn't record them). */
export function peerDamageState(
  doc: CharacterDoc,
  current: CombatState,
  amount: number,
  opts: DamageOptions = {},
  newId: () => string = () => crypto.randomUUID()
): CombatState {
  return peerDamageHit(doc, current, amount, opts, newId).state;
}

/** {@link peerDamageState} with what the hit owes others (Warding Bond's share, Armor of
 *  Agathys' cold). */
export function peerDamageHit(
  doc: CharacterDoc,
  current: CombatState,
  amount: number,
  opts: DamageOptions = {},
  newId: () => string = () => crypto.randomUUID()
): Pick<PeerHit, "state" | "transfers" | "retaliations"> {
  const resolved = resolvePeerHit(
    doc,
    current,
    amount,
    { ...opts, fromPeer: true },
    newId
  );
  return resolved
    ? {
        state: resolved.state,
        transfers: [...resolved.taken.transition.transfers],
        retaliations: [...resolved.taken.transition.retaliations],
      }
    : { state: current, transfers: [], retaliations: [] };
}

function resolvePeerHit(
  doc: CharacterDoc,
  current: CombatState,
  amount: number,
  opts: DamageOptions,
  newId: () => string
): { state: CombatState; taken: DamageTaken } | null {
  const damage = Math.max(0, Math.floor(amount));
  if (damage === 0) return null;
  // The target as it stands now: its sheet with the fresh combat roots folded in.
  const standing: CharacterDoc = {
    ...doc,
    session: {
      ...doc.session,
      hp: { ...doc.session.hp, current: current.hp.current, temp: current.hp.temp },
      conditions: [...current.conditions],
      deathSucc: current.deathSaves.successes,
      deathFail: current.deathSaves.failures,
    },
  };
  const taken = takeDamage(standing, damage, opts);
  if (!taken) return null;
  const hp = { current: taken.session.hp.current, temp: taken.session.hp.temp };
  // Still standing and concentrating: the hit asks a save (DC from the damage taken,
  // temporary hit points included; a ward's share was never taken). At 0 HP,
  // Concentration simply ends.
  const held = standing.session.concentration;
  const save: PendingConcentrationSave | null =
    hp.current > 0 &&
    held !== "" &&
    taken.dealt > 0 &&
    damageQueuesConcentrationSave(standing)
      ? {
          id: newId(),
          spell: held,
          damage: taken.dealt,
          difficultyClass: concentrationSaveDc(taken.dealt),
        }
      : null;
  const state: CombatState = {
    ...current,
    hp,
    conditions: [...taken.session.conditions],
    deathSaves: { successes: taken.session.deathSucc, failures: taken.session.deathFail },
    ...(save
      ? {
          pendingConcentrationSaves: [...(current.pendingConcentrationSaves ?? []), save],
        }
      : hp.current === 0 && (current.pendingConcentrationSaves?.length ?? 0) > 0
        ? { pendingConcentrationSaves: [] }
        : {}),
  };
  return { state, taken };
}
