/**
 * DivineInterventionModal — the shared guided spell picker for every free-cast-FROM-LIST
 * pool (D4): Cleric Divine Intervention (cast any Cleric spell ≤ 5th, 1/LR — L20 adds
 * Wish to the same pool), War God's Blessing (cast Shield of Faith OR Spiritual
 * Weapon for one Channel Divinity), AND the S9 charged multi-spell ITEMS (Wand of
 * Binding/Fear, Ring of Animal Influence, Staff of Charming — cast one of several
 * spells from a shared item-charge pool, with per-spell charge costs). One picker,
 * copy keyed off the pool's `sourceId` (golden rule 3 — never a second bespoke
 * picker; golden rule 7 — a stable id, never a display string): a `sourceId` that
 * resolves to a magic item drives the item rubric/hint + the per-row charge-cost
 * chip and disables a row the pool can't afford.
 *
 * The eligible pool (`pool.spellIds`) is resolved by the engine
 * (`resolveFreeCastFromList`); this modal only RENDERS it (a searchable, level-grouped
 * list) and reports the chosen spell. Casting is the player's explicit pick →
 * immediate-commit-with-undo (the parent debits the per-rest tracker); the engine never
 * auto-casts (override-first). Reuses the shared `ModalShell` + `SearchField` +
 * `matchesSearch` + the chromatic `--sl` level seal. Bilingual search anchors on BOTH
 * the localized name and the EN name.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { SearchField } from "@/components/shared/SearchField";
import { matchesSearch } from "@/lib/search";
import { spellIndex } from "@/data/spells";
import { getMagicItem } from "@/data/magic-items";
import { localizeSrd } from "@/i18n/resolver";
import { srdEn } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";
import type { FreeCastFromListPool } from "@/lib/smart-tracker";

export interface DivineInterventionModalProps {
  /** When non-null, the modal is open with this resolved free-cast-from-list pool. */
  pool: FreeCastFromListPool | null;
  locale: Locale;
  /** Confirm: the chosen spell id to cast (the parent debits the tracker, with undo). */
  onCast: (spellId: string) => void;
  onCancel: () => void;
}

/** Cantrip uses --sl-c; levelled slots use --sl-N (the chromatic slot seal). */
function slotVar(level: number): string {
  return level <= 0 ? "var(--sl-c)" : `var(--sl-${level})`;
}

/**
 * Per-pool copy (rubric + hint) keyed off the pool's stable `sourceId` — War God's
 * Blessing is a fixed-2-spell, Channel-Divinity-debiting menu (no level cap), so it
 * gets its own rubric/hint; every other free-cast-from-list pool falls back to the
 * Divine Intervention "any spell ≤ {{level}}" copy.
 */
function poolCopy(sourceId: string): { rubricKey: string; hintKey: string } {
  return sourceId === "cleric-war-war-gods-blessing"
    ? { rubricKey: "combat.warGodsBlessingRubric", hintKey: "combat.warGodsBlessingHint" }
    : {
        rubricKey: "combat.divineInterventionRubric",
        hintKey: "combat.divineInterventionHint",
      };
}

export function DivineInterventionModal({
  pool,
  locale,
  onCast,
  onCancel,
}: DivineInterventionModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  // The eligible spells as { id, name, level }, localized + sorted by level then name.
  const rows = useMemo(() => {
    if (!pool) return [];
    return pool.spellIds
      .map((id) => {
        const data = spellIndex.get(id);
        return {
          id,
          level: data?.level ?? 0,
          name: localizeSrd("spell", id, "name", locale),
          nameEn: srdEn("spell", id, "name"),
        };
      })
      .filter((r) => matchesSearch(query, r.name, r.nameEn))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [pool, locale, query]);

  if (!pool) return null;

  // S9 — a pool whose `sourceId` is a MAGIC ITEM id is the item→pool bridge (Wand
  // of Binding/Fear, Ring of Animal Influence, Staff of Charming): its rubric is the
  // item's name, its hint says "spend the item's charges", and each row shows a
  // per-spell charge-cost chip + disables when the pool can't afford it. Feature
  // pools (Divine Intervention / War God's Blessing) render exactly as before.
  const item = getMagicItem(pool.sourceId);
  const { rubricKey, hintKey } = poolCopy(pool.sourceId);
  const rubric = item
    ? localizeSrd("magic-item", pool.sourceId, "name", locale)
    : t(rubricKey);
  const subtitle = item
    ? t("combat.itemPoolCastHint")
    : t(hintKey, { level: pool.maxSpellLevel });

  return (
    <ModalShell
      open
      size="md"
      onClose={onCancel}
      rubric={rubric}
      title={t("combat.divineInterventionTitle")}
      subtitle={subtitle}
    >
      <div className="flex flex-col gap-3 px-4 pb-4">
        {/* S9 — an item pool spends a shared CHARGE budget at a per-spell cost, so
            the picker leads with the live remaining/total charges the rows draw
            from; each per-row cost pill then reads against this visible budget.
            Feature pools (Divine Intervention) don't render it. */}
        {item != null && (
          <div
            className="cl-pool-status"
            aria-label={t("combat.itemPoolChargesRemaining", {
              remaining: pool.remaining,
              total: pool.charges,
            })}
          >
            <span className="cl-pool-count" aria-hidden>
              <b>{pool.remaining}</b> / {pool.charges}
            </span>
            <span className="cl-pool-unit" aria-hidden>
              {t("equipment.charges")}
            </span>
          </div>
        )}
        <SearchField
          value={query}
          onChange={setQuery}
          autoFocus
          placeholder={
            // The item pool isn't a Cleric list, so it reuses the generic
            // "Search spells…" placeholder (one runtime `common` ns) rather than
            // the Cleric-specific Divine Intervention one.
            item != null
              ? t("levelUp.spells.searchSpells")
              : t("combat.divineInterventionSearch")
          }
        />
        {rows.length === 0 ? (
          <p className="m-0 py-4 text-center text-sm text-text-secondary">
            {t("common.noResults")}
          </p>
        ) : (
          <div
            className="cl-opts max-h-[50vh] overflow-y-auto"
            role="list"
            aria-label={t("combat.divineInterventionTitle")}
          >
            {rows.map((r) => {
              // S9 — per-spell charge cost (item pools only). The row disables when
              // the pool can't afford this spell (Wand of Binding at 4 charges →
              // Hold Monster costs 5 → disabled; Hold Person costs 2 → enabled).
              const cost = pool.costBySpell[r.id] ?? 1;
              const disabled = item != null && pool.remaining < cost;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="listitem"
                  className="cl-opt cl-slot"
                  style={{ ["--sl" as string]: slotVar(r.level) }}
                  disabled={disabled}
                  aria-disabled={disabled}
                  onClick={() => onCast(r.id)}
                >
                  <span className="cl-seal" aria-hidden>
                    {r.level}
                  </span>
                  <span className="cl-name">{r.name}</span>
                  {item != null && (
                    <span className="cl-cost" data-charge-cost={cost}>
                      {t("combat.itemPoolChargeCost", { n: cost })}
                    </span>
                  )}
                  <span className="cl-count">
                    {t("spells.levelShort", { level: r.level })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
