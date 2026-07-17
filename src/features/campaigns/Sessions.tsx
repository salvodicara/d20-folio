/**
 * Sessions — the campaign's session list (Phase 5 · Part 2b; D28).
 *
 * A one-shot, membership-scoped read on open (NOT a standing listener — NFR: read
 * on-open + cached) plus "new session" create, both through the 2a `campaign-io`
 * subcollection helpers.
 *
 * D28 — a session is an ACCORDION row, not an always-open textarea: collapsed it
 * shows its name, date, and a one-line teaser of what happened; expanding reveals
 * the full summary RENDERED as block markdown (the same reading view as the
 * chronicle), with "Edit summary" revealing the editor on intent (Save / Cancel).
 * A new session opens straight into edit mode so you can write it down on the spot.
 * The accordion reuses the app's chevron + grid-rows reveal vocabulary.
 *
 * The LATEST session is the FIXED at-a-glance row (always visible) + "New session";
 * the OLDER sessions are the section's collapsible DETAIL ({@link SectionPanel}).
 * Both the detail and a row's own body ride the SAME CSS `grid-template-rows` reveal
 * — there is NO ResizeObserver `AutoAnimateHeight` wrapping the list anymore, so
 * opening a row never makes two stacked height animators fight (bug B).
 */

import { useEffect, useState, type MouseEvent, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { CalendarPlus, ChevronDown, PencilLine, ScrollText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/input";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { NoteClamp } from "@/components/shared/NoteClamp";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { useConfirmStore } from "@/stores/confirmStore";
import type { SessionLogDoc } from "@/types/campaign";
import {
  createSession,
  deleteSession,
  listSessions,
  updateSession,
} from "@/features/campaigns/campaign-io";

/** Sessions shown at a glance (newest first); the long campaign tail sits behind
 *  "View all" (the Treasury-log bounded-list recipe) so recency stays scannable
 *  and the sections below the list never sink out of reach. */
const VISIBLE_SESSIONS = 5;

/** Interactive descendants that own their click (the chevron, the inline rename, the
 *  delete button) — a whole-row toggle skips them so they never fight (the
 *  CombatantCard / SectionHeader whole-surface guard). */
const INTERACTIVE = 'button,a,input,select,textarea,[role="button"]';

/** The first non-empty line of a summary, for the collapsed teaser. */
function firstLine(notes: string): string {
  for (const line of notes.split("\n")) {
    const trimmed = line.replace(/^#+\s*/, "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function Sessions({ campaignId }: { campaignId: string }) {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<SessionLogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Accordion: any number of rows may be open. Edit mode is one row at a time.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Bounded list (CAMPAIGN-NOTES-UX): the latest sessions at a glance, the
  // archive behind "View all". A new session prepends, so it is always visible.
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listSessions(campaignId)
      .then((s) => {
        if (!cancelled) setSessions(s);
      })
      .catch(() => {
        /* an unreadable list just stays empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function toggleOpen(id: string): void {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSession(): Promise<void> {
    setBusy(true);
    const label = t("campaignHub.sessionN", { n: sessions.length + 1 });
    const date = new Date();
    try {
      const id = await createSession(campaignId, { label, date });
      const created: SessionLogDoc = {
        id,
        date,
        label,
        notes: "",
        recapRequested: false,
        recapRequestedBy: null,
        recapRequestedAt: null,
        logs: {},
        generatedRecap: null,
        addedToChronicle: false,
      };
      setSessions((prev) => [created, ...prev]);
      // Open it AND drop straight into edit mode — write the recap on the spot.
      setOpenIds((prev) => new Set(prev).add(id));
      setEditingId(id);
      setDraft("");
    } catch {
      /* surfaced on the next load; keep the optimistic UI quiet */
    } finally {
      setBusy(false);
    }
  }

  /** Rename a session (#49) — optimistic, persisted through the io. */
  function renameSession(id: string, label: string): void {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
    void updateSession(campaignId, id, { label }).catch(() => {});
  }

  function startEdit(s: SessionLogDoc): void {
    setOpenIds((prev) => new Set(prev).add(s.id));
    setEditingId(s.id);
    setDraft(s.notes);
  }

  /** Commit the draft summary (D28) — optimistic, persisted on Save. */
  function saveNotes(id: string): void {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, notes: draft } : s)));
    void updateSession(campaignId, id, { notes: draft }).catch(() => {});
    setEditingId(null);
  }

  /** Delete a session (#49) — confirm first (it's shared, party-wide). */
  async function confirmDeleteSession(id: string): Promise<void> {
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.deleteSessionTitle"),
      message: t("campaignHub.deleteSessionMessage"),
      confirmLabel: t("common.remove"),
      tone: "danger",
    });
    if (!ok) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
    void deleteSession(campaignId, id).catch(() => {});
  }

  // One session as a full accordion row (the chevron + grid-rows reveal). Used for
  // the latest in the FIXED panel AND each older one in the DETAIL — extracted so the
  // two never drift. Its OWN per-row `.sess-bodywrap` reveal is now the ONLY height
  // animator in play: the section's detail rides the sibling CSS `grid-template-rows`
  // reveal too (no ResizeObserver `AutoAnimateHeight` wrapping it), so opening a row
  // can never make two stacked height animators fight (bug B — the sticky/janky feel).
  function renderSession(s: SessionLogDoc): ReactElement {
    const open = openIds.has(s.id);
    const editing = editingId === s.id;
    const teaser = firstLine(s.notes);
    // A click anywhere on the summary row that isn't on an interactive descendant
    // toggles the row (the CombatantCard whole-surface convenience). The chevron
    // button stays the keyboard/SR affordance — mouse-only, no extra tab stop.
    const onRowClick = (e: MouseEvent<HTMLDivElement>): void => {
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
      toggleOpen(s.id);
    };
    return (
      <li key={s.id} className="sess-item" data-open={open || undefined}>
        <div className="sess-summary" onClick={onRowClick}>
          <button
            type="button"
            className="sess-toggle"
            aria-expanded={open}
            aria-label={t("campaignHub.sessionToggle")}
            onClick={() => toggleOpen(s.id)}
          >
            <Icon as={ChevronDown} size="sm" decorative className="sess-chevron" />
          </button>
          <div className="sess-head">
            <Icon as={ScrollText} size="sm" decorative className="sess-ico" />
            <span className="sess-label">
              <InlineEditable
                type="text"
                editable
                value={s.label}
                onChange={(v) => renameSession(s.id, v)}
                ariaLabel={t("campaignHub.sessionLabel")}
              />
            </span>
            <span className="sess-date">{s.date.toLocaleDateString(i18n.language)}</span>
            <button
              type="button"
              className="sess-del"
              aria-label={t("campaignHub.deleteSession")}
              onClick={() => void confirmDeleteSession(s.id)}
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
          {!open && teaser && <p className="sess-teaser">{teaser}</p>}
        </div>
        <div className="sess-bodywrap">
          <div className="sess-body">
            {editing ? (
              <div className="flex flex-col gap-2 pt-2">
                <Textarea
                  rows={4}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("campaignHub.sessionNotesPlaceholder")}
                  aria-label={t("campaignHub.sessionNotes")}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditingId(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="primary" onClick={() => saveNotes(s.id)}>
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            ) : s.notes.trim() ? (
              <div className="flex flex-col gap-2 pt-2">
                {/* Bounded preview (CAMPAIGN-NOTES-UX): expanding the row is already
                    intent-to-read, so the generous `reading` cap lets a typical recap
                    show whole — only a truly long one clamps behind "Show more". */}
                <NoteClamp variant="reading">
                  <BlockMarkdown
                    text={s.notes}
                    className="sess-prose max-w-[--measure] text-sm text-text-secondary"
                  />
                </NoteClamp>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                    <Icon as={PencilLine} size="sm" decorative />
                    {t("campaignHub.sessionEditSummary")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-sm text-text-muted">
                  {t("campaignHub.sessionNoSummary")}
                </span>
                <Button variant="secondary" size="sm" onClick={() => startEdit(s)}>
                  <Icon as={PencilLine} size="sm" decorative />
                  {t("campaignHub.sessionAddSummary")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  // The latest session is the FIXED at-a-glance signal (a real, expandable row); the
  // OLDER sessions are the collapsible DETAIL, bounded to keep the at-a-glance set the
  // latest VISIBLE_SESSIONS total (1 fixed + the rest below) with "View all".
  const [latest, ...older] = sessions;
  const detailPreview = VISIBLE_SESSIONS - 1;
  const visibleOlder = showAll ? older : older.slice(0, detailPreview);
  const hiddenCount = older.length - visibleOlder.length;

  const olderDetail =
    older.length > 0 ? (
      <div className="flex flex-col gap-3">
        <ul className="sess-list">{visibleOlder.map(renderSession)}</ul>
        {hiddenCount > 0 || showAll ? (
          <button
            type="button"
            className="rh-action self-start text-text-muted hover:text-accent-text"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? t("common.showLess")
              : t("campaignHub.viewAll", { count: sessions.length })}
          </button>
        ) : null}
      </div>
    ) : undefined;

  return (
    <SectionPanel
      sectionId="sessions"
      title={t("campaignHub.sessions")}
      count={sessions.length || undefined}
      framed
      detail={olderDetail}
      showLabel={t("campaignHub.olderSessions", { count: older.length })}
      hideLabel={t("campaignHub.hideOlderSessions")}
    >
      <div className="flex flex-col gap-3">
        {loading ? null : sessions.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("campaignHub.sessionsEmpty")}</p>
        ) : (
          <ul className="sess-list">{latest ? renderSession(latest) : null}</ul>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" loading={busy} onClick={() => void addSession()}>
            <CalendarPlus aria-hidden className="h-4 w-4" />
            {t("campaignHub.newSession")}
          </Button>
        </div>
      </div>
    </SectionPanel>
  );
}
