/**
 * MonsterArtHeader (Part B) — the portrait row atop a bestiary monster's detail leaf
 * (compendium + the encounter picker's SRD detail). Shows the user's per-monster
 * portrait OVERRIDE (keyed by `srdId`) through the shared {@link MonsterPortraitPanel},
 * over the creature-type glyph default; hovering the seal reveals the upload affordance.
 *
 * Reads the live override off `libraryStore.monsterArt[srdId]`, so setting art here
 * updates every surface at once — and, because `toMonsterInput` copies it, every future
 * encounter add of this monster carries the face (one source of truth, golden rule 6).
 */

import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useLibraryStore } from "@/stores/libraryStore";
import type { CreatureType } from "@/data/types";

// The portrait editor pulls the crop UI (react-easy-crop) — load it lazily so the
// statblock detail (the common read) doesn't carry the crop lib until it paints.
const MonsterPortraitPanel = lazy(() =>
  import("@/components/shared/MonsterPortraitPanel").then((m) => ({
    default: m.MonsterPortraitPanel,
  }))
);

export function MonsterArtHeader({
  srdId,
  name,
  creatureType,
}: {
  srdId: string;
  name: string;
  creatureType: CreatureType;
}) {
  const { t } = useTranslation();
  const art = useLibraryStore((s) => s.monsterArt[srdId]);

  return (
    <div className="mb-4 flex items-center gap-4">
      <Suspense fallback={<span className="seal h-20 w-20 shrink-0" aria-hidden />}>
        <MonsterPortraitPanel
          target={{ kind: "srd", srdId }}
          portraitUrl={art?.portraitUrl ?? null}
          portraitCrop={art?.portraitCrop ?? null}
          name={name}
          seed={srdId}
          creatureType={creatureType}
          className="h-20 w-20"
        />
      </Suspense>
      <p className="text-xs leading-snug text-text-secondary">
        {art ? t("monster.portrait.hintSet") : t("monster.portrait.hint")}
      </p>
    </div>
  );
}
