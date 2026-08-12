/**
 * Sessions — the campaign's session list (Phase 5 · Part 2b; D28).
 *
 * A one-shot, membership-scoped read on open (NOT a standing listener — NFR: read
 * on-open + cached) plus "new session" create, both through the 2a `campaign-io`
 * subcollection helpers.
 *
 * D28 — the selected session is a directly editable living document, not a read card
 * followed by an Edit → Save ceremony. The draft is mirrored to localStorage on every
 * keystroke, debounced to Firestore, and flushed on blur / page hide / route unmount.
 * Switching campaign workspace tabs keeps this component mounted; leaving the route is
 * still safe because the local draft survives until a confirmed remote write.
 *
 * The LATEST session is the FIXED at-a-glance row (always visible) + "New session";
 * the OLDER sessions are the section's collapsible DETAIL ({@link SectionPanel}).
 * Both the detail and a row's own body ride the SAME CSS `grid-template-rows` reveal
 * — there is NO ResizeObserver `AutoAnimateHeight` wrapping the list anymore, so
 * opening a row never makes two stacked height animators fight (bug B).
 */

import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  LoaderCircle,
  ScrollText,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/input";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
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

/** Interactive descendants that own their click (the chevron and inline rename) — a
 *  whole-row toggle skips them so they never fight (the
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

type SummarySaveState = "saved" | "pending" | "saving" | "error";

const SUMMARY_SAVE_DELAY = 900;

function draftKey(campaignId: string, id: string): string {
  return `d20.sessionDraft.${campaignId}.${id}`;
}

function readSessionDraft(campaignId: string, session: SessionLogDoc): string {
  try {
    const local = localStorage.getItem(draftKey(campaignId, session.id));
    if (local === null) return session.notes;
    // A fresh remote read that contains the same text is the strongest possible
    // acknowledgement. Reconcile the safety copy here; until then it survives a
    // route transition even if a just-resolved write has not reached the next read.
    if (local === session.notes) {
      localStorage.removeItem(draftKey(campaignId, session.id));
      return session.notes;
    }
    return local;
  } catch {
    return session.notes;
  }
}

export function Sessions({
  campaignId,
  liveDesk = false,
}: {
  campaignId: string;
  /** Open the newest session as the live campaign desk's directly editable document. */
  liveDesk?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<SessionLogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // One selected session document at a time; the archive stays a compact index.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<SummarySaveState>("saved");
  // Bounded list (CAMPAIGN-NOTES-UX): the latest sessions at a glance, the
  // archive behind "View all". A new session prepends, so it is always visible.
  const [showAll, setShowAll] = useState(false);
  // Only ONE row edits at a time, so a single ref points at the mounted editor.
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveSequence = useRef(0);
  const activeDraft = useRef<{ id: string; value: string; saved: string } | null>(null);

  function keepDraft(id: string, value: string): void {
    try {
      localStorage.setItem(draftKey(campaignId, id), value);
    } catch {
      // Storage-disabled browsers still keep the controlled draft for this mount.
    }
  }

  function clearDraft(id: string, value: string): void {
    try {
      if (localStorage.getItem(draftKey(campaignId, id)) === value) {
        localStorage.removeItem(draftKey(campaignId, id));
      }
    } catch {
      // Nothing to clear when storage is unavailable.
    }
  }

  function flushNotes(id: string, value = draft): void {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const current = sessions.find((s) => s.id === id)?.notes ?? "";
    if (value === current) {
      clearDraft(id, value);
      setSaveState("saved");
      return;
    }
    const sequence = ++saveSequence.current;
    setSaveState("saving");
    // Firestore usually queues local writes in call order, but the editor must not
    // depend on that implementation detail: blur, debounce and page transitions can
    // request adjacent saves. Serialising them guarantees an older recap can never
    // land after a newer one and overwrite it.
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(() => updateSession(campaignId, id, { notes: value }));
    void saveChain.current
      .then(() => {
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, notes: value } : s))
        );
        if (activeDraft.current?.id === id) activeDraft.current.saved = value;
        // Keep the safety copy through a possible route transition. It is reconciled
        // by the next matching remote read (or a later equality flush), rather than
        // relying on navigation and snapshot timing lining up perfectly.
        if (sequence === saveSequence.current) setSaveState("saved");
      })
      .catch(() => {
        if (sequence === saveSequence.current) setSaveState("error");
      });
  }

  function scheduleSave(id: string, value: string): void {
    keepDraft(id, value);
    setSaveState("pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushNotes(id, value), SUMMARY_SAVE_DELAY);
  }

  function updateDraft(id: string, value: string): void {
    setDraft(value);
    const active = activeDraft.current;
    if (active?.id === id) active.value = value;
    scheduleSave(id, value);
  }

  function blurEditor(id: string): void {
    flushNotes(id, activeDraft.current?.value ?? draft);
  }

  // Focus the editor when a row enters edit mode — WITHOUT scrolling (the old
  // `autoFocus` yanked the accordion into view). Caret to the end so an existing
  // recap is appended to, never select-all-then-typed-over.
  useEffect(() => {
    if (!editingId) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [editingId]);

  useEffect(() => {
    let cancelled = false;
    void listSessions(campaignId)
      .then((s) => {
        if (!cancelled) {
          setSessions(s);
          if (liveDesk && s[0]) {
            setOpenIds(new Set([s[0].id]));
            setEditingId(s[0].id);
            const value = readSessionDraft(campaignId, s[0]);
            setDraft(value);
            activeDraft.current = { id: s[0].id, value, saved: s[0].notes };
          }
        }
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
  }, [campaignId, liveDesk]);

  // The browser may freeze a background tab without firing beforeunload. The local
  // draft is already durable per keystroke; these events also make a best-effort remote
  // flush so returning from a character sheet normally finds the server current.
  useEffect(() => {
    const flushActive = (): void => {
      const active = activeDraft.current;
      if (active && active.value !== active.saved) {
        void updateSession(campaignId, active.id, { notes: active.value });
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") flushActive();
    };
    window.addEventListener("pagehide", flushActive);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushActive);
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flushActive();
    };
  }, [campaignId]);

  function toggleOpen(s: SessionLogDoc): void {
    if (openIds.has(s.id)) {
      if (editingId === s.id) flushNotes(s.id);
      setOpenIds(new Set());
      setEditingId(null);
      activeDraft.current = null;
      return;
    }
    const active = activeDraft.current;
    if (active && active.value !== active.saved) flushNotes(active.id, active.value);
    setOpenIds(new Set([s.id]));
    setEditingId(s.id);
    const value = readSessionDraft(campaignId, s);
    setDraft(value);
    activeDraft.current = { id: s.id, value, saved: s.notes };
    setSaveState("saved");
  }

  async function addSession(): Promise<void> {
    const active = activeDraft.current;
    if (active && active.value !== active.saved) flushNotes(active.id, active.value);
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
      setOpenIds(new Set([id]));
      setEditingId(id);
      setDraft("");
      activeDraft.current = { id, value: "", saved: "" };
      setSaveState("saved");
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
      toggleOpen(s);
    };
    return (
      <li key={s.id} className="sess-item" data-open={open || undefined}>
        <div className="sess-summary" onClick={onRowClick}>
          <button
            type="button"
            className="sess-toggle"
            aria-expanded={open}
            aria-label={t("campaignHub.sessionToggle")}
            onClick={() => toggleOpen(s)}
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
          </div>
          {!open && teaser && <p className="sess-teaser">{teaser}</p>}
        </div>
        <div className="sess-bodywrap">
          <div className="sess-body">
            <div className="sess-notes">
              {editing ? (
                <>
                  <Textarea
                    ref={editorRef}
                    rows={3}
                    className="sess-notes-edit"
                    value={draft}
                    onChange={(e) => updateDraft(s.id, e.target.value)}
                    onBlur={() => blurEditor(s.id)}
                    placeholder={t("campaignHub.sessionNotesPlaceholder")}
                    aria-label={t("campaignHub.sessionNotes")}
                  />
                  <div className="sess-notes-actions">
                    <span
                      className="sess-save-state"
                      data-state={saveState}
                      role="status"
                    >
                      {saveState === "saving" && (
                        <Icon
                          as={LoaderCircle}
                          size="sm"
                          decorative
                          className="animate-spin"
                        />
                      )}
                      {saveState === "saved" && <Icon as={Check} size="sm" decorative />}
                      {saveState === "error"
                        ? t("campaignHub.sessionSaveError")
                        : saveState === "saved"
                          ? t("save.saved")
                          : t("save.saving")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="sess-delete-action"
                      onClick={() => void confirmDeleteSession(s.id)}
                    >
                      <Icon as={Trash2} size="sm" decorative />
                      {t("campaignHub.deleteSession")}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="sess-notes-empty">{t("campaignHub.sessionNoSummary")}</p>
              )}
            </div>
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
      headerAction={
        <Button
          variant="ghost"
          size="sm"
          loading={busy}
          onClick={() => void addSession()}
        >
          <CalendarPlus aria-hidden className="h-4 w-4" />
          {t("campaignHub.newSession")}
        </Button>
      }
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
      </div>
    </SectionPanel>
  );
}
