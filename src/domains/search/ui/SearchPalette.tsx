/**
 * ⌘K on the new UI: one search over the player's characters and campaigns, the app's
 * screens, the rules and the whole compendium, in either language. The pattern is the
 * quick search of D&D Beyond's header and Foundry's Quick Insert, and the classic sheet's
 * own palette: a field on top, then the hits grouped under a heading per kind, the
 * best group first; ↑ ↓ walk them and Enter opens one. A rule with no page of its own
 * (a condition, a skill) opens its «In breve» in place. With nothing typed, the few
 * entries opened last.
 *
 * It reads the roster and the compendium, so the shell mounts it lazily, on first open.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import type { SearchEntry, SearchKind } from "@/domains/search/global-search";
import { loadSearchIndex } from "@/domains/search/load-search-index";
import { moveHighlight, paletteView } from "@/domains/search/palette-view";
import type { SearchHit, SearchIndex } from "@/domains/search/search-index";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import { getPaletteRecents, recordPaletteRecent } from "@/app/shell/palette-recents";
import { listSharedCampaigns } from "@/features/campaigns/campaign-io";
import { useCharacters } from "@/hooks/useCharacters";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useLocale } from "@/hooks/useLocale";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";
import { Art, Dialog, Icon } from "@/ui";
import type { IconName } from "@/ui/icon-names";

const GROUP_KEY: Record<SearchKind, string> = {
  character: "palette.groupCharacters",
  campaign: "palette.groupCampaigns",
  destination: "palette.groupSections",
  rule: "palette.groupReference",
  compendium: "palette.groupCompendium",
};

const KIND_ICON: Record<SearchKind, IconName> = {
  character: "g-create",
  campaign: "g-campaign",
  destination: "g-compass",
  rule: "g-journal",
  compendium: "g-journal",
};

export default function SearchPalette({
  open,
  initialQuery = "",
  onClose,
}: {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const uid = useAuthStore((s) => s.user?.uid);
  const { characters } = useCharacters();
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [highlight, setHighlight] = useState(-1);
  const [explained, setExplained] = useState<string | null>(null);
  const [recents] = useState(getPaletteRecents);
  const listId = useId();

  useEffect(() => {
    if (!uid) return;
    let live = true;
    void listSharedCampaigns(uid)
      .then((list) => {
        if (live) setCampaigns(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [uid]);

  // Built on first open, rebuilt when the language or the lists change.
  useEffect(() => {
    let live = true;
    void loadSearchIndex({
      t,
      locale,
      characters,
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
      isAdmin,
    }).then((built) => {
      if (live) setIndex(built);
    });
    return () => {
      live = false;
    };
  }, [t, locale, characters, campaigns, isAdmin]);

  const view = useMemo(
    () => paletteView(index ? index.query(query, { limit: 30, recents }) : []),
    [index, query, recents]
  );
  const activeId = (n: number) => `${listId}-${String(n)}`;

  const choose = (entry: SearchEntry) => {
    recordPaletteRecent(entry.id);
    if (entry.action.kind === "navigate") {
      onClose();
      void navigate(entry.action.route);
    } else {
      setExplained((cur) => (cur === entry.id ? null : entry.id));
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const count = view.flat.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, count, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      const hit = view.flat[highlight] ?? view.flat[0];
      if (hit) {
        e.preventDefault();
        choose(hit.entry);
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("palette.title")}
      closeLabel={t("common.close")}
    >
      <div className="f-pal">
        <label className="f-srch f-pal-field">
          <Icon name="u-search" />
          <input
            data-autofocus=""
            type="search"
            role="combobox"
            aria-expanded={view.flat.length > 0}
            aria-controls={listId}
            aria-activedescendant={highlight >= 0 ? activeId(highlight) : undefined}
            aria-label={t("palette.title")}
            placeholder={t("palette.placeholder")}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(-1);
              setExplained(null);
            }}
            onKeyDown={onKey}
          />
        </label>
        <div
          id={listId}
          role="listbox"
          aria-label={t("palette.title")}
          className="f-pal-list"
        >
          {index && query.trim() !== "" && view.flat.length === 0 && (
            <p className="f-quiet">{t("palette.empty")}</p>
          )}
          {/* nothing typed and nothing opened yet: say what the search finds */}
          {query.trim() === "" && view.flat.length === 0 && (
            <p className="f-quiet">{t("palette.description")}</p>
          )}
          {view.groups.map((group) => (
            <div key={group.kind} role="group" aria-label={t(GROUP_KEY[group.kind])}>
              <p className="f-help f-pal-gh">{t(GROUP_KEY[group.kind])}</p>
              {group.hits.map((hit) => {
                const i = view.flat.indexOf(hit);
                return (
                  <PaletteRow
                    key={hit.entry.id}
                    id={activeId(i)}
                    hit={hit}
                    on={i === highlight}
                    open={explained === hit.entry.id}
                    onChoose={() => choose(hit.entry)}
                    onHover={() => setHighlight(i)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function PaletteRow({
  id,
  hit,
  on,
  open,
  onChoose,
  onHover,
}: {
  id: string;
  hit: SearchHit;
  on: boolean;
  open: boolean;
  onChoose: () => void;
  onHover: () => void;
}) {
  const { entry } = hit;
  const art = entry.art;
  const glyph = <Icon name={KIND_ICON[entry.kind]} />;
  return (
    <div className="f-pal-item">
      <button
        id={id}
        type="button"
        role="option"
        aria-selected={on}
        tabIndex={-1}
        className="f-pal-row"
        onClick={onChoose}
        onMouseMove={onHover}
      >
        <span className="f-act-slot" data-painted="" aria-hidden="true">
          {art && "spell" in art ? (
            <SpellArt id={art.spell} school={art.school} size="fill" />
          ) : art ? (
            <Art kind={art.kind} id={art.id} fallback={glyph} />
          ) : (
            glyph
          )}
        </span>
        <span className="f-row-main">
          <span className="f-row-t">{entry.label}</span>
          {entry.sub && <span className="f-row-s">{entry.sub}</span>}
        </span>
      </button>
      {open && entry.gist && <p className="f-note f-pal-gist">{entry.gist}</p>}
    </div>
  );
}
