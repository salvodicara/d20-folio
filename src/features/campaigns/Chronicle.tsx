/**
 * Chronicle — the shared campaign log (Phase 5 · Part 2b; #32 reading view; D27).
 *
 * A shared, everyone-can-edit story log. The chronicle listener is mounted by the
 * HUB itself (`useChronicleSubscription` in `CampaignHubPage` — its compose-once
 * loading gate waits for the chronicle's first snapshot so the book-spread never
 * grows after paint); this section only READS the store.
 *
 * #32 / D27 — at rest the chronicle is a RENDERED reading view: a long log splits
 * by `#`/`##` headings into chapters you page through, and each chapter body is
 * full BLOCK markdown (sub-headings, scene rules, lists, **bold**) so a session
 * recount reads like a book, not a raw textarea.
 *
 * D27 — editing is a DRAFT model, not a live keystroke stream: "Edit" opens a
 * working copy; "Save" commits it (snapshotting the prior text into a capped
 * version history first), and a confirm guards a large deletion so nobody wipes the
 * story by accident. Past revisions can be restored into the draft before saving.
 */

import { useState, useMemo, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Download,
  PencilLine,
  Users,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
} from "lucide-react";
import { InfoCard } from "@/components/shared/InfoCard";
import { NoteClamp } from "@/components/shared/NoteClamp";
import { Select } from "@/components/shared/Select";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { splitChapters } from "@/features/campaigns/chronicle-chapters";
import { isLargeReduction } from "@/features/campaigns/chronicle-versions";
import { downloadChronicleMarkdown } from "@/features/campaigns/chronicle-export";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { AutoAnimateHeight } from "@/components/shared/AutoAnimateHeight";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useToastStore } from "@/stores/toastStore";
import { useLocale } from "@/hooks/useLocale";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { commitChronicleEdit } from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { ChronicleVersion } from "@/types/campaign";

