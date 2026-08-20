/**
 * party-chronicle — the DM-facing UI over the Combat Chronicle feed
 * ({@link import("@/types/combat-chronicle").CombatChronicleEvent}).
 *
 * Both surfaces render the RECONCILED feed ({@link ReconciledEvent}) — the stored beats
 * fused with the players' declared attacks by `chronicle-reconcile.ts` (auto-attributed
 * hits + synthesized certain miss lines + uncertain markers). Both DM-only (the feed
 * rides the encounter doc, which only the DM writes; showing exact monster HP to a player
 * would leak the concealed-band):
 *   • {@link ChronicleFeed} — the collapsible live feed the DM watches build. A hit that
 *     is still PENDING (undeclared / paper play) OR an UNCERTAIN auto-attribution shows
 *     the one-tap attacker override (pre-picked to the current combatant or the derived
 *     attacker, always skippable, NEVER auto-guessed); a certain auto-attributed hit reads
 *     as a plain confirmed line; a declared miss reads as a certain miss line.
 *   • {@link EndEncounterDialog} — the editable entry at "End encounter": a title, a
 *     free-text narrative note, an editable outcome, and the localized record lines
 *     (each removable) — the DM's full override of the reconciled record. "Save to
 *     Chronicle" renders ONE markdown chapter and appends it (the single persisted
 *     Chronicle write per fight); "Skip" saves nothing. Either way the encounter clears.
 *
 * Localization is at the render edge only (the presenter `combat-chronicle-view.ts`
 * takes injected resolvers): combatant ids → names off the live view rows, condition
 * ids → the SRD catalogue. IDs + numbers are the only stored facts (golden rule 7).
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText, ChevronDown, Trash2, HelpCircle, Undo2 } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/shared/Select";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalBody, ModalFoot } from "@/components/ui/modal-head";
import { useLocale } from "@/hooks/useLocale";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { localizeText } from "@/lib/views/srd-i18n";
import {
  localizeChronicleEvent,
  chronicleNeedsAttribution,
  buildChronicleChapter,
  type ResolveCombatantName,
  type ResolveConditionName,
  type ResolveActionName,
} from "@/lib/views/combat-chronicle-view";
import {
  setEventAttacker,
  skipEventAttacker,
  inferOutcome,
} from "@/features/campaigns/combat-chronicle";
import { undoAdversaryChronicleEvent } from "@/features/campaigns/encounter-world-command";
import type { ReconciledEvent } from "@/features/campaigns/chronicle-reconcile";
import type { ApplyFn } from "@/features/campaigns/party-encounter";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { CampaignDoc, EncounterState } from "@/types/campaign";
import type { EncounterOutcome } from "@/types/combat-chronicle";

type MemberDetails = CampaignDoc["memberDetails"];

// ─── Shared resolvers (combatant id → name, condition id → name) ─────────────

function useChronicleResolvers(
  rows: ReadonlyArray<EncounterCombatantView>,
  memberDetails: MemberDetails
): {
  resolveName: ResolveCombatantName;
  resolveCondition: ResolveConditionName;
  resolveAction: ResolveActionName;
} {
  const { t } = useTranslation();
  const { language } = useLocale();
  const nameById = useMemo(
    () =>
      new Map(
        rows.map((r) => {
          // Prefer the denormalized member snapshot name for a PC — it is ALWAYS present
          // (the live doc hydrates late) AND it is the SAME name the party cards +
          // `resolveActorName` show, so the chronicle never disagrees with the table. Fall
          // back to the live row name (a monster, or a PC with no snapshot yet).
          const snapshot = r.memberUid
            ? memberDetails[r.memberUid]?.character?.name
            : undefined;
          return [r.id, snapshot?.trim() || r.name.trim() || ""] as const;
        })
      ),
    [rows, memberDetails]
  );
  const resolveName = useCallback<ResolveCombatantName>(
    (id) => nameById.get(id)?.trim() || t("combatChronicle.someone"),
    [nameById, t]
  );
  const resolveCondition = useCallback<ResolveConditionName>(
    (id) =>
      hasSrd("condition", id, "name", language)
        ? localizeSrd("condition", id, "name", language)
        : id,
    [language]
  );
  const resolveAction = useCallback<ResolveActionName>(
    (action) => localizeText(action, language),
    [language]
  );
  return { resolveName, resolveCondition, resolveAction };
}

// ─── A combatant chip (attribution pick / miss target) ───────────────────────

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
      className="rounded-sm border border-border-medium bg-bg-tertiary px-2 py-0.5 text-2xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary data-[selected]:border-accent data-[selected]:bg-accent/15 data-[selected]:text-text-primary"
    >
      {label}
    </button>
  );
}

// ─── The live feed ───────────────────────────────────────────────────────────

/**
 * The collapsible Combat Chronicle feed — DM-only. Renders the accumulated events in
 * round-grouped order (the deterministic record of what LANDED); each un-attributed
 * damage hit shows the one-tap attacker picker (current combatant pre-selected). All
 * edits route through `apply` (the DM encounter reducer), so they ride the SAME
 * debounced encounter writer (no per-action write).
 */
