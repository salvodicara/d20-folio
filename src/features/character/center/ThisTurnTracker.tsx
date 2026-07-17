/**
 * ThisTurnTracker — the action-economy turn meter, rendered at the TOP of the
 * Play tab (cockpit IA revision): combat is self-contained on the surface the
 * player acts from, instead of floating above every tab.
 *
 * Round ring · initiative · the Action / Bonus / Reaction economy tokens · the
 * 5-ft movement bar · the gilded End-Turn button, with the concentration banner
 * directly under it. It is a PURE meter: it READS the combat turn state
 * (`combatStore`) + the character (for the engine-derived initiative bonus +
 * movement budget) and DISPATCHES turn actions only. The per-slot commit/undo +
 * End-Turn finalization are owned by the shared `useTurnEconomy()` provider (one
 * source of undo refs), and the combatStore hydrate/persist bookkeeping lives in
 * that same PERSISTENT `TurnEconomyProvider` — so the in-progress turn survives
 * leaving and returning to Play (this component unmounts on a tab switch; the
 * provider does not).
 *
 * Render isolation (§7.2): a `combatStore` change re-renders THIS meter (and the
 * Play-tab cards, which share the store), never the Left/Right HUD.
 */

import { useMemo } from "react";
import { totalLevel } from "@/lib/classes";
import { useTranslation } from "react-i18next";
import { Swords, Zap, RefreshCw, ArrowRight, Flag } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useLocale } from "@/hooks/useLocale";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import {
  abilityModifier,
  characterHasFeat,
  computeInitiative,
  effectiveAbilityScores,
  effectiveProficiencyBonus,
} from "@/lib/compute";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  concentrationLabel,
  grantSourceLabel,
  conditionLabel,
} from "@/lib/views/tracker-view";
import {
  resolveStartOfTurnRegen,
  resolveRound1DamageDoubles,
  effectiveWalkingSpeedFt,
} from "@/lib/smart-tracker";
import { getEquipment } from "@/data/equipment";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { composeTurnLimiters } from "@/lib/views/combat-action-view";
import {
  registerUndoableResult,
  registerUndoableToast,
  useUndoStore,
  wireUndoToast,
} from "@/stores/undoStore";
import { InitVital } from "@/features/campaigns/init-vital";
import { useTurnEconomy } from "./useTurnEconomy";
import { useTurnState, useSheetCombat } from "./turn-state";
import { MovementSlider } from "./MovementSlider";

/** The economy-token types the meter can filter the action board by (item e). */
export type EconFilterType = "action" | "bonus" | "reaction";

