/**
 * party-chronicle — the Combat Chronicle UI, a view of the session log.
 *
 *   • {@link ChronicleFeed} — the collapsible live feed every member of the campaign
 *     watches build: the current encounter's lines of the session log
 *     (`encounterFeed`, auto-attribution applied at read time). "Who struck?" appends a
 *     correction; the DM may answer it on any line, a player on a hit their own
 *     character took. A line is struck from the record (a retraction) by its author or
 *     the DM; the DM's undo on a monster's HP or condition line also restores the
 *     monster through the engine, and the DM mirror then retracts the line. History is
 *     never deleted. The "(4/12 HP)" readout comes from the live encounter and follows
 *     the monster card's rule: the DM always, players only for allies, revealed
 *     monsters and PCs.
 *   • {@link EndEncounterDialog} — the editable entry at "End encounter": a title, a
 *     narrative note, an editable outcome and the record lines (each removable from the
 *     chapter). "Save to Chronicle" hands the chapter, note and outcome to the caller,
 *     which appends them to the session log and the Chronicle book; "Skip" saves
 *     nothing. Either way the encounter clears.
 *
 * Localization is at the render edge only (`combat-chronicle-view.ts` takes injected
 * resolvers): combatant ids → names off the live view rows, condition ids → the SRD
 * catalogue. IDs + numbers are the only stored facts.
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText, ChevronDown, Trash2, HelpCircle, Undo2, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/shared/Select";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalBody, ModalFoot } from "@/components/ui/modal-head";
import { useLocale } from "@/hooks/useLocale";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { localizeText } from "@/lib/views/srd-i18n";
import { concentrationLabel } from "@/lib/views/tracker-view";
import {
  buildEncounterChapter,
  localizeFeedEvent,
  rankAttackers,
  type FeedNames,
} from "@/lib/views/combat-chronicle-view";
import {
  mayAttribute,
  mayRetract,
  needsAttribution,
  type CombatantId,
  type FeedLine,
  type FeedViewer,
} from "@/lib/session-log";
import { inferOutcome } from "@/features/campaigns/combat-chronicle";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { CampaignDoc, EncounterState } from "@/types/campaign";
import type { EncounterOutcome } from "@/types/combat-chronicle";

type MemberDetails = CampaignDoc["memberDetails"];

/** The target's HP after a line, when the viewer may see it (`null` otherwise). */
export type HpFor = (line: FeedLine) => { current: number; max: number } | null;

// ─── Shared resolvers (combatant id → name, condition id → name) ─────────────

function useFeedNames(
  rows: ReadonlyArray<EncounterCombatantView>,
  memberDetails: MemberDetails,
  fallbackNames: Readonly<Record<string, string>> = {}
): FeedNames {
  const { t } = useTranslation();
  const { language } = useLocale();
  const nameById = useMemo(
    () =>
      new Map(
        rows.map((r) => {
          // Prefer the denormalized member snapshot name for a PC — it is ALWAYS present
          // (the live doc hydrates late) AND it is the SAME name the party cards show.
          const snapshot = r.memberUid
            ? memberDetails[r.memberUid]?.character?.name
            : undefined;
          return [r.id, snapshot?.trim() || r.name.trim() || ""] as const;
        })
      ),
    [rows, memberDetails]
  );
  const name = useCallback(
    (id: string) =>
      nameById.get(id)?.trim() ||
      fallbackNames[id]?.trim() ||
      memberDetails[id.replace(/^pc-/, "")]?.character?.name.trim() ||
      t("combatChronicle.someone"),
    [nameById, fallbackNames, memberDetails, t]
  );
  return useMemo(
    () => ({
      name,
      condition: (id) =>
        hasSrd("condition", id, "name", language)
          ? localizeSrd("condition", id, "name", language)
          : id,
      action: (action) => localizeText(action, language),
      spell: (ref) => concentrationLabel(ref, language),
    }),
    [name, language]
  );
}

// ─── A combatant chip (attribution pick) ─────────────────────────────────────

function CombatantChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected ? "" : undefined}
      className="encounter-feed-chip"
    >
      {label}
    </button>
  );
}