export function ChronicleFeed({
  campaignId,
  events,
  rows,
  memberDetails,
  currentId,
  apply,
  embedded = false,
}: {
  /** The campaign id — the undo tap derives the engine world under this root. */
  campaignId: string;
  /** The RECONCILED feed — stored beats fused with the players' declared attacks
   *  (auto-attributed hits + synthesized miss lines + uncertain markers). */
  events: ReadonlyArray<ReconciledEvent>;
  rows: ReadonlyArray<EncounterCombatantView>;
  /** The campaign roster — the source of a PC's snapshot name while its live doc loads. */
  memberDetails: MemberDetails;
  /** The current combatant id — the attacker the attribution picker pre-selects. */
  currentId: string | null;
  apply: ApplyFn;
  /** Join the feed to the encounter status rail inside one framed folio surface. */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const { resolveName, resolveCondition, resolveAction } = useChronicleResolvers(
    rows,
    memberDetails
  );

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
        {events.length > 0 && (
          <span className="encounter-chronicle-count">{events.length}</span>
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
          {events.length === 0 ? (
            <p className="encounter-chronicle-empty">{t("combatChronicle.feedEmpty")}</p>
          ) : (
            <ol className="encounter-timeline">
              {events.map((re, i) => {
                const prev = events[i - 1];
                const showRound = !prev || prev.event.round !== re.event.round;
                return (
                  <li
                    key={re.event.id}
                    className={showRound ? "encounter-beat has-round" : "encounter-beat"}
                  >
                    {showRound && (
                      <p className="encounter-timeline-round">
                        {t("combatChronicle.round", { n: re.event.round })}
                      </p>
                    )}
                    <FeedLine
                      campaignId={campaignId}
                      reconciled={re}
                      rows={rows}
                      currentId={currentId}
                      resolveName={resolveName}
                      resolveCondition={resolveCondition}
                      resolveAction={resolveAction}
                      apply={apply}
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
 * One feed line + the DM override affordance. The attacker picker shows when the stored
 * hit is still PENDING (paper-play, the Phase-0 fallback) OR when the auto-attribution is
 * UNCERTAIN (>1 player could have landed it) — so the DM confirms/corrects the guess. A
 * CERTAIN auto-attributed hit reads as a plain confirmed line (removable at End). The
 * uncertain marker is the subtle "which of these?" hint (never interrupts the fight).
 */
function FeedLine({
  reconciled,
  rows,
  currentId,
  resolveName,
  resolveCondition,
  resolveAction,
  apply,
  campaignId,
}: {
  reconciled: ReconciledEvent;
  rows: ReadonlyArray<EncounterCombatantView>;
  currentId: string | null;
  resolveName: ResolveCombatantName;
  resolveCondition: ResolveConditionName;
  resolveAction: ResolveActionName;
  apply: ApplyFn;
  campaignId: string;
}) {
  const { t } = useTranslation();
  const { event, uncertain } = reconciled;
  const text = localizeChronicleEvent(
    event,
    t,
    resolveName,
    resolveCondition,
    resolveAction
  );
  // Show the picker for a still-pending stored hit OR an ambiguous auto-attribution.
  const showPicker = chronicleNeedsAttribution(event) || uncertain === true;
  // Candidate attackers = every combatant EXCEPT the one that took the hit.
  const targetId = event.kind === "hp-damage" ? event.targetId : null;
  const candidates = rows.filter((r) => r.id !== targetId);
  // Pre-select the derived attacker on an uncertain line, else the current combatant.
  const preselect =
    event.kind === "hp-damage" && event.attackerId ? event.attackerId : currentId;

  // UNDO affordance (remediability) — a stored MONSTER line can be reversed in one tap:
  // {@link undoAdversaryChronicleEvent} reverses an engine-mirrored beat through its
  // exact journal action (hp trio + booked lifetimes restore precisely; legacy beats
  // degrade to the blind arithmetic inside the boundary) and removes the line. Only for
  // a real stored event on a monster target (a PC event / synthesized line has none).
  const hpTargetRow =
    event.kind === "hp-damage" || event.kind === "hp-heal"
      ? rows.find((r) => r.id === event.targetId)
      : undefined;
  const conditionTargetRow =
    event.kind === "condition-gain" || event.kind === "condition-loss"
      ? rows.find((r) => r.id === event.targetId)
      : undefined;
  const canUndoHp = hpTargetRow?.kind === "monster";
  const canUndoCondition = conditionTargetRow?.kind === "monster";

  return (
    <div className="encounter-feed-line">
      <span className="encounter-feed-copy">
        {uncertain && (
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
        {(canUndoHp || canUndoCondition) && (
          <button
            type="button"
            onClick={() =>
              apply((encounter) =>
                undoAdversaryChronicleEvent(encounter, campaignId, event.id)
              )
            }
            aria-label={t("combatChronicle.undoLine")}
            title={t("combatChronicle.undoLineHint")}
            className="shrink-0 rounded p-0.5 text-text-faint transition-colors hover:text-accent"
          >
            <Icon as={Undo2} size="xs" decorative />
          </button>
        )}
      </span>
      {showPicker && event.kind === "hp-damage" && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[length:var(--text-micro)] uppercase tracking-[0.08em] text-text-faint">
            {t("combatChronicle.attributeLabel")}
          </span>
          {candidates.map((c) => (
            <CombatantChip
              key={c.id}
              label={resolveName(c.id)}
              selected={c.id === preselect}
              onClick={() => apply((e) => setEventAttacker(e, event.id, c.id))}
            />
          ))}
          <CombatantChip
            label={t("combatChronicle.attributeSkip")}
            onClick={() => apply((e) => skipEventAttacker(e, event.id))}
          />
        </div>
      )}
    </div>
  );
}

// ─── The End-encounter editable entry ────────────────────────────────────────

/**
 * The editable entry shown at "End encounter". The DM edits the title, writes a
 * free-text narrative note, picks the (state-inferred) outcome, and removes any record
 * line. "Save to Chronicle" builds ONE markdown chapter from the KEPT lines + note +
 * outcome and hands it to `onSave` (the single Chronicle append); "Skip" calls
 * `onSkip`. Either resolves the encounter (the caller clears it).
 */
export function EndEncounterDialog({
  encounter,
  reconciled,
  rows,
  memberDetails,
  onSave,
  onSkip,
  onCancel,
}: {
  encounter: EncounterState;
  /** The RECONCILED lines (auto-attributed hits + miss lines) — the record the DM edits
   *  and saves; the outcome default still derives from the live `encounter`. */
  reconciled: ReadonlyArray<ReconciledEvent>;
  rows: ReadonlyArray<EncounterCombatantView>;
  /** The campaign roster — the source of a PC's snapshot name while its live doc loads. */
  memberDetails: MemberDetails;
  /** Persist the built markdown chapter (the single write). Resolves on success (the
   *  caller then clears the encounter); REJECTS on failure (offline) so the dialog stays
   *  open + the fight running for a retry. */
  onSave: (chapter: string) => Promise<void>;
  /** Clear the encounter without saving anything. */
  onSkip: () => void;
  /** Dismiss the dialog and keep the encounter running. */
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { resolveName, resolveCondition, resolveAction } = useChronicleResolvers(
    rows,
    memberDetails
  );
  // The record = the reconciled lines (stored beats + auto-attributions + miss lines).
  const events = useMemo(() => reconciled.map((r) => r.event), [reconciled]);
  const [saving, setSaving] = useState(false);

  const defaultDate = useMemo(
    () => new Date().toLocaleDateString(undefined, { dateStyle: "medium" }),
    []
  );
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<EncounterOutcome>(() => inferOutcome(encounter));
  // Which record lines the DM keeps (all, until they remove some).
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());

  const effectiveTitle =
    title.trim() || t("combatChronicle.endTitlePlaceholder", { date: defaultDate });
  const kept = events.filter((e) => !removed.has(e.id));

  const save = (): void => {
    if (saving) return;
    const chapter = buildChronicleChapter(
      { title: effectiveTitle, note, events: kept, outcome },
      t,
      resolveName,
      resolveCondition,
      resolveAction
    );
    setSaving(true);
    // On success the caller clears the encounter (this dialog unmounts); on failure it
    // re-enables so the DM can retry (the fight is untouched).
    void onSave(chapter).catch(() => setSaving(false));
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
          {events.length === 0 ? (
            <p className="text-2xs italic text-text-faint">
              {t("combatChronicle.endEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 rounded-md border border-border-subtle bg-bg-tertiary/40 p-2">
              {events.map((event) => {
                const gone = removed.has(event.id);
                return (
                  <li key={event.id} className="flex items-center gap-2">
                    <span
                      className={
                        gone
                          ? "flex-1 text-2xs text-text-faint line-through"
                          : "flex-1 text-2xs text-text-secondary"
                      }
                    >
                      {localizeChronicleEvent(
                        event,
                        t,
                        resolveName,
                        resolveCondition,
                        resolveAction
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setRemoved((prev) => {
                          const next = new Set(prev);
                          if (next.has(event.id)) next.delete(event.id);
                          else next.add(event.id);
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
