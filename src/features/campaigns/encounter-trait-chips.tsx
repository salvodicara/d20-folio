/**
 * encounter-trait-chips — the DM's at-a-glance read of a bestiary monster's
 * table-changing traits (Magic Resistance, Pack Tactics, Regeneration, …) on its
 * encounter card, plus the one-tap Regeneration heal at that monster's turn
 * start. A LAZY seam file (like `encounter-bestiary.tsx`): it statically reads
 * the corpus (`getMonster`), so `party-encounter.tsx` reaches it only through a
 * dynamic `import("./encounter-trait-chips")` (eager-partition guard).
 */
import { HeartPulse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { getMonster } from "@/data/monsters";
import type { MonsterTraitFact } from "@/data/types";
import type { EncounterMonster } from "@/types/campaign";
import { useCampaignStore } from "./campaignStore";
import {
  applyRegeneration,
  regeneratedThisRound,
  regenerationDue,
  regenerationOffer,
  traitFactLabel,
} from "./encounter-trait-facts";
import type { ApplyFn } from "./party-encounter";

export function EncounterTraitChips({
  monster,
  campaignId,
  isCurrent,
  apply,
}: {
  monster: EncounterMonster;
  campaignId: string;
  isCurrent: boolean;
  apply: ApplyFn;
}) {
  const { t } = useTranslation();
  const regenerated = useCampaignStore((s) => {
    const encounter = s.campaign?.encounter;
    return encounter ? regeneratedThisRound(encounter, monster.id) : false;
  });
  const block = monster.srdId ? getMonster(monster.srdId) : undefined;
  const facts: MonsterTraitFact[] = (block?.traits ?? []).flatMap((entry) =>
    entry.kind === "narrative" && entry.fact ? [entry.fact] : []
  );
  if (facts.length === 0) return null;
  const regeneration = facts.find(
    (fact): fact is Extract<MonsterTraitFact, { kind: "regeneration" }> =>
      fact.kind === "regeneration"
  );
  const offer =
    regeneration && regenerationDue(monster, regeneration, isCurrent) && !regenerated
      ? regenerationOffer(monster, regeneration)
      : null;
  const label = (fact: MonsterTraitFact) =>
    traitFactLabel(fact, (key, args) => t(key, args));

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t("monster.trait.factsLabel")}
    >
      {offer !== null && regeneration && (
        <Button
          variant="secondary"
          size="sm"
          title={
            regeneration.suppressedBy
              ? t("monster.trait.regenerateHint", {
                  types: regeneration.suppressedBy
                    .map((type) => t(`srd.damage_${type}`))
                    .join(` ${t("create.sizeOr")} `),
                })
              : undefined
          }
          onClick={() =>
            apply((e) => applyRegeneration(e, campaignId, monster.id, offer))
          }
        >
          <Icon as={HeartPulse} size="sm" decorative />
          {t("monster.trait.regenerate", { amount: offer })}
        </Button>
      )}
      {/* Sentence-case pills that WRAP (a trait line is a phrase, never truncated —
          the uppercase `.badge` atom is nowrap and clipped on a phone). */}
      {facts.map((fact, index) => (
        <span
          key={index}
          className="rounded-md border border-border-subtle px-2 py-0.5 text-xs leading-snug text-text-muted"
        >
          {label(fact)}
        </span>
      ))}
    </div>
  );
}
