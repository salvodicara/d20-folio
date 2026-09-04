/**
 * The HP editor (component 18) — the DM's correction of a creature's vitals, opened from the
 * drawer's Registro tab or from the hotbar's HP pill.
 *
 * Four facts, four `override` actions, each of them a log entry with its own undo (rule 41: the
 * DM may modify any automatic outcome IN PLACE, with undo):
 *
 *   Danno / Cura  → `override vitals.hp`      (the reducer's own 0-HP tail comes with it)
 *   temp          → `override vitals.tempHp`
 *   max           → `override stats.maxHp`
 *   condizione    → `override condition`
 *
 * Damage and healing are entered as an AMOUNT, not as a new total, because that is what happens
 * at a table ("thirteen bludgeoning"); the component turns it into the total the path takes, so
 * the log records the number the DM meant and the fold records the number the rules produce.
 *
 * The fields start from the creature and are never re-synced while it is open: a DM typing "13"
 * must not have it wiped by an unrelated snapshot arriving mid-keystroke. The caller therefore
 * KEYS this component by the creature — a different creature is a different editor.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";
import type { ConditionId, Entity } from "@/lib/combat/types";

/** The closed condition set, in the order a DM scans for one. */
const CONDITIONS: readonly ConditionId[] = [
  "blinded",
  "charmed",
  "deafened",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
];

export interface HpEdit {
  readonly path: "vitals.hp" | "vitals.tempHp" | "stats.maxHp" | "condition";
  readonly value: unknown;
  readonly reason: string;
}

export interface HpEditorProps {
  readonly entity: Entity;
  readonly name: string;
  /** The conditions already on the creature, so the picker can end one too. */
  readonly conditions: readonly ConditionId[];
  readonly onApply: (edits: readonly HpEdit[]) => void;
  readonly onClose: () => void;
}

export function HpEditor({ entity, name, conditions, onApply, onClose }: HpEditorProps) {
  const { t } = useTranslation();
  const [verb, setVerb] = useState<"damage" | "heal">("damage");
  const [amount, setAmount] = useState("");
  const [temp, setTemp] = useState(String(entity.vitals.tempHp?.amount ?? 0));
  const [max, setMax] = useState(String(entity.stats.maxHp));
  const [condition, setCondition] = useState("");

  const delta = Number(amount);
  const next =
    Number.isFinite(delta) && amount !== ""
      ? Math.max(0, entity.vitals.hp + (verb === "damage" ? -delta : delta))
      : entity.vitals.hp;

  function apply() {
    const edits: HpEdit[] = [];
    const reason = t("play.hp.reason");
    if (amount !== "" && Number.isFinite(delta) && delta !== 0) {
      edits.push({ path: "vitals.hp", value: next, reason });
    }
    const temporary = Number(temp);
    if (Number.isFinite(temporary) && temporary !== (entity.vitals.tempHp?.amount ?? 0)) {
      edits.push({ path: "vitals.tempHp", value: temporary, reason });
    }
    const maximum = Number(max);
    if (Number.isFinite(maximum) && maximum !== entity.stats.maxHp) {
      edits.push({ path: "stats.maxHp", value: maximum, reason });
    }
    if (condition !== "") {
      const [id, state] = condition.split(":");
      edits.push({
        path: "condition",
        value: { condition: id, active: state === "on" },
        reason,
      });
    }
    if (edits.length > 0) onApply(edits);
    onClose();
  }

  return (
    <div className="pl-hpedit" data-testid="pl-hp-editor">
      <div className="pl-hpedit__title">
        <span>
          <b>{name}</b> · {entity.vitals.hp} → {next} {t("play.hp.unit")}
        </span>
        <button
          type="button"
          className="pl-icon-btn"
          onClick={onClose}
          aria-label={t("play.hp.close")}
        >
          <PlayIcon id="i-x" />
        </button>
      </div>

      <div className="pl-hpedit__row">
        <button
          type="button"
          className="pl-hpedit__verb"
          data-verb="damage"
          aria-pressed={verb === "damage"}
          onClick={() => setVerb("damage")}
        >
          {t("play.hp.damage")}
        </button>
        <input
          className="pl-hpedit__amount"
          type="number"
          min={0}
          inputMode="numeric"
          value={amount}
          placeholder="0"
          aria-label={t("play.hp.amount")}
          data-testid="pl-hp-amount"
          onChange={(event) => setAmount(event.target.value)}
        />
        <button
          type="button"
          className="pl-hpedit__verb"
          data-verb="heal"
          aria-pressed={verb === "heal"}
          onClick={() => setVerb("heal")}
        >
          {t("play.hp.heal")}
        </button>
      </div>

      <div className="pl-hpedit__row">
        <label className="pl-field">
          <input
            type="number"
            min={0}
            value={temp}
            aria-label={t("play.hp.temp")}
            data-testid="pl-hp-temp"
            onChange={(event) => setTemp(event.target.value)}
          />
          <span>{t("play.hp.temp")}</span>
        </label>
        <label className="pl-field">
          <input
            type="number"
            min={1}
            value={max}
            aria-label={t("play.hp.max")}
            data-testid="pl-hp-max"
            onChange={(event) => setMax(event.target.value)}
          />
          <span>{t("play.hp.max")}</span>
        </label>
        <label className="pl-field">
          <select
            value={condition}
            aria-label={t("play.hp.condition")}
            data-testid="pl-hp-condition"
            onChange={(event) => setCondition(event.target.value)}
          >
            <option value="">{t("play.hp.noCondition")}</option>
            {CONDITIONS.map((id) => {
              const on = conditions.includes(id);
              return (
                <option key={id} value={`${id}:${on ? "off" : "on"}`}>
                  {on
                    ? t("play.hp.clearCondition", { name: t(`play.condition.${id}`) })
                    : t(`play.condition.${id}`)}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div className="pl-hpedit__foot">
        <span>{t("play.hp.hint")}</span>
        <button
          type="button"
          className="pl-ghost"
          onClick={apply}
          data-testid="pl-hp-apply"
        >
          {t("play.hp.apply")}
        </button>
      </div>
    </div>
  );
}