export function ThisTurnTracker({
  activeFilter,
  onFilterByType,
  attackRollState = "none",
}: {
  /**
   * The Play-tab's active action filter (item e) — the SAME `filter` state the
   * fchips drive, so the meter and the chips can never disagree (one source of
   * truth). Omitted when the meter renders without a filterable board.
   */
  activeFilter?: string;
  /**
   * Filter the action board to an economy type (item e). Clicking a meter token
   * for the type it's already showing clears back to "all" — the caller decides
   * the toggle. Omitted = the tokens stay non-filtering (display only).
   */
  onFilterByType?: (type: EconFilterType) => void;
  /**
   * B3 — the netted attack-roll state (advantage/disadvantage/none) PlayTab
   * already derives once (`attackRollState`, conditions + grant clauses netted
   * RAW). Passed down (single source of truth — never re-derived here) so the
   * "what's limiting you" summary surfaces an attack-disadvantage limiter only
   * when the NET is disadvantage (an advantage source cancels it). Defaults to
   * "none" for a standalone mount.
   */
  attackRollState?: "advantage" | "disadvantage" | "none";
} = {}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const { handleEndTurn, maintenancePrompts, keepMaintainedEffect, endMaintainedEffect } =
    useTurnEconomy();

  const character = useCharacterStore((s) => s.character);
  // The ONE turn seam: in an active campaign encounter `round` is the SHARED encounter
  // round (resolved from the shell global-combat status) and `phase` distinguishes
  // gathering / my-turn / waiting; solo it is the local `combatStore.round` with
  // `phase: "solo"`. One round shown, never a private counter that can drift (the cured
  // "round 6, 7, 8…" bug). The seam's static graph is Firebase-free (turn-state.ts).
  const { round, phase, currentActorName } = useTurnState();
  const inEncounter = phase !== "solo";
  // C3 — once the DM begins turns (the encounter order is frozen — phase `my-turn`/`waiting`)
  // a PC's initiative LOCKS: the sheet's roll widget goes read-only, matching the encounter
  // card. The DM owns every order change after Begin (drag-to-reorder), never a silent
  // re-sort from a mid-fight re-roll. Solo + the gathering phase stay freely editable.
  const initLocked = phase === "my-turn" || phase === "waiting";
  // P10 GLASS CASE — on a read-only viewer the turn meter is a pure READ-OUT:
  // the roll widget locks and the movement slider goes inert (End Turn / Reset /
  // prompt CTAs are hidden by the folio.css glass-case recipe; the combatStore
  // readonly guards are the behavioral backstop).
  const readonly = useSheetReadonly();
  const selected = useCombatStore((s) => s.selected);
  const budget = useCombatStore((s) => s.budget);
  const reactionUsed = useCombatStore((s) => s.reactionUsed);
  const initiative = useCombatStore((s) => s.initiative);
  const setInitiative = useCombatStore((s) => s.setInitiative);
  // The OPEN hero's live encounter status (`null` = solo). In an encounter the roll's ONE
  // home is the campaign's `encounterInit` table — `gc.initiativeRoll` reads it and the
  // commit below writes it — so the sheet, the card, and the pip literally share the same
  // stored value (golden rule 6). Solo keeps `combatStore.initiative` → the subdoc.
  const gc = useSheetCombat();
  const movementUsedFt = useCombatStore((s) => s.movementUsedFt);
  const setMovementUsed = useCombatStore((s) => s.setMovementUsed);
  // RA-09 — Dash commits this turn; each extends the movement budget by one Speed.
  const dashesThisTurn = useCombatStore((s) => s.dashesThisTurn);
  // RA-08 — slot-paid spell casts this turn (the one-spell-slot-per-turn advisory).
  const spellSlotCastsThisTurn = useCombatStore((s) => s.spellSlotCastsThisTurn);
  const exhaustion = useCharacterStore((s) => s.character?.session.exhaustion ?? 0);
  // Session inputs to the canonical full-grant aggregate (while-active toggles +
  // grant-bundle/lineage choices) — the SAME pair CombatHeader + LeftHud thread, so
  // the initiative DEX read folds set-score floors AND magic-item ability bonuses
  // identically (golden rule 6 — one chokepoint, no per-surface drift).
  const activeFeatures = useCharacterStore((s) => s.character?.session.activeFeatures);
  const grantBundleChoices = useCharacterStore(
    (s) => s.character?.session.grantBundleChoices
  );
  const applyInitiativeTrackerTopUps = useCharacterStore(
    (s) => s.applyInitiativeTrackerTopUps
  );

  // S4 — rolling Initiative tops up the listed trackers (Persistent Rage, Battle
  // Master Relentless, Superior Inspiration, Archdruid, Perfect Focus). Fires when
  // the field goes from EMPTY to a value (= the player just rolled this combat),
  // never on every keystroke of a multi-digit edit. Override-first: a toast names
  // the source and offers Undo.
  //
  // SINGLE SOURCE OF TRUTH (INIT-3): `combatStore.initiative` holds the canonical raw d20
  // ROLL — the SAME value the campaign encounter + the `combat/state.initiativeRoll`
  // subdoc store. The total (roll + bonus) is DERIVED for display, never stored. The input
  // below edits that raw d20 roll directly; `rollInitiative` receives the raw roll string.
  function rollInitiative(roll: string) {
    // "First roll of THIS fight" gates the S4 top-ups: in an encounter that is an empty
    // `encounterInit` row (`gc.initiativeRoll === null` — a stale SOLO roll lingering in
    // `combatStore.initiative` is irrelevant, its home is separate now); solo it is the
    // blank combat-store string.
    const wasEmpty = gc ? gc.initiativeRoll === null : initiative === "";
    if (gc) {
      // ENCOUNTER — the roll's ONE home is the campaign doc's `encounterInit` table
      // (the member's own-row grant / the DM's unconstrained branch both authorize it).
      // Dynamic import so this module's static graph stays Firebase-free (the same
      // discipline as `advanceSharedTurn`). NEVER written to the combat store/subdoc —
      // that would resurrect the dual-home drift this re-architecture deleted.
      const myUid = gc.myId.startsWith("pc-") ? gc.myId.slice(3) : gc.myId;
      const campaignId = gc.campaignId;
      void import("@/features/campaigns/campaign-io")
        .then(({ setEncounterInitiative }) =>
          setEncounterInitiative(campaignId, myUid, roll === "" ? null : Number(roll))
        )
        .catch((e: unknown) => console.error("Initiative roll failed", e));
    } else {
      setInitiative(roll);
    }
    if (!wasEmpty || roll === "") return;
    const { sourceIds, restore } = applyInitiativeTrackerTopUps();
    if (sourceIds.length === 0) return;
    // Pattern B (the reversal contract): the top-up already ran and the message
    // names its source — register on the session undo stack so ⌘Z / the standing
    // control reach it too, then wire the standard 5s snackbar. Character-state
    // entry (a tracker restore, not per-turn economy) → turnScoped false.
    const message = t("combat.initiativeTopUp", {
      source: grantSourceLabel(sourceIds[0] ?? "", locale),
    });
    const entryId = useUndoStore.getState().register({
      label: { message },
      turnScoped: false,
      undo: restore,
      redo: () => {
        const again = useCharacterStore.getState().applyInitiativeTrackerTopUps();
        return again.sourceIds.length > 0 ? again.restore : null;
      },
    });
    wireUndoToast(entryId, { message });
  }

  // Coin re-arm — mis-tap recovery WITHOUT a button (owner-ratified 2026-07-03):
  // tapping a SPENT economy coin sends that slot back to available, in place, with
  // a 5s undo toast (the same immediate-commit-with-undo idiom). It re-arms the
  // ECONOMY DISPLAY through the store's own primitives (`deselectSlot` /
  // `resetReaction`) — the RESOURCE (spell slot / tracker) is refunded by the
  // per-spend undo toast that fires the moment you commit, so the two affordances
  // split cleanly: the coin frees the economy slot, the spend toast un-casts. An
  // OPEN coin keeps its board-filter tap; only a spent coin re-arms.
  function rearmSlot(slot: "action" | "bonus") {
    // On the session undo stack (the reversal contract) — a turn-scoped entry
    // like the commits it un-marks, so ⌘Z / the standing control reach it and
    // the turn-start fence purges it with the rest of the turn's economy acts.
    registerUndoableToast(
      { message: t("combat.coinRearmed", { slot: t(`combat.${slot}`) }) },
      () => {
        const store = useCombatStore.getState();
        const snapshot = [...store.selected[slot]];
        if (snapshot.length === 0) return null; // nothing to re-arm — legal bail
        // ATTACK-PIPS — re-arming the Action coin also clears the swing counter
        // (deselectSlot resets it with the released Attack-group entries); snapshot
        // it so undo restores the exact prior pip progress alongside the slot.
        const prevAttacksUsed = store.attacksUsed;
        const prevAttackSwingIds = [...store.attackSwingIds];
        store.deselectSlot(slot);
        return () => {
          const s = useCombatStore.getState();
          // STALE-UNDO guard — if the player already re-spent the re-armed slot
          // (a new swing/commit occupies it), restoring the snapshot would
          // silently collide AND clobber the live swing counter (losing the new
          // swing). The re-occupied slot means the rearm was superseded: no-op.
          if (s.selected[slot].length > 0) return;
          for (const a of snapshot) s.selectAction(a);
          if (slot === "action")
            useCombatStore.setState({
              attacksUsed: prevAttacksUsed,
              // Restore the exact Attack-group occupant ledger with the swings.
              attackSwingIds: prevAttackSwingIds,
            });
        };
      },
      { turnScoped: true }
    );
  }

  function rearmReaction() {
    registerUndoableToast(
      { message: t("combat.coinRearmed", { slot: t("combat.reaction") }) },
      () => {
        const store = useCombatStore.getState();
        if (!store.reactionUsed) return null; // already armed — legal bail
        // Snapshot the occupant id so undo restores the EXACT reaction that spent
        // the round's Reaction (its card keeps the ring), not just the boolean.
        const prevReactionId = store.reactionUsedId;
        store.resetReaction();
        return () =>
          useCombatStore.setState({
            reactionUsed: true,
            reactionUsedId: prevReactionId,
          });
      },
      { turnScoped: true }
    );
  }

  // End Combat (SOLO only — the band hides it in an encounter, where the DM ends
  // fights from the hub). Behind the app's standard ConfirmDialog, whose body
  // states the exact scope: round → 1, economy re-armed, movement refilled,
  // initiative cleared — and NOTHING else (the Action Log keeps its own Clear;
  // conditions, concentration, HP, and death saves are untouched). `endCombat`
  // touches only the combat-turn store, so that scope holds by construction.
  async function endCombat() {
    const ok = await useConfirmStore.getState().confirm({
      title: t("combat.endCombatConfirmTitle"),
      message: t("combat.endCombatConfirmBody"),
      confirmLabel: t("combat.endCombat"),
      cancelLabel: t("common.cancel"),
      tone: "warning",
    });
    if (!ok) return;
    useCombatStore.getState().endCombat();
  }

  // Engine-derived initiative bonus (DEX + Alert(PB) + exhaustion + grant bonus
  // e.g. Gloom Stalker Dread Ambusher = +WIS). Memoized on the inputs that feed
  // it so combat ticks (round / movement / selection) don't re-evaluate grants.
  //
  // Routes the DEX read through the CANONICAL combat-math chokepoint
  // (`aggregateCharacterGrants` → `effectiveAbilityScores`), the SAME path
  // CombatHeader + the PDF view use — so set-score floors AND attuned magic-item
  // ability bonuses (+2 DEX item) fold into the displayed initiative total instead
  // of reading the raw stored DEX (golden rule 6: one chokepoint, no per-surface
  // divergence; with no such item the floor/bonus are empty → identical result).
  const charData = character?.character;
  const initBonus = useMemo(() => {
    if (!charData) return 0;
    if (charData.initiativeBonusOverride != null) return charData.initiativeBonusOverride;
    const effectivePB = effectiveProficiencyBonus(
      totalLevel(charData),
      charData.proficiencyBonusOverride
    );
    const hasAlertFeat = characterHasFeat("alert", {
      humanOriginFeat: charData.humanOriginFeat,
      bgFeat: charData.bgFeat,
      features: charData.features,
    });
    const initAgg = aggregateCharacterGrants(charData, {
      activeFeatures,
      grantBundleChoices,
    });
    const effectiveScores = effectiveAbilityScores(
      charData.abilityScores,
      initAgg.abilityScoreFloors,
      initAgg.itemAbilityScoreBonus,
      initAgg.itemAbilityScoreCap
    );
    const initiativeGrantBonus =
      initAgg.initiativeBonusFlat +
      initAgg.initiativeBonusAbilities.reduce(
        (sum, a) => sum + abilityModifier(effectiveScores[a]),
        0
      );
    return computeInitiative(
      effectiveScores.DEX,
      effectivePB,
      hasAlertFeat,
      exhaustion,
      initiativeGrantBonus
    );
  }, [charData, exhaustion, activeFeatures, grantBundleChoices]);

  if (!character || !charData) return null;

  // The shown roll: in an encounter, the campaign's `encounterInit` row (live — a DM
  // rolling FOR this player re-syncs it here in the same snapshot every surface gets);
  // solo, the combat store's raw d20 string. Two facts, two homes, one widget — a prior
  // fight can never pre-fill (a fresh fight starts with an EMPTY table by construction).
  const initShownRoll = gc
    ? gc.initiativeRoll
    : initiative === ""
      ? null
      : parseInt(initiative, 10);

  // End Turn is inert both when the shared pointer is on SOMEONE ELSE (`waiting` — the
  // transaction would reject it; you can only end your OWN turn) AND before turns begin
  // (`gathering` — there is no turn to end yet; the one call to action there is rolling
  // initiative). The band wears its quiet inert treatment in both; solo / your-turn keep the
  // live meter. The reaction coin carves back to live in `waiting` only (RAW off-turn
  // reactions), driven by `data-phase` in folio.css.
  const endTurnInert = phase === "waiting" || phase === "gathering";

  // Start-of-turn regen riders (`regen-at-turn-start` — Champion Survivor's
  // Heroic Rally: 5+CON HP while Bloodied). AX exposure audit — the resolver
  // existed but nothing mounted it. Surface ONLY the currently-ACTIVE entries
  // (condition met) as a turn note; the player applies the heal themselves
  // (override-first, the engine never auto-heals).
  const activeRegens = resolveStartOfTurnRegen(character).filter((r) => r.active);

  // Round-1 save-gated damage-doubler notes (Assassin Death Strike): a DISPLAY-ONLY
  // reminder shown ONLY in combat round 1 (the same round-1 gate Assassinate's
  // attack advantage uses). The DC is engine-resolved; the app never doubles nor
  // rolls (golden rule 21) — the DM/player runs the target's save externally.
  const round1Doubles = round === 1 ? resolveRound1DamageDoubles(character) : [];

  // S8 ONE-TAP — commit a start-of-turn regen's DETERMINISTIC amount (5+CON, no
  // dice — golden rule 21) through the SAME store healing seam the manual HP
  // control uses (`applyHealing` clamps to effective max + logs the structured
  // `hp-heal` event), with an undoable heal toast (mirrors `useHpControls.
  // applyHeal`: snapshot prevHP → onUndo restores via the log-free `setHP`, so
  // undoing leaves no spurious second event). Override-first: the HP control stays
  // editable; this is just the one-tap shortcut so the player needn't re-type it.
  function applyRegen(amount: number) {
    // On the session undo stack (the reversal contract; Pattern B — the message
    // reads the clamped result). At full HP `applyHealing` changes nothing —
    // no entry, no toast, for a heal that didn't happen.
    const cs = useCharacterStore.getState();
    const prevHP = cs.character?.session.hp.current ?? 0;
    cs.applyHealing(amount);
    const nextHP = cs.character?.session.hp.current ?? prevHP;
    if (nextHP === prevHP) return;
    registerUndoableResult(
      { message: t("combat.hpHealToast", { val: amount, prev: prevHP, next: nextHP }) },
      () => useCharacterStore.getState().setHP(prevHP),
      () => applyRegen(amount)
    );
  }

  // TEMPORARY-HP variant (Heroism: spellcasting mod at the start of each turn).
  // DETERMINISTIC (CHA mod, no dice — golden rule 21) so it one-taps through the
  // store `gainTempHp` seam, where the MAX-WINS rule lives (temp HP don't stack);
  // undoable via the log-free `setTempHP` restore (mirrors PlayTab's temp-HP card).
  function applyTurnStartTempHp(amount: number) {
    // On the session undo stack (Pattern B — the message reads the max-wins
    // result). With equal-or-higher temp HP already up, nothing changed — no
    // entry, no toast.
    const cs = useCharacterStore.getState();
    const prevTemp = cs.character?.session.hp.temp ?? 0;
    cs.gainTempHp(amount);
    const nextTemp = cs.character?.session.hp.temp ?? prevTemp;
    if (nextTemp === prevTemp) return;
    registerUndoableResult(
      { message: t("combat.tempHpToast", { val: nextTemp }) },
      () => useCharacterStore.getState().setTempHP(prevTemp),
      () => applyTurnStartTempHp(amount)
    );
  }

  // Movement budget — the EFFECTIVE walking Speed in feet, spent in 5-ft
  // increments. Routed through the SAME `effectiveWalkingSpeedFt` chokepoint
  // CombatHeader + the PDF view use (golden rule 6 — one source, no per-surface
  // drift), so Mobile / Fast Movement / Roving / Boots of Speed (×2) / the
  // heavy-armor Strength penalty / exhaustion all fold in, override-first
  // (`speedOverride` pins it by hand). Passing the live combat `round` lets the
  // round-1-only bonus (Gloom Stalker Ambusher's Leap, +10 ft) surface on the
  // first turn's movement bar and auto-clear from round 2+. The MovementSlider
  // owns the segmented visual + the drag / arrow-key / type interaction; this just
  // feeds it the speed + used feet.
  const speedFt =
    charData.speedOverride ?? effectiveWalkingSpeedFt(character, getEquipment, round);
  // RA-09 — a committed Dash grants extra movement equal to Speed, so the turn's
  // movement budget is speed × (1 + dashes). The meter's total readout reflects
  // the extension (30 ft → 60 ft after one Dash); the base Speed is unchanged.
  const moveBudgetFt = speedFt * (1 + dashesThisTurn);

  // B1 — the single self-side condition resolver, read here for the two states
  // this meter owns: the movement slider (speedZero) + the concentration banner
  // (breaksConcentration). The save-medallion auto-fail mark reads the SAME
  // function in LeftHud. Derived FRESH from session.conditions; the slider stays
  // manually editable (override-first — a feature may let the player move anyway),
  // so the speed-0 state is an informational note, never a hard lock.
  const conditions = character.session.conditions;
  const conditionEffects = resolveConditionEffects(conditions);
  // The FIRST active condition that breaks concentration — names the cause on the
  // concentration banner note. (Speed-0's cause is NOT named on the movement
  // slider: it is carried solely by the "what's limiting you this turn" banner —
  // single source / DRY; the slider only shows a clean zeroed/locked readout.)
  const concBlockedReason = conditionEffects.breaksConcentration
    ? (conditions.find((id) => resolveConditionEffects([id]).breaksConcentration) ?? null)
    : null;

  // B3 — the single-glance "what's limiting you this turn" summary, composed
  // from the SAME memoized condition resolver + the netted attackRollState (from
  // PlayTab) + active exhaustion. Pure presenter (single source of truth — the
  // cause names re-derive from `resolveConditionEffects`, never re-stated).
  // Renders ONLY when ≥1 limiter is active (golden rule 19).
  const limiters = composeTurnLimiters({
    conditions,
    attackRollState,
    exhaustion,
    spellSlotCasts: spellSlotCastsThisTurn,
    locale,
  });
  const limiterText = (l: (typeof limiters)[number]): string => {
    // Branch on the STABLE limiter kind (golden rule 7 — ids, never labels);
    // each maps to its UI sentence key, the cause/abilities localized for it.
    switch (l.kind) {
      case "blockedEconomy":
        return t("combat.limiterBlockedEconomy", {
          slots: l.slots.map((s) => t(`combat.${s}`)).join(", "),
          cause: l.cause,
        });
      case "attackDisadvantage":
        return t("combat.limiterAttackDisadvantage", { cause: l.cause });
      case "speedZero":
        return t("combat.limiterSpeedZero", { cause: l.cause });
      case "autoFailSaves":
        return t("combat.limiterAutoFailSaves", {
          abilities: l.abilities.map((a) => t(`abilities.${a}_short`)).join("/"),
          cause: l.cause,
        });
      case "exhaustion":
        return t("combat.limiterExhaustion", { level: l.level });
      case "spellSlotLimit":
        return t("combat.limiterSpellSlotLimit", { n: l.count });
    }
  };

  // SR-only economy-token status: "Action: available" / "Action: spent on X".
  // `spentName === undefined` → available; "" → spent (no named action, e.g.
  // reaction); a string → spent on that action.
  const econStatus = (label: string, spentName: string | undefined): string => {
    if (spentName === undefined) {
      return t("combat.econStatusOpen", { slot: label });
    }
    if (spentName) {
      return t("combat.econStatusSpentOn", {
        slot: label,
        name: spentName,
      });
    }
    return t("combat.econStatusSpent", { slot: label });
  };

  // B6 — SR-only status for a BUDGETED slot (action/bonus): names how many of the
  // turn's slots are spent ("Action: 1 of 2 used"). At budget 1 it reads as the
  // familiar open/spent line (0/1 → open, 1/1 → spent), so single-slot characters
  // are unchanged; at budget 2+ it announces the count.
  const econStatusBudgeted = (label: string, used: number, total: number): string => {
    if (used >= total) return t("combat.econStatusSpent", { slot: label });
    if (used === 0) return t("combat.econStatusOpen", { slot: label });
    return t("combat.econStatusBudget", { slot: label, used, total });
  };

  // BG3 grammar (owner ruling 2026-07-09): the Action coin behaves like ANY action
  // — it spends fully on the FIRST swing, no partial state, no segmented ring. The
  // "attacks remaining" fact lives on the weapon/War-Magic CARDS (PlayTab) and the
  // board group header, never on the coin. Extra Attack (`attackBudget`) is still
  // read here only to drive the count badge via the ordinary `budget` path.
  const actionSlotFull = selected.action.length >= budget.action;
  const actionState: "open" | "spent" = actionSlotFull ? "spent" : "open";

  return (
    <div>
      {/* ── Turn bar / action-economy meter (the heart of combat, §3.1) ──
          Round ring · Initiative · 4 depleting tokens · gilded End Turn. */}
      {/* BUG 2 — `data-phase` drives the not-your-turn (`waiting`) treatment: on End Turn the
          band flips to waiting IMMEDIATELY (optimistic status), dimming + inerting the economy
          and quieting End Turn on `--ease-settle` so the hand-off is unmistakable on the SHEET
          (the pip carries whose-turn; this makes the meter respond too). */}
      <div className="turn" data-phase={inEncounter ? phase : undefined}>
        <div className="round">
          <span className="r-lbl">{t("combat.round")}</span>
          <span className="r-ring tnum">
            {/* Keyed on the round so each advance remounts → a light tick animation. */}
            <span key={round} className="r-num">
              {round}
            </span>
          </span>
        </div>
        {/* TB4 — ONE init-entry widget app-wide: the SHARED roll-to-total InitVital
            (the same tile the encounter + the global pip use), so the sheet and the
            encounter write + show the SAME raw d20 ROLL. NO DICE (constitution 2.2):
            the player types their physical d20; the engine-derived BONUS (the 6b
            chokepoint value) is added to display the total. Committing routes through
            `rollInitiative`: in an ENCOUNTER it writes the campaign's `encounterInit`
            row (the initiative SSOT — same doc the card + pip write); SOLO it writes
            `combatStore.initiative`, which TurnEconomyProvider persists to the
            `combat/state` subdoc. The S4 tracker top-ups fire on the first roll of a
            fight either way. */}
        <div className="init">
          <InitVital
            value={initShownRoll}
            bonus={initBonus}
            canEdit={!initLocked && !readonly}
            name={charData.name}
            urgent={inEncounter && !initLocked && initShownRoll === null}
            onCommit={(roll) => rollInitiative(roll === null ? "" : String(roll))}
          />
        </div>

        <div className="econ" role="group" aria-label={t("combat.economy")}>
          {/* Action — B6: a COUNT when the budget exceeds 1 (Action Surge /
              Haste → "Action 1/2"); "spent" only once every slot is filled. */}
          <EconToken
            kind="action"
            state={actionState}
            icon={Swords}
            caption={t("combat.action")}
            used={selected.action.length}
            total={budget.action}
            spentName={selected.action.map((a) => a.name).join(" · ") || null}
            statusLabel={econStatusBudgeted(
              t("combat.action"),
              selected.action.length,
              budget.action
            )}
            onFilter={onFilterByType ? () => onFilterByType("action") : undefined}
            filterActive={activeFilter === "action"}
            filterLabel={t("combat.filterMeterByType", { type: t("combat.action") })}
            onRearm={() => rearmSlot("action")}
            rearmLabel={t("combat.rearmSlot", { slot: t("combat.action") })}
          />
          {/* Bonus */}
          <EconToken
            kind="bonus"
            state={selected.bonus.length >= budget.bonus ? "spent" : "open"}
            icon={Zap}
            caption={t("combat.bonus")}
            used={selected.bonus.length}
            total={budget.bonus}
            spentName={selected.bonus.map((a) => a.name).join(" · ") || null}
            statusLabel={econStatusBudgeted(
              t("combat.bonus"),
              selected.bonus.length,
              budget.bonus
            )}
            onFilter={onFilterByType ? () => onFilterByType("bonus") : undefined}
            filterActive={activeFilter === "bonus"}
            filterLabel={t("combat.filterMeterByType", { type: t("combat.bonus") })}
            onRearm={() => rearmSlot("bonus")}
            rearmLabel={t("combat.rearmSlot", { slot: t("combat.bonus") })}
          />
          {/* Reaction — same pure-filter token as Action/Bonus (owner verdict,
              2026-06-11: "It should behave just like them"). SPENDING the
              reaction lives on the action list — a reaction card's React CTA, or
              the off-list "Mark used" row in the reaction-filtered board. The
              disc dims (spent) when the reaction is committed, exactly like the
              Action/Bonus discs. */}
          <EconToken
            kind="reaction"
            state={reactionUsed ? "spent" : "open"}
            icon={RefreshCw}
            caption={t("combat.reaction")}
            statusLabel={econStatus(t("combat.reaction"), reactionUsed ? "" : undefined)}
            onFilter={onFilterByType ? () => onFilterByType("reaction") : undefined}
            filterActive={activeFilter === "reaction"}
            filterLabel={t("combat.filterMeterByType", { type: t("combat.reaction") })}
            onRearm={rearmReaction}
            rearmLabel={t("combat.rearmSlot", { slot: t("combat.reaction") })}
          />
          {/* Movement — a DRAGGABLE 5-ft-snap slider (item d): drag the handle,
              arrow-key it, or type the remaining feet — every legal value is
              reachable all three ways. Keeps the carved segmented visual + the SR
              aria-valuetext meter reading. */}
          {/* Read-only: the movement meter stays a legible read-out but leaves
              the tab order and drops its tap/drag/type editing (inert) — the
              same idiom the HUD rails use. */}
          <span inert={readonly} className="contents">
            <MovementSlider
              speedFt={moveBudgetFt}
              usedFt={movementUsedFt}
              onChange={setMovementUsed}
              locale={locale}
              speedZero={conditionEffects.speedZero}
            />
          </span>
        </div>

        <button
          className="endturn"
          onClick={handleEndTurn}
          disabled={endTurnInert}
          aria-label={
            endTurnInert && currentActorName
              ? t("combat.waitingForActor", { actor: currentActorName })
              : undefined
          }
        >
          <span>{t("combat.endTurn")}</span>
          <Icon as={ArrowRight} decorative />
        </button>
        {/* End Combat — SOLO ONLY (owner-ratified 2026-07-03). In an encounter the DM
            ends the fight from the hub, so the band hides this entirely (`!inEncounter`)
            and shows End Turn alone. It is a quiet secondary control beside the gilded
            End Turn; behind the standard ConfirmDialog, whose body states the exact scope
            (round → 1, economy re-armed, movement refilled, initiative cleared — the log,
            conditions, concentration, HP, and death saves untouched). Mis-tap recovery
            needs no button: the economy coins re-arm in place (tap a spent coin). */}
        {!inEncounter && (
          <button type="button" className="end-combat" onClick={() => void endCombat()}>
            <Icon as={Flag} decorative />
            <span>{t("combat.endCombat")}</span>
          </button>
        )}
      </div>

      {/* Start-of-turn regen note — shown only while its condition holds
          (Bloodied + alive), right where the turn starts. */}
      {activeRegens.map((r) => (
        <div key={r.sourceId} className="conc-banner" role="status">
          <span className="conc-banner-mark" aria-hidden />
          <span className="conc-banner-text">
            {t(r.asTempHp ? "combat.turnStartTempHp" : "combat.turnStartRegen", {
              amount: r.amount,
              name: grantSourceLabel(r.sourceId, locale),
            })}
          </span>
          {/* S8 ONE-TAP — apply the deterministic amount in one tap (undoable),
              instead of re-typing it into the HP control. A temp-HP grant (Heroism)
              routes to the max-wins `gainTempHp` seam; a heal (Heroic Rally) to
              `applyHealing`. Reuses the existing `conc-banner-drop` button recipe
              (golden rule 3 — no new CSS). */}
          <button
            type="button"
            className="conc-banner-drop"
            onClick={() =>
              r.asTempHp ? applyTurnStartTempHp(r.amount) : applyRegen(r.amount)
            }
          >
            {t(
              r.asTempHp ? "combat.turnStartTempHpApply" : "combat.turnStartRegenApply",
              {
                amount: r.amount,
              }
            )}
          </button>
        </div>
      ))}

      {/* Round-1 Death Strike reminder — shown only in combat round 1. Display-only
          (the app models no enemy and never rolls); the DM/player runs the save. */}
      {round1Doubles.map((d) => (
        <div key={d.sourceId} className="conc-banner" role="status">
          <span className="conc-banner-mark" aria-hidden />
          <span className="conc-banner-text">
            {t("combat.round1DamageDouble", {
              dc: d.saveDC,
              ability: t(`abilities.${d.saveAbility}_short`),
              name: grantSourceLabel(d.sourceId, locale),
            })}
          </span>
        </div>
      ))}

      {/* USE-APPLIES (Task 2) — maintained-state keep/end prompt. At End Turn a
          Rage-style state whose maintenance condition wasn't met this round
          surfaces here: it STAYS active by default (the player may have
          maintained it off-app), with one-tap End (drop it) / Keep (dismiss).
          Never a silent kill — the app surfaces the decision, the player owns it. */}
      {maintenancePrompts.map((m) => (
        <div key={m.activeKey} className="conc-banner conc-banner-prompt" role="status">
          <span className="conc-banner-mark" aria-hidden />
          <span className="conc-banner-text">
            {t("combat.maintainedEndPrompt", {
              name: grantSourceLabel(m.sourceId, locale),
            })}
          </span>
          <button
            type="button"
            className="conc-banner-drop"
            onClick={() => endMaintainedEffect(m.activeKey)}
          >
            {t("combat.maintainedEndAction")}
          </button>
          <button
            type="button"
            className="conc-banner-keep"
            onClick={() => keepMaintainedEffect(m.activeKey)}
          >
            {t("combat.maintainedKeepAction")}
          </button>
        </div>
      ))}

      {/* Concentration banner — first-class combat state (§3.1, p01-combat):
          when concentrating, surface the spell + a one-tap drop control directly
          under the turn bar (not only as a rail status chip). */}
      {character.session.concentration && (
        <div
          className="conc-banner"
          data-blocked={concBlockedReason ? "" : undefined}
          role="status"
        >
          <span className="conc-banner-mark" aria-hidden />
          <span className="conc-banner-text">
            {t("combat.concentratingOn", {
              spell: concentrationLabel(character.session.concentration, locale),
            })}
            {/* B1 — an active condition (Incapacitated family) forbids holding
                Concentration: name the cause inline. Override-first — the drop
                control beside it lets the player end it; the engine never
                auto-drops on a condition toggle. */}
            {concBlockedReason && (
              <span className="conc-banner-note">
                {t("combat.concentrationBlockedNote", {
                  condition: conditionLabel(concBlockedReason, locale),
                })}
              </span>
            )}
          </span>
          <button
            type="button"
            className="conc-banner-drop"
            // #66 — `setConcentration("")` already emits the stopped-concentrating
            // toast WITH undo (the store generalises the immediate-commit-with-undo
            // contract to every destructive action). Dispatch it alone so dropping
            // concentration fires EXACTLY ONE toast (matches ResourceRail); a second
            // showToast here was the double-toast bug.
            onClick={() => useCharacterStore.getState().setConcentration("")}
          >
            {t("combat.clearConcentration")}
          </button>
        </div>
      )}

      {/* B3 — "what's limiting you this turn": a single-glance read-out of every
          active penalty (condition disadvantages / speed-0 / auto-fail saves /
          exhaustion), composed from the SAME condition resolver. Reuses the
          `.conc-banner` register (crimson `data-blocked` variant — these are
          penalties) as a sibling of the concentration banner, not a new recipe.
          Renders ONLY when ≥1 limiter is active (golden rule 19). Pure read-out:
          clearing the source condition / exhaustion empties it. */}
      {limiters.length > 0 && (
        <div
          className="conc-banner turn-limiters"
          data-blocked=""
          role="status"
          aria-label={t("combat.limitersLabel")}
        >
          <span className="conc-banner-mark" aria-hidden />
          <span className="conc-banner-text">
            {limiters.map(limiterText).join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * One economy token in the turn-bar meter (§3.1) — a STRUCK MEDALLION: a coined
 * bronze disc (reeded edge · an enamel inlay ring in the slot's action-type hue ·
 * the embossed lucide sigil) when AVAILABLE; it tarnishes dark when SPENT. The coin
 * material is pure CSS (`.econ-disc` recipe); the markup below is state-agnostic.
 *
 * The whole token (disc + caption) is ONE `<button>` with two tap meanings by
 * state (owner-reported dead circle, 2026-06-11: the coloured disc is the PERCEIVED
 * button, so it can never be a caption-only target under an inert circle):
 *  - OPEN → the action-board FILTER trigger (item e): narrows the Play board to
 *    this type's cards; `aria-pressed` reflects the active filter, wired to the
 *    SAME `filter` state the fchips drive (one source of truth).
 *  - SPENT → RE-ARM in place (owner-ratified 2026-07-03): sends the slot back to
 *    available with a 5s undo toast — mis-tap recovery without a button. SPENDING
 *    still happens on the action board (a card commit; reactions via the off-list
 *    "Mark used" row); only UN-spending lives on the coin.
 * The token grid already exceeds the 44px touch floor.
 */
function EconToken({
  kind,
  state,
  icon,
  caption,
  spentName,
  statusLabel,
  used,
  total,
  onFilter,
  filterActive,
  filterLabel,
  onRearm,
  rearmLabel,
}: {
  kind: "action" | "bonus" | "reaction";
  state: "open" | "spent";
  icon: typeof Swords;
  caption: string;
  spentName?: string | null;
  /** B6 — committed count in this slot this turn (for the "1/2" count badge). */
  used?: number;
  /** B6 — the slot's per-turn budget; a count badge shows only when total > 1. */
  total?: number;
  /** Filter the action board by this token's type (item e); omitted = no filter. */
  onFilter?: () => void;
  /** Whether the board is currently filtered to this token's type. */
  filterActive?: boolean;
  /** Accessible label for the whole-token filter trigger. */
  filterLabel?: string;
  /** SR-only composed status, e.g. "Action: spent on Hypnotic Pattern" — the
   *  open/spent state is otherwise CSS-only (WCAG 1.3.1 / 4.1.2). */
  statusLabel: string;
  /** Re-arm this slot in place (fires only when SPENT); omitted = no re-arm. */
  onRearm?: () => void;
  /** Accessible label for the re-arm action (spent state). */
  rearmLabel?: string;
}) {
  // The spent action's name is ON-DEMAND detail (a tooltip on the disc), not a
  // cramped per-token line — that line truncated long IT names ("Scarica di Adre…")
  // and cluttered the strip. The disc's lit/voided state is the at-a-glance info; the
  // name reads on hover, and SR users get it from the status label below.
  const discTitle = state === "spent" && spentName ? spentName : undefined;

  // B6 — a "1/2" count badge appears ONLY when the slot's budget exceeds 1 (an
  // active Action Surge / Haste); a default single-slot token is visually
  // unchanged (golden rule 19 — the badge earns its place only when it informs).
  const countBadge =
    total != null && total > 1 ? (
      <span className="econ-count tnum" aria-hidden>
        {used ?? 0}/{total}
      </span>
    ) : null;

  // A SPENT coin re-arms; an OPEN coin filters. The sr-only status hangs off
  // `aria-describedby` because the button's aria-label overrides name-from-content
  // (the slot status would otherwise be silent to SR users). Re-arm is an ACTION,
  // not a toggle, so it drops `aria-pressed`.
  const rearmable = state === "spent" && !!onRearm;
  const statusId = `econ-status-${kind}`;
  return (
    <button
      type="button"
      className="econ-tok econ-tok-filter"
      data-kind={kind}
      data-state={state}
      aria-pressed={rearmable ? undefined : onFilter ? !!filterActive : undefined}
      aria-label={rearmable ? rearmLabel : filterLabel}
      aria-describedby={statusId}
      onClick={() => {
        if (state === "spent" && onRearm) onRearm();
        else onFilter?.();
      }}
    >
      <span className="econ-disc" title={discTitle}>
        <Icon as={icon} decorative />
        {countBadge}
      </span>
      <span className="econ-cap econ-cap-filter">{caption}</span>
      <span id={statusId} className="sr-only">
        {statusLabel}
      </span>
    </button>
  );
}
