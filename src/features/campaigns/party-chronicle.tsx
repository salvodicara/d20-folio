/**
 * party-chronicle — the DM-facing UI over the Combat Chronicle feed
 * ({@link import("@/types/combat-chronicle").CombatChronicleEvent}).
 *
 * Two surfaces, both DM-only (the feed rides the encounter doc, which only the DM
 * writes; showing exact monster HP to a player would leak the concealed-band):
 *   • {@link ChronicleFeed} — the collapsible live feed the DM watches build, with the
 *     one-tap attacker attribution on each un-attributed hit (pre-picked to the current
 *     combatant, always skippable, NEVER auto-guessed) and the pull-only "log a
 *     miss / a pass" affordance for the active combatant.
 *   • {@link EndEncounterDialog} — the editable entry at "End encounter": a title, a
 *     free-text narrative note, an editable outcome, and the localized record lines
 *     (each removable). "Save to Chronicle" renders ONE markdown chapter and appends it
 *     (the single persisted Chronicle write per fight); "Skip" saves nothing. Either
 *     way the encounter then clears.
 *
 * Localization is at the render edge only (the presenter `combat-chronicle-view.ts`
 * takes injected resolvers): combatant ids → names off the live view rows, condition
 * ids → the SRD catalogue. IDs + numbers are the only stored facts (golden rule 7).
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText, ChevronDown, Trash2, Swords, Crosshair } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/shared/Select";
import { ModalShell } from "@/components/shared/ModalShell";
import { useLocale } from "@/hooks/useLocale";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import {
  localizeChronicleEvent,
  chronicleNeedsAttribution,
  buildChronicleChapter,
  type ResolveCombatantName,
  type ResolveConditionName,
} from "@/lib/views/combat-chronicle-view";
import {
  setEventAttacker,
  skipEventAttacker,
  recordMiss,
  recordTurnPass,
  inferOutcome,
} from "@/features/campaigns/combat-chronicle";
import type { ApplyFn } from "@/features/campaigns/party-encounter";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { EncounterState } from "@/types/campaign";
import type { CombatChronicleEvent, EncounterOutcome } from "@/types/combat-chronicle";

// ─── Shared resolvers (combatant id → name, condition id → name) ─────────────

function useChronicleResolvers(rows: ReadonlyArray<EncounterCombatantView>): {
  resolveName: ResolveCombatantName;
  resolveCondition: ResolveConditionName;
} {
  const { t } = useTranslation();
  const { language } = useLocale();
  const nameById = useMemo(
    () => new Map(rows.map((r) => [r.id, r.name] as const)),
    [rows]
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
  return { resolveName, resolveCondition };
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
 * round-grouped order; each un-attributed damage hit shows the one-tap attacker picker
 * (current combatant pre-selected), and the active combatant gets the pull-only
 * miss / pass logger. All edits route through `apply` (the DM encounter reducer), so
 * they ride the SAME debounced encounter writer (no per-action write).
 */
