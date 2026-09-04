/**
 * The roll panel — every roll is a panel (UI spec rule 31): the die with its raw number, what
 * was rolled and its formula, the total, a one-word verdict, and Annulla.
 *
 * It has two lives, because a person's dice mode has two (design §2 D7):
 *
 *  - **`app`** — the dice seam already rolled; the panel REPORTS. The die shows the face, the
 *    total shows the sum, and the verdict is the receipt's own outcome, so the panel never
 *    computes a result of its own.
 *  - **`manual`** — the person is reading real dice off the table; the panel ASKS. One carved
 *    field per die, in the formula's order, and nothing is appended until every face is a legal
 *    number for that die. Refusing a bad face here is what keeps the log honest.
 *
 * A hidden DM roll (rule 34) shows players the dice with "?" faces and nothing else. That is why
 * `faces` is nullable rather than absent: the panel shows there WAS a roll — the table saw the
 * dice tumble — without saying what it was. There is no "Mostra" button yet: a `RollRecord` is
 * immutable once appended and the log has no action that reveals one, so offering the control
 * would be offering a button that cannot work. The DM's own copy already shows the number.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";
import { PlayExplain } from "./PlayTip";
import type { ActionId } from "@/lib/combat/ids";
import type { Outcome } from "@/lib/combat/types";
import type { PendingInput } from "./table/dispatch";

/** The newest settled roll, as the panel prints it. */
export interface RollView {
  readonly id: ActionId;
  /** What was rolled: a mechanic's name, or the purpose when it stands alone. */
  readonly title: string;
  /** Who rolled it, already resolved to a name. */
  readonly who: string;
  readonly formula: string;
  /** `null` when the roll is hidden from this viewer (rule 34). */
  readonly faces: readonly number[] | null;
  readonly total: number | null;
  /** The number it was rolled against, when the action names one. */
  readonly dc: { readonly label: string; readonly value: number } | null;
  readonly verdict: Outcome | null;
  readonly hidden: boolean;
  readonly undoable: boolean;
}

/**
 * What the panel is ASKING for.
 *
 * `inputs` — the dice an intent still owes, one field each, in manual mode.
 * `free`   — the dice medallion's own roll: a formula the person types, for the things the
 *            rules do not model. Both end in a `roll` action on the same log.
 */
export type RollPrompt =
  | {
      readonly kind: "inputs";
      readonly title: string;
      readonly inputs: readonly PendingInput[];
    }
  | { readonly kind: "free"; readonly title: string };

const VERDICT_TONE: Readonly<Record<Outcome, "ok" | "ko" | "crit">> = {
  hit: "ok",
  crit: "crit",
  miss: "ko",
  "save-fail": "ok",
  "save-success": "ko",
};

/** The d20's silhouette — one hexagon path, the rendition's plaque die. */
function Die({ value, hidden }: { value: string; hidden: boolean }) {
  return (
    <span className={hidden ? "pl-die pl-die--hidden" : "pl-die"}>
      <svg viewBox="0 0 88 88" aria-hidden="true">
        <path d="M44 4 79 24v40L44 84 9 64V24z" />
      </svg>
      <b>{value}</b>
    </span>
  );
}

export interface RollPanelProps {
  readonly roll: RollView | null;
  readonly prompt: RollPrompt | null;
  readonly onManual: (faces: Readonly<Record<string, readonly number[]>>) => void;
  /** The free roll: the formula, and the faces when the person is reading real dice. */
  readonly onFree: (formula: string, faces: readonly number[] | null) => void;
  /** The person's dice mode, switchable here — the medallion's job is the roll itself. */
  readonly mode: "app" | "manual";
  readonly onMode: (mode: "app" | "manual") => void;
  readonly onCancel: () => void;
  readonly onUndo: (action: ActionId) => void;
}

/** How many dice a formula's term asks for, so the panel draws the right number of fields. */
function diceCount(formula: string): number {
  const match = /^\s*(\d*)d(\d+)/i.exec(formula);
  if (!match) return 1;
  return Math.max(1, Number(match[1] || 1));
}