// ─── The live feed ───────────────────────────────────────────────────────────

/**
 * The collapsible Combat Chronicle feed — every member sees it. Renders the encounter's
 * lines in log order, grouped by round; an open "Who struck?" shows the one-tap picker
 * to whoever may answer it.
 */
export function ChronicleFeed({
  lines,
  rows,
  memberDetails,
  names: fallbackNames,
  currentId,
  viewer,
  hpFor,
  undoFor,
  onAttribute,
  onRetract,
  embedded = false,
}: {
  lines: ReadonlyArray<FeedLine>;
  rows: ReadonlyArray<EncounterCombatantView>;
  /** The campaign roster — the source of a PC's snapshot name while its live doc loads. */
  memberDetails: MemberDetails;
  /** Names recorded on the encounter's start line, for a creature no longer at the table. */
  names?: Readonly<Record<string, string>>;
  /** The current combatant id — the attacker the picker pre-selects. */
  currentId: string | null;
  viewer: FeedViewer;
  hpFor: HpFor;
  /** The DM's engine undo for a monster HP/condition line, or `null`. */
  undoFor: (line: FeedLine) => (() => void) | null;
  /** Answer "Who struck?" (`null` = no one). */
  onAttribute: (line: FeedLine, actor: CombatantId | null) => void;
  /** Strike a line from the record. */
  onRetract: (line: FeedLine) => void;
  /** Join the feed to the encounter status rail inside one framed folio surface. */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const names = useFeedNames(rows, memberDetails, fallbackNames);

  return (
    <section
      className={embedded ? "encounter-chronicle is-embedded" : "encounter-chronicle"}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="encounter-chronicle-toggle"
      >
        <span className="encounter-chronicle-sigil" aria-hidden>
          <Icon as={ScrollText} size="sm" decorative />
        </span>
        <span className="encounter-chronicle-title">
          {t("combatChronicle.feedTitle")}
        </span>
        {lines.length > 0 && (
          <span className="encounter-chronicle-count">{lines.length}</span>
        )}
        <Icon
          as={ChevronDown}
          size="sm"
          className={
            open ? "encounter-chronicle-chevron is-open" : "encounter-chronicle-chevron"
          }
          decorative
        />
      </button>

      {open && (
        <div className="encounter-chronicle-body">
          {lines.length === 0 ? (
            <p className="encounter-chronicle-empty">{t("combatChronicle.feedEmpty")}</p>
          ) : (
            <ol className="encounter-timeline">
              {lines.map((line, i) => {
                const prev = lines[i - 1];
                const showRound =
                  line.round !== undefined && (!prev || prev.round !== line.round);
                return (
                  <li
                    key={line.id}
                    className={showRound ? "encounter-beat has-round" : "encounter-beat"}
                  >
                    {showRound && (
                      <p className="encounter-timeline-round">
                        {t("combatChronicle.round", { n: line.round ?? 0 })}
                      </p>
                    )}
                    <FeedRow
                      line={line}
                      rows={rows}
                      names={names}
                      currentId={currentId}
                      viewer={viewer}
                      hp={hpFor(line)}
                      undo={undoFor(line)}
                      onAttribute={onAttribute}
                      onRetract={onRetract}
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * One feed line + its affordances: the uncertain marker on an ambiguous derived
 * attacker, the undo (DM, monster line) or the retraction (author or DM), and the
 * "Who struck?" picker while the question is open for this viewer.
 */
function FeedRow({
  line,
  rows,
  names,
  currentId,
  viewer,
  hp,
  undo,
  onAttribute,
  onRetract,
}: {
  line: FeedLine;
  rows: ReadonlyArray<EncounterCombatantView>;
  names: FeedNames;
  currentId: string | null;
  viewer: FeedViewer;
  hp: { current: number; max: number } | null;
  undo: (() => void) | null;
  onAttribute: (line: FeedLine, actor: CombatantId | null) => void;
  onRetract: (line: FeedLine) => void;
}) {
  const { t } = useTranslation();
  const [showMore, setShowMore] = useState(false);
  const { event } = line;
  const text = localizeFeedEvent(event, t, names, hp);
  const showPicker = needsAttribution(line) && mayAttribute(line, viewer);
  const targetId = event.kind === "damage" ? (event.target ?? null) : null;
  // Pre-select the derived attacker on an uncertain line, else the current combatant.
  const preselect = event.kind === "damage" && event.actor ? event.actor : currentId;
  const { primary, more } = rankAttackers(rows, targetId, preselect);
  const candidates = showMore ? [...primary, ...more] : primary;
  const retract = !undo && mayRetract(line, viewer);

  return (
    <div className="encounter-feed-line">
      <span className="encounter-feed-copy">
        {line.uncertain && (
          <span
            className="inline-flex shrink-0 text-warning"
            title={t("combatChronicle.uncertain")}
            aria-label={t("combatChronicle.uncertain")}
            role="img"
          >
            <Icon as={HelpCircle} size="xs" decorative />
          </span>
        )}
        <span className="flex-1">{text}</span>
        {undo && (
          <button
            type="button"
            onClick={undo}
            aria-label={t("combatChronicle.undoLine")}
            title={t("combatChronicle.undoLineHint")}
            className="shrink-0 rounded p-0.5 text-text-faint transition-colors hover:text-accent"
          >
            <Icon as={Undo2} size="xs" decorative />
          </button>
        )}
        {retract && (
          <button
            type="button"
            onClick={() => onRetract(line)}
            aria-label={t("combatChronicle.retractLine")}
            title={t("combatChronicle.retractLineHint")}
            className="shrink-0 rounded p-0.5 text-text-faint transition-colors hover:text-error"
          >
            <Icon as={X} size="xs" decorative />
          </button>
        )}
      </span>
      {showPicker && (
        <div
          className="encounter-feed-pick"
          role="group"
          aria-label={t("combatChronicle.attributeLabel")}
        >
          <span className="encounter-feed-pick-label">
            {t("combatChronicle.attributeLabel")}
          </span>
          {candidates.map((c) => (
            <CombatantChip
              key={c.id}
              label={names.name(c.id)}
              selected={c.id === preselect}
              onClick={() => onAttribute(line, c.id)}
            />
          ))}
          {more.length > 0 && !showMore && (
            <button
              type="button"
              className="encounter-feed-pick-quiet"
              onClick={() => setShowMore(true)}
            >
              {t("combatChronicle.attributeMore", { count: more.length })}
            </button>
          )}
          <button
            type="button"
            className="encounter-feed-pick-quiet"
            onClick={() => onAttribute(line, null)}
          >
            {t("combatChronicle.attributeSkip")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── The End-encounter editable entry ────────────────────────────────────────

/** What "Save to Chronicle" hands back: the chapter for the book, and the note and
 *  outcome the session log records. */
export interface EncounterClose {
  chapter: string;
  note: string;
  outcome: EncounterOutcome;
}

/**
 * The editable entry shown at "End encounter". The DM edits the title, writes a
 * free-text narrative note, picks the (state-inferred) outcome, and removes any record
 * line from the chapter. "Save to Chronicle" builds ONE markdown chapter from the kept
 * lines + note + outcome and hands it to `onSave`; "Skip" calls `onSkip`. Either
 * resolves the encounter (the caller clears it).
 */
export function EndEncounterDialog({
  encounter,
  lines,
  rows,
  memberDetails,
  names: fallbackNames,
  hpFor,
  onSave,
  onSkip,
  onCancel,
}: {
  encounter: EncounterState;
  /** The encounter's feed lines — the record the DM edits and saves. */
  lines: ReadonlyArray<FeedLine>;
  rows: ReadonlyArray<EncounterCombatantView>;
  memberDetails: MemberDetails;
  names?: Readonly<Record<string, string>>;
  /** The HP readout as the book's readers may see it (the book is shared). */
  hpFor: HpFor;
  /** Persist the close. Resolves on success (the caller then clears the encounter);
   *  REJECTS on failure so the dialog stays open + the fight running for a retry. */
  onSave: (close: EncounterClose) => Promise<void>;
  /** Clear the encounter without saving anything. */
  onSkip: () => void;
  /** Dismiss the dialog and keep the encounter running. */
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const names = useFeedNames(rows, memberDetails, fallbackNames);
  const texts = useMemo(
    () =>
      lines.map((line) => ({
        id: line.id,
        ...(line.round === undefined ? {} : { round: line.round }),
        text: localizeFeedEvent(line.event, t, names, hpFor(line)),
      })),
    [lines, t, names, hpFor]
  );
  const [saving, setSaving] = useState(false);

  const defaultDate = useMemo(
    () => new Date().toLocaleDateString(undefined, { dateStyle: "medium" }),
    []
  );
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<EncounterOutcome>(() => inferOutcome(encounter));
  // Which record lines the DM keeps in the chapter (all, until they remove some).
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());

  const effectiveTitle =
    title.trim() || t("combatChronicle.endTitlePlaceholder", { date: defaultDate });

  const save = (): void => {
    if (saving) return;
    const chapter = buildEncounterChapter(
      {
        title: effectiveTitle,
        note,
        lines: texts.filter((line) => !removed.has(line.id)),
        outcome,
      },
      t
    );
    setSaving(true);
    // On success the caller clears the encounter (this dialog unmounts); on failure it
    // re-enables so the DM can retry (the fight is untouched).
    void onSave({ chapter, note: note.trim(), outcome }).catch(() => setSaving(false));
  };

  return (
    <ModalShell
      open
      onClose={onCancel}
      title={t("combatChronicle.endTitle")}
      backDismiss={false}
      compact
    >
      <ModalBody className="flex flex-col gap-4">
        {/* Title */}
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-[0.12em] text-text-muted">
            {t("combatChronicle.endTitleLabel")}
          </span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("combatChronicle.endTitlePlaceholder", { date: defaultDate })}
            maxLength={80}
          />
        </label>

        {/* Narrative note */}
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-[0.12em] text-text-muted">
            {t("combatChronicle.endNoteLabel")}
          </span>
          <Textarea
            className="field-sizing-content min-h-[4rem]"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("combatChronicle.endNotePlaceholder")}
            maxLength={4000}
          />
        </label>

        {/* Outcome */}
        <label className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-[0.12em] text-text-muted">
            {t("combatChronicle.endOutcomeLabel")}
          </span>
          <Select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as EncounterOutcome)}
            className="text-xs"
          >
            <option value="victory">{t("combatChronicle.outcomeVictory")}</option>
            <option value="ended">{t("combatChronicle.outcomeEnded")}</option>
          </Select>
        </label>

        {/* The record — removable lines */}
        <div className="flex flex-col gap-1">
          <span className="text-2xs uppercase tracking-[0.12em] text-text-muted">
            {t("combatChronicle.endLinesLabel")}
          </span>
          {texts.length === 0 ? (
            <p className="text-2xs italic text-text-faint">
              {t("combatChronicle.endEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 rounded-md border border-border-subtle bg-bg-tertiary/40 p-2">
              {texts.map((line) => {
                const gone = removed.has(line.id);
                return (
                  <li key={line.id} className="flex items-center gap-2">
                    <span
                      className={
                        gone
                          ? "flex-1 text-2xs text-text-faint line-through"
                          : "flex-1 text-2xs text-text-secondary"
                      }
                    >
                      {line.text}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setRemoved((prev) => {
                          const next = new Set(prev);
                          if (next.has(line.id)) next.delete(line.id);
                          else next.add(line.id);
                          return next;
                        })
                      }
                      className="shrink-0 rounded p-1 text-text-faint transition-colors hover:text-error"
                      aria-label={t("combatChronicle.endDeleteLine")}
                      aria-pressed={gone}
                    >
                      <Icon as={Trash2} size="xs" decorative />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ModalBody>
      <ModalFoot>
        <Button variant="ghost" onClick={onSkip} disabled={saving}>
          {t("combatChronicle.endSkip")}
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          <Icon as={ScrollText} size="sm" decorative />
          {t("combatChronicle.endSave")}
        </Button>
      </ModalFoot>
    </ModalShell>
  );
}