export function ChronicleFeed({
  events,
  rows,
  currentId,
  gathering,
  apply,
}: {
  events: ReadonlyArray<CombatChronicleEvent>;
  rows: ReadonlyArray<EncounterCombatantView>;
  currentId: string | null;
  /** During the gathering phase there is no active combatant, so no miss/pass logger. */
  gathering: boolean;
  apply: ApplyFn;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const { resolveName, resolveCondition } = useChronicleResolvers(rows);

  return (
    <section className="rounded-md border border-border-medium bg-[var(--bg-recessed)] shadow-[var(--elev-recessed)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Icon as={ScrollText} size="sm" className="text-text-secondary" decorative />
        <span className="flex-1 font-mono text-2xs uppercase tracking-[0.08em] text-text-secondary">
          {t("combatChronicle.feedTitle")}
        </span>
        {events.length > 0 && (
          <span className="rounded-sm bg-bg-tertiary px-1.5 text-2xs tabular-nums text-text-muted">
            {events.length}
          </span>
        )}
        <Icon
          as={ChevronDown}
          size="sm"
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
          decorative
        />
      </button>

      {open && (
        <div className="border-t border-border-subtle px-3 py-2">
          {events.length === 0 ? (
            <p className="py-2 text-center text-2xs italic text-text-faint">
              {t("combatChronicle.feedEmpty")}
            </p>
          ) : (
            <ol className="flex max-h-[240px] flex-col gap-1 overflow-y-auto">
              {events.map((event, i) => {
                const prev = events[i - 1];
                const showRound = !prev || prev.round !== event.round;
                return (
                  <li key={event.id}>
                    {showRound && (
                      <p className="mt-1.5 mb-0.5 font-mono text-[length:var(--text-micro)] uppercase tracking-[0.1em] text-text-faint first:mt-0">
                        {t("combatChronicle.round", { n: event.round })}
                      </p>
                    )}
                    <FeedLine
                      event={event}
                      rows={rows}
                      currentId={currentId}
                      resolveName={resolveName}
                      resolveCondition={resolveCondition}
                      apply={apply}
                    />
                  </li>
                );
              })}
            </ol>
          )}

          {!gathering && currentId && (
            <MissPassLogger
              actorId={currentId}
              rows={rows}
              resolveName={resolveName}
              apply={apply}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** One feed line + (for an un-attributed hit) the one-tap attacker picker. */
function FeedLine({
  event,
  rows,
  currentId,
  resolveName,
  resolveCondition,
  apply,
}: {
  event: CombatChronicleEvent;
  rows: ReadonlyArray<EncounterCombatantView>;
  currentId: string | null;
  resolveName: ResolveCombatantName;
  resolveCondition: ResolveConditionName;
  apply: ApplyFn;
}) {
  const { t } = useTranslation();
  const text = localizeChronicleEvent(event, t, resolveName, resolveCondition);
  const needsAttribution = chronicleNeedsAttribution(event);
  // Candidate attackers = every combatant EXCEPT the one that took the hit.
  const targetId = event.kind === "hp-damage" ? event.targetId : null;
  const candidates = rows.filter((r) => r.id !== targetId);

  return (
    <div className="flex flex-col gap-1 rounded px-1 py-0.5">
      <span className="text-2xs leading-snug text-text-secondary">{text}</span>
      {needsAttribution && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[length:var(--text-micro)] uppercase tracking-[0.08em] text-text-faint">
            {t("combatChronicle.attributeLabel")}
          </span>
          {candidates.map((c) => (
            <CombatantChip
              key={c.id}
              label={c.name}
              selected={c.id === currentId}
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

/** The pull-only miss / pass logger for the active combatant — off unless the DM taps.
 *  A miss reveals target chips; a pass logs immediately. The app NEVER infers either. */
function MissPassLogger({
  actorId,
  rows,
  resolveName,
  apply,
}: {
  actorId: string;
  rows: ReadonlyArray<EncounterCombatantView>;
  resolveName: ResolveCombatantName;
  apply: ApplyFn;
}) {
  const { t } = useTranslation();
  const [pickingMiss, setPickingMiss] = useState(false);
  const targets = rows.filter((r) => r.id !== actorId);
  const actorName = resolveName(actorId);

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-border-subtle pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[length:var(--text-micro)] uppercase tracking-[0.08em] text-text-faint">
          {actorName}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPickingMiss((v) => !v)}
          aria-expanded={pickingMiss}
        >
          <Icon as={Crosshair} size="xs" decorative />
          {t("combatChronicle.logMiss")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => apply((e) => recordTurnPass(e, actorId))}
        >
          <Icon as={Swords} size="xs" decorative />
          {t("combatChronicle.logPass")}
        </Button>
      </div>
      {pickingMiss && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[length:var(--text-micro)] uppercase tracking-[0.08em] text-text-faint">
            {t("combatChronicle.missTargetLabel")}
          </span>
          {targets.map((c) => (
            <CombatantChip
              key={c.id}
              label={c.name}
              onClick={() => {
                apply((e) => recordMiss(e, actorId, c.id));
                setPickingMiss(false);
              }}
            />
          ))}
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
  rows,
  onSave,
  onSkip,
  onCancel,
}: {
  encounter: EncounterState;
  rows: ReadonlyArray<EncounterCombatantView>;
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
  const { resolveName, resolveCondition } = useChronicleResolvers(rows);
  const events = useMemo(() => encounter.events ?? [], [encounter.events]);
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
      resolveCondition
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
      <div className="flex flex-col gap-4">
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
            <ul className="flex max-h-[220px] flex-col gap-0.5 overflow-y-auto rounded-md border border-border-subtle bg-bg-tertiary/40 p-2">
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
                      {localizeChronicleEvent(event, t, resolveName, resolveCondition)}
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

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onSkip} disabled={saving}>
            {t("combatChronicle.endSkip")}
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            <Icon as={ScrollText} size="sm" decorative />
            {t("combatChronicle.endSave")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
