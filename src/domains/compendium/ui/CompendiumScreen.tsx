/**
 * The new UI's Compendium (approved prototypes comp, comp-detail, comp-filters), behind
 * VITE_NEW_UI. Three panels on a wide screen — the filters, the results with the type
 * tabs, the open entry — over the library room; on a narrower screen the filters move
 * into a sheet, and on a phone the entry replaces the list. Each row opens with the
 * entry's painted icon in the same bronze slot as Play's rows (no tooltip: the row
 * says everything). The data, search and filters are the compendium specs' own.
 */
import { useCallback, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { NewUiFilterChips } from "@/components/sheet/filter-chip-look";
import {
  COMPENDIUM_SPECS,
  spellSpec,
  type AnyCompendiumSpec,
} from "@/features/compendium/picker/specs";
import {
  useCompendiumPicker,
  countActiveFacets,
  type CompendiumPickerApi,
} from "@/features/compendium/picker/useCompendiumPicker";
import type { PickerCtx } from "@/features/compendium/picker/types";
import { compendiumArt } from "@/domains/compendium/compendium-art";
import { compendiumGist } from "@/domains/compendium/compendium-gist";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { tieLast } from "@/lib/text-ties";
import { formatCr } from "@/lib/utils";
import { Art, Button, Dialog, Icon, Panel, Room, Tabs } from "@/ui";

export function CompendiumScreen() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const type = params.get("type");
  const spec =
    COMPENDIUM_SPECS.find((s) => s.id === type) ??
    (spellSpec as unknown as AnyCompendiumSpec);
  const selectedId = params.get("sel");
  const setParam = useCallback(
    (key: string, value: string | null, push = false) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (value === null) next.delete(key);
          else next.set(key, value);
          if (key === "type") {
            next.delete("sel");
            next.delete("q");
          }
          return next;
        },
        { replace: !push }
      ),
    [setParams]
  );
  const picker = useCompendiumPicker(spec, {
    mode: "browse",
    initialQuery: params.get("q") ?? "",
    selectedId,
    onSelectedIdChange: (id) => setParam("sel", id, id !== null && !selectedId),
  });
  const wide = useMediaQuery("(min-width: 1281px)");
  const phone = useMediaQuery("(max-width: 960px)");
  const [sheet, setSheet] = useState(false);
  const selected = picker.selected;
  const title = selected ? spec.getName(selected, picker.ctx) : null;
  useDocumentTitle(title ? `${title} · ${t("nav.compendium")}` : t("nav.compendium"));
  const active = countActiveFacets(spec.filters, picker.filterState);

  const results = (
    <Panel
      color="cmp"
      title={t("compendium.results")}
      aside={t("compendium.count", { count: picker.count })}
      className="f-cmp-results"
    >
      <Tabs
        label={t("compendium.type")}
        items={COMPENDIUM_SPECS.map((s) => ({ id: s.id, label: s.label(t) }))}
        value={spec.id}
        onChange={(id) => setParam("type", id, true)}
      />
      <ResultRows spec={spec} picker={picker} selectedId={selectedId} />
    </Panel>
  );
  const detail = selected ? (
    <EntryPanel
      spec={spec}
      entry={selected}
      ctx={picker.ctx}
      onBack={phone ? () => picker.clearSelection() : undefined}
    />
  ) : (
    <Panel color="cmp" title={t("compendium.detail")} className="f-cmp-detail">
      <p className="f-note">{t("compendium.frontisHint")}</p>
    </Panel>
  );

  return (
    <NewUiFilterChips.Provider value={true}>
      <main id="main" className="f-page f-cmp">
        <Room room="library" band />
        <header className="f-ph">
          <div>
            <h1>{t("nav.compendium")}</h1>
            <p>{t("compendium.hint")}</p>
          </div>
        </header>
        <div className="f-cmp-bar">
          <label className="f-srch f-cmp-srch">
            <Icon name="u-search" />
            <input
              type="search"
              value={picker.query}
              placeholder={spec.searchPlaceholder?.(t) ?? t("shell.search")}
              aria-label={spec.searchPlaceholder?.(t) ?? t("shell.search")}
              onChange={(e) => picker.setQuery(e.target.value)}
            />
          </label>
          {!wide && (
            <Button icon="u-filter" aria-haspopup="dialog" onClick={() => setSheet(true)}>
              {t("compendium.filters")}
              {active > 0 && <span className="f-chip-n">{active}</span>}
            </Button>
          )}
        </div>
        <div className="f-cmp-grid" data-open={selected ? "" : undefined}>
          {wide && (
            <Panel
              color="cmp"
              title={t("compendium.filters")}
              aside={
                active > 0 ? (
                  <Button kind="quiet" onClick={picker.reset}>
                    {t("compendium.reset")}
                  </Button>
                ) : undefined
              }
              className="f-cmp-filters"
            >
              <Filters spec={spec} picker={picker} />
            </Panel>
          )}
          {phone && selected ? detail : results}
          {!phone && detail}
        </div>
        <Dialog
          open={sheet}
          color="cmp"
          title={t("compendium.filters")}
          closeLabel={t("common.close")}
          onClose={() => setSheet(false)}
          actions={
            <>
              <Button onClick={picker.reset}>{t("compendium.reset")}</Button>
              <Button kind="primary" onClick={() => setSheet(false)}>
                {t("compendium.showResults", { count: picker.count })}
              </Button>
            </>
          }
        >
          <Filters spec={spec} picker={picker} />
        </Dialog>
      </main>
    </NewUiFilterChips.Provider>
  );
}