export function Chronicle({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  /** The campaign's name — guaranteed present by the hub (it early-returns when the
   *  campaign hasn't loaded), so it's a real string here, never null/defaulted. Used
   *  to name the chronicle's `.md` export. */
  campaignName: string;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const uid = useAuthStore((s) => s.user?.uid);
  const showToast = useToastStore((s) => s.showToast);
  const chronicle = useChronicleStore((s) => s.chronicle);
  const commitText = useChronicleStore((s) => s.commitText);
  const memberDetails = useCampaignStore((s) => s.campaign?.memberDetails);
  const [editing, setEditing] = useState(false);
  // The chapter the reader is on, lifted here so Edit can drop the cursor there. A
  // `null` sentinel means "follow the latest chapter" — the FIXED reading view shows
  // the newest chapter at rest (the rest are reachable through the inline navigator
  // above the body), until the reader explicitly pages to another.
  const [activeChapter, setActiveChapter] = useState<number | null>(null);

  const text = chronicle?.text ?? "";
  const versions = chronicle?.versions ?? [];
  const hasText = text.trim().length > 0;
  const chapters = useMemo(() => splitChapters(text), [text]);
  const lastIdx = Math.max(0, chapters.length - 1);
  const activeIdx = activeChapter === null ? lastIdx : Math.min(activeChapter, lastIdx);
  const activeChapterData = chapters[activeIdx];

  // The RAW display name for `id` — used verbatim ONLY where a name must be PERSISTED
  // (the `editedByName` snapshot `handleSave` writes below), so a self-authored entry
  // never bakes a locale-specific "you"/"te" string into Firestore for every future
  // viewer to see. Byline RENDERING always goes through {@link authorLabel} instead.
  const nameOf = (id: string): string =>
    memberDetails?.[id]?.displayName || t("campaignHub.unnamedPlayer");
  // B32 — the self-authored byline: when the entry's author IS the viewer themselves
  // (a uid match — golden rule 7, never a display-string comparison), name them the
  // localized "you"/"te" instead of their raw account name ("Narrato da te" / "Narrated
  // by you"), reading naturally and never risking a stray English placeholder leaking
  // into another locale. `id` is always a uid here (`lastEditedBy` / `ChronicleVersion.
  // editedBy`), never user content.
  const authorLabel = (id: string): string =>
    id === uid ? t("campaignHub.chronicleAuthorSelf") : nameOf(id);
  const editorName = chronicle?.lastEditedBy ? authorLabel(chronicle.lastEditedBy) : null;
  // The version-history row label: self-authored still wins over the STORED snapshot
  // name (so an old self-edit reads "you"/"te" today, never a name the viewer typed
  // years ago); otherwise the snapshot's `editedByName` (a departed member's name
  // preserved verbatim) falls back to a live `memberDetails` lookup.
  const versionAuthor = (v: ChronicleVersion): string =>
    v.editedBy === uid
      ? t("campaignHub.chronicleAuthorSelf")
      : v.editedByName || nameOf(v.editedBy);
  // Absolute timestamp (no Date.now() in render → React-compiler safe); only shown
  // once a real edit has been recorded (lastEditedBy set ⇒ lastEditedAt is real).
  const lastEdited = chronicle?.lastEditedBy
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(chronicle.lastEditedAt)
    : null;

  // Save commits the draft. B18 — the authoritative persist is an ATOMIC transaction
  // (`commitChronicleEdit`) that snapshots the SERVER's current text into history before
  // overwriting, so a concurrent editor's paragraph is never lost from the text OR the
  // restore history. The local `commitText` is kept purely OPTIMISTIC (instant reading
  // view). An event handler, so the `new Date()` stamp is React-compiler safe.
  async function handleSave(next: string): Promise<void> {
    const priorEditor = chronicle?.lastEditedBy ?? "";
    commitText(next, uid ?? "", priorEditor ? nameOf(priorEditor) : "", new Date());
    try {
      await commitChronicleEdit(campaignId, { text: next, editedBy: uid ?? "" });
      setEditing(false);
    } catch (e) {
      // The atomic save needs a live round-trip, so it can't silently queue offline —
      // tell the user honestly and keep the editor open with the draft so they can retry.
      console.error("Chronicle save failed", e);
      showToast({ message: t("campaignHub.chronicleSaveFailed"), duration: 6000 });
    }
  }

  // The chapter NAVIGATOR is responsive (a multi-chapter log only): on DESKTOP it is a
  // vertical chapter RAIL in the freed gutter of the full-width book-spread; on MOBILE
  // it falls back to the INLINE top-navigator (prev/next + jump) above the body — never
  // buried behind a footer disclosure (B10 — owner: "a navigator for chronicles at the
  // bottom? wtf"). So Chronicle passes NO `detail` to SectionPanel (clean static header).
  const showNav = !editing && hasText && chapters.length > 1;

  return (
    <SectionPanel
      sectionId="chronicle"
      className="lg:col-span-2"
      title={t("campaignHub.chronicle")}
      count={hasText ? chapters.length : undefined}
    >
      {/* The reading view FLOWS — never an inner scroll (nested scrollbars are a
          reading anti-pattern; a chapter flows and the page scrolls) — but it is
          BOUNDED (CAMPAIGN-NOTES-UX): a heading-less wall of text clamps to the
          reading cap with "Show more", so one giant chapter can't bury Sessions /
          Treasury / Notes below. The EDITOR is a fixed, comfortable height
          (independent of the section). AutoAnimateHeight glides the deliberate
          reader↔editor toggle, history, and the clamp's expand/collapse, while a
          pointer-drag (resizing the textarea) follows the cursor INSTANTLY —
          never sticky (#64). This is the section's FIXED panel — it never folds. */}
      <AutoAnimateHeight className="info-card flex flex-col gap-3">
        {editing ? (
          <ChronicleEditor
            initialText={text}
            versions={versions}
            versionAuthor={versionAuthor}
            locale={locale}
            initialCursor={activeChapterData?.start ?? 0}
            onSave={(next) => void handleSave(next)}
            onCancel={() => setEditing(false)}
          />
        ) : hasText && activeChapterData ? (
          // D27 + premium re-layout — a long chronicle reads like a book. On the full-
          // width hub band this becomes a BOOK-SPREAD: a reading column (clamped to the
          // ~72ch `--measure` reading measure — the extra band width buys the rail, NOT
          // longer lines) beside a vertical chapter RAIL in the freed gutter. On mobile
          // the rail is hidden and the inline top-navigator (prev/next + jump) shows
          // instead. (Recommended of the taste fork; the alternative — a centred narrower
          // manuscript with `prose mx-auto`, no rail — is noted for a later owner glance.)
          <div className="chronicle-spread" data-spread={showNav || undefined}>
            <div className="chronicle-reading-col">
              {showNav ? (
                <div className="chronicle-nav-inline lg:hidden">
                  <ChronicleChapterNav
                    chapters={chapters}
                    active={activeIdx}
                    onActiveChange={setActiveChapter}
                  />
                </div>
              ) : null}
              <ChronicleChapterBody chapter={activeChapterData} activeKey={activeIdx} />
              <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-2">
                {/* A small mono byline (the app's caption vocabulary — `--text-micro`,
                    like a forum "posted by" line): smaller than the serif prose above
                    and clearly metadata, not part of the story. */}
                <span className="font-mono text-[length:var(--text-micro)] tracking-wide text-text-muted">
                  {lastEdited
                    ? editorName
                      ? t("campaignHub.chronicleLastEditedBy", {
                          name: editorName,
                          when: lastEdited,
                        })
                      : t("campaignHub.chronicleLastEdited", {
                          when: lastEdited,
                        })
                    : ""}
                </span>
                {/* Document actions sit together at the foot, same button vocabulary:
                    Download (any member may export the shared log as portable markdown —
                    the chronicle IS markdown) beside the primary Edit. */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => downloadChronicleMarkdown(text, campaignName)}
                  >
                    <Icon as={Download} size="sm" decorative />
                    {t("common.download")}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    <Icon as={PencilLine} size="sm" decorative />
                    {t("common.edit")}
                  </Button>
                </div>
              </div>
            </div>
            {showNav ? (
              <ChronicleChapterRail
                chapters={chapters}
                active={activeIdx}
                onActiveChange={setActiveChapter}
              />
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Icon as={BookOpen} className="h-8 w-8 text-text-muted" decorative />
            <p className="text-sm text-text-secondary">
              {t("campaignHub.chronicleEmpty")}
            </p>
            <Button variant="primary" onClick={() => setEditing(true)}>
              <Icon as={PencilLine} size="sm" decorative />
              {t("campaignHub.chronicleWriteFirst")}
            </Button>
          </div>
        )}
      </AutoAnimateHeight>
    </SectionPanel>
  );
}

/**
 * The chronicle editor (D27) — a DRAFT working copy with Save / Cancel, a confirm
 * before a large deletion, and a collapsible history of past revisions you can
 * restore into the draft. Local draft (no live keystroke writes), so Save is the
 * single commit point and Cancel discards cleanly.
 */

/**
 * Pixel offset of caret `index` from the top of a textarea's content. Measured
 * through a hidden mirror that copies the textarea's wrap-relevant styles, so it
 * counts SOFT-WRAPPED visual lines — a plain `\n` count under-scrolls wrapped
 * prose, leaving the caret well below the top (owner: "doesn't start from there").
 */
function caretTopPx(ta: HTMLTextAreaElement, index: number): number {
  const cs = getComputedStyle(ta);
  const innerWidth =
    ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const mirror = document.createElement("div");
  mirror.style.cssText =
    "position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;" +
    `overflow-wrap:break-word;word-break:${cs.wordBreak};width:${innerWidth}px;` +
    `font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};` +
    `font-style:${cs.fontStyle};line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing}`;
  mirror.textContent = ta.value.slice(0, index);
  const marker = document.createElement("span");
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}

function ChronicleEditor({
  initialText,
  versions,
  versionAuthor,
  locale,
  initialCursor,
  onSave,
  onCancel,
}: {
  initialText: string;
  versions: ChronicleVersion[];
  /** B32 — the byline label for one version row: "you"/"te" when the viewer wrote
   *  it themselves, else its stored/live author name. */
  versionAuthor: (v: ChronicleVersion) => string;
  locale: string;
  /** Char offset to focus the cursor at on open — the start of the section you
   *  were reading. */
  initialCursor: number;
  onSave: (next: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialText);
  const [showHistory, setShowHistory] = useState(false);
  const dirty = draft !== initialText;
  // Snapshot the open-time cursor so the mount-once effect reads a STABLE value
  // (a ref is captured at first render and never re-assigned) — its `[]` deps are
  // then honest, with no dependency on a changing prop.
  const cursorRef = useRef(initialCursor);

  // On open (before paint, so no flash): focus and drop the cursor at the start of
  // the section you were reading, then scroll so the editor STARTS at that line
  // (the browser clamps when the doc is too short to scroll that far). `preventScroll`
  // keeps the PAGE put; we move only the textarea's own scroll. Once (mount snapshot).
  useLayoutEffect(() => {
    const ta = document.getElementById("chronicle-text");
    if (!(ta instanceof HTMLTextAreaElement)) return;
    const at = Math.min(Math.max(0, cursorRef.current), ta.value.length);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(at, at);
    ta.scrollTop = caretTopPx(ta, at);
  }, []);

  async function attemptSave(): Promise<void> {
    if (isLargeReduction(initialText, draft)) {
      const ok = await useConfirmStore.getState().confirm({
        title: t("campaignHub.chronicleWipeTitle"),
        message: t("campaignHub.chronicleWipeMessage"),
        confirmLabel: t("campaignHub.chronicleWipeConfirm"),
        tone: "warning",
      });
      if (!ok) return;
    }
    onSave(draft);
  }

  function restore(v: ChronicleVersion): void {
    setDraft(v.textSnapshot);
    setShowHistory(false);
  }

  return (
    <>
      {/* D27 — make it OBVIOUS the chronicle is SHARED with the whole party. */}
      <div className="shared-notice">
        <Icon as={Users} size="sm" decorative />
        <span>{t("campaignHub.chronicleShared")}</span>
      </div>
      <label htmlFor="chronicle-text" className="text-sm text-text-secondary">
        {t("campaignHub.chronicleHint")}
      </label>
      {/* Flex-fills the editor card (which is at least as tall as the section you
          were reading), with a generous minimum, and scrolls internally for very
          long drafts. NOT user-resizable: a drag handle fought the height observer
          (every drag-pixel animated → "sticky/slow"); the editor is already sized
          to your section, so the handle isn't needed. */}
      <Textarea
        id="chronicle-text"
        className="chronicle-text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("campaignHub.chroniclePlaceholder")}
      />
      {versions.length > 0 && (
        <div className="chronicle-history">
          <button
            type="button"
            className="rh-action self-start"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            <Icon as={History} size="sm" decorative />
            {showHistory
              ? t("campaignHub.chronicleHideHistory")
              : t("campaignHub.chronicleHistory", {
                  count: versions.length,
                })}
          </button>
          {showHistory && (
            // Reuse the Treasury ledger recipe (the sibling history list): an
            // `.info-card` carrying flex rows, so the chronicle history reads as
            // the same carded ledger chrome rather than bespoke floating rows.
            // Capped height + internal scroll so a long revision list (metadata,
            // not story) stays compact; AutoAnimateHeight glides the card open.
            <InfoCard
              as="ul"
              className="mt-1 flex max-h-[160px] flex-col gap-1 overflow-y-auto text-sm text-text-secondary"
            >
              {versions.map((v, i) => (
                <li key={i} className="group flex items-center gap-3">
                  {/* Lead with the mono timestamp so revisions align in a scannable
                      column (the WHEN is the key for "which version to restore");
                      the author is secondary context. */}
                  <time className="shrink-0 font-mono text-xs tabular-nums text-text-secondary">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(v.timestamp)}
                  </time>
                  <span className="min-w-0 flex-1 truncate text-text-muted">
                    {versionAuthor(v)}
                  </span>
                  {/* Icon-only restore (reuses the Treasury ledger's `.hdr-icon`
                      row action) so a column of revisions stays uncluttered. The
                      tooltip spells out that it LOADS the version into the editor —
                      nothing persists until Save. */}
                  <IconButton
                    className="shrink-0 text-text-muted hover:text-accent-text"
                    aria-label={t("campaignHub.chronicleRestore")}
                    title={t("campaignHub.chronicleRestoreVersion")}
                    onClick={() => restore(v)}
                  >
                    <Icon as={RotateCcw} size="xs" decorative />
                  </IconButton>
                </li>
              ))}
            </InfoCard>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={() => void attemptSave()}>
          {t("common.save")}
        </Button>
      </div>
    </>
  );
}

/**
 * The chronicle reading body (D27) — the FIXED panel's single chapter (the latest at
 * rest; whichever the navigator paged to otherwise). One chapter is a digestible
 * "page" the card grows to; the navigator (prev/next/jump) is the inline
 * {@link ChronicleChapterNav} above it.
 */
function ChronicleChapterBody({
  chapter,
  activeKey,
}: {
  chapter: { title: string | null; body: string };
  /** The active index — keys the clamp so paging always lands collapsed. */
  activeKey: number;
}) {
  return (
    <div className="chronicle-reader">
      {chapter.title && <h3 className="chronicle-chapter-title">{chapter.title}</h3>}
      {/* Bounded preview (CAMPAIGN-NOTES-UX): chapters already page the log, but a
          single heading-less chapter can be a wall of text — the reading cap keeps
          it from swallowing the hub; "Show more" reads on (page-scroll, no nested
          scrollbar). Keyed by chapter so paging always lands collapsed. */}
      <NoteClamp key={activeKey} variant="reading">
        <BlockMarkdown
          text={chapter.body}
          className="chronicle-prose max-w-[--measure]"
        />
      </NoteClamp>
    </div>
  );
}

/**
 * The chronicle chapter navigator (D27) — prev/next + a jump select + the position
 * count. Rendered INLINE at the top of the reading panel (B10), only for a
 * multi-chapter log: it drives the parent's `activeChapter`, so picking a chapter
 * re-renders the reading body below. Keeps the same `aria-label="Chapter"` jump
 * control as before.
 */
function ChronicleChapterNav({
  chapters,
  active,
  onActiveChange,
}: {
  chapters: ReadonlyArray<{ title: string | null; body: string }>;
  active: number;
  onActiveChange: (index: number) => void;
}) {
  const { t } = useTranslation();
  const idx = active;
  return (
    <div className="chronicle-nav">
      <button
        type="button"
        className="chronicle-nav-btn"
        disabled={idx === 0}
        onClick={() => onActiveChange(Math.max(0, idx - 1))}
        aria-label={t("campaignHub.chroniclePrev")}
      >
        <Icon as={ChevronLeft} size="sm" decorative />
      </button>
      <Select
        size="sm"
        value={String(idx)}
        onChange={(e) => onActiveChange(Number(e.target.value))}
        aria-label={t("campaignHub.chronicleChapter")}
      >
        {chapters.map((c, i) => (
          <option key={i} value={String(i)}>
            {c.title ?? t("campaignHub.chroniclePrologue")}
          </option>
        ))}
      </Select>
      <span className="chronicle-nav-count">
        {idx + 1} / {chapters.length}
      </span>
      <button
        type="button"
        className="chronicle-nav-btn"
        disabled={idx === chapters.length - 1}
        onClick={() => onActiveChange(Math.min(chapters.length - 1, idx + 1))}
        aria-label={t("campaignHub.chronicleNext")}
      >
        <Icon as={ChevronRight} size="sm" decorative />
      </button>
    </div>
  );
}

/**
 * The chronicle chapter RAIL (premium re-layout) — the DESKTOP navigator that lives in
 * the freed gutter of the full-width book-spread: a vertical list of chapters with the
 * current one highlighted, click to jump. Hidden below `lg` (the inline
 * {@link ChronicleChapterNav} serves mobile). Drives the same parent `activeChapter`.
 */
function ChronicleChapterRail({
  chapters,
  active,
  onActiveChange,
}: {
  chapters: ReadonlyArray<{ title: string | null; body: string }>;
  active: number;
  onActiveChange: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav className="chronicle-rail" aria-label={t("campaignHub.chronicleChapters")}>
      <p className="chronicle-rail-head">{t("campaignHub.chronicleChapters")}</p>
      <ul className="chronicle-rail-list">
        {chapters.map((c, i) => (
          <li key={i}>
            <button
              type="button"
              className="chronicle-rail-item"
              data-active={i === active || undefined}
              aria-current={i === active ? "true" : undefined}
              onClick={() => onActiveChange(i)}
            >
              <span className="chronicle-rail-num">{i + 1}</span>
              <span className="chronicle-rail-title">
                {c.title ?? t("campaignHub.chroniclePrologue")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
