/**
 * CompendiumResultList — the shared, scrollable results list (count + rows +
 * empty state) rendered from a picker api + its spec. Used by BOTH the modal
 * `CompendiumPicker` and the Compendium page, so the row markup (and the
 * already-added override) lives in exactly one place. Rows are `PickerRow`s; the
 * spec supplies leading / name / meta / warning, the picker supplies "added".
 *
 * PERF — the whole filtered set is scrollable, but only the on-screen window (plus
 * an overscan margin) is MOUNTED, via a small dependency-free windowed list
 * (`VirtualRows` below). The pools are large (≈330 monsters, ≈420 spells) and a full
 * reconcile of every row on each keystroke was the search-input cost; windowing keeps
 * every edit — and cold open — cheap while the reader still scrolls the ENTIRE list,
 * no cap, no ceiling. The row markup, verdict, already-added state, selection and
 * keyboard reach are unchanged.
 */

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ModalScroll } from "@/components/ui/modal-head";
import { PickerRow } from "@/components/sheet/picker-parts";
import type { CompendiumPickerApi } from "./useCompendiumPicker";
import type { CompendiumPickerSpec } from "./types";

/** Seed stride for a codex row (row box + inter-row gap) — replaced by the MEASURED
 *  stride of a real row on mount, so this only sizes the very first frame. Codex rows
 *  are a uniform box (the design's own contract), so one stride windows the pool. */
const EST_ROW_H = 62;
/** Space between rows — matches the codex row rhythm (the old `.pick-row + .pick-row`
 *  margin), folded into the stride so windowed offsets stay exact. */
const ROW_GAP = 6;
/** Rows kept mounted beyond the viewport on EACH side. Generous on purpose: the
 *  compendium page's arrow-key nav walks the mounted `.pick-row`s, so the row just
 *  past the fold must already be in the DOM for ↑/↓ to reach it — and background
 *  character-store churn must never pop a near row out from under the reader. */
const OVERSCAN = 10;
/** The first-frame slice, before the viewport is measured — bounded so cold open never
 *  reconciles the whole pool, yet ample so the initial screenful is always covered. */
const INITIAL_WINDOW = 40;
/** Breathing room above a route-revealed row: seated at the start, not glued to it. */
const REVEAL_TOP_GAP = 8;

/** The nearest scrollable ancestor — the `ModalScroll` body in a modal, the page's
 *  `.cmp-list` in bare mode — i.e. the element the list scrolls against. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return null;
}

interface VirtualRowsProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /**
   * The route-selected entry in the persistent Compendium index. It may sit
   * outside the mounted virtual window, so revealing it has to happen here —
   * a row-level `scrollIntoView` cannot target DOM that does not exist yet.
   */
  revealKey?: string;
}

/**
 * The windowed row renderer (no dependency). Finds its scroll container on mount,
 * measures one real row's stride, then mounts only the visible slice (+ overscan) as
 * absolutely-positioned rows over a full-height spacer — so the scrollbar and every
 * scroll offset match the FULL list, with no cap and no ceiling.
 *
 * `range === null` is the render-EVERY-row fallback taken where there is no layout to
 * window against (jsdom, or any zero-height host): correct, just un-windowed, so tests
 * and SSR-less first paint still show the whole list. A real browser measures a
 * positive height and switches to the windowed path.
 */
