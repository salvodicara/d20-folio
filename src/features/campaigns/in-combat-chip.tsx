/**
 * InCombatStatus — the cockpit's own-turn campaign control, beneath the Play-tab turn meter.
 * When the OPEN character is a PC whose campaign encounter has reached the player's OWN turn,
 * it surfaces the shared CAMPAIGN turn-advance controls (distinct from the local End Turn).
 *
 * **It renders BESIDE the turn meter on the Play tab** (TB1), not in the identity header
 * (golden rule 6 — combat controls live with the combat economy). The ROUND and the
 * roll-to-total INITIATIVE are owned by the turn meter ({@link "@/features/character/center/ThisTurnTracker"})
 * — the single combat-round display + the one shared {@link InitVital} entry — so this
 * region NEVER duplicates them (TB3/TB4 single-source).
 *
 * **No status/link badge (the pip is the signal).** The global topbar combat pip is now the
 * single combat SIGNAL *and* the switch back to the encounter, so the former decorative
 * "in combat" / "your turn" / "gathering" badges and the reciprocal hub link are dropped here
 * (they duplicated the pip). This region carries ONLY the own-turn action surface.
 *
 * **ONE shared live source (INIT-2).** It reads the SHELL-level
 * {@link useGlobalCombat} context — the single `subscribeToSharedCampaigns` listener that
 * also feeds the global topbar pip — instead of its own one-shot `listSharedCampaigns`
 * read (which never re-fired when an encounter started). So the sheet and the pip can
 * never disagree on round / turn / whose-turn (golden rule 6), and a sheet not in combat
 * pays zero extra reads (the shell owns the listener).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { advanceEncounterTurn } from "@/features/campaigns/campaign-io";
import { useSheetCombat } from "@/features/character/center/turn-state";
import { EncounterTurnControls } from "@/features/campaigns/party-encounter";

export function InCombatStatus() {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const showToast = useToastStore((s) => s.showToast);
  // The shell-level live combat status, SCOPED to the OPEN character (null = this hero is not
  // in combat — including a second hero of the same user whose OTHER hero is in a fight).
  const gc = useSheetCombat();
  // Disarm while an advance is in flight (double-click UX half; CAS is the correctness half).
  const [advancing, setAdvancing] = useState(false);

  if (!gc) return null;

  const { campaignId, view, isMyTurn, gathering } = gc;

  function advance(dir: "next" | "prev"): void {
    if (advancing) return;
    setAdvancing(true);
    // The transaction reads the FROZEN `order` off the encounter doc — no orderedIds param.
    // `view.currentId` is the pointer seen — the CAS aborts a stale double-click.
    void advanceEncounterTurn(campaignId, dir, { uid, isDm: false }, view.currentId)
      .catch((e: unknown) => {
        // The turn pointer is a CAMPAIGN-doc write (currentCombatantId + round), NOT the
        // per-hero combat-state subdoc — so a failure here is NEVER a combat-state
        // grant. Surface an honest turn-scoped message, never the "DM access out of date"
        // combat-state toast (which would mislabel a transient turn-advance error).
        console.error("Turn-advance write failed", e);
        showToast({ message: t("campaignHub.turnAdvanceFailed"), duration: 5000 });
      })
      .finally(() => setAdvancing(false));
  }

  // Turn-advance is offered ONLY on the player's OWN turn (once turns begin); it writes the
  // shared `campaign.encounter.{currentCombatantId, round}` via the scoped transaction.
  // Before turns begin (gathering) or on another combatant's turn there is nothing to show —
  // the pip carries the live combat signal + the jump back to the encounter.
  if (gathering || !isMyTurn) return null;

  return (
    <div className="mt-2">
      <EncounterTurnControls
        canAdvance
        empty={view.turnOrderIds.length === 0}
        pending={advancing}
        onPrev={() => advance("prev")}
        onNext={() => advance("next")}
      />
    </div>
  );
}
