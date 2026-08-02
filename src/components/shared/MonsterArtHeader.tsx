/**
 * MonsterArtHeader (Part B) — the per-monster portrait OVERRIDE seal for a bestiary
 * monster's detail leaf (compendium + the encounter picker's SRD detail). It is seated
 * in the stat block's top-right slot ({@link MonsterStatBlockCard}'s `portrait` prop),
 * beside the ability table. Shows the user's portrait (keyed by `srdId`) through the
 * shared {@link MonsterPortraitPanel}, over the tinted-initial default. The seal IS the
 * affordance — hovering/clicking reveals the same upload/edit menu the character seal
 * uses; there is no standing instructional caption.
 *
 * Reads the live override off `libraryStore.monsterArt[srdId]`, so setting art here
 * updates every surface at once — and, because `toMonsterInput` copies it, every future
 * encounter add of this monster carries the face (one source of truth, golden rule 6).
 */

import { lazy, Suspense } from "react";
import { useLibraryStore } from "@/stores/libraryStore";

// The portrait editor pulls the crop UI (react-easy-crop) — load it lazily so the
// statblock detail (the common read) doesn't carry the crop lib until it paints.
const MonsterPortraitPanel = lazy(() =>
  import("@/components/shared/MonsterPortraitPanel").then((m) => ({
    default: m.MonsterPortraitPanel,
  }))
);

export function MonsterArtHeader({ srdId, name }: { srdId: string; name: string }) {
  const art = useLibraryStore((s) => s.monsterArt[srdId]);

  return (
    <Suspense fallback={<span className="seal mon-portrait-seal" aria-hidden />}>
      <MonsterPortraitPanel
        target={{ kind: "srd", srdId }}
        portraitUrl={art?.portraitUrl ?? null}
        portraitCrop={art?.portraitCrop ?? null}
        name={name}
        seed={srdId}
        className="mon-portrait-seal"
      />
    </Suspense>
  );
}
