/**
 * MonsterStatBlockCard — the shared, presentational D&D 2024 (SRD 5.2.1) monster
 * statblock renderer. Home of the bestiary's read surface: the compendium
 * Monsters section mounts it in a detail leaf's `extras`, and the later
 * encounter/companion surfaces reuse it (hence `components/shared`, not the
 * compendium feature).
 *
 * PURE + presentational: it takes the {@link MonsterStatBlock} (ids + numbers)
 * plus the active locale, resolves every display string through the LAZY `monster`
 * catalogue + the closed-set chrome seams, and derives every printed number through
 * `src/lib/monster.ts` (D-4 — nothing derivable is stored). Prose is the display
 * truth (D-3): each entry prints its catalogue `text` through `InlineMarkdown` +
 * `highlightRulesText`, never a line reconstructed from the structured fields.
 *
 * Struck on the `.beast-ref` plaque family (the polymorph reference card's carved
 * vellum vocabulary, InfoCard register tier), regrown as the `.mon-*` recipes;
 * token-driven, so both themes come for free. When `title` is omitted the card is
 * headless — the compendium masthead already carries the name + identity line;
 * the standalone (future) uses pass `title`.
 */

import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import { conditionChips } from "@/lib/views/tracker-view";
import { abilityModifier } from "@/lib/ability";
import { formatCr, formatModifier, localeDistance } from "@/lib/utils";
import {
  monsterInitiative,
  monsterPassivePerception,
  monsterSaveBonus,
  monsterSkillBonus,
  pbForCr,
  xpForCr,
} from "@/lib/monster";
import type {
  AbilityCode,
  DamageType,
  MonsterEntry,
  MonsterStatBlock,
} from "@/data/types";
import type { Locale } from "@/lib/locale";
import { monsterIdentity } from "@/components/shared/monster-identity";

/** The translator, derived from the hook (no direct i18next type import). */
type TFn = ReturnType<typeof useTranslation>["t"];

