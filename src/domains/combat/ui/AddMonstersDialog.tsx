/**
 * «Aggiungi mostri» on the Scontro tab (D&D Beyond's Encounter Builder): search, a
 * Challenge Rating filter, each creature a row ending in «+»; what's picked counts up on
 * its row (− takes one back), and the fight's difficulty updates as you pick (the word
 * in its colour and the XP). The DM's own creatures come first. «Aggiungi» puts them
 * all in the fight, with an undo.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  encounterBudget,
  homebrewMonsterInput,
  homebrewPickerMonsters,
} from "@/domains/combat/monster-picker-view";
import { MONSTERS } from "@/data/monsters";
import { monsterPortraitUrl } from "@/data/monster-art";
import { toMonsterInput } from "@/features/campaigns/encounter-monster-input";
import type { MonsterInput } from "@/lib/play/encounter";
import { useLibraryStore } from "@/stores/libraryStore";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { matchesSearch } from "@/lib/search";
import { fmtXp, formatCr } from "@/lib/utils";
import type { CampaignDoc } from "@/types/campaign";
import { Button, Chip, Dialog, Field } from "@/ui";
import { MonsterFace } from "@/domains/combat/ui/FightLine";

const BANDS = [
  { id: "all", min: 0, max: 99 },
  { id: "low", min: 0, max: 0.5 },
  { id: "mid", min: 1, max: 4 },
  { id: "high", min: 5, max: 10 },
  { id: "top", min: 11, max: 99 },
] as const;
type Band = (typeof BANDS)[number]["id"];
const SHOWN = 40;

interface Row {
  key: string;
  kind: "srd" | "homebrew";
  id: string;
  name: string;
  cr: number | null;
  sub: string;
  art: string | null;
}

export function AddMonstersDialog({
  campaign,
  locale,
  onAdd,
  onClose,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onAdd: (monsters: MonsterInput[], label: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const library = useLibraryStore((s) => s.entries);
  const [q, setQ] = useState("");
  const [band, setBand] = useState<Band>("all");
  const [picked, setPicked] = useState<ReadonlyMap<string, number>>(new Map());
  const rows = useMemo<Row[]>(
    () => [
      ...homebrewPickerMonsters(library).map((m) => ({
        key: `h:${m.id}`,
        kind: "homebrew" as const,
        id: m.id,
        name: m.name,
        cr: m.cr,
        sub: t("fight.dm.yours"),
        art: null,
      })),
      ...MONSTERS.map((m) => ({
        key: `s:${m.id}`,
        kind: "srd" as const,
        id: m.id,
        name: localizeSrd("monster", m.id, "name", locale),
        cr: m.cr,
        sub: t(`srd.creatureType_${m.type}`),
        art: monsterPortraitUrl(m.id),
      })),
    ],
    [library, locale, t]
  );
  const range = BANDS.find((b) => b.id === band) ?? BANDS[0];
  const found = rows.filter(
    (r) =>
      (band === "all" || (r.cr !== null && r.cr >= range.min && r.cr <= range.max)) &&
      (!q.trim() || matchesSearch(q, r.name))
  );
  const chosen = rows.filter((r) => picked.has(r.key));
  const count = chosen.reduce((n, r) => n + (picked.get(r.key) ?? 0), 0);
  const budget = encounterBudget(
    campaign,
    chosen.map((r) => ({ cr: r.cr, count: picked.get(r.key) ?? 0 }))
  );
  const bump = (key: string, by: number) => {
    const next = new Map(picked);
    const n = (next.get(key) ?? 0) + by;
    if (n > 0) next.set(key, n);
    else next.delete(key);
    setPicked(next);
  };
  const add = () => {
    const inputs = chosen.flatMap((r) => {
      const n = picked.get(r.key) ?? 0;
      if (r.kind === "homebrew") {
        const input = homebrewMonsterInput(library, r.id, n, null);
        return input ? [input] : [];
      }
      const m = MONSTERS.find((x) => x.id === r.id);
      return m ? [toMonsterInput(m, locale, n)] : [];
    });
    onAdd(inputs, chosen.map((r) => `${r.name} ×${picked.get(r.key)}`).join(", "));
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={t("fight.dm.addMonsters")}
      closeLabel={t("common.close")}
      actions={
        <>
          {budget.difficulty && (
            <span className="f-dm-budget" data-d={budget.difficulty}>
              <b>
                {t(
                  `campaignHub.encounterBudget${budget.difficulty[0]?.toUpperCase()}${budget.difficulty.slice(1)}`
                )}
              </b>
              {` · ${t("campaignHub.encounterBudgetXp", { xp: fmtXp(budget.xp, locale) })}`}
            </span>
          )}
          <Button kind="primary" disabled={count === 0} onClick={add}>
            {count > 0 ? t("fight.dm.addN", { count }) : t("common.add")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <Field
          label={t("fight.dm.search")}
          autoComplete="off"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="f-ask">
        <div className="f-chips" role="group" aria-label={t("fight.dm.crLabel")}>
          {BANDS.map((b) => (
            <Chip key={b.id} pressed={band === b.id} onClick={() => setBand(b.id)}>
              {b.id === "all" ? t("common.all") : t(`fight.dm.cr.${b.id}`)}
            </Chip>
          ))}
        </div>
      </div>
      <div className="f-dm-list">
        {found.slice(0, SHOWN).map((r) => {
          const n = picked.get(r.key) ?? 0;
          return (
            <div key={r.key} className="f-row f-dm-pick" data-on={n > 0 || undefined}>
              <span className="f-act-slot" data-painted="" aria-hidden="true">
                <Face row={r} />
              </span>
              <div className="f-row-main">
                <div className="f-row-t">{r.name}</div>
                <div className="f-row-s">
                  {[
                    r.cr !== null && t("polymorph.crShort", { cr: formatCr(r.cr) }),
                    r.sub,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="f-dm-count">
                {n > 0 && (
                  <>
                    <button
                      type="button"
                      className="f-dm-step"
                      aria-label={t("fight.dm.less", { name: r.name })}
                      onClick={() => bump(r.key, -1)}
                    >
                      −
                    </button>
                    <b aria-live="polite">{n}</b>
                  </>
                )}
                <button
                  type="button"
                  className="f-dm-step"
                  data-add=""
                  aria-label={t("fight.dm.more", { name: r.name })}
                  onClick={() => bump(r.key, 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
        {found.length === 0 && <p className="f-quiet">{t("fight.dm.none")}</p>}
      </div>
    </Dialog>
  );
}

/** The creature's face in the slot: its own painting cropped to the head, the same as
 *  the initiative rows; else its initial. */
function Face({ row }: { row: Row }) {
  return row.art ? (
    <MonsterFace src={row.art} />
  ) : (
    <b className="f-dm-initial">{row.name.slice(0, 1)}</b>
  );
}
