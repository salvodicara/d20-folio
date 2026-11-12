/**
 * The new UI's ⌘K results (D&D Beyond's and Foundry's quick search): the ranked hits
 * grouped under one heading per kind, the group of the best hit first, each group in
 * the index's own order; plus the same hits flattened, so ↑ ↓ and Enter walk them in
 * the order they read.
 */
import type { SearchKind } from "./global-search";
import type { SearchHit } from "./search-index";

export interface PaletteGroup {
  kind: SearchKind;
  hits: SearchHit[];
}

export interface PaletteView {
  groups: PaletteGroup[];
  /** Every hit in reading order (group by group): the keyboard's walk. */
  flat: SearchHit[];
}

export function paletteView(hits: ReadonlyArray<SearchHit>): PaletteView {
  const byKind = new Map<SearchKind, SearchHit[]>();
  for (const hit of hits) {
    const group = byKind.get(hit.entry.kind);
    if (group) group.push(hit);
    else byKind.set(hit.entry.kind, [hit]);
  }
  const groups = [...byKind].map(([kind, groupHits]) => ({ kind, hits: groupHits }));
  return { groups, flat: groups.flatMap((g) => g.hits) };
}

/** The next highlighted row for an arrow key, wrapping at both ends (-1 = none). */
export function moveHighlight(current: number, count: number, step: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return step === 1 ? 0 : count - 1;
  return (current + step + count) % count;
}