const ABILITY_ORDER: readonly AbilityCode[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/** The recharge / limited-use parenthetical struck after an entry name. */
function entrySuffix(entry: MonsterEntry, t: TFn): string {
  if (entry.recharge != null) {
    return entry.recharge === 6
      ? ` (${t("monster.rechargeExact")})`
      : ` (${t("monster.recharge", { min: entry.recharge })})`;
  }
  if (entry.uses) {
    const label =
      entry.uses.per === "day"
        ? t("monster.usesPerDay", { count: entry.uses.count })
        : entry.uses.per === "short-or-long-rest"
          ? t("monster.usesRechargeShortLong")
          : t("monster.usesRechargeLong");
    return ` (${label})`;
  }
  return "";
}

/** XP formatted per locale, in the app's `it-IT`/`en-US` thousands grouping. */
function fmtXp(n: number, locale: Locale): string {
  return n.toLocaleString(locale === "it" ? "it-IT" : "en-US");
}

/** Damage-type names as ink-tinted runs (`--dmg-<type>-ink`), comma-joined. */
function damageRun(types: ReadonlyArray<DamageType>, t: TFn): ReactNode {
  return types.map((type, i) => (
    <Fragment key={type}>
      {i > 0 && ", "}
      <span
        className="mon-dmg"
        style={{ ["--mon-dmg-ink" as string]: `var(--dmg-${type}-ink)` }}
      >
        {t(`srd.damage_${type}`)}
      </span>
    </Fragment>
  ));
}

/** Localized Languages line — handles the closed irregular prints (understands-only,
 *  plus-any, knew-in-life, telepathy); the omitted field renders the honest "None". */
function languagesLine(m: MonsterStatBlock, t: TFn, locale: Locale): string {
  const L = m.languages;
  // Omitted field → the honest "None" (the shared generic label), not a bare "—".
  if (!L) return t("abilities.none");
  const parts: string[] = [];
  if (L.special === "knew-in-life") {
    parts.push(t("monster.langKnewInLife"));
  } else if (L.special === "all") {
    parts.push(t("monster.langAll"));
  } else {
    let langs = (L.ids ?? [])
      .map((id) => localizeSrd("language", id, "name", locale))
      .join(", ");
    if (L.plusAnyCount) {
      langs = t("monster.langPlusAny", { langs, count: L.plusAnyCount });
    }
    if (L.understandsOnly) langs = t("monster.langUnderstands", { langs });
    if (langs) parts.push(langs);
    // The split print: spoken `ids` above, then a separate understands-only clause.
    const uo = (L.understandsOnlyIds ?? [])
      .map((id) => localizeSrd("language", id, "name", locale))
      .join(", ");
    if (uo) parts.push(t("monster.langUnderstands", { langs: uo }));
  }
  if (L.telepathyFt != null) {
    parts.push(t("monster.telepathy", { dist: localeDistance(L.telepathyFt, locale) }));
  }
  return parts.join(", ");
}

/** One statblock entry — the bold name + suffix, then its catalogue prose lit by
 *  the rules-colour grammar. The name is injected as markdown so the whole entry is
 *  ONE valid inline paragraph (a block renderer nested in a `<p>` is invalid HTML). */
function StatEntry({
  m,
  section,
  entry,
  locale,
}: {
  m: MonsterStatBlock;
  section: string;
  entry: MonsterEntry;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const key = srdKey(m.id, section, entry.id);
  const name = localizeSrd("monster", key, "name", locale);
  const text = localizeSrd("monster", key, "text", locale);
  return (
    <InlineMarkdown
      className="mon-entry"
      text={`**${name}${entrySuffix(entry, t)}.** ${text}`}
      highlight={highlightRulesText(locale)}
    />
  );
}

/** A labelled statblock section (Traits · Actions · …) — the gilt eyebrow + entries. */
function StatSection({
  m,
  section,
  entries,
  label,
  locale,
  header,
}: {
  m: MonsterStatBlock;
  section: string;
  entries: ReadonlyArray<MonsterEntry> | undefined;
  label: string;
  locale: Locale;
  /** Extra header content (the legendary uses line + preamble). */
  header?: ReactNode;
}) {
  if (!entries || entries.length === 0) return null;
  return (
    <section className="mon-sec">
      <span className="beast-ref-label">{label}</span>
      {header}
      {entries.map((entry) => (
        <StatEntry key={entry.id} m={m} section={section} entry={entry} locale={locale} />
      ))}
    </section>
  );
}

/** A labelled ledger line (Skills · Immunities · Senses · …). */
function LedgerLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mon-line">
      <span className="beast-ref-label">{label}</span> {children}
    </div>
  );
}

export interface MonsterStatBlockCardProps {
  monster: MonsterStatBlock;
  locale: Locale;
  /** When set, the card renders its own title band (name + identity line); omitted
   *  ⇒ headless (the compendium masthead already carries them). */
  title?: string;
}