function VirtualRows<T>({ items, getKey, renderItem, revealKey }: VirtualRowsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const count = items.length;
  // STATE (never refs read during render): `stride` positions the rows; `range` is the
  // mounted window (`null` = render every row where there's no layout to window against).
  const [stride, setStride] = useState(EST_ROW_H);
  const [range, setRange] = useState<{ start: number; end: number } | null>({
    start: 0,
    end: Math.min(count, INITIAL_WINDOW),
  });
  // A far deep-link near the END of the corpus needs a short trailing runway or
  // the browser physically cannot scroll that row to the top (it clamps at the
  // content bottom). Ordinary visible row clicks never earn this spacer.
  const [revealRunway, setRevealRunway] = useState<{
    key: string;
    px: number;
    align: boolean;
  } | null>(null);

  // Runs only from effects / scroll+resize handlers (never during render), so reading
  // the scroll-box ref here is safe. Depends on the state it reads, so it re-derives.
  const recompute = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const sc = scrollRef.current;
    // No scroll box, or no measurable viewport (jsdom / hidden) — render the whole
    // list. Un-windowed but correct, so tests and zero-height hosts show every row.
    if (!sc || sc.clientHeight <= 0) {
      setRange((r) => (r === null ? r : null));
      return;
    }
    const vh = sc.clientHeight;
    // How far the list's top has scrolled ABOVE the viewport top — measured live so
    // any header above the list (the modal's count line) is accounted for exactly.
    const scrolledPast = Math.max(
      0,
      sc.getBoundingClientRect().top - cont.getBoundingClientRect().top
    );
    const start = Math.max(0, Math.floor(scrolledPast / stride) - OVERSCAN);
    const end = Math.min(count, Math.ceil((scrolledPast + vh) / stride) + OVERSCAN);
    setRange((r) => (r && r.start === start && r.end === end ? r : { start, end }));
  }, [count, stride]);

  // Keep the scroll/resize listener STABLE while `recompute` changes identity: it calls
  // the latest recompute through a ref updated in an effect (never during render).
  const recomputeRef = useRef(recompute);
  useLayoutEffect(() => {
    recomputeRef.current = recompute;
  });

  // Wire the scroll box ONCE: find the scroll parent, measure a real row's stride, and
  // attach scroll + resize handlers (which re-window via the latest-recompute ref).
  useLayoutEffect(() => {
    const cont = containerRef.current;
    const sc = findScrollParent(cont);
    scrollRef.current = sc;
    const firstRow = cont?.querySelector<HTMLElement>("[data-vrow]");
    if (firstRow) {
      // offsetHeight = the row's real box height (position-independent); + the gap is
      // the true stride. Uniform codex rows, so one measurement windows the pool.
      const h = firstRow.offsetHeight;
      if (h > 0) setStride(h + ROW_GAP);
    }
    recomputeRef.current();
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => recomputeRef.current());
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    ro?.observe(sc);
    return () => {
      sc.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Re-window when the result set size or the measured stride changes (recompute
  // closes over both), against the same scroll box.
  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  // A palette/deep-link selection can be hundreds of rows beyond the initial
  // virtual window. Give a near-end row only the trailing runway it needs, move
  // it to the START of the index with a small optical inset, then re-window so
  // the highlighted row mounts there. An ordinary click on an already-visible
  // row preserves the reader's position.
  useLayoutEffect(() => {
    if (!revealKey) return;
    const cont = containerRef.current;
    const sc = scrollRef.current;
    if (!cont || !sc || sc.clientHeight <= 0) return;
    const index = items.findIndex((item) => getKey(item) === revealKey);
    if (index < 0) return;

    const scRect = sc.getBoundingClientRect();
    const contRect = cont.getBoundingClientRect();
    const targetTop = contRect.top + index * stride;
    const targetBottom = targetTop + Math.max(1, stride - ROW_GAP);
    if (revealRunway?.key !== revealKey) {
      const alreadyVisible =
        targetTop >= scRect.top + REVEAL_TOP_GAP && targetBottom <= scRect.bottom;
      const trailingRows = count - index - 1;
      setRevealRunway({
        key: revealKey,
        align: !alreadyVisible,
        px: alreadyVisible
          ? 0
          : Math.max(
              0,
              sc.clientHeight -
                (stride - ROW_GAP) -
                REVEAL_TOP_GAP -
                trailingRows * stride
            ),
      });
      return;
    }
    if (!revealRunway.align) return;

    const next = Math.max(0, sc.scrollTop + targetTop - scRect.top - REVEAL_TOP_GAP);
    if (Math.abs(next - sc.scrollTop) < 1) return;
    sc.scrollTop = next;
    recomputeRef.current();
  }, [count, getKey, items, revealKey, revealRunway, stride]);

  if (range === null) {
    return (
      <div ref={containerRef} className="flex flex-col gap-1.5">
        {items.map((item) => (
          <div key={getKey(item)} data-vrow>
            {renderItem(item)}
          </div>
        ))}
      </div>
    );
  }

  const end = Math.min(range.end, count);
  const slice: ReactNode[] = [];
  for (let i = range.start; i < end; i++) {
    const item = items[i];
    if (item == null) continue;
    slice.push(
      <div
        key={getKey(item)}
        data-vrow
        data-index={i}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          transform: `translateY(${i * stride}px)`,
        }}
      >
        {renderItem(item)}
      </div>
    );
  }
  const runwayPx = revealRunway && revealRunway.key === revealKey ? revealRunway.px : 0;
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: count * stride + runwayPx,
        width: "100%",
      }}
    >
      {slice}
    </div>
  );
}

