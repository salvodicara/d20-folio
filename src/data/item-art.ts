/**
 * Optional compendium item illustrations, addressed by corpus kind + immutable id.
 *
 * The typed key prevents a mundane and magic item with the same id from stealing
 * each other's plate. URLs stay outside character data and i18n catalogues: art
 * can be added or remastered without a schema migration. Source files use
 * `{kind}--{id}.webp`; the prefix survives Rolldown's flattened asset metadata.
 */
import { packItemArt } from "@pack/item-art";

export type ItemArtKind = "equipment" | "magic";

const publicFiles = import.meta.glob<string>("../../assets/items/**/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

function itemArtKey(assetPath: string): string {
  const match = assetPath.match(/\/items\/(equipment|magic)\/([^/]+)\.webp$/);
  if (!match?.[1] || !match[2]) throw new Error(`Invalid item art path: ${assetPath}`);
  const prefix = `${match[1]}--`;
  if (!match[2].startsWith(prefix))
    throw new Error(`Invalid item art name: ${assetPath}`);
  return `${match[1]}:${match[2].slice(prefix.length)}`;
}

const publicItemArt = Object.fromEntries(
  Object.entries(publicFiles).map(([path, url]) => [itemArtKey(path), url])
);

export const ITEM_ART: Readonly<Record<string, string>> = {
  ...publicItemArt,
  ...packItemArt,
};

/** Missing art is a first-class state: callers render no well and keep the leaf compact. */
export function itemArtUrl(kind: ItemArtKind, id: string): string | null {
  return ITEM_ART[`${kind}:${id}`] ?? null;
}
