/**
 * The campaign's effects out of a fight, stored one document per effect at
 * `campaigns/{id}/effects/{effectId}` (`lib/play/campaign-effects.ts`). A member
 * writes the effects they cast; ending one only sets `ended`, so its undo brings the
 * same occurrence back. Under dev bypass an in-memory store stands in, with the same
 * listeners. Imports only the Firestore functions it uses: a dynamic import of the whole
 * Firestore namespace would keep every export in the shared, eager Firebase chunk.
 */
import { collection, deleteField, doc, onSnapshot, writeBatch } from "firebase/firestore";

import { isActiveCombatEffect } from "@/lib/combat-effect-io";
import { DEV_BYPASS_AUTH as DEV_BYPASS } from "@/lib/dev-bypass";
import { db } from "@/lib/firebase";
import type { CampaignEffectDoc } from "@/lib/play/campaign-effects";
import type { ActiveCombatEffect } from "@/types/combat-effect";

type Listener = (docs: CampaignEffectDoc[]) => void;
type Ended = NonNullable<CampaignEffectDoc["ended"]>;

const devStore = new Map<string, Map<string, CampaignEffectDoc>>();
const devListeners = new Map<string, Set<Listener>>();
const devMode = () => import.meta.env.DEV && DEV_BYPASS;

function devPublish(campaignId: string): void {
  const docs = [...(devStore.get(campaignId)?.values() ?? [])];
  for (const listener of devListeners.get(campaignId) ?? []) listener(docs);
}

function devDocs(campaignId: string): Map<string, CampaignEffectDoc> {
  let docs = devStore.get(campaignId);
  if (!docs) devStore.set(campaignId, (docs = new Map<string, CampaignEffectDoc>()));
  return docs;
}

/** A stored effect read at the untrusted boundary; anything malformed is dropped. */
export function conformCampaignEffect(raw: unknown): CampaignEffectDoc | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { ended, ...effect } = raw as Record<string, unknown>;
  if (!isActiveCombatEffect(effect) || effect.duration.kind !== "game-clock") return null;
  return ended === "concentration" || ended === "revoked" ? { ...effect, ended } : effect;
}

/** Listen to a campaign's effects; returns the unsubscribe. */
export function subscribeCampaignEffects(
  campaignId: string,
  onDocs: Listener,
  onError: (error: Error) => void
): () => void {
  if (devMode()) {
    let set = devListeners.get(campaignId);
    if (!set) devListeners.set(campaignId, (set = new Set<Listener>()));
    set.add(onDocs);
    onDocs([...devDocs(campaignId).values()]);
    return () => set.delete(onDocs);
  }
  return onSnapshot(
    collection(db, "campaigns", campaignId, "effects"),
    (snap) =>
      onDocs(
        snap.docs.flatMap((stored) => {
          const effect = conformCampaignEffect(stored.data());
          return effect ? [effect] : [];
        })
      ),
    onError
  );
}

/** Write effects that live on the campaign clock (one document each, by id). */
export async function writeCampaignEffects(
  campaignId: string,
  effects: ReadonlyArray<ActiveCombatEffect>
): Promise<void> {
  if (effects.length === 0) return;
  if (devMode()) {
    const docs = devDocs(campaignId);
    for (const effect of effects) docs.set(effect.id, effect);
    devPublish(campaignId);
    return;
  }
  const batch = writeBatch(db);
  for (const effect of effects) {
    batch.set(doc(db, "campaigns", campaignId, "effects", effect.id), effect);
  }
  await batch.commit();
}

/** End effects before their time (`ended`), or bring them back (`null`, an undo). */
export async function setCampaignEffectsEnded(
  campaignId: string,
  ids: ReadonlyArray<string>,
  ended: Ended | null
): Promise<void> {
  if (ids.length === 0) return;
  if (devMode()) {
    const docs = devDocs(campaignId);
    for (const id of ids) {
      const current = docs.get(id);
      if (!current) continue;
      const { ended: _prior, ...effect } = current;
      void _prior;
      docs.set(id, ended ? { ...effect, ended } : effect);
    }
    devPublish(campaignId);
    return;
  }
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(doc(db, "campaigns", campaignId, "effects", id), {
      ended: ended ?? deleteField(),
    });
  }
  await batch.commit();
}
