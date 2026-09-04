/**
 * `/campaigns/:campaignId/play` — the live play surface (stage 6 design §2 D5, D6).
 *
 * This is the ONLY module that binds `PlayScreen` to the app's singletons: the campaign
 * document, the signed-in user, the character store, the Firestore lease, and the lazy
 * bestiary. `PlayScreen` itself takes all of it as props, which is what lets `/_play` mount
 * the same screen over an in-memory fixture.
 *
 * The role is data, never a privilege (D6): `dm = uid === campaign.dmUid || profile.role ===
 * "admin"`; a member whose `memberDetails[uid].characterId` is set may seat that character; a
 * member without one is a spectator. `firestore.rules` — not this file — is what actually
 * permits a write; the screen simply does not offer what a person cannot do.
 *
 * The seat verbs are the lease's (stage 4, narrowed by §5 while D1 holds):
 *
 *  - **Sit** — the character store's hydrated document is projected (`projectCharacter`) and
 *    `joinTable` appends the `join` and marks the lease in one batch. The hydrated document is
 *    the SAME one the sheet reads (`useCharacterSubscription` publishes it), so the numbers at
 *    the table are the numbers on the sheet — not a second derivation of them.
 *  - **Stand** — `leaveTable` appends the `leave`, writes the fight's outcome back into the
 *    personal `combat/state`, and clears the lease in one batch. The `previous` state it is
 *    projected onto is read FRESH from the live document immediately before the batch, because
 *    the write is a whole-document overwrite.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { CORE_MECHANICS } from "@/data/combat/core-catalogue";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { createSeqClock, createEncounter, newActionId } from "@/lib/combat-io";
import { joinTable, leaveTable } from "@/lib/combat-lease";
import { encodeLegacyWriteBack } from "@/lib/combat-state-writeback";
import { subscribeCombatState } from "@/lib/combat-state-io";
import { projectCharacter } from "@/lib/combat-projection";
import { projectMonster } from "@/lib/combat/monster-entity";
import { db } from "@/lib/firebase";
import { formatCr } from "@/lib/utils";
import { localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";
import { useCampaignSubscription } from "@/features/campaigns/useCampaignSubscription";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useAuthStore } from "@/stores/authStore";
import type { CombatState } from "@/types/combat-state";
import type { MonsterStatBlock } from "@/data/types";
import type { Entity } from "@/lib/combat/types";
import type { EntityId } from "@/lib/combat/ids";
import { PlayScreen } from "./PlayScreen";
import { monsterLabelId } from "./labels";
import { LIVE_ENCOUNTER_ID, liveTableRef } from "./table/table-store";
import { useTable } from "./table/use-table";
import type { CreatureOption } from "./AddCreature";

const { catalogue } = buildCatalogue(CORE_MECHANICS);

/** The live document read once, so the write-back is projected onto what is actually there. */
function readCombatState(uid: string, characterId: string): Promise<CombatState | null> {
  return new Promise((resolve, reject) => {
    const stop = subscribeCombatState(
      uid,
      characterId,
      (state) => {
        stop();
        resolve(state);
      },
      (error) => {
        stop();
        reject(error);
      }
    );
  });
}

/**
 * The composed bestiary, resolved ONCE for the DM.
 *
 * It is dynamic for the reason `/compendium` is (`router.tsx`): the monster corpus is the lazy
 * SRD kind, and a player's client must never pay for it. `ensureSrdKind` resolves its locale
 * catalogues alongside the data so the first render never shows a raw key.
 */
function useBestiary(enabled: boolean): {
  readonly blocks: readonly MonsterStatBlock[];
  readonly loading: boolean;
} {
  // One piece of state, set once when the corpus arrives: `null` IS "still loading", so
  // nothing has to be flipped on the way in and the effect never sets state synchronously.
  const [blocks, setBlocks] = useState<readonly MonsterStatBlock[] | null>(null);

  useEffect(() => {
    if (!enabled || blocks !== null) return;
    let live = true;
    void Promise.all([import("@/data/monsters"), import("@/i18n")]).then(
      async ([monsters, i18n]) => {
        await i18n.ensureSrdKind("monster");
        if (live) setBlocks(monsters.MONSTERS);
      }
    );
    return () => {
      live = false;
    };
  }, [enabled, blocks]);

  return { blocks: blocks ?? [], loading: enabled && blocks === null };
}