/** Rules prose set for reading: a number keeps its unit, a paragraph ends on three words. */
function tidy(text: string): string {
  return text
    .replace(/(\d) (m|kg|ft|lb|mo|ma|mr)(?![\wà-ÿ])/g, "$1\u00a0$2")
    .replace(/ (\S+) (\S+)$/gm, "\u00a0$1\u00a0$2");
}

/** The spec's own filter groups, each under its label, its chips in the new UI's look. */
function Filters({
  spec,
  picker,
}: {
  spec: AnyCompendiumSpec;
  picker: CompendiumPickerApi<unknown>;
}) {
  const { t } = useTranslation();
  return (
    <div className="f-cmp-facets">
      {spec.filters.map((g) => {
        const chips = g.render(
          picker.filterState[g.id],
          (v) => picker.setFilterValue(g.id, v),
          picker.ctx,
          picker.filterState
        );
        if (chips == null) return null;
        const label = g.label?.(t);
        return (
          <div key={g.id} className="f-field" role="group" aria-label={label}>
            {label && <span className="f-lbl">{label}</span>}
            <div className="f-chips">{chips}</div>
          </div>
        );
      })}
    </div>
  );
}

/** An entry's painted icon, or its type's glyph when it has none. */
function EntryArt({ spec, entry }: { spec: AnyCompendiumSpec; entry: unknown }) {
  const art = compendiumArt(spec.id, entry);
  const glyph = spec.icon ? <Glyph as={spec.icon} /> : null;
  if (art && "spell" in art)
    return <SpellArt id={art.spell} school={art.school} size="fill" />;
  if (art) return <Art kind={art.kind} id={art.id} fallback={glyph} />;
  return glyph;
}

function Glyph({ as: G }: { as: NonNullable<AnyCompendiumSpec["icon"]> }) {
  return <G aria-hidden="true" />;
}

function Slot({ children }: { children: ReactNode }) {
  return (
    <span className="f-act-slot" data-painted="" aria-hidden="true">
      {children}
    </span>
  );
}

function ResultRows({
  spec,
  picker,
  selectedId,
}: {
  spec: AnyCompendiumSpec;
  picker: CompendiumPickerApi<unknown>;
  selectedId: string | null;
}) {
  const { t } = useTranslation();
  const { attachListScroll, filtered, count, ctx, reset, select } = picker;
  if (count === 0)
    return (
      <div className="f-cmp-empty">
        <p className="f-note">{t("compendium.emptyHint")}</p>
        <Button onClick={reset}>{t("compendium.emptyReset")}</Button>
      </div>
    );
  return (
    <div className="f-cmp-list" ref={attachListScroll}>
      {filtered.map((entry) => {
        const id = spec.getId(entry);
        const row = spec.row(entry, ctx);
        const verdict = spec.verdict?.(entry, ctx);
        // the codex drew a monster's CR on its seal: here it leads the line
        const cr =
          spec.id === "monster"
            ? t("compendium.cr", { cr: formatCr((entry as { cr: number }).cr) })
            : null;
        return (
          <a
            key={id}
            href={`?type=${spec.id}&sel=${encodeURIComponent(id)}`}
            className="f-act f-cmp-row"
            aria-current={id === selectedId || undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              select(entry);
            }}
          >
            <Slot>
              <EntryArt spec={spec} entry={entry} />
            </Slot>
            <span className="f-row-main">
              <span className="f-row-t">{row.name}</span>
              {(cr ?? row.meta) && (
                <span className="f-row-s">
                  {cr}
                  {cr && row.meta ? " · " : null}
                  {row.meta}
                </span>
              )}
            </span>
            {verdict && (
              <span
                className="f-cmp-verdict"
                style={verdict.tone ? { ["--v" as string]: verdict.tone } : undefined}
              >
                {verdict.label}
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}

function EntryPanel({
  spec,
  entry,
  ctx,
  onBack,
}: {
  spec: AnyCompendiumSpec;
  entry: unknown;
  ctx: PickerCtx;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const view = spec.detail(entry, ctx, { added: false });
  const gist = compendiumGist(spec.id, entry, ctx.locale);
  return (
    <Panel color="cmp" title={spec.label(t)} className="f-cmp-detail">
      {onBack && (
        <Button kind="quiet" icon="u-back" onClick={onBack}>
          {t("compendium.results")}
        </Button>
      )}
      <div className="f-cmp-head">
        {/* the entry's art large, as BG3's wiki shows it: beside the name, a banner on a phone */}
        <span className="f-cmp-art" aria-hidden="true">
          <span className="f-cmp-art-img">
            <EntryArt spec={spec} entry={entry} />
          </span>
        </span>
        <div>
          <h2 className="f-cmp-name">{spec.getName(entry, ctx)}</h2>
          {view.eyebrow && <div className="f-row-s f-cmp-eyebrow">{view.eyebrow}</div>}
        </div>
      </div>
      {gist && (
        <p className="f-cmp-gist">
          <span className="f-lbl">{t("compendium.gist")}</span>
          {tieLast(gist)}
        </p>
      )}
      {view.warning && (
        <p className="f-note" data-c="cond">
          {view.warning}
        </p>
      )}
      {view.meta && view.meta.length > 0 && (
        <dl className="f-cmp-facts">
          {view.meta.map((f, i) => (
            <div key={i}>
              <dt className="f-lbl">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {view.description != null && (
        <InlineMarkdown
          text={tidy(view.description)}
          className="f-cmp-prose"
          highlight={highlightRulesText(ctx.locale)}
        />
      )}
      {/* the codex's own blocks (a monster's stat block, a spell's tags), not rebuilt
          yet: out of the new UI's audit until they are */}
      {view.extras && (
        <div className="f-cmp-extras" data-audit-skip="">
          {view.extras}
        </div>
      )}
    </Panel>
  );
}
