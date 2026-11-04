/**
 * The questions a move asks mid-flow on the Play screen, drawn in the new UI from the
 * engine's prompt store (`usePlayPrompt`): which slot (approved prototype cast-bless),
 * on whom, how to pay, how many points, the rolls a magic item needs, Arcane Recovery's
 * slots and a free cast's spell. Each dialog answers through the callbacks the flow
 * published, so the commit stays the engine's; the damage tray after a use is
 * `PlayTray`. The shape-change form picker is still the sheet's own until its new
 * version lands.
 */
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  usePlayPrompt,
  type PlayPrompts as Prompts,
} from "@/features/character/center/playPromptStore";
import { localizeSrd } from "@/i18n/resolver";
import { selfFormRule } from "@/lib/polymorph";
import { arcaneRecoveryPicker } from "@/lib/arcane-recovery";
import {
  metamagicChipStates,
  toggleMetamagicSelection,
  type CastLevelOption,
} from "@/lib/cast-options";
import type { Locale } from "@/lib/locale";
import type { ResourceInputRequest } from "@/lib/resources";
import { damageAtSlotLevel, healAtSlotLevel } from "@/lib/views/cast-slot-preview";
import { freeCastListRows } from "@/lib/views/free-cast-list-view";
import {
  enteredRollLabel,
  initialValue,
  inputLabelKey,
} from "@/lib/views/item-resource-view";
import { localizeTrackerUnit } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { getSpellById } from "@/data/spells";
import { resolveActions } from "@/lib/smart-tracker";
import { castHandsView } from "@/lib/views/cast-hands-view";
import { localizeAction } from "@/lib/views/combat-action-view";
import { Button, Chip, Choice, Dialog, Field, Stepper } from "@/ui";

import { PlayFormPicker } from "./PlayFormPicker";
import { PlayTray } from "./PlayTray";

const TransformFormPicker = lazy(() =>
  import("@/features/character/center/tabs/spells/TransformFormPicker").then((m) => ({
    default: m.TransformFormPicker,
  }))
);

export function PlayPrompts({ locale }: { locale: Locale }) {
  const formPicker = usePlayPrompt("form-picker");
  const doc = useCharacterStore((s) => s.character);
  return (
    <>
      <CastDialogs locale={locale} />
      <PaymentDialog />
      <PoolDialog />
      <ItemInputDialog />
      <ArcaneDialog />
      <SpellListDialog locale={locale} />
      {formPicker && doc && selfFormRule(formPicker.spellId).pool !== "bestiary" ? (
        <PlayFormPicker
          key={formPicker.spellId}
          doc={doc}
          sourceId={formPicker.spellId}
          locale={locale}
          onClose={formPicker.onClose}
        />
      ) : formPicker ? (
        <Suspense fallback={null}>
          <TransformFormPicker
            spellId={formPicker.spellId}
            onClose={formPicker.onClose}
          />
        </Suspense>
      ) : null}
      <PlayTray locale={locale} />
    </>
  );
}

/** Esc fires the dialog's cancel and close events: answer the flow once. */
function useOnce(fn: () => void): () => void {
  const done = useRef(false);
  return () => {
    if (done.current) return;
    done.current = true;
    fn();
  };
}

/** Lancia X: first the slot (when there is a choice), then on whom (when it asks). */
function CastDialogs({ locale }: { locale: Locale }) {
  const cast = usePlayPrompt("cast-level");
  const target = usePlayPrompt("target");
  if (cast)
    return <SlotStep key={cast.request.spellName} prompt={cast} locale={locale} />;
  if (target)
    return <TargetStep key={target.request.actionName} prompt={target} locale={locale} />;
  return null;
}

/**
 * No hand free for the spell's components (a weapon in hand, a Shield): a warning,
 * never a block, with a one-tap stow that spends the turn's object interaction.
 */
