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

import { useState, useMemo, useRef, useId } from "react";
import { totalLevel } from "@/lib/classes";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Heart, Dice5 } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useItemResourceCommands } from "./center/useItemResourceCommands";
import { restThroughWorld } from "./rest-world-boundary";
import { canCharacterRest } from "@/lib/character-status";
import { abilityModifier, effectiveAbilityScores } from "@/lib/compute";
import { aggregateCharacterGrants, effectiveMaxHp } from "@/lib/aggregate-character";
import {
  getShortRestExhaustionRecovery,
  gainsHeroicInspirationOnLongRest,
} from "@/lib/smart-tracker";
import { cn } from "@/lib/utils";
import { InfoCard } from "@/components/shared/InfoCard";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalBody } from "@/components/ui/modal-head";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RestPhase = "idle" | "confirm-short" | "confirm-long" | "summary";
type RestBoundaryKind = "short-rest" | "long-rest";

interface RestSummary {
  type: "short" | "long";
  hpBefore: number;
  hpAfter: number;
  hpMax: number;
  hitDiceUsed: number;
  slotsRestored: number;
  trackersRestored: number;
  exhaustionReduced: boolean;
  /** S4 — Human's Resourceful: a Long Rest auto-lit Heroic Inspiration. */
  inspirationGained: boolean;
  /** Total typed item-resource units restored by this exact rest boundary. */
  itemResourceUnitsRecovered: number;
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
  const character = useCharacterStore((s) => s.character);
  const setHP = useCharacterStore((s) => s.setHP);
  const updateSession = useCharacterStore((s) => s.updateSession);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const itemResourceCommands = useItemResourceCommands();

  const [phase, setPhase] = useState<RestPhase>("idle");
  const [summary, setSummary] = useState<RestSummary | null>(null);
  const [hitDiceToSpend, setHitDiceToSpend] = useState(0);
  const [diceTotal, setDiceTotal] = useState("");
  const inputId = useId();
  const [committing, setCommitting] = useState(false);
  const committingRef = useRef(false);

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
  const restEligible = canCharacterRest(restCharacter.status, session);
  const level = totalLevel(charData);
  const hitDie = charData.hitDieType;
  const hitDiceMax = charData.hitDiceTotalOverride ?? level;
  const hitDiceUsed = session.hitDice.used;
  const hitDiceAvailable = Math.max(0, hitDiceMax - hitDiceUsed);
  const hpCurrent = session.hp.current;
  // D1 — rest restores up to the EFFECTIVE max (stored base + hp-flat boons + Aid),
  // matching the store's `longRest`/`applyHealing` clamp, so the summary readout +
  // the short-rest cap agree with the real max (rule 6).
  const hpMax = effectiveMaxHp(charData, session);
  // B8 — short-rest healing adds the CURRENT (effective) CON modifier, so an
  // Amulet of Health (CON→19) raises the preview. The REAL heal engine resolves
  // against effective CON (smart-tracker `combatAbilityScores`); the preview must
  // use the SAME score, never raw, or it disagrees with the actual heal (rule 6).
  const agg = aggregateCharacterGrants(charData, session);
  const conMod = abilityModifier(
    effectiveAbilityScores(
      charData.abilityScores,
      agg.abilityScoreFloors,
      agg.itemAbilityScoreBonus,
      agg.itemAbilityScoreCap
    ).CON
  );
  const roll = Number(diceTotal);
  const rollValid =
    diceTotal.trim() !== "" &&
    Number.isInteger(roll) &&
    roll >= hitDiceToSpend &&
    roll <= hitDiceToSpend * hitDie;
  const diceCountValid = hitDiceToSpend <= hitDiceAvailable;
  const shortRestHeal =
    hitDiceToSpend === 0
      ? 0
      : rollValid
        ? Math.max(hitDiceToSpend, roll + hitDiceToSpend * conMod)
        : null;
  const hpAfterRest =
    shortRestHeal === null ? null : Math.min(hpCurrent + shortRestHeal, hpMax);

  function changeDiceCount(next: number) {
    setHitDiceToSpend(Math.max(0, Math.min(hitDiceAvailable, next)));
    setDiceTotal("");
  }

