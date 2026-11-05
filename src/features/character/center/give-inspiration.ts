/**
 * Inspiration a use gives other PCs (Musician: Heroic Inspiration to allies after a
 * rest; Bardic Inspiration: a die the ally keeps), written on each picked PC's play
 * state through the peer write (`writeCampaignCombatEffect`, `inspiration`): in a
 * fight from its roster, out of one from the campaign's party. A creature that
 * isn't a PC of the campaign (a monster, an ally the app doesn't know) gets nothing
 * written; its player ticks it at the table. Returns the undo.
 */
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { useToastStore } from "@/stores/toastStore";

type Grant = { kind: "heroic" } | { kind: "bardic-die"; die: string };

/** What the use gives, from its summary; null when it gives no inspiration. */
export function inspirationGrantOf(
  action: Pick<ResolvedAction, "summary">
): Grant | null {
  if (action.summary.grantsHeroicInspiration) return { kind: "heroic" };
  const die = action.summary.grantedDie?.die;
  return die ? { kind: "bardic-die", die } : null;
}

/** The picked PCs this sheet can write to: their owner, character and maximum HP. */
function peerTargets(
  targets: ReadonlyArray<string>
): Array<{ memberUid: string; characterId: string; maxHp: number }> {
  const status = useCombatStatusStore.getState().status;
  if (status) {
    return targets.flatMap((id) => {
      const row = status.view.rows.find((r) => r.id === id);
      return id !== status.myId && row?.kind === "pc" && row.memberUid && row.characterId
        ? [{ memberUid: row.memberUid, characterId: row.characterId, maxHp: row.maxHp }]
        : [];
    });
  }
  const party = usePartyRosterStore.getState().party;
  return targets.flatMap((id) => {
    const member = party?.members.find((m) => m.ref.combatantId === id);
    return member
      ? [
          {
            memberUid: member.ref.memberUid,
            characterId: member.ref.characterId,
            maxHp: 1,
          },
        ]
      : [];
  });
}

/** Give the use's inspiration to the picked PCs; the returned undo takes it back
 *  where it wasn't spent since. Null when there is nothing to write. */
export function giveInspiration(
  action: Pick<ResolvedAction, "summary">,
  targets: ReadonlyArray<string>,
  failedMessage: string
): (() => void) | null {
  const grant = inspirationGrantOf(action);
  const peers = grant ? peerTargets(targets) : [];
  if (!grant || peers.length === 0) return null;
  const failed = (error: unknown): void => {
    console.error("Inspiration write failed", error);
    useToastStore.getState().showToast({ message: failedMessage, duration: 6000 });
  };
  const writes = peers.map((peer) =>
    import("@/features/campaigns/campaign-io")
      .then(async ({ writeCampaignCombatEffect }) => {
        const { before, after } = await writeCampaignCombatEffect(
          peer.memberUid,
          peer.characterId,
          null,
          peer.maxHp,
          { kind: "inspiration", grant }
        );
        return () =>
          void writeCampaignCombatEffect(
            peer.memberUid,
            peer.characterId,
            null,
            peer.maxHp,
            {
              kind: "revert",
              written: after,
              previous: before,
              spends: [],
            }
          ).catch(failed);
      })
      .catch((error: unknown) => {
        failed(error);
        return () => {};
      })
  );
  return () => {
    for (const write of writes) void write.then((undo) => undo());
  };
}