export function PlayRoute() {
  const { t } = useTranslation();
  const { language } = useLocale();
  const { campaignId = "" } = useParams<{ campaignId: string }>();
  const uid = useAuthStore((s) => s.user?.uid) ?? "";
  const admin = useAuthStore((s) => s.profile?.role) === "admin";

  useCampaignSubscription(campaignId);
  const campaign = useCampaignStore((s) => s.campaign);

  const dm = campaign !== null && (uid === campaign.dmUid || admin);
  const characterId = campaign?.memberDetails[uid]?.characterId ?? null;

  // The seated character's own document, hydrated exactly as the sheet hydrates it.
  useCharacterSubscription(characterId ?? undefined);
  const characterDoc = useCharacterStore((s) => s.character);

  const role = useMemo(() => ({ uid, dm }), [uid, dm]);
  const table = useTable(campaignId, role);
  const state = table.fold?.state ?? null;

  const { blocks, loading: bestiaryLoading } = useBestiary(dm);

  const [seq] = useState(() => createSeqClock(uid || "anon"));

  const members = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [id, detail] of Object.entries(campaign?.memberDetails ?? {})) {
      out[id] = detail.displayName;
    }
    return out;
  }, [campaign]);

  const characters = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const detail of Object.values(campaign?.memberDetails ?? {})) {
      if (detail.characterId && detail.character?.name) {
        out[detail.characterId] = detail.character.name;
      }
    }
    return out;
  }, [campaign]);

  const portraits = useMemo<Record<EntityId, string | null>>(() => {
    const out: Record<EntityId, string | null> = {};
    for (const detail of Object.values(campaign?.memberDetails ?? {})) {
      if (detail.characterId)
        out[detail.characterId] = detail.character?.portraitUrl ?? null;
    }
    return out;
  }, [campaign]);

  const levels = useMemo<Record<EntityId, number | null>>(() => {
    const out: Record<EntityId, number | null> = {};
    for (const detail of Object.values(campaign?.memberDetails ?? {})) {
      if (!detail.characterId) continue;
      const classes = detail.character?.classes ?? [];
      const total = classes.reduce((sum, entry) => sum + entry.level, 0);
      out[detail.characterId] = total > 0 ? total : (detail.character?.level ?? null);
    }
    return out;
  }, [campaign]);

  /** A monster's printed type and CR, for the target block — only where the corpus is loaded. */
  const identityOf = useCallback(
    (entity: Entity) => {
      const origin = entity.origin;
      if (origin.kind !== "monster") return null;
      const block = blocks.find((one) => one.id === origin.srdId);
      if (!block) return null;
      return {
        type: t(`srd.creatureType_${block.type}`),
        cr: formatCr(block.cr),
      };
    },
    [blocks, t]
  );

  const creatures = useMemo<readonly CreatureOption[]>(
    () =>
      blocks.map((block) => ({
        id: block.id,
        name: localizeSrd("monster", block.id, "name", language),
        cr: formatCr(block.cr),
        type: block.type,
      })),
    [blocks, language]
  );

  /** The one live table per campaign (D5): no pointer field, no encounter list — the DM
   *  simply writes the document `useTable` is already listening to. */
  const openTable = useCallback(() => {
    void createEncounter(liveTableRef(db, campaignId), {
      schema: 1,
      id: LIVE_ENCOUNTER_ID,
      host: { kind: "campaign", campaignId },
      log: [],
      checkpoint: null,
    });
  }, [campaignId]);

  const sit = useCallback(() => {
    if (!characterDoc || !characterId || !state) return;
    const { entity, mechanics } = projectCharacter(characterDoc, {
      uid,
      characterId,
      buildRevision: characterDoc.revision,
    });
    void joinTable({
      db,
      uid,
      characterId,
      campaignId,
      encounterId: LIVE_ENCOUNTER_ID,
      epoch: state.epoch,
      entity,
      mechanics,
      action: { id: newActionId(), seq: seq() },
    });
  }, [characterDoc, characterId, state, uid, campaignId, seq]);

  const stand = useCallback(
    (entityId: EntityId) => {
      if (!characterId || !state) return;
      const entity = state.entities[entityId];
      if (!entity) return;
      void readCombatState(uid, characterId).then((previous) => {
        // No live document means the sheet's own integrity failure, not a fresh character:
        // leaving would overwrite nothing with something. The table op is skipped rather
        // than half-applied.
        if (!previous) return;
        return leaveTable({
          db,
          uid,
          characterId,
          campaignId,
          encounterId: LIVE_ENCOUNTER_ID,
          entity,
          leave: { id: newActionId(), seq: seq() },
          personal: {
            kind: "document",
            data: encodeLegacyWriteBack(previous, entity, Object.values(state.effects)),
          },
        });
      });
    },
    [characterId, state, uid, campaignId, seq]
  );

  const addCreature = useCallback(
    (option: CreatureOption) => {
      if (!state) return;
      const block = blocks.find((one) => one.id === option.id);
      if (!block) return;
      // Two ogres are told apart by an ordinal, not by a random id: the label the log prints
      // has to mean something at the table.
      const already = Object.values(state.entities).filter(
        (entity) => entity.origin.kind === "monster" && entity.origin.srdId === block.id
      ).length;
      const ordinal = already + 1;
      const { entity, mechanics } = projectMonster(block, {
        id: `${block.id}-${ordinal}`,
        label: monsterLabelId(block.id, ordinal),
        controllerUid: campaign?.dmUid ?? uid,
      });
      void table.dispatch({
        kind: "table",
        table: { op: "add-entity", entity, mechanics },
      });
    },
    [state, blocks, campaign, uid, table]
  );

  return (
    <PlayScreen
      table={table}
      catalogue={catalogue}
      viewer={{ uid, dm, characterId, dmUid: campaign?.dmUid ?? "" }}
      title={campaign?.name ?? t("play.scene.untitled")}
      members={members}
      characters={characters}
      portraits={portraits}
      levels={levels}
      identityOf={identityOf}
      creatures={creatures}
      creaturesLoading={bestiaryLoading}
      onAddCreature={addCreature}
      onOpenTable={dm ? openTable : undefined}
      onSit={characterId && characterDoc ? sit : undefined}
      onStand={stand}
    />
  );
}
