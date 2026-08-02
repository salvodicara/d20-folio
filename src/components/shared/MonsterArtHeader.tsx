/** Canonical, non-editable bestiary portrait for compendium and encounter detail. */
import { Portrait } from "@/components/shared/Portrait";
import { monsterPortraitUrl } from "@/data/monster-art";

export function MonsterArtHeader({ srdId, name }: { srdId: string; name: string }) {
  return (
    <Portrait
      src={monsterPortraitUrl(srdId)}
      name={name}
      seed={srdId}
      className="mon-portrait-seal"
    />
  );
}
