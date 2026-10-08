/**
 * Record the owner's own sheet gestures into the session log of the campaign the
 * character is attached to. The campaign is resolved on the first gesture (no read for a
 * sheet that is only looked at); a character attached nowhere records nothing. Every
 * failure goes to diagnostics and never touches the sheet.
 */

import { useEffect } from "react";

import { createAttachedCampaignTracker } from "@/features/campaigns/refresh-attached-sheets";
import { diagnosticsLog } from "@/lib/diagnostics";
import { createCharacterLogMirror, createSessionRecorder } from "@/lib/session-log";
import { sessionLogStoreFor } from "@/features/campaigns/session-log-source";
import { useAuthStore } from "@/stores/authStore";
import { setPlayLogSink } from "@/stores/characterStore";

type Mirror = ReturnType<typeof createCharacterLogMirror>;

export function useSessionLogPlayerRecorder(characterId: string | undefined): void {
  const uid = useAuthStore((s) => s.user?.uid);

  useEffect(() => {
    if (!uid || !characterId) return;
    const onError = (error: unknown): void =>
      diagnosticsLog("warn", "session-log.player-failed", { message: String(error) });
    const tracker = createAttachedCampaignTracker(uid, characterId);
    let mirror: Promise<Mirror | null> | null = null;
    const resolve = (): Promise<Mirror | null> =>
      (mirror ??= tracker.ensure().then(([campaignId]) => {
        if (campaignId === undefined) return null;
        const recorder = createSessionRecorder({
          store: sessionLogStoreFor(campaignId),
          uid,
        });
        return createCharacterLogMirror({ recorder, characterId, actor: `pc-${uid}` });
      }));
    const forward = (send: (m: Mirror) => Promise<void>): void => {
      resolve()
        .then((m) => (m ? send(m) : undefined))
        .catch(onError);
    };
    setPlayLogSink({
      added: (id, entry) => {
        if (id === characterId) forward((m) => m.added(entry));
      },
      removed: (id, entryId) => {
        if (id === characterId) forward((m) => m.removed(entryId));
      },
    });
    return () => setPlayLogSink(null);
  }, [uid, characterId]);
}
