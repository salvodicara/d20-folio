/**
 * CustomSpellEditForm — the inline edit form for a homebrew spell (name / level /
 * school / range / duration / components / description / higher-levels / notes).
 * Homebrew content is USER data: it carries its own single-locale text and is
 * shown verbatim (no SRD resolver). Extracted from SpellsTab so the orchestrator
 * stays thin and the custom-spell card body is testable in isolation.
 */
import { useTranslation } from "react-i18next";
import { Input, Textarea } from "@/components/ui/input";
import { CheckboxField } from "@/components/ui/selection";
import { Select } from "@/components/shared/Select";
import { castingTimeI18nKey } from "@/lib/utils";
import type { CustomSpell } from "@/types/character";

/** The same casting-time option tokens the creation form offers (stable ids). */
const CASTING_TIMES = [
  "action",
  "bonus",
  "reaction",
  "1 minute",
  "10 minutes",
  "1 hour",
  "8 hours",
  "24 hours",
] as const;

/** Conform a stored casting time to its option token ("bonus action" → "bonus"). */
function castingTimeOption(raw: string): string {
  const key = castingTimeI18nKey(raw);
  return key === "bonus action" ? "bonus" : key;
}

export function CustomSpellEditForm({
  spell,
  onUpdateField,
  onUpdateComponent,
}: {
  spell: CustomSpell;
  onUpdateField: (field: string, value: string | boolean | number | null) => void;
  onUpdateComponent: (key: "v" | "s" | "m" | "material", value: boolean | string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="custom-spell-form">
      <Input
        type="text"
        defaultValue={spell.name}
        placeholder={t("common.name")}
        aria-label={t("common.name")}
        onBlur={(e) => onUpdateField("name", e.target.value.trim() || spell.name)}
      />
      <div className="csf-row">
        <label className="field">
          <span className="field-label">{t("common.level")}</span>
          <Select
            defaultValue={spell.level}
            onChange={(e) => onUpdateField("level", Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
              <option key={l} value={l}>
                {l === 0 ? t("spells.cantrip") : l}
              </option>
            ))}
          </Select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">{t("spells.school")}</span>
          <Select
            defaultValue={spell.school}
            onChange={(e) => onUpdateField("school", e.target.value)}
          >
            {(
              [
                "abjuration",
                "conjuration",
                "divination",
                "enchantment",
                "evocation",
                "illusion",
                "necromancy",
                "transmutation",
              ] as const
            ).map((s) => (
              <option key={s} value={s}>
                {t(`srd.school_${s}`)}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="csf-row">
        {/* Casting time was settable at creation but not editable afterwards —
            it drives the card's action-economy edge + gloss, so it must stay
            edit-in-place like every other field (same option ids as the
            creation form; golden rule 7 — the select binds stable tokens). */}
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">{t("spells.castingTime")}</span>
          <Select
            defaultValue={castingTimeOption(spell.castingTime)}
            onChange={(e) => onUpdateField("castingTime", e.target.value)}
          >
            {CASTING_TIMES.map((ct) => (
              <option key={ct} value={ct}>
                {t(`srd.castingTime_${ct}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">{t("spells.range")}</span>
          <Input
            type="text"
            defaultValue={spell.range}
            onBlur={(e) => onUpdateField("range", e.target.value)}
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">{t("spells.duration")}</span>
          <Input
            type="text"
            defaultValue={spell.duration}
            onBlur={(e) => onUpdateField("duration", e.target.value)}
          />
        </label>
      </div>
      <div className="csf-checks">
        {(["v", "s", "m"] as const).map((c) => (
          <CheckboxField
            key={c}
            className="csf-check"
            checked={spell.components[c]}
            onCheckedChange={(val) => onUpdateComponent(c, val)}
            label={c.toUpperCase()}
          />
        ))}
        <CheckboxField
          className="csf-check"
          checked={spell.concentration}
          onCheckedChange={(val) => onUpdateField("concentration", val)}
          label={t("spells.concentration")}
        />
      </div>
      {spell.components.m && (
        <Input
          type="text"
          defaultValue={spell.components.material ?? ""}
          placeholder={t("spells.material")}
          aria-label={t("spells.material")}
          onBlur={(e) => onUpdateComponent("material", e.target.value)}
        />
      )}
      <Textarea
        style={{ minHeight: 80, resize: "vertical" }}
        placeholder={t("common.descriptionPlaceholder")}
        rows={4}
        defaultValue={spell.description}
        aria-label={t("common.descriptionPlaceholder")}
        onBlur={(e) => onUpdateField("description", e.target.value)}
      />
      <Textarea
        style={{ minHeight: 48, resize: "vertical" }}
        placeholder={t("spells.higherLevelsPlaceholder")}
        rows={2}
        defaultValue={spell.higherLevels ?? ""}
        aria-label={t("spells.higherLevelsPlaceholder")}
        onBlur={(e) => onUpdateField("higherLevels", e.target.value)}
      />
      <Textarea
        style={{ minHeight: 48, resize: "vertical" }}
        placeholder={t("common.notesPlaceholder")}
        rows={2}
        defaultValue={spell.notes ?? ""}
        aria-label={t("common.notesPlaceholder")}
        onBlur={(e) => onUpdateField("notes", e.target.value)}
      />
    </div>
  );
}
