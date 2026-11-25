/**
 * Creating a character without waiting for the server, and without ever losing the draft
 * (#1283; Coordinator decision 2026-11-25: keep the draft until the server confirms).
 *
 * Offline, a Firestore write settles only when the server answers, so a create that
 * awaited it spun forever. Here the new sheet opens at once (its id is made locally and
 * the write is queued), and the built character is kept on this device until the server
 * confirms it. If the server refuses it, the player is told and can create it again from
 * the kept draft. Storage that is blocked (private mode) only loses the safety copy; the
 * create itself still goes through.
 */
import { queueCreateCharacter } from "@/lib/firestore";
import { diagnosticsLog } from "@/lib/diagnostics";
import { useToastStore } from "@/stores/toastStore";
import type { CharacterDoc } from "@/types/character";

type Payload = Partial<CharacterDoc>;

interface KeptDraft {
  id: string;
  payload: Payload;
}

const key = (uid: string): string => `folio.pendingCreates.${uid}`;

/** The drafts kept on this device for creates the server has not confirmed yet. */
export function keptDrafts(uid: string): KeptDraft[] {
  try {
    const raw = localStorage.getItem(key(uid));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as KeptDraft[]) : [];
  } catch {
    return [];
  }
}

function writeDrafts(uid: string, drafts: KeptDraft[]): void {
  try {
    if (drafts.length === 0) localStorage.removeItem(key(uid));
    else localStorage.setItem(key(uid), JSON.stringify(drafts));
  } catch {
    // Blocked storage: the safety copy is lost, the create is not.
  }
}

/**
 * Queue the create, keep its draft, and return the new id at once (the caller opens the
 * sheet). `open` is also used by «Create again» after a refusal.
 */
export async function createCharacterOffline(input: {
  uid: string;
  payload: Payload;
  open: (id: string) => void;
  t: (key: string) => string;
}): Promise<string> {
  const { uid, payload, open, t } = input;
  const { id, written } = await queueCreateCharacter(uid, payload);
  writeDrafts(uid, [...keptDrafts(uid).filter((d) => d.id !== id), { id, payload }]);
  written.then(
    () =>
      writeDrafts(
        uid,
        keptDrafts(uid).filter((d) => d.id !== id)
      ),
    (err: unknown) => {
      diagnosticsLog("warn", "character.create-rejected", {
        message: err instanceof Error ? err.message : String(err),
      });
      useToastStore.getState().showToast({
        message: t("character.notSaved"),
        duration: 15_000,
        action: {
          label: t("character.createAgain"),
          run: () => {
            writeDrafts(
              uid,
              keptDrafts(uid).filter((d) => d.id !== id)
            );
            void createCharacterOffline({ uid, payload, open, t }).then(open);
          },
        },
      });
    }
  );
  return id;
}