export function RollPanel({
  roll,
  prompt,
  onManual,
  onFree,
  mode,
  onMode,
  onCancel,
  onUndo,
}: RollPanelProps) {
  const { t } = useTranslation();
  const [entered, setEntered] = useState<Record<string, string[]>>({});
  const [formula, setFormula] = useState("1d20");
  const [freeFaces, setFreeFaces] = useState<string[]>([]);

  /** The mode switch lives wherever the panel is ASKING for something: the medallion's own job
   *  is the roll, so the choice between "the app rolls" and "I read my dice" sits here. */
  const modeSwitch = (
    <button
      type="button"
      className="pl-ghost"
      data-testid="pl-roll-mode"
      onClick={() => onMode(mode === "app" ? "manual" : "app")}
    >
      {t(mode === "app" ? "play.dice.modeApp" : "play.dice.modeManual")}
    </button>
  );

  if (prompt?.kind === "free") {
    const need = diceCount(formula);
    const ready =
      mode === "app" ||
      (freeFaces.length === need &&
        freeFaces.every((value) => value !== "" && Number(value) > 0));
    return (
      <section
        className="pl-float pl-roll pl-panel pl-panel--framed"
        data-testid="pl-roll-free"
      >
        <span className="pl-brackets" />
        <div className="pl-roll__head">
          <span className="pl-roll__title">{prompt.title}</span>
          <span className="pl-roll__who">
            {t(mode === "app" ? "play.dice.appHint" : "play.roll.manualHint")}
          </span>
        </div>
        <div className="pl-roll__orn" />
        <div className="pl-faces">
          <label className="pl-face">
            <input
              type="text"
              value={formula}
              aria-label={t("play.dice.formula")}
              data-testid="pl-free-formula"
              onChange={(event) => {
                setFormula(event.target.value);
                setFreeFaces([]);
              }}
            />
            <span>{t("play.dice.formula")}</span>
          </label>
          {mode === "manual"
            ? Array.from({ length: need }, (_, index) => (
                <label className="pl-face" key={index}>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={freeFaces[index] ?? ""}
                    aria-label={t("play.roll.faceAria", { formula })}
                    data-testid={`pl-free-face-${index}`}
                    onChange={(event) =>
                      setFreeFaces((current) => {
                        const values = [...current];
                        values[index] = event.target.value;
                        return values;
                      })
                    }
                  />
                  <span>{formula}</span>
                </label>
              ))
            : null}
        </div>
        <div className="pl-roll__foot">
          {modeSwitch}
          <span>
            <button type="button" className="pl-ghost" onClick={onCancel}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="pl-ghost"
              disabled={!ready}
              data-testid="pl-free-roll"
              onClick={() =>
                onFree(
                  formula,
                  mode === "manual" ? freeFaces.map((value) => Number(value)) : null
                )
              }
            >
              {t("play.dice.throw")}
            </button>
          </span>
        </div>
      </section>
    );
  }

  if (prompt) {
    const complete = prompt.inputs.every((input) => {
      const values = entered[input.key] ?? [];
      const need = diceCount(input.input.kind === "dice" ? input.input.formula : "1d20");
      return (
        values.length === need &&
        values.every((value) => value !== "" && Number(value) > 0)
      );
    });
    return (
      <section
        className="pl-float pl-roll pl-panel pl-panel--framed"
        data-testid="pl-roll-manual"
      >
        <span className="pl-brackets" />
        <div className="pl-roll__head">
          <span className="pl-roll__title">{prompt.title}</span>
          <span className="pl-roll__who">{t("play.roll.manualHint")}</span>
        </div>
        <div className="pl-roll__orn" />
        <div className="pl-faces">
          {prompt.inputs.map((input) => {
            const formula = input.input.kind === "dice" ? input.input.formula : "1d20";
            return Array.from({ length: diceCount(formula) }, (_, index) => (
              <label className="pl-face" key={`${input.key}#${index}`}>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={entered[input.key]?.[index] ?? ""}
                  aria-label={t("play.roll.faceAria", { formula })}
                  data-testid={`pl-face-${input.key}-${index}`}
                  onChange={(event) =>
                    setEntered((current) => {
                      const values = [...(current[input.key] ?? [])];
                      values[index] = event.target.value;
                      return { ...current, [input.key]: values };
                    })
                  }
                />
                <span>{formula}</span>
              </label>
            ));
          })}
        </div>
        <div className="pl-roll__foot">
          {modeSwitch}
          <button type="button" className="pl-ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="pl-ghost"
            disabled={!complete}
            data-testid="pl-roll-apply"
            onClick={() =>
              onManual(
                Object.fromEntries(
                  Object.entries(entered).map(([key, values]) => [
                    key,
                    values.map((value) => Number(value)),
                  ])
                )
              )
            }
          >
            {t("combat.apply")}
          </button>
        </div>
      </section>
    );
  }

  if (!roll) return null;
  const face = roll.faces?.[0];
  return (
    <section className="pl-float pl-roll pl-panel pl-panel--framed" data-testid="pl-roll">
      <span className="pl-brackets" />
      <div className="pl-roll__head">
        <span className="pl-roll__title">{roll.title}</span>
        <span className="pl-roll__who">{roll.who}</span>
      </div>
      {roll.dc ? (
        <div className="pl-roll__dc">
          <span className="pl-cap">{roll.dc.label}</span>
          <b>{roll.dc.value}</b>
        </div>
      ) : null}
      <div className="pl-roll__orn" />
      <div className="pl-roll__dice">
        <Die
          value={roll.faces === null ? "?" : String(face ?? "–")}
          hidden={roll.faces === null}
        />
        <div className="pl-roll__total">
          <b>
            {roll.faces === null || roll.total === null ? "?" : roll.total}
            <small>{roll.formula}</small>
          </b>
          {roll.verdict ? (
            <div className="pl-verdict" data-tone={VERDICT_TONE[roll.verdict]}>
              <PlayExplain
                term={t(`play.verdict.${roll.verdict}`)}
                label={t(`play.verdict.${roll.verdict}`)}
                hint={t(`play.verdict.${roll.verdict}Tip`)}
              />
            </div>
          ) : (
            <div className="pl-verdict" data-tone="wait">
              {t("play.roll.waiting")}
            </div>
          )}
        </div>
      </div>
      <div className="pl-roll__foot">
        <span>
          {roll.hidden ? (
            <>
              <PlayIcon id="i-eye-off" /> {t("play.roll.hidden")}
            </>
          ) : null}
        </span>
        <span>
          {roll.undoable ? (
            <button
              type="button"
              className="pl-ghost"
              onClick={() => onUndo(roll.id)}
              data-testid="pl-roll-undo"
            >
              {t("common.undo")}
            </button>
          ) : null}
        </span>
      </div>
    </section>
  );
}