  /** Preflight and atomically commit one typed item-resource rest boundary.
   * The reviewed character snapshot stays frozen across any physical-roll input. */
  async function commitRestBoundary(kind: RestBoundaryKind) {
    if (committingRef.current) return null;
    if (!canCharacterRest(restCharacter.status, restCharacter.session)) return null;
    committingRef.current = true;
    setCommitting(true);
    try {
      const prepared = await itemResourceCommands.prepareBoundary({ kind });
      if (!prepared) return null;
      const live = useCharacterStore.getState().character;
      if (live !== restCharacter || !canCharacterRest(live.status, live.session)) {
        useToastStore.getState().showToast({
          message: t("rest.stateChanged"),
          duration: 5000,
        });
        return null;
      }
      return itemResourceCommands.commitBoundary(prepared) ? prepared : null;
    } finally {
      committingRef.current = false;
      setCommitting(false);
    }
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
    const prepared = await commitRestBoundary("short-rest");
    if (!prepared) return;
    const hpBefore = hpCurrent;
    const newHp = Math.min(hpCurrent + healedHp, hpMax);

    // S4 — Ranger's Tireless: a Short Rest removes Exhaustion (computed BEFORE
    // the rest applies it, so the summary can report it). 0 for anyone
    // without the grant.
    const exhaustionRemovedOnShort =
      getShortRestExhaustionRecovery(restCharacter) > 0 && session.exhaustion > 0;

    // CUTOVER — the rest routes through the canonical mechanics runtime:
    // `restThroughWorld` plans the kernel's rest boundary over the persisted
    // world FIRST (rest-completed evidence, timed/until-rest lifetime endings,
    // every engine-modeled recovery, the entered heal as the recorded roll),
    // runs the wrapped legacy `shortRest()` as the write-through bridge, then
    // commits the world action so the mirror re-asserts every world-owned
    // field. Fail-closed: a rejected world plan degrades to the legacy rest
    // alone, exactly the pre-cutover behavior (see rest-world-boundary.ts).
    restThroughWorld("short", { healedHp });
    if (healedHp > 0) setHP(newHp);
    if (hitDiceToSpend > 0) {
      updateSession({ hitDice: { used: hitDiceUsed + hitDiceToSpend } });
    }
    // A short rest ends the current fight — return combat to baseline.
    useCombatStore.getState().endCombat();

    setSummary({
      type: "short",
      hpBefore,
      hpAfter: newHp,
      hpMax,
      hitDiceUsed: hitDiceToSpend,
      slotsRestored: 0,
      trackersRestored: 0,
      exhaustionReduced: exhaustionRemovedOnShort,
      inspirationGained: false,
      itemResourceUnitsRecovered: prepared.entries.reduce(
        (sum, { receipt }) => sum + Math.max(0, receipt.after - receipt.before),
        0
      ),
    });
    setPhase("summary");
    setHitDiceToSpend(0);
  }

