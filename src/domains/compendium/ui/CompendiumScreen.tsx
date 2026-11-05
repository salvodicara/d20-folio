/**
 * «Compendio» on the new frame (approved prototypes comp, comp-detail, comp-empty):
 * the library above the page, one search, then three columns on a wide screen —
 * Filters (ticks by group), Results (one category at a time, a row per entry) and
 * the open entry's Detail. Below 1100px the detail takes the page with a way back
 * to the results; on a phone the filters open in a dialog.
 *
 * The category, the search and the open entry live in the URL (`?type=`, `?q=`,
 * `?sel=`), so the shell's search and a shared link land on the same view, and
 * the browser's Back closes an entry it opened.
 */
import { createElement, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { equipmentCategoryIcon, magicItemSealIcon } from "@/components/shared/item-icons";
import {
  COMP_CATEGORIES,
  compendiumDetail,
  compendiumFilters,
  compendiumRows,
  filterCompRows,
  isCompCategory,
  pickCount,
  type CompCategory,
  type CompDetail,
  type CompFilter,
  type CompIcon,
  type CompPicks,
} from "@/domains/compendium/compendium-view";
import { ActionIcon } from "@/domains/play/ui/ActionIcon";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocale } from "@/hooks/useLocale";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button, Dialog, Icon, Panel, Room, Tabs } from "@/ui";

const CATEGORY_LABEL: Record<CompCategory, string> = {
  spell: "nav.spells",
  item: "items.tab",
  feat: "feats.feats",
};

