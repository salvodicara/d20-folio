/**
 * BeastFormPicker — the Polymorph / True Polymorph Beast-form chooser (S7).
 *
 * Opened from a Polymorph spell card's "Transform" affordance. Two modes:
 *  - **Myself** — choosing a Beast APPLIES the self-swap (the store
 *    `assumePolymorphForm` stamps AC/speeds/scores + Temp HP, engages
 *    concentration). Consistent with the single-character-sheet architecture.
 *  - **Another creature** — a READ-ONLY reference: pick a Beast to view its stat
 *    block for a creature you polymorph. NO swap, NO override writes — the app
 *    models one character, so a polymorphed TARGET is a reference card only.
 *
 * The eligible forms (`forms`) are CR-gated by the engine
 * (`resolvePolymorphForms` — CR ≤ the caster's level). Reuses the shared
 * `ModalShell` + `SearchField` + `matchesSearch`, mirroring
 * {@link import("./DivineInterventionModal").DivineInterventionModal}. SRD names
 * (Beast / attacks / traits) resolve through the `beasts` catalogue at render;
 * this component reads ZERO BiText.
 *
 * Folio-styled: the mode switch is the shared `Segmented` control; the list is
 * the fixed-height `flex-1` scroll region with the read-only stat block pinned
 * below it (`.beast-ref` — a carved recessed creature plaque), so the picked
 * creature is always visible without scrolling past the whole list.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { Segmented } from "@/components/ui/segmented";
import { SearchField } from "@/components/shared/SearchField";
import { matchesSearch } from "@/lib/search";
import { localizeSrd } from "@/i18n/resolver";
import { srdEn } from "@/i18n/srd-en";
import { formatModifier, localeDistance } from "@/lib/utils";
import { abilityModifier } from "@/lib/ability";
import type { Locale } from "@/lib/locale";
import type { AbilityCode, BeastStatBlock } from "@/data/types";

const ABILITY_ORDER: ReadonlyArray<AbilityCode> = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
];

/** Format a (possibly-fractional) Challenge Rating: 0.25 → "1/4", 0.5 → "1/2". */
function formatCr(cr: number): string {
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

export interface BeastFormPickerProps {
  open: boolean;
  /** CR-gated Beast forms (`resolvePolymorphForms(character)`). */
  forms: ReadonlyArray<BeastStatBlock>;
  locale: Locale;
  /** Apply the SELF-swap for `beastId` (the parent's `assumePolymorphForm`). */
  onAssume: (beastId: string) => void;
  onClose: () => void;
}

/** The read-only stat block shown for a chosen Beast (reference card + confirm). */
function BeastStatBlockView({
  beast,
  locale,
}: {
  beast: BeastStatBlock;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const name = localizeSrd("beasts", beast.id, "name", locale);
  const speedParts: string[] = [];
  if (typeof beast.speeds.walk === "number")
    speedParts.push(
      `${t("polymorph.speedWalk")} ${localeDistance(beast.speeds.walk, locale)}`
    );
  for (const mode of ["fly", "swim", "climb", "burrow"] as const) {
    const v = beast.speeds[mode];
    if (typeof v === "number") {
      const label =
        mode === "burrow" ? t("polymorph.speedBurrow") : t(`character.speed_${mode}`);
      speedParts.push(`${label} ${localeDistance(v, locale)}`);
    }
  }
  const senseParts: string[] = [];
  for (const kind of ["darkvision", "blindsight", "tremorsense", "truesight"] as const) {
    const ft = beast.senses?.[`${kind}Ft`];
    if (typeof ft === "number")
      senseParts.push(`${t(`character.sense_${kind}`)} ${localeDistance(ft, locale)}`);
  }

  return (
    <div className="beast-ref">
      <p className="beast-ref-head">
        <strong>{name}</strong>{" "}
        <span className="beast-ref-meta">
          {t(`srd.size_${beast.size.toLowerCase()}`)} ·{" "}
          {t("polymorph.crShort", {
            cr: formatCr(beast.cr),
          })}
        </span>
      </p>
      <dl className="beast-ref-grid">
        <div>
          <dt>{t("character.armorClassShort")}</dt>
          <dd>{beast.ac}</dd>
        </div>
        <div>
          <dt>{t("units.hp")}</dt>
          <dd>{beast.hp}</dd>
        </div>
        <div>
          <dt>{t("character.speed")}</dt>
          <dd>{speedParts.join(", ")}</dd>
        </div>
      </dl>
      <ul className="beast-ref-scores">
        {ABILITY_ORDER.map((code) => (
          <li key={code}>
            <span className="beast-ref-score-code">{code}</span>{" "}
            {beast.abilityScores[code]} (
            {formatModifier(abilityModifier(beast.abilityScores[code]))})
          </li>
        ))}
      </ul>
      {beast.attacks.length > 0 && (
        <div className="beast-ref-section">
          <span className="beast-ref-label">{t("combat.attacksPerAction")}</span>
          <ul>
            {beast.attacks.map((atk, i) => {
              const dist = atk.range
                ? `${localeDistance(atk.range.nearFt, locale)}/${localeDistance(
                    atk.range.farFt,
                    locale
                  )}`
                : localeDistance(atk.reachFt ?? 5, locale);
              return (
                <li key={`${atk.nameKey}-${i}`}>
                  {localizeSrd("beasts", atk.nameKey, "name", locale)}{" "}
                  {formatModifier(atk.toHit)} · {atk.damageDice}{" "}
                  {t(`srd.damage_${atk.damageType}`)} · {dist}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {beast.senses && senseParts.length > 0 && (
        <div className="beast-ref-section">
          <span className="beast-ref-label">{t("character.hud.senses")}</span>{" "}
          {senseParts.join(", ")}
        </div>
      )}
      {beast.traits && beast.traits.length > 0 && (
        <div className="beast-ref-section">
          <span className="beast-ref-label">{t("polymorph.traits")}</span>{" "}
          {beast.traits.map((id) => localizeSrd("beasts", id, "name", locale)).join(", ")}
        </div>
      )}
    </div>
  );
}

export function BeastFormPicker({
  open,
  forms,
  locale,
  onAssume,
  onClose,
}: BeastFormPickerProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"self" | "reference">("self");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return forms
      .map((b) => ({
        beast: b,
        name: localizeSrd("beasts", b.id, "name", locale),
        nameEn: srdEn("beasts", b.id, "name") ?? b.id,
      }))
      .filter((r) => matchesSearch(query, r.name, r.nameEn));
  }, [forms, locale, query]);

  if (!open) return null;

  const selected = selectedId ? (forms.find((b) => b.id === selectedId) ?? null) : null;

  return (
    <ModalShell
      open
      size="md"
      onClose={onClose}
      rubric={t("polymorph.rubric")}
      title={t("polymorph.title")}
      subtitle={mode === "self" ? t("polymorph.selfHint") : t("polymorph.referenceHint")}
    >
      {/* Fixed-height flex column: the list is the `flex-1` scroll region, and the
          REFERENCE stat block pins below it (`shrink-0`) so the picked creature is
          always visible — the list shrinks to make room, never the block. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
        <Segmented
          className="poly-mode-switch"
          aria-label={t("polymorph.title")}
          value={mode}
          onChange={(next) => {
            setMode(next);
            // The reference selection only shows in "reference" mode; clear it when
            // returning to "self" so a later switch back never reveals a stale block.
            if (next === "self") setSelectedId(null);
          }}
          options={[
            { value: "self", label: t("polymorph.selfTab") },
            { value: "reference", label: t("polymorph.referenceTab") },
          ]}
        />

        <SearchField
          value={query}
          onChange={setQuery}
          autoFocus
          placeholder={t("polymorph.search")}
        />

        {rows.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <p className="m-0 py-4 text-center text-sm text-text-secondary">
              {forms.length === 0 ? t("polymorph.noForms") : t("common.noResults")}
            </p>
          </div>
        ) : (
          <div className="cl-opts min-h-0 flex-1 overflow-y-auto" role="list">
            {rows.map((r) => (
              <button
                key={r.beast.id}
                type="button"
                role="listitem"
                className={`cl-opt${selectedId === r.beast.id ? " is-active" : ""}`}
                onClick={() => {
                  if (mode === "self") {
                    onAssume(r.beast.id);
                    onClose();
                  } else {
                    setSelectedId(r.beast.id);
                  }
                }}
              >
                <span className="cl-name">{r.name}</span>
                <span className="cl-count">
                  {t(`srd.size_${r.beast.size.toLowerCase()}`)} ·{" "}
                  {t("polymorph.crShort", { cr: formatCr(r.beast.cr) })}
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === "reference" && selected && (
          <div className="shrink-0">
            <BeastStatBlockView beast={selected} locale={locale} />
          </div>
        )}
      </div>
    </ModalShell>
  );
}