  async function handleLongRestConfirm() {
    const prepared = await commitRestBoundary("long-rest");
    if (!prepared) return;
    const hpBefore = hpCurrent;
    const hadExhaustion = session.exhaustion > 0;
    // RA-01 — Hit Dice regain is handled by `longRest()` (2024 RAW: regain ALL
    // spent Hit Dice). Surface the count we restored so the summary can show it.
    const hitDiceRestored = hitDiceUsed;

    // S4 — Human's Resourceful: a Long Rest auto-lights Heroic Inspiration. Show
    // it in the summary ONLY when it's a genuine GAIN (the character didn't
    // already have it), so the line reads as a consequence of this rest.
    const inspirationGained =
      gainsHeroicInspirationOnLongRest(restCharacter) && !session.inspiration;

    // CUTOVER — engine plans first (rest-completed evidence, until-long-rest
    // lifetime endings, concentration end requests, a lingering solo world
    // encounter closed, every engine-modeled recovery), the wrapped legacy
    // `longRest()` runs as the write-through bridge, then the world action
    // commits and mirrors. Fail-closed degradation to the legacy rest alone
    // when the world rejects (see rest-world-boundary.ts).
    restThroughWorld("long");
    // A long rest ends the current fight — return combat to baseline.
    useCombatStore.getState().endCombat();

    setSummary({
      type: "long",
      hpBefore,
      hpAfter: hpMax,
      hpMax,
      hitDiceUsed: hitDiceRestored,
      slotsRestored: totalSlotsSpent,
      trackersRestored: totalTrackersSpent,
      exhaustionReduced: hadExhaustion,
      inspirationGained,
      itemResourceUnitsRecovered: prepared.entries.reduce(
        (sum, { receipt }) => sum + Math.max(0, receipt.after - receipt.before),
        0
      ),
    });
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
            summary.type === "long"
              ? t("rest.longRestSummary")
              : t("rest.shortRestSummary")
          }
        />
        <div className="rest-summary-panel">
          <div className="rest-summary-head">
            {summary.type === "long" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
            <span className="rest-summary-title">
              {summary.type === "long" ? t("rest.longRest") : t("rest.shortRest")}{" "}
              {t("rest.summary")}
            </span>
          </div>

          <div className="rest-summary-rows">
            <SummaryRow
              label={t("character.hitPoints")}
              value={`${summary.hpBefore} → ${summary.hpAfter} / ${summary.hpMax}`}
              highlight={summary.hpAfter > summary.hpBefore}
            />
            {summary.type === "short" && summary.hitDiceUsed > 0 && (
              <SummaryRow
                // RA-02 — report the ACTUAL HP healed (hpAfter − hpBefore from the
                // player's entered roll), never a fabricated average.
                label={t("rest.hitDiceSpent")}
                value={t("rest.hitDiceSpentValue", {
                  count: summary.hitDiceUsed,
                  die: hitDie,
                  hp: summary.hpAfter - summary.hpBefore,
                })}
              />
            )}
            {summary.type === "short" && summary.exhaustionReduced && (
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
            {summary.type === "long" && (
              <>
                <SummaryRow
                  label={t("rest.hitDiceRecovered")}
                  value={`${summary.hitDiceUsed} of ${hitDiceMax}`}
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
                <span className="text-sm text-text-secondary">d{hitDie}</span>
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
                  {t("rest.diceTotal")}
                </label>
                <Input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={hitDiceToSpend}
                  max={hitDiceToSpend * hitDie}
                  step={1}
                  value={diceTotal}
                  onChange={(event) => setDiceTotal(event.target.value)}
                  disabled={committing}
                  error={diceTotal !== "" && !rollValid}
                  aria-describedby={`${inputId}-hint${diceTotal !== "" && !rollValid ? ` ${inputId}-error` : ""}`}
                  placeholder="—"
                  className="rest-roll-input"
                />
                <p id={`${inputId}-hint`} className="rest-input-hint">
                  {t("rest.diceTotalHint", { count: hitDiceToSpend, die: hitDie })}
                </p>
                {diceTotal !== "" && !rollValid && (
                  <p id={`${inputId}-error`} className="rest-input-hint text-error">
                    {t("rest.diceTotalError", {
                      min: hitDiceToSpend,
                      max: hitDiceToSpend * hitDie,
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
              {t("rest.completeShortRest")}
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
              {t("rest.longRestHpItem", { max: hpMax })}
            </li>
            <li>
              <Dice5 className="h-4 w-4 text-accent-text" />
              {/* RA-01 — 2024 RAW restores ALL spent Hit Dice. */}
              {t("rest.longRestDiceItem", { count: hitDiceUsed })}
            </li>
            {totalSlotsSpent > 0 && (
              <li>
                <span className="magic-mark" aria-hidden />
                {t("rest.longRestSlotsItem", { count: totalSlotsSpent })}
              </li>
            )}
            {totalTrackersSpent > 0 && (
              <li>
                <span className="flex h-4 w-4 items-center justify-center text-accent">
                  ⟳
                </span>
                {t("rest.longRestTrackersItem", { count: totalTrackersSpent })}
              </li>
            )}
            {session.exhaustion > 0 && (
              <li>
                <span className="flex h-4 w-4 items-center justify-center text-warning">
                  ↓
                </span>
                {t("rest.longRestExhaustionItem", { level: session.exhaustion })}
              </li>
            )}
            <li>
              <span className="flex h-4 w-4 items-center justify-center text-text-secondary">
                ○
              </span>
              {t("rest.longRestConditionsItem")}
            </li>
          </ul>

          <div className="rest-action-row">
            <Button
              onClick={() => void handleLongRestConfirm()}
              className="flex-1"
              disabled={committing}
            >
              {t("rest.takeLongRest")}
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
                die: hitDie,
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
              {t("rest.longRestHpItem", { max: hpMax })}
            </li>
            <li>
              <Dice5 className="h-3.5 w-3.5" />
              {/* RA-01 — 2024 RAW restores ALL spent Hit Dice. */}
              {t("rest.longRestDiceItem", { count: hitDiceUsed })}
            </li>
            {totalSlotsSpent > 0 && (
              <li>
                <span className="magic-mark" aria-hidden />
                {t("rest.longRestSlotsItem", { count: totalSlotsSpent })}
              </li>
            )}
            {session.exhaustion > 0 && (
              <li>{t("rest.longRestExhaustionItem", { level: session.exhaustion })}</li>
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