export function CompendiumScreen() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width: 1101px)");

  const typeParam = params.get("type");
  const category: CompCategory = isCompCategory(typeParam) ? typeParam : "spell";
  const query = params.get("q") ?? "";
  const sel = params.get("sel");
  const [picksBy, setPicksBy] = useState<Partial<Record<CompCategory, CompPicks>>>({});
  const picks = useMemo(() => picksBy[category] ?? {}, [picksBy, category]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const rowsBy = useMemo(
    () =>
      Object.fromEntries(
        COMP_CATEGORIES.map((c) => [c, compendiumRows(c, locale)])
      ) as Record<CompCategory, ReturnType<typeof compendiumRows>>,
    [locale]
  );
  const rows = rowsBy[category];
  const filters = useMemo(
    () => compendiumFilters(category, rows, locale),
    [category, rows, locale]
  );
  const shown = useMemo(() => filterCompRows(rows, query, picks), [rows, query, picks]);
  // A search counts its hits in every category, so a miss here points to the right tab.
  const hitsBy = useMemo(
    () =>
      query.trim()
        ? (Object.fromEntries(
            COMP_CATEGORIES.map((c) => [c, filterCompRows(rowsBy[c], query, {}).length])
          ) as Record<CompCategory, number>)
        : null,
    [query, rowsBy]
  );

  // On a wide screen the first result reads in the Detail column until one is chosen.
  const openId = sel ?? (wide ? (shown[0]?.id ?? null) : null);
  const detail = openId ? compendiumDetail(category, openId, locale) : null;
  useDocumentTitle(
    sel && detail ? `${detail.name} · ${t("nav.compendium")}` : t("nav.compendium")
  );

  const setParam = (key: string, value: string | null, push = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === "type") next.delete("sel");
        return next;
      },
      push ? { state: { compEntry: true } } : { replace: true }
    );
  // The first entry opened pushes one history step, so Back returns to the results.
  // An entry is a link (shareable); the first one opened pushes one history step, so
  // Back returns to the results, and the next ones replace it.
  const entryHref = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("sel", id);
    return `?${next.toString()}`;
  };
  const closeEntry = () => {
    if ((location.state as { compEntry?: boolean } | null)?.compEntry) void navigate(-1);
    else setParam("sel", null);
  };
  const setPicks = (next: CompPicks) => setPicksBy({ ...picksBy, [category]: next });
  const ticked = pickCount(picks);

  const filterPanel = <Filters groups={filters} picks={picks} onChange={setPicks} />;
  const clearButton = ticked > 0 && (
    <Button kind="quiet" onClick={() => setPicks({})}>
      {t("compendium.screen.clear")}
    </Button>
  );

  const reading = !wide && detail !== null;
  return (
    <>
      <Room room="library" />
      <main id="main" className="f-page f-comp">
        {reading ? (
          <div className="f-comp-reading">
            <Button kind="quiet" icon="u-back" onClick={closeEntry}>
              {t("compendium.screen.results")}
            </Button>
            <DetailPanel detail={detail} />
          </div>
        ) : (
          <>
            <header className="f-ph">
              <div>
                <h1>{t("nav.compendium")}</h1>
                <p>{t("compendium.screen.subtitle")}</p>
              </div>
              <div className="f-ph-acts f-show-m">
                <Button icon="u-filter" onClick={() => setFiltersOpen(true)}>
                  {ticked > 0
                    ? `${t("compendium.filters")} · ${String(ticked)}`
                    : t("compendium.filters")}
                </Button>
              </div>
            </header>
            <label className="f-srch f-comp-srch">
              <Icon name="u-search" size={20} />
              <input
                type="search"
                autoComplete="off"
                aria-label={t("shell.search")}
                placeholder={t("shell.search")}
                value={query}
                onChange={(e) => setParam("q", e.target.value || null)}
              />
            </label>
            <div className="f-comp-grid">
              <Panel
                color="cmp"
                className="f-hide-m"
                title={t("compendium.filters")}
                aside={clearButton}
              >
                {filterPanel}
              </Panel>
              <Panel
                color="cmp"
                title={t("compendium.screen.results")}
                aside={t("compendium.screen.results", { count: shown.length })}
              >
                <Tabs
                  label={t("compendium.type")}
                  value={category}
                  onChange={(c) => setParam("type", c)}
                  items={COMP_CATEGORIES.map((c) => ({
                    id: c,
                    label: hitsBy
                      ? `${t(CATEGORY_LABEL[c])} ${String(hitsBy[c])}`
                      : t(CATEGORY_LABEL[c]),
                  }))}
                />
                {shown.length === 0 ? (
                  <div className="f-comp-none">
                    <h3>
                      {query.trim()
                        ? t("compendium.screen.noMatch", { query: query.trim() })
                        : t("compendium.screen.noMatchFilters")}
                    </h3>
                    <p>{t("compendium.screen.noMatchHint")}</p>
                    <div className="f-hero-acts">
                      {ticked > 0 && (
                        <Button onClick={() => setPicks({})}>
                          {t("compendium.screen.clearFilters")}
                        </Button>
                      )}
                      {query.trim() && (
                        <Button onClick={() => setParam("q", null)}>
                          {t("common.clearSearch")}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <ul className="f-comp-list">
                    {shown.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={entryHref(r.id)}
                          replace={sel !== null}
                          state={{ compEntry: true }}
                          className="f-row f-comp-row"
                          aria-current={r.id === openId ? "true" : undefined}
                        >
                          <CompGlyph icon={r.icon} />
                          <span className="f-row-main">
                            <span className="f-row-t">{tieLast(r.name)}</span>
                            <span className="f-row-s">{r.facts.join("\u00a0· ")}</span>
                          </span>
                          {r.aside.map((a) => (
                            <span key={a} className="f-row-s f-comp-aside">
                              {a}
                            </span>
                          ))}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              {wide && detail && <DetailPanel detail={detail} />}
            </div>
          </>
        )}
      </main>
      {filtersOpen && (
        <Dialog
          open
          onClose={() => setFiltersOpen(false)}
          title={t("compendium.filters")}
          color="cmp"
          closeLabel={t("common.close")}
          actions={
            <>
              {clearButton}
              <Button kind="primary" onClick={() => setFiltersOpen(false)}>
                {t("compendium.screen.doneFilters")}
              </Button>
            </>
          }
        >
          {filterPanel}
        </Dialog>
      )}
    </>
  );
}

/** Ticks by group: inside a group they widen the list, across groups they narrow it. */
function Filters({
  groups,
  picks,
  onChange,
}: {
  groups: readonly CompFilter[];
  picks: CompPicks;
  onChange: (next: CompPicks) => void;
}) {
  return (
    <div className="f-comp-filters">
      {groups.map((g) => {
        const on = picks[g.id] ?? [];
        return (
          <fieldset key={g.id} className="f-comp-group">
            <legend className="f-lbl">{g.label}</legend>
            {g.options.map((o) => (
              <label key={o.id} className="f-check">
                <input
                  type="checkbox"
                  checked={on.includes(o.id)}
                  onChange={() =>
                    onChange({
                      ...picks,
                      [g.id]: on.includes(o.id)
                        ? on.filter((x) => x !== o.id)
                        : [...on, o.id],
                    })
                  }
                />
                <span>{tieLast(o.label)}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

function DetailPanel({ detail: d }: { detail: CompDetail }) {
  const { t } = useTranslation();
  return (
    <Panel color="cmp" className="f-comp-detail" title={d.kind}>
      <div className="f-comp-head">
        <CompGlyph icon={d.icon} />
        <div>
          <h3>{tieLast(d.name)}</h3>
          <p className="f-row-s">{d.facts.join("\u00a0· ")}</p>
        </div>
      </div>
      {d.kv.length > 0 && (
        <dl className="f-comp-kv">
          {d.kv.map((kv) => (
            <div key={kv.label}>
              <dt className="f-lbl">{kv.label}</dt>
              <dd>{kv.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {d.effect && (
        <div className="f-note" data-c="cmp">
          <span className="f-lbl">{t("compendium.screen.effect")}</span>
          <p>{d.effect}</p>
        </div>
      )}
      {d.text && <BlockMarkdown className="f-prose" text={tieTails(d.text)} />}
      {d.more.map((m) => (
        <div key={m.label} className="f-comp-more">
          <span className="f-lbl">{m.label}</span>
          <BlockMarkdown className="f-prose" text={tieTails(m.text)} />
        </div>
      ))}
    </Panel>
  );
}

/** A row's framed glyph, the same slot the sheet's actions wear. */
function CompGlyph({ icon }: { icon: CompIcon }) {
  if (icon.kind === "school" || icon.kind === "weapon") return <ActionIcon icon={icon} />;
  if (icon.kind === "feat") return <ActionIcon icon={{ kind: "feature" }} />;
  const glyph =
    icon.kind === "magic"
      ? magicItemSealIcon(icon.type)
      : equipmentCategoryIcon(icon.category);
  return (
    <span className="f-act-slot" aria-hidden="true">
      {createElement(glyph)}
    </span>
  );
}

/** A long name wraps without leaving its last word alone. */
const tieLast = (name: string) => name.replace(/ (\S+)$/, "\u00a0$1");

/** Each line of prose ends on its last three words together, never on a lone word. */
const tieTails = (md: string) =>
  md
    .split("\n")
    .map((line) =>
      line.startsWith("|") ? line : line.replace(/ (\S+) (\S+)$/, "\u00a0$1\u00a0$2")
    )
    .join("\n");