function HandsNote({ spellId, locale }: { spellId: string | undefined; locale: Locale }) {
  const { t } = useTranslation();
  const doc = useCharacterStore((s) => s.character);
  const { executeAction } = useTurnEconomy();
  const [stowed, setStowed] = useState(false);
  const spell = spellId ? getSpellById(spellId) : undefined;
  const view = doc && spell ? castHandsView(doc, spell) : null;
  if (stowed) {
    return (
      <div className="f-ask">
        <p className="f-quiet">{t("play.hands.stowed")}</p>
      </div>
    );
  }
  if (!doc || !view?.weaponId) return null;
  const weapon = localizeSrd("equipment", view.weaponId, "name", locale);
  const interaction = resolveActions(doc).find((a) => a.id === "base-object-interaction");
  return (
    <div className="f-ask">
      <span className="f-lbl">{t("play.hands.title")}</span>
      <p className="f-quiet">
        {t(view.shield ? "play.hands.heldWithShield" : "play.hands.held", { weapon })}
      </p>
      {view.stow && interaction && (
        <div>
          <Button
            kind="ghost"
            onClick={() => {
              executeAction(localizeAction(interaction, locale));
              setStowed(true);
            }}
          >
            {t("play.hands.stow")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SlotStep({ prompt, locale }: { prompt: Prompts["cast-level"]; locale: Locale }) {
  const { t } = useTranslation();
  const { request } = prompt;
  const cantrip = request.baseLevel === 0;
  const options = request.options.filter((o) => o.kind !== "cantrip");
  const usable = (o: CastLevelOption) =>
    o.kind === "mastery" ||
    o.kind === "cantrip" ||
    (o.kind === "free-cast" ? o.remaining >= o.cost : o.remaining > 0);
  const base = options.findIndex(
    (o) => (o.kind ?? "slot") === "slot" && o.level === request.baseLevel && usable(o)
  );
  const [picked, setPicked] = useState(
    base >= 0 ? base : Math.max(0, options.findIndex(usable))
  );
  const [metamagic, setMetamagic] = useState<string[]>([]);
  const cancel = useOnce(prompt.onCancel);
  const rows = request.metamagic ?? [];
  const perSpell = request.metamagicPerSpell ?? 1;
  const chips = metamagicChipStates(
    rows,
    metamagic,
    request.sorceryRemaining ?? 0,
    perSpell
  );
  const stackers = new Set(rows.filter((m) => m.stacksWithPrimary).map((m) => m.id));
  const option = options[picked];
  const confirm = () => {
    if (cantrip) prompt.onConfirm(0, { kind: "cantrip", level: 0 }, metamagic);
    else if (option) prompt.onConfirm(option.level, option, metamagic);
  };
  const note = cantrip
    ? t("play.ask.noSlot")
    : !option
      ? null
      : option.kind === "free-cast"
        ? t("play.ask.spendFree", { source: option.sourceName })
        : option.kind === "mastery"
          ? t("play.ask.noSlot")
          : option.pactMagic
            ? t("play.ask.spendPact", { level: option.level })
            : t("play.ask.spendSlot", { level: option.level });
  return (
    <Dialog
      open
      onClose={cancel}
      color="res"
      title={t("play.ask.castTitle", { name: request.spellName })}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" disabled={!cantrip && !option} onClick={confirm}>
            {t("spells.cast")}
          </Button>
        </>
      }
    >
      <HandsNote spellId={request.spellId} locale={locale} />
      {options.length > 0 && (
        <div className="f-ask">
          <span className="f-lbl">{t("play.ask.whichSlot")}</span>
          <div className="f-slots">
            {options.map((o, i) => (
              <Choice
                key={`${o.kind ?? "slot"}-${String(o.level)}-${String(i)}`}
                tile
                on={i === picked}
                disabled={!usable(o)}
                onClick={() => setPicked(i)}
              >
                <SlotTile option={o} upcast={request.upcast} />
              </Choice>
            ))}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div className="f-ask">
          <div className="f-ask-row">
            <span className="f-lbl">{t("metamagic.section")}</span>
            <span className="f-choice-n">
              {t("metamagic.sorceryRemaining", { count: chips.remaining })}
            </span>
          </div>
          <div className="f-chips">
            {rows.map((m, i) => {
              const chip = chips.chips[i];
              return (
                <Chip
                  key={m.id}
                  pressed={chip?.selected ?? false}
                  disabled={!chip?.enabled}
                  title={
                    chip?.why === "not-applicable"
                      ? t("metamagic.notApplicable")
                      : chip?.why === "not-enough"
                        ? t("metamagic.notEnoughSp")
                        : chip?.why === "swaps"
                          ? t("metamagic.swapsPrimary")
                          : undefined
                  }
                  onClick={() =>
                    setMetamagic((s) =>
                      toggleMetamagicSelection(s, m.id, stackers, perSpell)
                    )
                  }
                >
                  {`${m.name} · ${t("levelUp.metamagicCost", { cost: m.cost })}`}
                </Chip>
              );
            })}
          </div>
          <p className="f-help">
            {t(perSpell > 1 ? "metamagic.twoPrimaryRule" : "metamagic.onePrimaryRule")}
          </p>
        </div>
      )}
      {request.higherLevels && (
        <p className="f-help f-ask">
          <b>{t("spells.higherLevels")}</b>
          {" " + request.higherLevels}
        </p>
      )}
      {note && (
        <p className="f-note f-ask" data-c="res">
          {note}
        </p>
      )}
    </Dialog>
  );
}

function SlotTile({
  option,
  upcast,
}: {
  option: CastLevelOption;
  upcast: Prompts["cast-level"]["request"]["upcast"];
}) {
  const { t } = useTranslation();
  const level = <b>{t("play.ask.slotTile", { level: option.level })}</b>;
  if (option.kind === "mastery")
    return (
      <>
        {level}
        <span className="f-choice-s">{option.sourceName}</span>
        <span className="f-choice-n">{t("combat.atWill")}</span>
      </>
    );
  if (option.kind === "free-cast")
    return (
      <>
        {level}
        <span className="f-choice-s">{option.sourceName}</span>
        <span className="f-choice-n">
          {t("play.uses", { current: option.remaining, total: option.total })}
        </span>
      </>
    );
  if (option.kind === "cantrip") return level;
  const preview =
    damageAtSlotLevel(upcast, option.level) ?? healAtSlotLevel(upcast, option.level);
  return (
    <>
      {level}
      <span
        className="f-choice-pips"
        role="img"
        aria-label={t("play.uses", { current: option.remaining, total: option.total })}
      >
        {Array.from({ length: option.total }, (_, i) => (
          <i key={i} data-used={i >= option.remaining || undefined} />
        ))}
      </span>
      {(preview ?? option.pactMagic) && (
        <span className="f-choice-s">
          {[preview, option.pactMagic ? t("combat.pactSlotBadge") : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </>
  );
}

function TargetStep({ prompt, locale }: { prompt: Prompts["target"]; locale: Locale }) {
  const { t } = useTranslation();
  const { request } = prompt;
  const { step } = request;
  const [picked, setPicked] = useState<string[]>([]);
  const cancel = useOnce(prompt.onCancel);
  const toggle = (id: string) =>
    setPicked((now) =>
      now.includes(id)
        ? now.filter((x) => x !== id)
        : step.max === 1
          ? [id]
          : now.length < step.max
            ? [...now, id]
            : now
    );
  const sides = (["ally", "enemy"] as const)
    .map((side) => ({ side, rows: step.candidates.filter((c) => c.side === side) }))
    .filter((g) => g.rows.length > 0);
  if (step.candidates[0]?.side === "enemy") sides.reverse();
  return (
    <Dialog
      open
      onClose={cancel}
      color={request.isSpell ? "res" : "act"}
      title={
        request.isSpell
          ? t("play.ask.castTitle", { name: request.actionName })
          : request.actionName
      }
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          <Button kind="quiet" onClick={() => prompt.onConfirm([])}>
            {request.isSpell ? t("play.ask.castNoTarget") : t("play.ask.confirmNoTarget")}
          </Button>
          <Button
            kind="primary"
            disabled={picked.length === 0}
            onClick={() => prompt.onConfirm(picked)}
          >
            {request.isSpell ? t("spells.cast") : t("common.confirm")}
          </Button>
        </>
      }
    >
      {request.isSpell && <HandsNote spellId={request.spellId} locale={locale} />}
      <span className="f-lbl">
        {step.max > 1
          ? t("play.ask.onWhomMany", { count: step.max })
          : t("campaignHub.encounterActionOnWhom")}
      </span>
      {sides.map((g) => (
        <div key={g.side} className="f-ask">
          {sides.length > 1 && (
            <span className="f-help">
              {t(g.side === "ally" ? "combat.targetAllies" : "combat.targetEnemies")}
            </span>
          )}
          <div className="f-chips">
            {g.rows.map((c) => {
              const on = picked.includes(c.id);
              return (
                <Chip
                  key={c.id}
                  pressed={on}
                  disabled={!on && step.max > 1 && picked.length >= step.max}
                  onClick={() => toggle(c.id)}
                >
                  {c.self ? t("combat.targetMe", { name: c.name }) : c.name}
                </Chip>
              );
            })}
          </div>
        </div>
      ))}
    </Dialog>
  );
}

function PaymentDialog() {
  const prompt = usePlayPrompt("payment");
  return prompt ? <PaymentStep key={prompt.request.actionName} prompt={prompt} /> : null;
}

function PaymentStep({ prompt }: { prompt: Prompts["payment"] }) {
  const { t } = useTranslation();
  const { rows } = prompt.request;
  const first =
    rows.find((r) => r.primary && r.affordable) ?? rows.find((r) => r.affordable);
  const [picked, setPicked] = useState(first?.index ?? null);
  const cancel = useOnce(prompt.onCancel);
  return (
    <Dialog
      open
      onClose={cancel}
      title={t("combat.paymentPickerTitle", { name: prompt.request.actionName })}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={picked === null}
            onClick={() => picked !== null && prompt.onConfirm(picked)}
          >
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <span className="f-lbl">{t("combat.paymentPickerHint")}</span>
        <div className="f-choices">
          {rows.map((r) => (
            <Choice
              key={r.index}
              color="act"
              on={picked === r.index}
              disabled={!r.affordable}
              onClick={() => setPicked(r.index)}
            >
              <span className="f-choice-main">
                <span className="f-row-t">{r.label}</span>
                <span className="f-choice-s">
                  {t(r.primary ? "combat.paymentPrimary" : "combat.paymentAlternate")}
                </span>
              </span>
              {r.remaining && <span className="f-choice-n">{r.remaining}</span>}
            </Choice>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function PoolDialog() {
  const prompt = usePlayPrompt("pool-spend");
  return prompt ? <PoolStep key={prompt.request.featureName} prompt={prompt} /> : null;
}

function PoolStep({ prompt }: { prompt: Prompts["pool-spend"] }) {
  const { t } = useTranslation();
  const { request } = prompt;
  const [amount, setAmount] = useState(Math.min(request.max, request.defaultAmount ?? 1));
  const cancel = useOnce(prompt.onCancel);
  const unit = localizeTrackerUnit(request.unit, t);
  return (
    <Dialog
      open
      onClose={cancel}
      title={request.featureName}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" onClick={() => prompt.onConfirm(amount)}>
            {t("combat.poolSpendConfirm")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <div className="f-ask-row">
          <span className="f-lbl">{t("combat.poolSpendLabel", { unit })}</span>
          <Stepper
            value={amount}
            min={1}
            max={request.max}
            label={t("combat.poolSpendLabel", { unit })}
            less={t("common.decrease")}
            more={t("common.increase")}
            onChange={setAmount}
          />
        </div>
        <p className="f-help">
          {t("combat.poolSpendRemaining", { remaining: request.max, unit })}
        </p>
      </div>
    </Dialog>
  );
}

function ItemInputDialog() {
  const prompt = usePlayPrompt("item-resource-input");
  return prompt ? (
    <ItemInputStep key={prompt.request.sourceName} prompt={prompt} />
  ) : null;
}

function ItemInputStep({ prompt }: { prompt: Prompts["item-resource-input"] }) {
  const { t } = useTranslation();
  const { request } = prompt;
  const [answers, setAnswers] = useState(
    () => new Map(request.requests.map((r) => [r.kind, initialValue(r)] as const))
  );
  const cancel = useOnce(prompt.onCancel);
  const set = (kind: ResourceInputRequest["kind"], value: number) =>
    setAnswers((now) => new Map(now).set(kind, value));
  return (
    <Dialog
      open
      onClose={cancel}
      title={request.sourceName}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" onClick={() => prompt.onConfirm(answers)}>
            {t("common.continue")}
          </Button>
        </>
      }
    >
      <p className="f-help">{t("magicItems.resourceInputHint")}</p>
      {request.requests.map((input) => {
        const label = t(inputLabelKey(input), { roll: enteredRollLabel(input) });
        return (
          <div key={input.kind} className="f-ask-row f-ask">
            <span>{label}</span>
            <Stepper
              value={answers.get(input.kind) ?? initialValue(input)}
              min={input.min}
              max={input.max}
              label={label}
              less={t("common.decrease")}
              more={t("common.increase")}
              onChange={(v) => set(input.kind, v)}
            />
          </div>
        );
      })}
    </Dialog>
  );
}

function ArcaneDialog() {
  const prompt = usePlayPrompt("arcane-recovery");
  return prompt ? <ArcaneStep prompt={prompt} /> : null;
}

function ArcaneStep({ prompt }: { prompt: Prompts["arcane-recovery"] }) {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Record<number, number>>({});
  const cancel = useOnce(prompt.onCancel);
  const pick = arcaneRecoveryPicker(
    prompt.request.wizardLevel,
    prompt.request.expended,
    counts
  );
  return (
    <Dialog
      open
      onClose={cancel}
      color="res"
      title={t("combat.arcaneRecoveryTitle")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={pick.slotLevels.length === 0}
            onClick={() => prompt.onConfirm(pick.slotLevels)}
          >
            {t("combat.arcaneRecoveryConfirm")}
          </Button>
        </>
      }
    >
      {pick.rows.length === 0 ? (
        <p className="f-quiet">{t("combat.arcaneRecoveryNothing")}</p>
      ) : (
        <>
          <p className="f-note" data-c="res">
            {t("combat.arcaneRecoveryBudget", {
              remaining: pick.remaining,
              cap: pick.cap,
            })}
          </p>
          {pick.rows.map((r) => {
            const label = t("combat.arcaneRecoverySlotLevel", { level: r.level });
            return (
              <div key={r.level} className="f-ask-row f-ask">
                <span className="f-choice-main">
                  <span className="f-row-t">{label}</span>
                  <span className="f-choice-s">
                    {t("combat.arcaneRecoveryExpended", { count: r.expended })}
                  </span>
                </span>
                <Stepper
                  value={r.count}
                  min={0}
                  max={r.max}
                  label={label}
                  less={t("common.decrease")}
                  more={t("common.increase")}
                  onChange={(v) => setCounts((c) => ({ ...c, [r.level]: v }))}
                />
              </div>
            );
          })}
        </>
      )}
    </Dialog>
  );
}

function SpellListDialog({ locale }: { locale: Locale }) {
  const prompt = usePlayPrompt("divine-intervention");
  return prompt ? (
    <SpellListStep key={prompt.pool.sourceId} prompt={prompt} locale={locale} />
  ) : null;
}

/** Divine Intervention, War God's Blessing, Wish's duplicate, a charged item's spells. */
function SpellListStep({
  prompt,
  locale,
}: {
  prompt: Prompts["divine-intervention"];
  locale: Locale;
}) {
  const { t } = useTranslation();
  const { pool } = prompt;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const cancel = useOnce(prompt.onCancel);
  const rows = freeCastListRows(pool, locale, query);
  const itemPool = pool.itemId !== undefined;
  const title = pool.itemId
    ? localizeSrd("magic-item", pool.itemId, "name", locale)
    : pool.sourceId === "wish"
      ? t("combat.wishRubric")
      : pool.sourceId === "cleric-war-war-gods-blessing"
        ? t("combat.warGodsBlessingRubric")
        : t("combat.divineInterventionRubric");
  return (
    <Dialog
      open
      onClose={cancel}
      color="res"
      title={title}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={!picked || !rows.some((r) => r.id === picked)}
            onClick={() => picked && prompt.onCast(picked)}
          >
            {t("spells.cast")}
          </Button>
        </>
      }
    >
      {itemPool && (
        <p className="f-note" data-c="res">
          {t("play.ask.charges", { remaining: pool.remaining, total: pool.charges })}
        </p>
      )}
      <div className="f-ask">
        <Field
          label={t("play.ask.whichSpell")}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {rows.length === 0 ? (
          <p className="f-quiet">{t("common.noResults")}</p>
        ) : (
          <div className="f-choices">
            {rows.map((r) => (
              <Choice
                key={r.id}
                on={picked === r.id}
                disabled={!r.affordable}
                onClick={() => setPicked(r.id)}
              >
                <b>
                  {r.level === 0
                    ? t("spells.cantrip")
                    : t("play.ask.slotTile", { level: r.level })}
                </b>
                <span className="f-choice-main f-row-t">{r.name}</span>
                {itemPool && (
                  <span className="f-choice-n">
                    {t("combat.itemPoolChargeCost", { n: r.cost })}
                  </span>
                )}
              </Choice>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
