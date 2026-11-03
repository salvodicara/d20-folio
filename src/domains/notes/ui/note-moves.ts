/**
 * The Note tab's writes, the same steps the old hub takes (SharedNotes): the screen
 * updates at once (`upsertNote` / `removeNote`), the per-note document is written
 * through (`setCampaignNote`, `setCampaignNoteHidden`, `deleteCampaignNote`). Each
 * move returns its undo, for the toast.
 */
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import {
  deleteCampaignNote,
  setCampaignNote,
  setCampaignNoteHidden,
} from "@/features/campaigns/campaign-io";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { SharedNote } from "@/types/campaign";

const warn = (what: string) => (error: unknown) =>
  diagnosticsLog("warn", `notes.${what}-failed`, { message: String(error) });

/** Write a note (new or edited), keeping who wrote it and its visibility. */
export function saveNote(
  campaignId: string,
  next: SharedNote,
  previous: SharedNote | null
): () => void {
  const store = useCampaignStore.getState();
  store.upsertNote(next);
  void setCampaignNote(campaignId, next).catch(warn("save"));
  // A hidden note moves between collections: the DM-only one is a separate write.
  if (previous && previous.dmOnly !== next.dmOnly) {
    void setCampaignNoteHidden(campaignId, next, next.dmOnly === true).catch(
      warn("hide")
    );
  }
  return () =>
    previous ? void saveNote(campaignId, previous, next) : removeNote(campaignId, next);
}

/** Delete a note for the whole table. */
export function removeNote(campaignId: string, note: SharedNote): () => void {
  useCampaignStore.getState().removeNote(note.id);
  void deleteCampaignNote(campaignId, note.id, note.dmOnly === true).catch(
    warn("delete")
  );
  return () => void saveNote(campaignId, note, null);
}