export function MonsterStatBlockCard({
  monster: m,
  locale,
  title,
}: MonsterStatBlockCardProps) {
  const { t } = useTranslation();

  // Defense line ---------------------------------------------------------------
  const init = monsterInitiative(m);
  const speedParts: string[] = [];
  if (m.speeds.walk != null) speedParts.push(localeDistance(m.speeds.walk, locale));
  for (const mode of ["climb", "fly", "swim", "burrow"] as const) {
    const v = m.speeds[mode];
    if (v == null) continue;
    const label =
      mode === "burrow" ? t("polymorph.speedBurrow") : t(`character.speed_${mode}`);
    let part = `${label} ${localeDistance(v, locale)}`;
    if (mode === "fly" && m.hover) part += ` (${t("monster.hover")})`;
    speedParts.push(part);
  }

  // Ledger defenses ------------------------------------------------------------
  const qualified = (kind: "resistance" | "immunity" | "vulnerability") =>
    m.qualifiedDefenses?.filter((q) => q.kind === kind) ?? [];

  const condImm = m.conditionImmunities ?? [];
  const condChips = conditionChips(
    condImm.map((c) => (typeof c === "string" ? c : c.id)),
    locale
  );

  // Senses (always ends with passive Perception) -------------------------------
  const senseParts: string[] = [];
  if (m.senses) {
    for (const kind of [
      "darkvision",
      "blindsight",
      "tremorsense",
      "truesight",
    ] as const) {
      const ft = m.senses[`${kind}Ft`];
      if (ft == null) continue;
      let part = `${t(`character.sense_${kind}`)} ${localeDistance(ft, locale)}`;
      if (kind === "blindsight" && m.senses.blindBeyond) {
        part += ` ${t("monster.blindBeyond")}`;
      }
      if (kind === "darkvision" && m.senses.unimpededByMagicalDarkness) {
        part += ` ${t("monster.darkvisionMagical")}`;
      }
      senseParts.push(part);
    }
  }

  // CR line --------------------------------------------------------------------
  const xpPart =
    m.xpInLair != null
      ? t("monster.xpWithLair", {
          xp: fmtXp(m.xp ?? xpForCr(m.cr), locale),
          lairXp: fmtXp(m.xpInLair, locale),
        })
      : t("monster.xp", { xp: fmtXp(m.xp ?? xpForCr(m.cr), locale) });

  const legendaryHeader = m.legendary ? (
    <>
      <p className="mon-legendary-uses">
        {m.legendary.usesInLair != null
          ? t("monster.legendaryUsesInLair", {
              count: m.legendary.uses,
              inLair: m.legendary.usesInLair,
            })
          : t("monster.legendaryUses", { count: m.legendary.uses })}
      </p>
      <p className="mon-legendary-preamble">
        {t("monster.legendaryPreamble", {
          name: localizeSrd("monster", m.id, "name", locale),
        })}
      </p>
    </>
  ) : undefined;

  const qualifierText = (
    kind: "resistance" | "immunity" | "vulnerability",
    hasPrefix: boolean
  ): ReactNode =>
    qualified(kind).map((q, i) => (
      <Fragment key={"noteKey" in q ? q.noteKey : q.qualifier}>
        {(hasPrefix || i > 0) && ", "}
        {"noteKey" in q ? (
          // A GM-variable defense: the printed prose note, rendered verbatim.
          t(`monster.defenseNote_${q.noteKey}`)
        ) : (
          <>
            {damageRun(q.damageTypes, t)}{" "}
            <span className="mon-qualifier">
              ({t(`monster.qualifier_${q.qualifier}`)})
            </span>
          </>
        )}
      </Fragment>
    ));

  return (
    <div className="beast-ref mon-ref">
      {title && (
        <p className="beast-ref-head mon-head">
          <strong>{title}</strong>{" "}
          <span className="beast-ref-meta">{monsterIdentity(m, t)}</span>
        </p>
      )}

      {/* Defense line — AC · Initiative · HP · Speed */}
      <dl className="beast-ref-grid mon-vitals">
        <div>
          <dt>{t("character.armorClassShort")}</dt>
          <dd>{m.ac}</dd>
        </div>
        <div>
          <dt>{t("monster.initiative")}</dt>
          <dd>
            {formatModifier(init)} ({10 + init})
          </dd>
        </div>
        <div>
          <dt>{t("units.hp")}</dt>
          <dd>
            {m.hp.average} (<span translate="no">{m.hp.formula}</span>)
          </dd>
        </div>
        <div>
          <dt>{t("character.speed")}</dt>
          <dd>{speedParts.join(", ")}</dd>
        </div>
      </dl>

      {/* Ability table — SCORE · MOD · SAVE per ability */}
      <table className="mon-abilities">
        <caption className="sr-only">{t("character.abilityScores")}</caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              {t("character.abilityScores")}
            </th>
            <th scope="col">{t("monster.mod")}</th>
            <th scope="col">{t("abilities.save")}</th>
          </tr>
        </thead>
        <tbody>
          {ABILITY_ORDER.map((code) => (
            <tr key={code}>
              <th scope="row">
                <span className="mon-ab-code">{t(`abilities.${code}_short`)}</span>{" "}
                <span className="mon-ab-score">{m.abilityScores[code]}</span>
              </th>
              <td>{formatModifier(abilityModifier(m.abilityScores[code]))}</td>
              <td>{formatModifier(monsterSaveBonus(m, code))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Ledger lines */}
      {m.skills && m.skills.length > 0 && (
        <LedgerLine label={t("abilities.skills")}>
          {m.skills
            .map(
              (s) =>
                `${t(`skills.${s.skill}`)} ${formatModifier(monsterSkillBonus(m, s))}`
            )
            .join(", ")}
        </LedgerLine>
      )}

      {Boolean(m.damageVulnerabilities?.length || qualified("vulnerability").length) && (
        <LedgerLine label={t("abilities.vulnerabilitiesLabel")}>
          {damageRun(m.damageVulnerabilities ?? [], t)}
          {qualifierText("vulnerability", Boolean(m.damageVulnerabilities?.length))}
        </LedgerLine>
      )}

      {Boolean(m.damageResistances?.length || qualified("resistance").length) && (
        <LedgerLine label={t("abilities.resistancesLabel")}>
          {damageRun(m.damageResistances ?? [], t)}
          {qualifierText("resistance", Boolean(m.damageResistances?.length))}
        </LedgerLine>
      )}

      {Boolean(
        m.damageImmunities?.length || condImm.length || qualified("immunity").length
      ) && (
        <LedgerLine label={t("abilities.immunitiesLabel")}>
          {damageRun(m.damageImmunities ?? [], t)}
          {qualifierText("immunity", Boolean(m.damageImmunities?.length))}
          {condChips.length > 0 && (
            <span className="mon-cond-chips">
              {condChips.map((chip, i) => {
                const c = condImm[i];
                const note = c && typeof c !== "string" ? c.note : undefined;
                return (
                  <span
                    key={chip.id}
                    className="co-chip"
                    style={{
                      ["--co" as string]: chip.color,
                      ["--co-ink" as string]: chip.ink,
                    }}
                  >
                    {chip.label}
                    {note && (
                      <span className="mon-cond-note">
                        ({t(`monster.condNote_${note}`)})
                      </span>
                    )}
                  </span>
                );
              })}
            </span>
          )}
        </LedgerLine>
      )}

      {m.gear && m.gear.length > 0 && (
        <LedgerLine label={t("monster.gear")}>
          {m.gear
            .map((g) => {
              const name = hasSrd("equipment", g.id, "name", locale)
                ? localizeSrd("equipment", g.id, "name", locale)
                : g.id;
              return g.qty ? `${name} ×${g.qty}` : name;
            })
            .join(", ")}
        </LedgerLine>
      )}

      <LedgerLine label={t("abilities.sensesLabel")}>
        {[
          ...senseParts,
          `${t("abilities.passivePerceptionLabel")} ${monsterPassivePerception(m)}`,
        ].join(", ")}
      </LedgerLine>

      <LedgerLine label={t("abilities.languages")}>
        {languagesLine(m, t, locale)}
      </LedgerLine>

      <p className="mon-cr">
        {t("polymorph.crShort", { cr: formatCr(m.cr) })} ({xpPart};{" "}
        {t("monster.pb", { pb: formatModifier(pbForCr(m.cr)) })})
      </p>

      {/* Sections — 2024 reading order */}
      <StatSection
        m={m}
        section="traits"
        entries={m.traits}
        label={t("polymorph.traits")}
        locale={locale}
      />
      <StatSection
        m={m}
        section="actions"
        entries={m.actions}
        label={t("combat.actions")}
        locale={locale}
      />
      <StatSection
        m={m}
        section="bonusActions"
        entries={m.bonusActions}
        label={t("combat.groupBonus")}
        locale={locale}
      />
      <StatSection
        m={m}
        section="reactions"
        entries={m.reactions}
        label={t("combat.reactions")}
        locale={locale}
      />
      <StatSection
        m={m}
        section="legendaryActions"
        entries={m.legendaryActions}
        label={t("monster.legendaryActions")}
        locale={locale}
        header={legendaryHeader}
      />
    </div>
  );
}
