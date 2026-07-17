/**
 * Wizard F feat LIST — the read-then-choose morphing accordion for large feat
 * pools (the level-up boon, the Human Versatile origin feat).
 *
 * THE MORPH CONTRACT (owner round-6 + fb4, binding): every entry keeps ONE
 * header and ONE body through all three states — collapsed · reading · chosen.
 * A tap unfolds the reading spread (free browsing); an explicit Choose commits.
 * Choosing a NO-ASKS feat changes ONLY the chosen treatment (gold socket, ink,
 * wax check) — the prose geometry stays byte-identical. Choosing an ASKS feat
 * animates ONLY the `.wiz-spread` grid column track (1fr 0fr → 1.2fr 1fr): the
 * asks column opens on the right, the gold-thread separator fades in, the prose
 * reflows narrower at IDENTICAL typography. Never a swapped layout, never a
 * second unfold, never a font-size change. Mobile ≤720px stacks the asks as a
 * 0fr→1fr row fold.
 *
 * EQUAL-HEIGHT ENTHRONEMENT (owner fb4, 2026-06-12): reading→chosen keeps the
 * SAME card height — zero perceived jump. The act row NEVER folds (the primary
 * Choose swaps in place for the ghost "Remove choice" — the ONE release
 * affordance; the header is a pure fold toggle for every entry, chosen
 * included). On commit the entry locks `--wiz-spread-h` to the measured
 * reading height; the narrowed prose and the asks ledger scroll within it, and
 * the release reverses the same track animation inside the same lock.
 *
 * No-jump: selection changes counter-scroll pre-paint via `useEnthroneAnchor`
 * — the spot the user tapped never moves.
 *
 * Collapsed rows are CHEAP: only an open entry mounts its fold (prose + asks),
 * so a full-SRD list stays snappy.
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Sparkles, Star } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/shared/SearchField";
import { FilterChip } from "@/components/sheet/picker-parts";
import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { rankedSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { FeatCategory } from "@/data/types";
import { featPickCategories, type FeatPickVM } from "@/lib/views/feat-pick-view";
import { useEnthroneAnchor } from "./use-enthrone-anchor";
import { useIdleMounted } from "./use-idle-mount";
import { WizardFold } from "./fold";

export function WizardFeatList({
  feats,
  chosenId,
  onChoose,
  asksFor,
  searchPlaceholder,
}: {
  /** The OFFERED pool (RAW-illegal entries already filtered by the presenter). */
  feats: ReadonlyArray<FeatPickVM>;
  chosenId: string | null;
  /** Commit / release the choice (null releases). */
  onChoose: (id: string | null) => void;
  /**
   * The feat's caused asks (the half-feat "+1 ability" pick + nested choice
   * slots), or null when the feat asks nothing. Mounted through BOTH open
   * states (closed track while reading) so commit is ONE width animation.
   */
  asksFor: (featId: string) => ReactNode | null;
  searchPlaceholder: string;
}) {
  const { t } = useTranslation();
  const scopeRef = useRef<HTMLDivElement>(null);
  const remember = useEnthroneAnchor(scopeRef);
  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<FeatCategory | null>(null);
  /** The ONE open entry (reading or chosen-expanded) — a chosen entry starts open. */
  const [focusId, setFocusId] = useState<string | null>(chosenId);

  const categories = featPickCategories(feats);
  const activeFacet = facet != null && categories.includes(facet) ? facet : null;
  let visible: ReadonlyArray<FeatPickVM> = feats;
  if (activeFacet) visible = visible.filter((f) => f.category === activeFacet);
  // Two-tier ranked search (fb4): name hits first, description hits appended.
  visible = rankedSearch(
    query,
    visible,
    (f) => f.searchText,
    (f) => f.searchDesc
  );

  const chosen = chosenId ? (feats.find((f) => f.id === chosenId) ?? null) : null;
  const keptName =
    chosen != null && !visible.some((f) => f.id === chosen.id) ? chosen.name : null;

  /** The Choose button commits; the entry STAYS open (the asks track opens
   *  inside the same height-locked body) and the clicked spot never moves. */
  const enthrone = useCallback(
    (id: string) => {
      remember(id);
      onChoose(id);
      setFocusId(id);
    },
    [remember, onChoose]
  );

  /** The act row's "Remove choice" — the ONE release affordance. The entry
   *  stays open, back in reading (the exact reverse track animation). */
  const release = useCallback(
    (id: string) => {
      remember(id);
      onChoose(null);
      setFocusId(id);
    },
    [remember, onChoose]
  );

  /** The header tap — a pure fold toggle (collapsed ⇄ open) for EVERY entry,
   *  chosen included. It never releases (one clear release model: the act row). */
  const headerTap = useCallback(
    (id: string, open: boolean) => {
      remember(id);
      setFocusId(open ? null : id);
    },
    [remember]
  );

  return (
    <>
      <div className="wiz-controls">
        <SearchField
          className="wiz-search"
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder}
        />
        {categories.length > 1 && (
          <div className="wiz-facets">
            <FilterChip
              label={t("common.all")}
              active={activeFacet === null}
              onClick={() => setFacet(null)}
            />
            {categories.map((c) => (
              <FilterChip
                key={c}
                label={t(`feats.category_${c}`)}
                active={activeFacet === c}
                onClick={() => setFacet(activeFacet === c ? null : c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* The chosen feat survives a filter that hides it — say so, once. */}
      {keptName != null && (
        <button
          type="button"
          className="wiz-kept"
          onClick={() => {
            setQuery("");
            setFacet(null);
          }}
        >
          <Icon as={Check} size="xs" decorative />
          <span>{t("wizard.keptChosen", { name: keptName })}</span>
        </button>
      )}

      {/* A stack of DISCLOSURE entries (header buttons with aria-expanded), not
          a listbox — option semantics would demand role=option children. */}
      <div className="wiz-list" ref={scopeRef} aria-label={t("feats.feats")}>
        {visible.map((f) => (
          <FeatEntry
            key={f.id}
            feat={f}
            chosen={f.id === chosenId}
            open={f.id === focusId}
            asks={f.id === chosenId || f.id === focusId ? asksFor(f.id) : null}
            onHeader={headerTap}
            onChoose={enthrone}
            onRelease={release}
          />
        ))}
        {visible.length === 0 && <p className="wiz-empty">{t("common.noResults")}</p>}
      </div>
    </>
  );
}

/**
 * ONE feat entry — three states on ONE header AND one body. The asks column is
 * in the DOM through both open states (closed track + `display:none` content
 * while reading); choosing only opens the track (round-6 binding correction)
 * inside the entry's measured `--wiz-spread-h` height lock (fb4: the chosen
 * card keeps the exact reading height; prose + asks scroll within).
 *
 * `memo`ized so selecting/expanding ONE entry never re-renders the full pool
 * (D). While READING, the (hidden) asks content idle-mounts — the expand
 * commit stays tight; the track-open commit finds it already in the DOM.
 */
const FeatEntry = memo(function FeatEntry({
  feat,
  chosen,
  open,
  asks,
  onHeader,
  onChoose,
  onRelease,
}: {
  feat: FeatPickVM;
  chosen: boolean;
  open: boolean;
  /** The feat's OWN asks content (null = Alert-style, the spread never opens). */
  asks: ReactNode | null;
  onHeader: (id: string, open: boolean) => void;
  onChoose: (id: string) => void;
  onRelease: (id: string) => void;
}) {
  const { t } = useTranslation();
  const entryRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const reading = open && !chosen;
  // D — defer the hidden asks subtree to the next idle slice while reading;
  // mount it immediately once chosen (the track animation needs it).
  const asksIdle = useIdleMounted(reading && asks != null);
  const mountAsks = asks != null && (chosen || asksIdle);

  /** Commit = measure the READING height and lock the spread to it BEFORE the
   *  track opens — the equal-height enthronement (zero perceived jump). */
  const choose = () => {
    const h = spreadRef.current?.offsetHeight;
    if (h != null && h > 0) {
      entryRef.current?.style.setProperty("--wiz-spread-h", `${h}px`);
    }
    onChoose(feat.id);
  };
  // A stale lock must not survive a fresh reading (viewport/fonts may have
  // changed since): drop it once the entry is neither open nor chosen.
  useEffect(() => {
    if (!open && !chosen) entryRef.current?.style.removeProperty("--wiz-spread-h");
  }, [open, chosen]);

  return (
    <div
      ref={entryRef}
      className="wiz-entry"
      data-fid={feat.id}
      data-open={open ? "" : undefined}
      data-chosen={chosen ? "" : undefined}
    >
      <button
        type="button"
        className="wiz-row"
        aria-expanded={open}
        onClick={() => onHeader(feat.id, open)}
      >
        <span className="wiz-socket" aria-hidden>
          <Icon as={Star} size="sm" decorative />
        </span>
        <span className="wiz-row-main">
          <span className="wiz-row-eyebrow">
            {chosen ? `${t("wizard.chosen")} · ` : ""}
            {t(`feats.category_${feat.category}`)}
            {feat.halfFeat ? ` · ${feat.halfFeat}` : ""}
          </span>
          <span className="wiz-row-name">{feat.name}</span>
          <span className="wiz-row-gloss">{feat.summary}</span>
        </span>
        {feat.halfFeat && <span className="wiz-card-badge wiz-fade">+1</span>}
        <span className="wiz-col wiz-fade">{t(`feats.category_${feat.category}`)}</span>
        {chosen && (
          <span className="wiz-row-check" aria-hidden>
            <Icon as={Check} size="xs" decorative />
          </span>
        )}
        <Icon
          as={ChevronDown}
          size="xs"
          decorative
          className={cn("wiz-chev", open && "open")}
        />
      </button>

      {/* THE one body — unfolds once beneath the (still-standing) header and
          then only morphs its column track between reading and chosen; the
          refold glides too (WizardFold). */}
      <WizardFold open={open}>
        <div
          ref={spreadRef}
          className="wiz-spread"
          data-asks={chosen && asks ? "" : undefined}
          data-can-ask={asks ? "" : undefined}
        >
          <div className="wiz-spread-main">
            <BlockMarkdown className="wiz-read-prose" text={feat.description} />
            {/* The act row NEVER folds (fb4: committing must not change the
                card's height) — the primary Choose swaps in place for the
                ghost release, the entry's ONE release affordance. */}
            <div className="wiz-spread-act">
              {chosen ? (
                <Button variant="ghost" onClick={() => onRelease(feat.id)}>
                  {t("wizard.removeChoice")}
                </Button>
              ) : (
                <Button variant="primary" onClick={choose}>
                  {t("wizard.choose", { name: feat.name })}
                </Button>
              )}
            </div>
          </div>
          {mountAsks && (
            <div className="wiz-spread-asks">
              <div className="wiz-asks">
                <p className="wiz-asks-head">
                  <Icon as={Sparkles} size="xs" decorative />
                  {t("wizard.asksMore")}
                </p>
                {asks}
              </div>
            </div>
          )}
        </div>
      </WizardFold>
    </div>
  );
});
