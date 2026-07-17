/**
 * SharedNotes — the campaign's shared notes (Phase 5 · Part 2b).
 *
 * Lore, leads, and reminders any member can edit. Notes are per-note documents in
 * the `/campaigns/{campId}/notes` subcollection (read live by
 * {@link useCampaignNotesSubscription}, written through immediately via
 * `setCampaignNote` / `deleteCampaignNote`) — NOT a field on the campaign doc, so
 * the content-sharing soft-reveal is enforced by `firestore.rules`: a player is
 * never even served a note the DM is holding hidden. Each edit updates the local
 * `notes` slice optimistically and persists in the same handler; the live
 * subscription reconciles. Pinned notes sort to the top.
 *
 * The most-recent (pinned-or-freshest) note is the FIXED at-a-glance signal + the
 * "Add note" action; the rest of the board is the section's collapsible DETAIL
 * ({@link SectionPanel}), bounded with "View all".
 */

import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Pin, Trash2, Plus, PencilLine, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { InfoCard } from "@/components/shared/InfoCard";
import { NoteClamp } from "@/components/shared/NoteClamp";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { useAuthStore } from "@/stores/authStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useConfirmStore } from "@/stores/confirmStore";
import type { SharedNote } from "@/types/campaign";
import { useCampaignStore, mergeSharedNotes } from "@/features/campaigns/campaignStore";
import { useCampaignNotesSubscription } from "@/features/campaigns/useCampaignNotesSubscription";
import {
  setCampaignNote,
  setCampaignNoteHidden,
  deleteCampaignNote,
  evictLegacyNote,
} from "@/features/campaigns/campaign-io";

/** Notes shown at a glance; the rest sit behind "View all" (the Treasury-log
 *  bounded-list recipe) so a long board never buries the sections below. */
const VISIBLE_NOTES = 5;

/** Sortable epoch ms for a note's `updatedAt`, tolerant of a note saved before
 *  the field existed (absent → epoch 0, sorts oldest). The read boundary already
 *  converts any wire `Timestamp` to a `Date`; this only guards the MISSING case. */
function noteMillis(note: SharedNote): number {
  return note.updatedAt instanceof Date ? note.updatedAt.getTime() : 0;
}

