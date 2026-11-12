/**
 * RestModal — Rest as an ACTION (blueprint §2.4: "Rest is an action", not a tab).
 *
 * Re-homed verbatim from the pre-rewrite Rest page: the same short/long-rest phase
 * machine (idle → confirm → summary) — now hosted in the shared `ModalShell`,
 * opened from the cockpit header's Rest button instead of a route. The page header
 * is dropped (the modal provides the title); the summary's Done closes the modal.
 * - Short rest: spend hit dice to heal, reset short-rest trackers
 * - Long rest: restore HP, spell slots, all trackers, reduce exhaustion
 *
 * The confirm routes through `restThroughWorld` (rest-world-boundary.ts): the
 * canonical mechanics runtime plans and commits the rest as one journal action
 * over the character's persisted world (the kernel's `complete-rest` boundary +
 * every engine-modeled recovery), wrapping the legacy `shortRest`/`longRest`
 * store flow as the rollout write-through; a rejected world degrades fail-closed
 * to that legacy flow alone.
 */

import {
  hitDiceLabel,
  hitDiceLeft,
  hitDicePool,
  hitDiceTotal,
  hitDiceTotalRange,
  readHitDiceRoll,
} from "@/lib/play/hit-dice";
import { shortRestHeal as shortRestHealFor } from "@/lib/play/short-rest-healing";
import { useState, useMemo, useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Moon,
  Sun,
  Heart,
  Dice5,
  Sparkles,
  RotateCcw,
  TrendingDown,
  Focus,
  Star,
} from "lucide-react";
import { restSummary, type RestSummary } from "@/lib/play/rest-summary";
import { useCharacterStore } from "@/stores/characterStore";
import { restExpertiseRows } from "@/lib/rest-expertise";
import { applyRestCantripSwap, restCantripSwaps } from "@/lib/rest-cantrip-swap";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { Select } from "@/components/shared/Select";
import { useUIStore } from "@/stores/uiStore";
import { useRestCommit } from "./use-rest-commit";
import { canCharacterRest } from "@/lib/character-status";
import { abilityModifier, aggregateAbilityScores } from "@/lib/compute";
import { aggregateCharacterGrants, effectiveMaxHp } from "@/lib/aggregate-character";
import { sessionAfterLongRestReduction } from "@/lib/play/rests";
import { FADING_PENALTIES } from "@/lib/play/fading-penalties";
import { localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import { InfoCard } from "@/components/shared/InfoCard";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalBody } from "@/components/ui/modal-head";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RestPhase = "idle" | "confirm-short" | "confirm-long" | "summary";

/** "−4", or "0" once the penalty is gone. */
function penaltyText(amount: number): string {
  return amount > 0 ? `−${amount}` : "0";
}

/**
 * The Rest action's modal — opened from the cockpit header. Hosts the rest flow
 * in the shared ModalShell; the flow mounts fresh on each open (phase resets to
 * idle), and the summary's Done + the shell's close both call `onClose`.
 */
export function RestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      rubric={t("character.restEyebrow")}
      title={t("character.rest")}
      size="lg"
      compact
    >
      <ModalBody>
        <RestFlow onClose={onClose} />
      </ModalBody>
    </ModalShell>
  );
}

function RestFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const rest = useRestCommit();
  const committing = rest.committing;

  const [phase, setPhase] = useState<RestPhase>("idle");
  const [summary, setSummary] = useState<RestSummary | null>(null);
  const [hitDiceToSpend, setHitDiceToSpend] = useState(0);
  const [diceTotal, setDiceTotal] = useState("");
  // A Long Rest's re-picked Expertise (Versatile Merc), by choice key; absent:
  // last time's pick, preselected.
  const [restPicks, setRestPicks] = useState<Readonly<Record<string, string | null>>>({});
  // A lineage cantrip replaced at this Long Rest (High Elf): the new cantrip, by key.
  const [cantripPicks, setCantripPicks] = useState<Readonly<Record<string, string>>>({});
  const inputId = useId();

  // Count spent spell slots
  const totalSlotsSpent = useMemo(() => {
    if (!character) return 0;
    return Object.values(character.session.spellSlots).reduce(
      (sum, slot) => sum + slot.used,
      0
    );
  }, [character]);

  // Count spent trackers
  const totalTrackersSpent = useMemo(() => {
    if (!character) return 0;
    return Object.values(character.session.trackers).reduce((sum, t) => sum + t.used, 0);
  }, [character]);

  if (!character) return null;

  const restCharacter = character;
  const { character: charData, session } = restCharacter;
  // Expertise picked at each Long Rest: proficient skills with no Expertise from
  // another rule, last time's pick preselected.
  const restAggregate = aggregateCharacterGrants(charData, session);
  const restLastPicks = new Set(
    restAggregate.restExpertise.flatMap(
      ({ choiceKey }) => session.grantBundleChoices?.[choiceKey] ?? []
    )
  );
  const expertiseRows = restExpertiseRows(
    restAggregate.restExpertise,
    session.grantBundleChoices,
    charData.skills,
    new Set([...restAggregate.expertiseSkills].filter((id) => !restLastPicks.has(id)))
  );
  const cantripRows = restCantripSwaps(restCharacter);
  const restPickOf = (row: (typeof expertiseRows)[number]) =>
    row.choiceKey in restPicks ? (restPicks[row.choiceKey] ?? null) : row.current;
  const restEligible = canCharacterRest(restCharacter.status, session);
  // A multiclass pool mixes die sizes (Fighter d10s + Wizard d6s).
  const hitDice = hitDicePool(charData);
  const hitDieSizes = hitDiceLabel(hitDice).sizes;
  const hitDiceText = (count: number) =>
    hitDiceLabel(hitDice, count).dice ??
    t("rest.hitDiceMixed", { count, sizes: hitDieSizes });
  const hitDiceMax = hitDiceTotal(charData);
  const hitDiceUsed = session.hitDice.used;
  const hitDiceAvailable = hitDiceLeft(charData, session);
  const hpCurrent = session.hp.current;
  // D1 — rest restores up to the EFFECTIVE max (stored base + hp-flat boons + Aid),
  // matching the store's `longRest`/`applyHealing` clamp, so the summary readout +
  // the short-rest cap agree with the real max (rule 6).
  const hpMax = effectiveMaxHp(charData, session);
  // A Long Rest ends a Hit Point maximum reduction first, so it promises and
  // reports the maximum it restores, not the reduced one.
  const longRestHpMax = effectiveMaxHp(charData, sessionAfterLongRestReduction(session));
  // B8 — short-rest healing adds the CURRENT (effective) CON modifier, so an
  // Amulet of Health (CON→19) raises the preview. The REAL heal engine resolves
  // against effective CON (smart-tracker `combatAbilityScores`); the preview must
  // use the SAME score, never raw, or it disagrees with the actual heal (rule 6).
  const agg = aggregateCharacterGrants(charData, session);
  const conMod = abilityModifier(
    aggregateAbilityScores(charData.abilityScores, agg, charData.abilityScoreOverrides)
      .CON
  );
  // The total is checked against the largest dice the pool holds.
  const rollRange = hitDiceTotalRange(hitDice, hitDiceToSpend);
  // The engine's heal, the same as the Play screen's: the entered roll plus CON per
  // die, and the items that change Hit Point Dice healing (Periapt of Wound Closure).
  const { heal: shortRestHeal, valid: rollValid } = shortRestHealFor(
    restCharacter,
    hitDiceToSpend,
    diceTotal
  );
  // A floor on the faces (a feature that counts a 1 or 2 as a 3) takes the faces
  // typed one per die; the engine's heal reads them the same way.
  const hitDieFloor = agg.hitDieFloor;
  const read = hitDieFloor
    ? readHitDiceRoll(diceTotal, hitDiceToSpend, hitDieFloor)
    : null;
  const diceCountValid = hitDiceToSpend <= hitDiceAvailable;
  const hpAfterRest =
    shortRestHeal === null ? null : Math.min(hpCurrent + shortRestHeal, hpMax);

  function changeDiceCount(next: number) {
    setHitDiceToSpend(Math.max(0, Math.min(hitDiceAvailable, next)));
    setDiceTotal("");
  }

  /**
   * RA-02 — finish the Short Rest, healing by `healedHp` (0 when no dice were
   * spent). The heal is the player's ENTERED roll + CON mod per die (golden rule
   * 21: the app NEVER fabricates a die total — the average is gone), resolved
   * from the validated dice total and effective CON. Clamped to the
   * effective max; the dice are debited; the summary reports the ACTUAL HP gained.
   */
  async function finishShortRest(healedHp: number) {
    if (!diceCountValid) return;

    // The rest routes through the canonical mechanics runtime (`useRestCommit`:
    // the item-resource boundary, `restThroughWorld`, the heal, the dice, the fight).
    const prepared = await rest.shortRest(restCharacter, hitDiceToSpend, healedHp);
    if (!prepared) return;

    const after = useCharacterStore.getState().character ?? restCharacter;
    setSummary(
      restSummary(
        "short",
        restCharacter,
        after,
        prepared.entries.map(({ receipt }) => receipt)
      )
    );
    setPhase("summary");
    setHitDiceToSpend(0);
  }

  async function handleLongRestConfirm() {
    // The summary (Hit Dice regained, Resourceful's Inspiration, the fades) is read
    // from the sheet before and after the rest (`restSummary`).
    // The rest routes through the canonical mechanics runtime (`useRestCommit`).
    const prepared = await rest.longRest(restCharacter);
    if (!prepared) return;
    // The Long Rest ends last time's Expertise and starts this one's.
    if (expertiseRows.length > 0) {
      useCharacterStore.getState().dispatch({
        kind: "set-bundle-choices",
        choices: Object.fromEntries(
          expertiseRows.map((row) => [row.choiceKey, restPickOf(row)])
        ),
      });
    }

    // …and a lineage cantrip replaced, when the player picked another.
    for (const [choiceKey, spellId] of Object.entries(cantripPicks)) {
      const store = useCharacterStore.getState();
      const live = store.character;
      if (live) store.setCharacter(applyRestCantripSwap(live, choiceKey, spellId));
    }

    const after = useCharacterStore.getState().character ?? restCharacter;
    setSummary(
      restSummary(
        "long",
        restCharacter,
        after,
        prepared.entries.map(({ receipt }) => receipt)
      )
    );
    setPhase("summary");
  }

  function handleDismiss() {
    setPhase("idle");
    setSummary(null);
    setHitDiceToSpend(0);
    setDiceTotal("");
  }

  // Summary view
  if (phase === "summary" && summary) {
    return (
      <div>
        <SectionHeader
          as="h2"
          tight
          title={
            summary.kind === "long"
              ? t("rest.longRestSummary")
              : t("rest.shortRestSummary")
          }
        />
        <div className="rest-summary-panel">
          <div className="rest-summary-head">
            {summary.kind === "long" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
            <span className="rest-summary-title">
              {summary.kind === "long"
                ? t("rest.longRestSummaryTitle")
                : t("rest.shortRestSummaryTitle")}
            </span>
          </div>

          <div className="rest-summary-rows">
            <SummaryRow
              label={t("character.hitPoints")}
              value={`${summary.hp.before} → ${summary.hp.after} / ${summary.hp.max}`}
              highlight={summary.hp.after > summary.hp.before}
            />
            {summary.kind === "short" && summary.hitDice.count > 0 && (
              <SummaryRow
                // RA-02 — report the ACTUAL HP healed (hpAfter − hpBefore from the
                // player's entered roll), never a fabricated average.
                label={t("rest.hitDiceSpent")}
                value={t("rest.hitDiceSpentValue", {
                  dice: hitDiceText(summary.hitDice.count),
                  hp: summary.hp.after - summary.hp.before,
                })}
              />
            )}
            {summary.kind === "short" && summary.exhaustionReduced && (
              <SummaryRow
                label={t("character.exhaustion")}
                value={t("rest.exhaustionReduced")}
                highlight
              />
            )}
            {summary.itemResourceUnitsRecovered > 0 && (
              <SummaryRow
                label={t("rest.itemResourcesRecovered")}
                value={t("rest.itemResourcesRecoveredValue", {
                  count: summary.itemResourceUnitsRecovered,
                })}
                highlight
              />
            )}
            {summary.kind === "long" && (
              <>
                <SummaryRow
                  label={t("rest.hitDiceRecovered")}
                  value={t("rest.hitDiceRecoveredValue", {
                    count: summary.hitDice.count,
                    total: summary.hitDice.total,
                  })}
                  highlight
                />
                {summary.slotsRestored > 0 && (
                  <SummaryRow
                    label={t("rest.slotsRestored")}
                    value={t("rest.slotsRestoredValue", { count: summary.slotsRestored })}
                    highlight
                  />
                )}
                {summary.trackersRestored > 0 && (
                  <SummaryRow
                    label={t("rest.trackersReset")}
                    value={t("rest.trackersRestoredValue", {
                      count: summary.trackersRestored,
                    })}
                    highlight
                  />
                )}
                {summary.exhaustionReduced && (
                  <SummaryRow
                    label={t("character.exhaustion")}
                    value={t("rest.exhaustionReduced")}
                    highlight
                  />
                )}
                {summary.inspirationGained && (
                  <SummaryRow
                    label={t("character.heroicInspiration")}
                    value={t("rest.inspirationGained")}
                    highlight
                  />
                )}
                {summary.fades?.penalties.map(({ id, before, after }) => {
                  const ref = FADING_PENALTIES[id]?.ref;
                  return (
                    <SummaryRow
                      key={id}
                      label={t("rest.fadingPenalty", {
                        name: ref ? localizeSrd(ref.kind, ref.key, "name", locale) : id,
                      })}
                      value={`${penaltyText(before)} → ${penaltyText(after)}`}
                      highlight
                    />
                  );
                })}
                {summary.fades?.maxHp && (
                  <SummaryRow
                    label={t("rest.maxHpRestored")}
                    value={`${summary.fades.maxHp.before} → ${summary.fades.maxHp.after}`}
                    highlight
                  />
                )}
              </>
            )}
          </div>

          <Button onClick={onClose} block>
            {t("common.done")}
          </Button>
        </div>
      </div>
    );
  }

  if (!restEligible) {
    return (
      <InfoCard as="p" className="text-sm text-text-secondary">
        {t("rest.unavailableWhileDown")}
      </InfoCard>
    );
  }

  // Confirm short rest
  if (phase === "confirm-short") {
    return (
      <div>
        <SectionHeader as="h2" tight title={t("rest.shortRest")} />
        <form
          className="rest-confirm-panel"
          onSubmit={(event) => {
            event.preventDefault();
            if (shortRestHeal !== null && diceCountValid && !committing) {
              void finishShortRest(shortRestHeal);
            }
          }}
        >
          <div className="rest-short-status">
            <span>
              {t("character.hitPoints")}{" "}
              <strong>
                {hpCurrent} / {hpMax}
              </strong>
            </span>
            <span>{t("rest.shortRestDuration")}</span>
          </div>

          <div className="rest-short-fields">
            <div role="group" aria-labelledby={`${inputId}-count-label`}>
              <div id={`${inputId}-count-label`} className="rest-input-label">
                {t("rest.hitDiceToSpend")}
              </div>
              <div className="rest-dice-row">
                <button
                  type="button"
                  aria-label={t("rest.fewerDice")}
                  onClick={() => changeDiceCount(hitDiceToSpend - 1)}
                  disabled={committing || hitDiceToSpend <= 0}
                  className="rest-dice-btn"
                >
                  −
                </button>
                <span className="rest-dice-count" aria-live="polite">
                  {hitDiceToSpend}
                </span>
                <button
                  type="button"
                  aria-label={t("rest.moreDice")}
                  onClick={() => changeDiceCount(hitDiceToSpend + 1)}
                  disabled={committing || hitDiceToSpend >= hitDiceAvailable}
                  className="rest-dice-btn"
                >
                  +
                </button>
                <span className="text-sm text-text-secondary">{hitDieSizes}</span>
              </div>
              <p className="rest-input-hint">
                {t("rest.hitDiceAvailable", {
                  available: hitDiceAvailable,
                  total: hitDiceMax,
                })}
              </p>
            </div>

            {hitDiceToSpend > 0 && (
              <div>
                <label htmlFor={inputId} className="rest-input-label">
                  {t(hitDieFloor ? "rest.diceFaces" : "rest.diceTotal")}
                </label>
                <Input
                  id={inputId}
                  {...(hitDieFloor
                    ? { type: "text", inputMode: "text" as const }
                    : {
                        type: "number",
                        inputMode: "numeric" as const,
                        min: rollRange.min,
                        max: rollRange.max,
                        step: 1,
                      })}
                  value={diceTotal}
                  onChange={(event) => setDiceTotal(event.target.value)}
                  disabled={committing}
                  error={diceTotal !== "" && !rollValid}
                  aria-describedby={`${inputId}-hint${diceTotal !== "" && !rollValid ? ` ${inputId}-error` : ""}`}
                  placeholder="—"
                  className="rest-roll-input"
                />
                <p id={`${inputId}-hint`} className="rest-input-hint">
                  {hitDieFloor
                    ? t("rest.diceFacesHint", {
                        dice: hitDiceText(hitDiceToSpend),
                        count: hitDiceToSpend,
                        below: hitDieFloor.floorBelow,
                        to: hitDieFloor.floorTo,
                      })
                    : t("rest.diceTotalHint", { dice: hitDiceText(hitDiceToSpend) })}
                </p>
                {diceTotal !== "" && !rollValid && (
                  <p id={`${inputId}-error`} className="rest-input-hint text-error">
                    {hitDieFloor
                      ? t("rest.diceFacesError", { count: hitDiceToSpend })
                      : t("rest.diceTotalError", {
                          min: rollRange.min,
                          max: rollRange.max,
                        })}
                  </p>
                )}
                {hitDieFloor && read?.faces && (
                  <p className="rest-input-hint" role="status">
                    {t("rest.diceFacesSum", {
                      faces: read.faces.join(" + "),
                      total: read.total,
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {hitDiceToSpend > 0 ? (
            <div className="rest-heal-preview">
              <div className="rest-short-status">
                <span>{t("rest.conAdded")}</span>
                <span>
                  {conMod >= 0 ? "+" : ""}
                  {hitDiceToSpend * conMod}
                </span>
              </div>
              <div className="rest-short-status">
                <span>{t("rest.hpAfterRest")}</span>
                <output aria-label={t("rest.hpAfterRest")}>
                  {hpCurrent} → {hpAfterRest ?? "—"} / {hpMax}
                </output>
              </div>
            </div>
          ) : (
            <p className="rest-input-hint">{t("rest.withoutHealing")}</p>
          )}

          <div className="rest-action-row">
            <Button
              type="submit"
              className="flex-1"
              disabled={committing || shortRestHeal === null || !diceCountValid}
            >
              {t("rest.completeRest")}
            </Button>
            <Button onClick={handleDismiss} variant="ghost" disabled={committing}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // Confirm long rest
  if (phase === "confirm-long") {
    return (
      <div>
        <SectionHeader as="h2" tight title={t("rest.longRest")} />
        <div className="rest-confirm-panel">
          <p className="mb-4 text-sm text-text-secondary">{t("rest.longRestExplain")}</p>
          <ul className="rest-confirm-list">
            <li>
              <Heart className="h-4 w-4 text-accent-text" />
              {t("rest.longRestHpItem", { max: longRestHpMax })}
            </li>
            <li>
              <Dice5 className="h-4 w-4 text-accent-text" />
              {/* RA-01 — 2024 RAW restores ALL spent Hit Dice. */}
              {t("rest.longRestDiceItem", { count: hitDiceUsed })}
            </li>
            {totalSlotsSpent > 0 && (
              <li>
                <Sparkles className="h-4 w-4 text-accent-text" />
                {t("rest.longRestSlotsItem", { count: totalSlotsSpent })}
              </li>
            )}
            {totalTrackersSpent > 0 && (
              <li>
                <RotateCcw className="h-4 w-4 text-accent-text" />
                {t("rest.longRestTrackersItem", { count: totalTrackersSpent })}
              </li>
            )}
            {session.exhaustion > 0 && (
              <li>
                <TrendingDown className="h-4 w-4 text-accent-text" />
                {t("rest.longRestExhaustionItem", { level: session.exhaustion })}
              </li>
            )}
            <li>
              <Focus className="h-4 w-4 text-accent-text" />
              {t("rest.longRestConditionsItem")}
            </li>
            {cantripRows.map((row) => {
              const source = grantSourceLabel(row.sourceId, locale);
              const spellName = (id: string) => localizeSrd("spell", id, "name", locale);
              return (
                <li key={row.choiceKey}>
                  <Star className="h-4 w-4 text-accent-text" />
                  <label className="flex flex-wrap items-center gap-2">
                    {t("rest.longRestCantripItem", { source })}
                    <Select
                      size="sm"
                      value={cantripPicks[row.choiceKey] ?? row.current}
                      onChange={(e) =>
                        setCantripPicks((prev) => ({
                          ...prev,
                          [row.choiceKey]: e.target.value,
                        }))
                      }
                    >
                      {[row.current, ...row.options]
                        .sort((a, b) => spellName(a).localeCompare(spellName(b), locale))
                        .map((id) => (
                          <option key={id} value={id}>
                            {spellName(id)}
                          </option>
                        ))}
                    </Select>
                  </label>
                </li>
              );
            })}
            {expertiseRows.map((row) => {
              const source = grantSourceLabel(row.sourceId, locale);
              return (
                <li key={row.choiceKey}>
                  <Star className="h-4 w-4 text-accent-text" />
                  {row.options.length === 0 ? (
                    t("rest.longRestExpertiseNone", { source })
                  ) : (
                    <label className="flex flex-wrap items-center gap-2">
                      {t("rest.longRestExpertiseItem", { source })}
                      <Select
                        size="sm"
                        value={restPickOf(row) ?? ""}
                        onChange={(e) =>
                          setRestPicks((prev) => ({
                            ...prev,
                            [row.choiceKey]: e.target.value || null,
                          }))
                        }
                      >
                        <option value="">{t("rest.longRestExpertiseSkip")}</option>
                        {[...row.options]
                          .sort((a, b) =>
                            t(`skills.${a}`).localeCompare(t(`skills.${b}`), locale)
                          )
                          .map((id) => (
                            <option key={id} value={id}>
                              {t(`skills.${id}`)}
                            </option>
                          ))}
                      </Select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="rest-action-row">
            <Button
              onClick={() => void handleLongRestConfirm()}
              className="flex-1"
              disabled={committing}
            >
              {t("rest.completeRest")}
            </Button>
            <Button onClick={handleDismiss} variant="ghost" disabled={committing}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Idle — show rest options
  return (
    <div>
      {/* Current status — progressive disclosure on mobile (≤480px).
          Uses <details open> so the panel is OPEN by default. On desktop the
          summary toggle is hidden and the grid is always visible. */}
      <details className="rest-disc" open>
        <summary className="rest-disc-summary">{t("rest.currentStatus")}</summary>
        <InfoCard>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatusCell
              label={t("stats.hp")}
              value={`${hpCurrent}/${hpMax}`}
              color={
                hpCurrent < hpMax / 2
                  ? "danger"
                  : hpCurrent < hpMax
                    ? "warning"
                    : "success"
              }
            />
            {sheetMode === "edit" ? (
              <div className="text-center">
                <div
                  className={cn(
                    "inline-flex items-baseline font-mono text-lg font-bold",
                    hitDiceAvailable === 0
                      ? "text-error"
                      : hitDiceAvailable < hitDiceMax
                        ? "text-warning"
                        : "text-success"
                  )}
                >
                  {hitDiceAvailable}/
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={hitDiceMax}
                    onChange={(e) => {
                      const val = Math.max(
                        1,
                        Math.min(20, parseInt(e.target.value, 10) || 1)
                      );
                      const store = useCharacterStore.getState();
                      const current = store.character;
                      if (!current) return;
                      store.setCharacter({
                        ...current,
                        character: { ...current.character, hitDiceTotalOverride: val },
                      });
                    }}
                    className="sm w-8 center"
                    title={t("abilities.hitDiceTotalLabel")}
                  />
                </div>
                <div className="text-[length:var(--text-micro)] uppercase tracking-wide text-text-secondary">
                  {t("rest.hitDice")}
                </div>
              </div>
            ) : (
              <StatusCell
                label={t("rest.hitDice")}
                value={`${hitDiceAvailable}/${hitDiceMax}`}
                color={
                  hitDiceAvailable === 0
                    ? "danger"
                    : hitDiceAvailable < hitDiceMax
                      ? "warning"
                      : "success"
                }
              />
            )}
            <StatusCell
              label={t("rest.slotsUsed")}
              value={String(totalSlotsSpent)}
              color="warning"
              muted={totalSlotsSpent === 0}
            />
            <StatusCell
              label={t("character.exhaustion")}
              value={String(session.exhaustion)}
              color="danger"
              muted={session.exhaustion === 0}
            />
          </div>
        </InfoCard>
      </details>

      {/* Rest cards — carved/embossed folio tiles (cast-brass, not flat
          rectangles). Each surfaces what the rest will DO inline (no hover-only
          reveal), then opens the spend/confirm flow. */}
      <div className="rest-grid">
        <button
          type="button"
          onClick={() => setPhase("confirm-short")}
          className="rest-card"
          data-kind="short"
        >
          <div className="rest-card-head">
            <Sun className="h-5 w-5" />
            <span className="rest-card-title">{t("rest.shortRest")}</span>
          </div>
          <p className="rest-card-desc">{t("rest.shortRestDesc")}</p>
          <ul className="rest-card-list">
            <li>
              <Dice5 className="h-3.5 w-3.5" />
              {t("rest.hitDiceAvailable", {
                available: hitDiceAvailable,
                total: hitDiceMax,
              })}
            </li>
            <li>
              <Heart className="h-3.5 w-3.5" />
              {t("rest.shortRestHealPerDie", {
                conMod: conMod >= 0 ? `+${conMod}` : `${conMod}`,
                die: hitDiceLabel(hitDice, 1).dice ?? hitDieSizes,
              })}
            </li>
          </ul>
          <span className="rest-card-cta">{t("rest.takeShortRest")}</span>
        </button>

        <button
          type="button"
          onClick={() => setPhase("confirm-long")}
          className="rest-card"
          data-kind="long"
        >
          <div className="rest-card-head">
            <Moon className="h-5 w-5" />
            <span className="rest-card-title">{t("rest.longRest")}</span>
          </div>
          <p className="rest-card-desc">{t("rest.longRestDesc")}</p>
          <ul className="rest-card-list">
            <li>
              <Heart className="h-3.5 w-3.5" />
              {t("rest.longRestHpItem", { max: longRestHpMax })}
            </li>
            <li>
              <Dice5 className="h-3.5 w-3.5" />
              {/* RA-01 — 2024 RAW restores ALL spent Hit Dice. */}
              {t("rest.longRestDiceItem", { count: hitDiceUsed })}
            </li>
            {totalSlotsSpent > 0 && (
              <li>
                <Sparkles className="h-3.5 w-3.5" />
                {t("rest.longRestSlotsItem", { count: totalSlotsSpent })}
              </li>
            )}
            {session.exhaustion > 0 && (
              <li>
                <TrendingDown className="h-3.5 w-3.5" />
                {t("rest.longRestExhaustionItem", { level: session.exhaustion })}
              </li>
            )}
          </ul>
          <span className="rest-card-cta">{t("rest.takeLongRest")}</span>
        </button>
      </div>
    </div>
  );
}

function StatusCell({
  label,
  value,
  color,
  muted = false,
}: {
  label: string;
  value: string;
  color: "success" | "warning" | "danger";
  /** Honest-blanks: a non-event (nothing to clear / spend) renders as a quiet
      muted "—" instead of a bright success-coloured 0. */
  muted?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "font-mono text-lg font-bold",
          muted && "text-text-secondary opacity-50",
          !muted && color === "success" && "text-success",
          !muted && color === "warning" && "text-warning",
          !muted && color === "danger" && "text-error"
        )}
      >
        {muted ? "—" : value}
      </div>
      <div className="text-[length:var(--text-micro)] uppercase tracking-wide text-text-secondary">
        {label}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rest-summary-row">
      <span className="rest-summary-lbl">{label}</span>
      <span className={cn("rest-summary-val", highlight && "highlight")}>{value}</span>
    </div>
  );
}
