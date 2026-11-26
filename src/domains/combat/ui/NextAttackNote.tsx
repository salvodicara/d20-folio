/**
 * A creature's own next attack roll has Disadvantage (or Advantage) from a one-shot
 * state on it: Ray of Enfeeblement on a success, Sap, Vicious Mockery (SRD 5.2.1).
 * The player's Play screen says it for their character, the DM's fight screen for a
 * monster, and «Used» spends it once the attack is rolled at the table (revoked, with
 * an undo that reinstates it). Pattern source: Help's «Usato» note (HelpedCheck), the
 * effect-driven roll modifier Foundry and Roll20 show on the next roll.
 */
import { useTranslation } from "react-i18next";

import {
  nextAttackNotes,
  type NextAttackNote,
} from "@/domains/combat/next-attack-note-view";
import {
  reinstatePersistentCombatEffect,
  revokePersistentCombatEffect,
} from "@/features/campaigns/campaign-io";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { useToastStore } from "@/stores/toastStore";
import type { CombatEffectOp } from "@/types/combat-effect";
import { Button } from "@/ui";

/** A state's source by name: a spell, a class feature or a weapon mastery (Sap). */
function sourceName(source: NextAttackNote["sources"][number], locale: Locale): string {
  const [kind, key] =
    source.kind === "spell"
      ? (["spell", source.id] as const)
      : source.id.startsWith("mastery-")
        ? (["weapon-mastery", source.id.slice("mastery-".length)] as const)
        : (["class-feature", source.id] as const);
  return hasSrd(kind, key, "name", locale) ? localizeSrd(kind, key, "name", locale) : "";
}

export function NextAttackNotes({
  campaignId,
  effectOps,
  targetIds,
  nameOf,
  locale,
}: {
  campaignId: string;
  effectOps: ReadonlyArray<CombatEffectOp> | undefined;
  targetIds: ReadonlyArray<string>;
  /** The DM's view: each note names its creature («Goblin: …»). Absent: the
   *  player's own character («your next attack roll»). */
  nameOf?: (combatantId: string) => string;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const notes = nextAttackNotes(effectOps, targetIds);
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((note) => {
        const mode = t(
          note.mode === "advantage" ? "common.advantage" : "common.disadvantage"
        );
        const sources = [
          ...new Set(note.sources.map((s) => sourceName(s, locale)).filter(Boolean)),
        ].join(", ");
        const line = nameOf
          ? t("fight.nextAttack.theirs", { name: nameOf(note.targetId), mode, sources })
          : t("fight.nextAttack.mine", { mode, sources });
        const use = () => {
          for (const id of note.effectIds)
            void revokePersistentCombatEffect(campaignId, id);
          useToastStore.getState().showToast({
            message: t("fight.nextAttack.usedToast", { mode }),
            duration: 6000,
            onUndo: () => {
              for (const id of note.effectIds)
                void reinstatePersistentCombatEffect(campaignId, id);
            },
          });
        };
        return (
          <div
            key={note.targetId}
            className="f-note f-suggest"
            data-c={note.mode === "advantage" ? "buff" : "cond"}
            role="group"
            aria-label={t("fight.nextAttack.title")}
          >
            <p>{line}</p>
            <Button onClick={use}>{t("play.help.used")}</Button>
          </div>
        );
      })}
    </>
  );
}
