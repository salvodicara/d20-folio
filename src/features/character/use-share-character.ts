/**
 * use-share-character — the owner side of a public character share link.
 *
 * The whole feature is one boolean on the character document, so this hook is one
 * write path and two actions:
 *
 *   share()  — turn sharing ON if it is off, then hand the link to the platform:
 *              the Web Share API native sheet where it exists (WhatsApp / Telegram /
 *              iMessage for free), the clipboard everywhere else. ONE tap from the
 *              menu to a sent link — the reason there is no share dialog to walk
 *              through (golden rule 20).
 *   revoke() — turn it off, immediately, on one quiet tap. NO confirm: the house
 *              register keeps those for destructive acts, and this one is instantly
 *              reversible (Share link puts the SAME link back). The very next read of
 *              the link is denied by `firestore.rules`; there is nothing to undo.
 *
 * Both mirror the portrait-metadata write precedent (`usePortraitCrop.removePortrait`):
 * persist through `updateCharacter`, then reflect on the store — never the reverse, so
 * a failed write never leaves the sheet claiming a link that does not work.
 *
 * Sharing + copying themselves are the shared primitives (`shareOrCopy`), never a
 * second implementation.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { shareOrCopy } from "@/components/shared/copy-to-clipboard";
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
  /** Turn sharing on (if needed) and hand the link to the native sheet / clipboard. */
  share: () => Promise<void>;
  /** Stop sharing, immediately — the link dies on the next read. */
  revoke: () => Promise<void>;
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

  const share = useCallback(async () => {
    if (!uid || !character) return;
    const name = character.character.name;
    const justEnabled = !shared;
    if (justEnabled && !(await setShared(true))) return;
    // ONE toast, always accurate: the first share says what sharing MEANS; a repeat
    // share just confirms the copy. Neither fires on the native-sheet path, where the
    // sheet itself is the feedback.
    await shareOrCopy(shareLinkFor(uid, character.id), {
      title: t("share.shareTitle", { name }),
      text: t("share.shareText", { name }),
      copiedToast: justEnabled
        ? t("share.enabledToast", { name })
        : t("share.linkCopied"),
    });
  }, [uid, character, shared, setShared, t]);

  const revoke = useCallback(async () => {
    if (!character) return;
    const name = character.character.name;
    if (await setShared(false)) {
      useToastStore.getState().showToast({
        message: t("share.revokedToast", { name }),
        duration: 3000,
      });
    }
  }, [character, setShared, t]);

  return { shared, share, revoke };
}