interface ResultListProps<T> {
  picker: CompendiumPickerApi<T>;
  spec: CompendiumPickerSpec<T>;
  /**
   * `bare` (the Compendium codex page) drops this list's own count line + scroll
   * wrapper + empty `<p>`: the tome head owns the count and the page owns the
   * scrolling `.cmp-list` + the on-brand empty leaf (and attaches the picker's
   * scroll memory to its own wrapper). The add-modals keep the default
   * (self-contained list with its count + scroll + the picker's scroll memory).
   */
  bare?: boolean;
}

export function CompendiumResultList<T>({
  picker,
  spec,
  bare = false,
}: ResultListProps<T>) {
  const { t } = useTranslation();
  // Alias the callback ref out of the api object BEFORE the JSX: a `ref=` usage
  // marks its source as a ref, and later `picker.*` reads would trip the
  // Rules-of-React lint if the object itself carried it.
  const { attachListScroll } = picker;
  const renderItem = (entry: T) => (
    <CompendiumResultRow entry={entry} picker={picker} spec={spec} />
  );
  const rows = (
    <VirtualRows
      items={picker.filtered}
      getKey={spec.getId}
      renderItem={renderItem}
      revealKey={bare && picker.selected ? spec.getId(picker.selected) : undefined}
    />
  );

  if (bare) {
    // The page wraps this in `.cmp-list` (its own scroll + padding) and renders its
    // own empty leaf, so here we emit the windowed rows only.
    return rows;
  }

  return (
    // `data-variant="codex"` opts the cockpit add-modal rows into the SAME elevated
    // codex-row treatment the Compendium page uses (carved tile · seal · verdict),
    // so adding a spell/item/feat from the sheet matches the browse experience.
    // `overscroll-contain` keeps wheel/touch momentum from chaining to the page.
    <ModalScroll className="flex-1" data-variant="codex" ref={attachListScroll}>
      <div className="mb-1 px-2 font-mono text-[length:var(--text-micro)] uppercase tracking-wider text-text-secondary">
        {t("common.items", { count: picker.count })}
      </div>
      {picker.filtered.length === 0 ? (
        <p className="opt-empty">{t("common.noResults")}</p>
      ) : (
        rows
      )}
    </ModalScroll>
  );
}

/**
 * One result row — the spec's row view plus, when the spec declares a verdict and
 * the entry isn't already-added, the right-aligned codex classifier chip (OWN-5).
 * The chip composes into the SAME `trailing` slot the warning badge uses, so it
 * shows in the cockpit add-modals too (one elevated row family, every surface).
 */
function CompendiumResultRow<T>({
  entry,
  picker,
  spec,
}: {
  entry: T;
  picker: CompendiumPickerApi<T>;
  spec: CompendiumPickerSpec<T>;
}) {
  const { t } = useTranslation();
  const added = picker.isAdded(entry);
  const base = spec.row(entry, picker.ctx);
  const verdict = added ? undefined : spec.verdict?.(entry, picker.ctx);
  const style: Record<string, string> = {};
  if (verdict?.tone) style["--vd"] = verdict.tone;

  return (
    <PickerRow
      leading={spec.repeatLeadingInRows === false ? undefined : base.leading}
      name={base.name}
      meta={base.meta}
      state={added ? "added" : base.state}
      // Entries are the spec's own data objects, so identity marks the row whose
      // reading leaf is open (the spread's seated selection; no-op in add mode,
      // where an open detail replaces the list).
      current={picker.selected === entry}
      trailing={
        added ? (
          <span className="pick-trail" data-tone="added">
            {t("common.added")}
          </span>
        ) : (
          <>
            {base.trailing}
            {verdict && (
              <span className="cmp-verdict" style={style}>
                {verdict.label}
              </span>
            )}
          </>
        )
      }
      onClick={() => picker.select(entry)}
      disabled={added}
      ariaLabel={spec.getName(entry, picker.ctx)}
    />
  );
}
