/** Canonical bestiary portraits, addressed by the same stable id as `MONSTERS`. */
import { packMonsterArt } from "@pack/monster-art";

const publicFiles = import.meta.glob<string>("../../assets/monsters/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

function portraitId(assetPath: string): string {
  const fileName = assetPath.split("/").at(-1);
  if (!fileName?.endsWith(".webp")) {
    throw new Error(`Invalid monster portrait path: ${assetPath}`);
  }
  return fileName.slice(0, -5);
}

const publicMonsterArt = Object.fromEntries(
  Object.entries(publicFiles).map(([path, url]) => [portraitId(path), url])
);

export const MONSTER_ART: Readonly<Record<string, string>> = {
  ...publicMonsterArt,
  ...packMonsterArt,
};

/** Unknown/stale ids deliberately fall back to the shared deterministic monogram. */
export function monsterPortraitUrl(id: string): string | null {
  return MONSTER_ART[id] ?? null;
}
