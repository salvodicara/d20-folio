/**
 * Ammunition (SRD 5.2.1 weapon property): after a fight, a minute spent searching
 * the battlefield recovers half the ammunition used, rounded down. The sheet counts
 * what each kind of ammunition spent (`session.ammoSpent`) until it is recovered.
 */
import type { CharacterDoc, SessionState } from "@/types/character";

export function recoveredAmmunition(spent: number): number {
  if (!Number.isFinite(spent) || spent <= 0) return 0;
  return Math.floor(spent / 2);
}

/** One more piece of `itemId` spent (an attack that used it). */
export function withAmmoSpent(session: SessionState, itemId: string): SessionState {
  return {
    ...session,
    ammoSpent: { ...session.ammoSpent, [itemId]: (session.ammoSpent?.[itemId] ?? 0) + 1 },
  };
}

/** What searching the battlefield would bring back, per kind of ammunition. */
export function ammunitionRecovery(
  doc: Pick<CharacterDoc, "session">
): Array<{ itemId: string; spent: number; recovered: number }> {
  return Object.entries(doc.session.ammoSpent ?? {}).flatMap(([itemId, spent]) => {
    const recovered = recoveredAmmunition(spent);
    return recovered > 0 ? [{ itemId, spent, recovered }] : [];
  });
}

/**
 * Search the battlefield: each kind of ammunition gets half of what it spent back,
 * rounded down, onto its first row; the count starts again. Null when nothing was
 * spent.
 */
export function recoverAmmunition(doc: CharacterDoc): CharacterDoc | null {
  if (!doc.session.ammoSpent || Object.keys(doc.session.ammoSpent).length === 0) {
    return null;
  }
  const back = new Map(ammunitionRecovery(doc).map((r) => [r.itemId, r.recovered]));
  const equipment = doc.character.equipment.map((ref) => {
    if ("custom" in ref) return ref;
    const amount = back.get(ref.srdId);
    if (amount === undefined) return ref;
    back.delete(ref.srdId);
    return { ...ref, quantity: (ref.quantity ?? 1) + amount };
  });
  const session = { ...doc.session };
  delete session.ammoSpent;
  return { ...doc, character: { ...doc.character, equipment }, session };
}
