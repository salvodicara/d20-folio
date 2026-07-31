/**
 * use-share-character — the owner side of a public character share link.
 *
 * The whole feature is one boolean on the character document, so this hook is one
 * write path and one action: `setShared(next)`. The SHARE POPOVER
 * (`SharePopover`, opened from the sheet's ⋯ menu) is the only caller — its switch
 * IS share-and-revoke, instant and with no confirm, because the popover's own state
 * (the link appearing and disappearing under the switch) is the feedback and the act
 * is reversible in the same gesture. Sharing again returns the SAME link: the link is
 * the document path, never a minted token.
 *
 * The write mirrors the portrait-metadata precedent
 * (`usePortraitCrop.removePortrait`): persist through `updateCharacter`, THEN reflect
 * on the store — never the reverse, so a failed write never leaves the sheet claiming
 * a link that does not work. A failure is the one thing that DOES speak up (a toast),
 * and the switch stays where it was.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { appLink } from "@/lib/app-link";
import { updateCharacter } from "@/lib/firestore";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

/** The public URL of a shared character — its Firestore document path IS the link. */
export function shareLinkFor(uid: string, charId: string): string {
  return appLink(`/view/${uid}/${charId}`);
}

export interface ShareCharacterActions {
  /** True while this character is publicly readable by anyone with the link. */
  shared: boolean;
  /** The public URL — stable, because it IS the document path. */
  link: string;
  /** Turn sharing on or off. Persists first; a failed write toasts and changes nothing. */
  setShared: (next: boolean) => void;
}

export function useShareCharacter(): ShareCharacterActions {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const character = useCharacterStore((s) => s.character);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const shared = character?.shared === true;

  /** Persist the flag, then reflect it — and say so plainly if the write failed. */
  const setShared = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (!uid || !character) return false;
      try {
        await updateCharacter(uid, character.id, { shared: next });
      } catch {
        useToastStore.getState().showToast({
          message: t("share.failed", { name: character.character.name }),
          duration: 4000,
        });
        return false;
      }
      setCharacter({ ...character, shared: next });
      return true;
    },
    [uid, character, setCharacter, t]
  );

  return {
    shared,
    link: uid && character ? shareLinkFor(uid, character.id) : "",
    setShared: (next: boolean) => void setShared(next),
  };
}
