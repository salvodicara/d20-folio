/**
 * Optional compendium item illustrations, addressed by corpus kind + immutable id.
 *
 * The typed key prevents a mundane and magic item with the same id from stealing
 * each other's plate. URLs stay outside character data and i18n catalogues: art
 * can be added or remastered without a schema migration. Source files use
 * `{kind}--{id}.webp`; the prefix survives Rolldown's flattened asset metadata.
 */
import { packItemArt } from "@pack/item-art";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";

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

/**
 * Art is a corpus, not a progressive enhancement. A partial collection makes
 * identical item leaves behave unpredictably, so plates unlock automatically
 * only when EVERY active equipment + magic-item id has a file. The expected set
 * is derived from the composed data (public + private pack), never hand-kept.
 */
const expectedItemArtKeys = [
  ...SRD_EQUIPMENT.map((item) => `equipment:${item.id}`),
  ...SRD_MAGIC_ITEMS.map((item) => `magic:${item.id}`),
];

export const ITEM_ART_COMPLETE = expectedItemArtKeys.every((key) => ITEM_ART[key]);

/** Incomplete corpus ⇒ no item renders a plate; complete corpus ⇒ every item does. */
export function itemArtUrl(kind: ItemArtKind, id: string): string | null {
  if (!ITEM_ART_COMPLETE) return null;
  return ITEM_ART[`${kind}:${id}`] ?? null;
}