export function SharedNotes() {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  const campaign = useCampaignStore((s) => s.campaign);
  const storeNotes = useCampaignStore((s) => s.notes);
  const notesLoading = useCampaignStore((s) => s.notesLoading);
  const notesError = useCampaignStore((s) => s.notesError);
  const upsertNote = useCampaignStore((s) => s.upsertNote);
  const removeNote = useCampaignStore((s) => s.removeNote);

  // Open the live notes subscription for THIS campaign (DM sees all; player sees
  // only the revealed ones — server-gated). Feeds the `notes` slice above.
  useCampaignNotesSubscription();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  // The add-note form is disclosed on demand so an empty campaign isn't two
  // empty input cards under the empty state (CMP5).
  const [showAdd, setShowAdd] = useState(false);
  // CN1 — a note edits IN PLACE: the card becomes its own title+content editor
  // (the inline-editing principle), keyed by id with a local draft.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  // Bounded list (CAMPAIGN-NOTES-UX): pinned + the freshest notes at a glance,
  // the long tail behind "View all" so the board never buries Treasury/DM tools.
  const [showAll, setShowAll] = useState(false);

  if (!campaign) return null;
  // Capture the id once the guard has proven `campaign` non-null, so the write-through
  // closures below (`persist` / `confirmRemove`) don't re-narrow it.
  const campaignId = campaign.id;

  // The content-sharing lens (SOFT model): the DM (or admin override) sees every
  // note + the reveal/hide control; a player never even sees a dmOnly note.
  const isDm = campaign.dmUid === uid || isAdmin;

  // Transitional read-fallback (rule 10): union the subscription notes (the new
  // subcollections) with the LEGACY `campaign.sharedNotes` array, so the live users'
  // pre-migration notes render with zero migration (subcollection copy wins on a
  // collision; every legacy note is visible). The set of legacy ids drives the
  // durable eviction below — when a legacy note is deleted/hidden, drop the
  // everyone-readable campaign-doc copy too.
  const mergedNotes = mergeSharedNotes(storeNotes, campaign.sharedNotes);
  const legacyNoteIds = campaign.sharedNotes
    ? new Set(campaign.sharedNotes.map((n) => n.id))
    : null;

  // Pinned first, then most-recently-touched — so a slice of the top of this
  // order is exactly "what the table cares about right now" (a freshly added or
  // edited note can never land hidden below the fold). The `!n.dmOnly` filter for
  // a non-DM is defense-in-depth: the SERVER already withholds hidden notes from a
  // player's subscription, so this only ever matters to the DM (who keeps all).
  const notes = [...mergedNotes]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || noteMillis(b) - noteMillis(a))
    .filter((n) => isDm || !n.dmOnly);
  // The most-recent (pinned-or-freshest) note is the FIXED at-a-glance signal; the
  // rest are the section's collapsible DETAIL, bounded so the at-a-glance set stays
  // the latest VISIBLE_NOTES total (1 fixed + the rest below) with "View all".
  const [mostRecent, ...rest] = notes;
  const detailPreview = VISIBLE_NOTES - 1;
  const visibleRest = showAll ? rest : rest.slice(0, detailPreview);
  const hiddenCount = rest.length - visibleRest.length;

  // Persist one note write-through (immediate, per-note doc), then let the live
  // subscription reconcile. A denied/failed write logs and self-corrects on the
  // next snapshot; under dev bypass this is a no-op (the optimistic store moves it).
  function persist(note: SharedNote): void {
    void setCampaignNote(campaignId, note).catch((err: unknown) =>
      console.error("Failed to save shared note", err)
    );
  }

  // Durably remove a LEGACY (not-yet-migrated) note from the everyone-readable
  // `campaign.sharedNotes` array — invoked when such a note is deleted or hidden
  // (the two acts that must drop the campaign-doc copy). A no-op for a note that
  // already lives only in the subcollections (post-migration / never legacy).
  function evictIfLegacy(noteId: string): void {
    if (!legacyNoteIds?.has(noteId)) return;
    void evictLegacyNote(campaignId, noteId).catch((err: unknown) =>
      console.error("Failed to evict legacy shared note", err)
    );
  }

  function addNote(): void {
    const tt = title.trim();
    const cc = content.trim();
    if (!tt && !cc) return;
    const note: SharedNote = {
      id: crypto.randomUUID(),
      title: tt,
      content: cc,
      pinned: false,
      createdBy: uid ?? "",
      updatedAt: new Date(),
      // A member can only ever author a VISIBLE note; hiding is a DM act (firestore
      // rules enforce this too). Store the flag explicitly so a player's scoped
      // `where dmOnly == false` query returns it.
      dmOnly: false,
    };
    upsertNote(note);
    persist(note);
    setTitle("");
    setContent("");
    setShowAdd(false);
  }

  function togglePin(note: SharedNote): void {
    const next = { ...note, pinned: !note.pinned, updatedAt: new Date() };
    upsertNote(next);
    persist(next);
  }

  // Content-sharing lens (DM/admin only) — reveal/hide a note. Visibility is the
  // COLLECTION it lives in (revealed `notes` vs DM-only `dmNotes`), so this MOVES
  // the doc server-side (DM-gated); the rules also block a player from reaching it.
  function toggleDmOnly(note: SharedNote): void {
    const nextHidden = !note.dmOnly;
    upsertNote({ ...note, dmOnly: nextHidden, updatedAt: new Date() });
    void setCampaignNoteHidden(campaignId, note, nextHidden).catch((err: unknown) =>
      console.error("Failed to reveal/hide shared note", err)
    );
    // Hiding a LEGACY note must also remove its visible campaign-doc copy, or the
    // (members-readable) `sharedNotes` array would keep leaking it to players even
    // though the soft-reveal moved it to `dmNotes`.
    if (nextHidden) evictIfLegacy(note.id);
  }

  function startEdit(note: SharedNote): void {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setShowAdd(false); // never edit + add at once
  }

  function saveEdit(note: SharedNote): void {
    // upsert by id preserves pinned + createdBy + dmOnly; only the text is corrected.
    const next = {
      ...note,
      title: editTitle.trim(),
      content: editContent.trim(),
      updatedAt: new Date(),
    };
    upsertNote(next);
    persist(next);
    setEditingId(null);
  }

  // Deleting a shared note removes it for the whole party — confirm first (CMP5).
  // `hidden` selects which collection holds it (revealed `notes` vs DM `dmNotes`).
  async function confirmRemove(note: SharedNote): Promise<void> {
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.removeNoteTitle"),
      message: t("campaignHub.removeNoteMessage"),
      confirmLabel: t("common.remove"),
      tone: "danger",
    });
    if (ok) {
      removeNote(note.id);
      void deleteCampaignNote(campaignId, note.id, note.dmOnly === true).catch(
        (err: unknown) => console.error("Failed to delete shared note", err)
      );
      // A legacy note also lives in the campaign-doc array — drop it there too, or
      // the next campaign snapshot would resurrect the "deleted" note.
      evictIfLegacy(note.id);
    }
  }

  // One note as its card (the in-place editor when it's the row being edited, else
  // the read card with its actions). Extracted so the FIXED most-recent note and each
  // older note in the DETAIL render identically.
  function renderNote(n: SharedNote): ReactElement {
    return editingId === n.id ? (
      // CN1 — in-place editor: the card becomes title + content fields.
      <InfoCard as="li" key={n.id} className="flex flex-col gap-3">
        <Field label={t("campaignHub.noteTitle")}>
          {(props) => (
            <Input
              {...props}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={t("campaignHub.noteTitlePlaceholder")}
            />
          )}
        </Field>
        <Field label={t("campaignHub.noteContent")}>
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditingId(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => saveEdit(n)}
            disabled={editTitle.trim() === "" && editContent.trim() === ""}
          >
            {t("common.save")}
          </Button>
        </div>
      </InfoCard>
    ) : (
      <InfoCard as="li" key={n.id} className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {n.dmOnly ? (
            // Shown only on the DM's board (a player never sees the note at all) —
            // a calm muted chip marking it held back.
            <Badge
              variant="muted"
              size="sm"
              glyph={<EyeOff aria-hidden className="h-3 w-3" />}
              className="mb-1"
            >
              {t("campaignHub.hiddenFromPlayers")}
            </Badge>
          ) : null}
          {n.title ? <h3 className="font-serif text-text-primary">{n.title}</h3> : null}
          {n.content ? (
            // Bounded preview (CAMPAIGN-NOTES-UX): a long note clamps to a few lines
            // with a fade + "Show more"; a short one renders untouched.
            <NoteClamp className="mt-1">
              <p className="whitespace-pre-wrap text-sm text-text-secondary">
                {n.content}
              </p>
            </NoteClamp>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {isDm ? (
            // Content-sharing lens (DM only): hide a note from players or reveal it.
            // Eye = currently shared (tap to hide); EyeOff = hidden (tap to reveal).
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={!!n.dmOnly}
              aria-label={
                n.dmOnly ? t("campaignHub.revealNote") : t("campaignHub.hideNote")
              }
              onClick={() => toggleDmOnly(n)}
            >
              {n.dmOnly ? (
                <EyeOff aria-hidden className="h-4 w-4 text-accent-text" />
              ) : (
                <Eye aria-hidden className="h-4 w-4 text-text-secondary" />
              )}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("campaignHub.editNote")}
            onClick={() => startEdit(n)}
          >
            <PencilLine aria-hidden className="h-4 w-4 text-text-secondary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={n.pinned}
            aria-label={n.pinned ? t("campaignHub.unpin") : t("campaignHub.pin")}
            onClick={() => togglePin(n)}
          >
            <Pin
              aria-hidden
              className={
                n.pinned ? "h-4 w-4 text-accent-text" : "h-4 w-4 text-text-secondary"
              }
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("campaignHub.removeNote")}
            onClick={() => void confirmRemove(n)}
          >
            <Trash2 aria-hidden className="h-4 w-4 text-text-secondary" />
          </Button>
        </div>
      </InfoCard>
    );
  }

  // The DETAIL = the older notes (the board minus the most-recent), bounded with
  // "View all". Only offer the disclosure when there is more than one note.
  const notesDetail =
    rest.length > 0 ? (
      <ul className="flex flex-col gap-2">
        {visibleRest.map(renderNote)}
        {hiddenCount > 0 || showAll ? (
          <li>
            <button
              type="button"
              className="rh-action text-text-muted hover:text-accent-text"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? t("common.showLess")
                : t("campaignHub.viewAll", { count: notes.length })}
            </button>
          </li>
        ) : null}
      </ul>
    ) : undefined;

  return (
    <SectionPanel
      sectionId="notes"
      title={t("campaignHub.notes")}
      count={notes.length || undefined}
      framed
      detail={notesDetail}
      showLabel={t("campaignHub.allNotes", { count: notes.length })}
      hideLabel={t("campaignHub.hideAllNotes")}
    >
      <div className="flex flex-col gap-3">
        {notesError ? (
          // The notes listener failed (read denied / offline) — a calm, honest
          // message, never a raw error string (impeccable §2.2). Plain text: the
          // section's `framed` card already carries the surface (no nested card).
          <p className="text-sm text-text-secondary">{t("campaignHub.notesError")}</p>
        ) : notesLoading && notes.length === 0 ? (
          // First-load skeleton — a single quiet placeholder, never a blank flicker.
          <div aria-busy="true" className="h-12 animate-pulse rounded bg-bg-tertiary" />
        ) : notes.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("campaignHub.notesEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mostRecent ? renderNote(mostRecent) : null}
          </ul>
        )}

        {showAdd ? (
          // gap-3 + right-aligned actions mirror the Treasury form so the two hub
          // forms read as one family (CMP5 tidy).
          <InfoCard className="flex flex-col gap-3">
            <Field label={t("campaignHub.noteTitle")}>
              {(props) => (
                <Input
                  {...props}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("campaignHub.noteTitlePlaceholder")}
                />
              )}
            </Field>
            <Field label={t("campaignHub.noteContent")}>
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAdd(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="secondary"
                onClick={addNote}
                disabled={title.trim() === "" && content.trim() === ""}
              >
                {t("campaignHub.addNote")}
              </Button>
            </div>
          </InfoCard>
        ) : (
          <div className="flex justify-start">
            <Button variant="secondary" onClick={() => setShowAdd(true)}>
              <Icon as={Plus} size="sm" decorative />
              {t("campaignHub.addNote")}
            </Button>
          </div>
        )}
      </div>
    </SectionPanel>
  );
}
