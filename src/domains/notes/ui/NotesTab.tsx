/**
 * The campaign's Note tab (approved prototype camp-notes): the table's shared notes,
 * important ones first then the freshest, each marked «!» important, «@» a person or
 * «#» a place. Filters and a search on the left; any member writes and edits, the DM
 * may keep a note hidden from the players. Every save and delete has its undo.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { notesView, type NoteFilter, type NoteRow } from "@/domains/notes/notes-view";
import { NoteDialog } from "@/domains/notes/ui/NoteDialog";
import { removeNote, saveNote } from "@/domains/notes/ui/note-moves";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useCampaignNotesSubscription } from "@/features/campaigns/useCampaignNotesSubscription";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc, SharedNote } from "@/types/campaign";
import { Button, Chip, Field, Panel } from "@/ui";

const FILTERS: NoteFilter[] = ["all", "important", "people", "places", "mine"];
const MARK = { important: "!", person: "@", place: "#", note: "" } as const;

export function NotesTab({
  campaign,
  onToast,
}: {
  campaign: CampaignDoc;
  onToast: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  useCampaignNotesSubscription();
  const uid = useAuthStore((s) => s.user?.uid) ?? "";
  const isDm = uid === campaign.dmUid;
  const stored = useCampaignStore((s) => s.notes);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SharedNote | "new" | null>(null);
  const rows = notesView(stored, { filter, query }, { uid, isDm });
  const players = campaign.memberDetails;
  const label = (f: NoteFilter) =>
    f === "all" ? t("common.allF") : t(`campaignNotes.${f}`);

  const save = (
    previous: SharedNote | null,
    draft: { title: string; content: string; pinned: boolean; dmOnly: boolean }
  ) => {
    const next: SharedNote = previous
      ? {
          ...previous,
          ...draft,
          dmOnly: isDm ? draft.dmOnly : previous.dmOnly,
          updatedAt: new Date(),
        }
      : {
          id: crypto.randomUUID(),
          ...draft,
          // Only the DM may hide a note; the rules enforce it too.
          dmOnly: isDm && draft.dmOnly,
          createdBy: uid,
          updatedAt: new Date(),
        };
    onToast(t("campaignNotes.saved"), saveNote(campaign.id, next, previous));
    setEditing(null);
  };

  return (
    <div className="f-split-l">
      <Panel color="log" title={t("campaignNotes.filter")} className="f-sticky">
        <div className="f-chips">
          {FILTERS.map((f) => (
            <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
              {label(f)}
            </Chip>
          ))}
        </div>
      </Panel>
      <Panel
        color="log"
        title={t("notes.combatRubric")}
        aside={
          <Button kind="primary" icon="u-add" onClick={() => setEditing("new")}>
            {t("campaignNotes.newNote")}
          </Button>
        }
      >
        <Field
          label={t("campaignNotes.search")}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {rows.length === 0 && (
          <p className="f-quiet f-lbl-gap">
            {t(stored.length ? "campaignNotes.noMatch" : "campaignNotes.empty")}
          </p>
        )}
        {rows.map((note) => (
          <NoteLine
            key={note.id}
            note={note}
            author={players[note.createdBy]?.displayName}
            onOpen={() => setEditing(note)}
          />
        ))}
      </Panel>
      {editing && (
        <NoteDialog
          note={editing === "new" ? null : editing}
          isDm={isDm}
          onClose={() => setEditing(null)}
          onSave={(draft) => save(editing === "new" ? null : editing, draft)}
          onDelete={
            editing === "new"
              ? undefined
              : () => {
                  onToast(t("campaignNotes.deleted"), removeNote(campaign.id, editing));
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}

function NoteLine({
  note,
  author,
  onOpen,
}: {
  note: NoteRow;
  author: string | undefined;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const mark = MARK[note.kind];
  return (
    <div className="f-row f-note-row">
      <span
        className="f-mark"
        data-kind={note.kind}
        aria-label={
          note.kind === "note" ? undefined : t(`campaignNotes.kind.${note.kind}`)
        }
      >
        {mark}
      </span>
      <span className="f-row-main">
        <span className="f-row-t">{note.title || note.content.split("\n")[0]}</span>
        {note.title && note.content && (
          <span className="f-row-s" data-user-text="">
            {note.content.split("\n")[0]}
          </span>
        )}
        <span className="f-row-s">
          {[
            author && t("diary.noteBy", { name: author }),
            note.dmOnly && t("campaignNotes.hidden"),
            ...note.tags,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <Button kind="quiet" icon="u-edit" onClick={onOpen}>
        {t("common.edit")}
      </Button>
    </div>
  );
}
