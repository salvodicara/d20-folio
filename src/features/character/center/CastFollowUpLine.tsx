/**
 * The optional follow-up line under a used card (owner 2026-10-11, "B"): "Aria +__ HP",
 * "Goblin −__ HP", "Goblin: failed the save? → Paralyzed", "+__ temp HP". Filling a row
 * applies it and writes one session-log line; ignoring it changes nothing. Never a
 * modal, never in the Undo toast.
 *
 * Where a filled row lands:
 *  - me → the sheet's own HP / condition seams (undoable like the HP popover); the
 *    line those seams log is tagged with the action as its source;
 *  - another PC in the live encounter → the same peer combat write the campaign PC
 *    card uses, then an `effect-given` log line;
 *  - a monster → only the `effect-given` log line (players cannot write monster HP).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { useLocale } from "@/hooks/useLocale";
import type { LocText } from "@/lib/loc-text";
import type { CastFollowUp } from "@/lib/play/cast-follow-ups";
import { conditionLabel } from "@/lib/views/tracker-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { CombatEvent } from "@/types/combat-log";

import { useCastFollowUpStore } from "./cast-follow-up-store";

type SelfKind = "hp-heal" | "hp-damage" | "temp-hp-gain" | "condition-gain";

/** Tag the line a self seam just logged with the action that caused it, so the
 *  session gets ONE line carrying target, amount and source. */
function tagNewLine(before: ReadonlySet<string>, kind: SelfKind, source: LocText): void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.findLast(
    (e) => !before.has(e.id) && e.event.kind === kind
  );
  if (entry) store.amendLogEntry(entry.id, { ...entry.event, source } as CombatEvent);
}

function logIds(): Set<string> {
  return new Set(
    useCharacterStore.getState().character?.session.logEntries.map((e) => e.id) ?? []
  );
}

export function CastFollowUpLine({ actionId }: { actionId: string }) {
  const offer = useCastFollowUpStore((s) => s.offer);
  const characterId = useCharacterStore((s) => s.character?.id);
  if (!offer || offer.actionId !== actionId || offer.characterId !== characterId)
    return null;
  return (
    <div data-testid="cast-follow-up" className="px-3 pb-2">
      {offer.items.map((item) => (
        <FollowUpRow
          key={`${item.kind}:${item.targetId}`}
          item={item}
          source={offer.source}
        />
      ))}
    </div>
  );
}

function FollowUpRow({ item, source }: { item: CastFollowUp; source: LocText }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const hp = useHpControls();
  const [amount, setAmount] = useState("");
  const selfName = useCharacterStore((s) => s.character?.character.name ?? "");
  const status = useCombatStatusStore((s) => s.status);
  const uid = useAuthStore((s) => s.user?.uid);
  // The same "me" the commit used (TurnEconomyProvider.selfCombatantId).
  const selfId = status?.myId ?? (uid ? `pc-${uid}` : "self");
  const row: EncounterCombatantView | undefined = status?.view.rows.find(
    (r) => r.id === item.targetId
  );
  const self = item.targetId === selfId;
  const name = self ? selfName : (row?.name ?? "");
  const done = () => useCastFollowUpStore.getState().done(item);

  const giveToOther = (
    event: Omit<
      Extract<CombatEvent, { kind: "effect-given" }>,
      "kind" | "target" | "targetName"
    >
  ) => {
    const log = () =>
      useCharacterStore.getState().logEvent({
        kind: "effect-given",
        target: item.targetId,
        targetName: name,
        source,
        ...event,
      });
    const memberUid = row?.kind === "pc" ? row.memberUid : undefined;
    const charId = row?.kind === "pc" ? row.characterId : undefined;
    if (!row || !memberUid || !charId) {
      log();
      return;
    }
    const mutation =
      event.effect === "condition"
        ? {
            kind: "condition" as const,
            operation: { kind: "add" as const, conditionId: event.conditionId ?? "" },
          }
        : event.effect === "temp-hp"
          ? { kind: "temp-hp" as const, value: Math.max(row.tempHp, event.amount ?? 0) }
          : {
              kind: "hp" as const,
              operation: {
                kind: event.effect === "heal" ? ("heal" as const) : ("damage" as const),
                amount: event.amount ?? 0,
              },
            };
    void import("@/features/campaigns/campaign-io")
      .then(({ writeCampaignCombatEffect }) =>
        writeCampaignCombatEffect(memberUid, charId, null, row.maxHp, mutation)
      )
      .then(log)
      .catch((error: unknown) => {
        console.error("Combat write failed", error);
        useToastStore
          .getState()
          .showToast({ message: t("campaignHub.combatWriteFailed"), duration: 6000 });
      });
  };

  const applyAmount = () => {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0 || item.kind === "condition") return;
    if (self) {
      const before = logIds();
      if (item.kind === "heal") hp.applyHeal(n);
      else if (item.kind === "temp-hp") hp.applyTemp(n);
      else hp.handleApplyDamage([{ amount: n }]);
      tagNewLine(
        before,
        item.kind === "heal"
          ? "hp-heal"
          : item.kind === "temp-hp"
            ? "temp-hp-gain"
            : "hp-damage",
        source
      );
    } else {
      giveToOther({ effect: item.kind, amount: n });
    }
    done();
  };

  const applyCondition = (conditionId: string) => {
    if (self) {
      const before = logIds();
      useCharacterStore.getState().addCondition(conditionId);
      tagNewLine(before, "condition-gain", source);
    } else {
      giveToOther({ effect: "condition", conditionId });
    }
    done();
  };

  if (item.kind === "condition") {
    const choices = item.pickOne
      ? item.conditionIds.map((id) => [id])
      : [item.conditionIds];
    return (
      <div className="heal-roll-entry">
        <span className="heal-roll-label">
          {t("combat.followUpSave", { target: name })}
        </span>
        {choices.map((ids) => (
          <Button
            key={ids.join("+")}
            variant="secondary"
            size="sm"
            onClick={() => ids.forEach(applyCondition)}
          >
            → {ids.map((id) => conditionLabel(id, locale)).join(" + ")}
          </Button>
        ))}
      </div>
    );
  }

  const labelKey =
    item.kind === "heal"
      ? "combat.followUpHeal"
      : item.kind === "temp-hp"
        ? "combat.followUpTempHp"
        : "combat.followUpDamage";
  return (
    <div className="heal-roll-entry">
      <span className="heal-roll-label">{t(labelKey, { target: name })}</span>
      <span className="w-16 shrink-0">
        <Input
          type="number"
          min="1"
          inputMode="numeric"
          className="sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          aria-label={t(labelKey, { target: name })}
        />
      </span>
      <Button variant="secondary" size="sm" onClick={applyAmount}>
        {t("combat.apply")}
      </Button>
    </div>
  );
}
