/**
 * The Play screen's centre column (approved prototype x-play): the turn strip (round,
 * whose turn, Action · Bonus · Reaction · Movement, «Fine turno»), «Cosa ti conviene
 * fare», and the actions table with D&D Beyond's filters. Each row's button (Attacca,
 * Lancia, Usa, Reagisci) commits through the engine's one turn flow (`executeAction`);
 * its state is the shared `actionCtaView` for this turn, so it reads as the old sheet's.
 */
import { turnMovementBudgetFt } from "@/lib/play/self-move";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { playActionsView, type PlayActionRow } from "@/domains/play/play-actions-view";
import { helpView, type HelpView } from "@/domains/play/help-view";
import { spareView, type SpareView } from "@/domains/play/spare-view";
import { weaponPickView, type WeaponPick } from "@/domains/play/weapon-pick-view";
import {
  playInventoryView,
  type PlayInventoryView,
  type PlayItem,
} from "@/domains/play/play-inventory-view";
import {
  playSpellsView,
  type PlaySpell,
  type PlaySpellsView,
} from "@/domains/play/play-spells-view";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { useMarkCountered } from "@/features/character/center/use-mark-countered";
import { counterableCasts } from "@/lib/play/countered";
import { compactRange } from "@/lib/views/compact-range";
import { localizeText } from "@/lib/views/srd-i18n";
import { resolveReplaceAttackWithCast } from "@/lib/smart-tracker";
import {
  blockReasonLine,
  type ActionCtaVerb,
  type ActionTurnState,
} from "@/lib/views/action-cta-view";
import { maxReplaceAttackSpellLevel } from "@/lib/views/combat-action-view";
import { playbookView } from "@/domains/play/playbook/playbook-view";
import { useTurnState, useSheetCombat } from "@/features/character/center/turn-state";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import type { Locale } from "@/lib/locale";
import { formatWeight, localeDistance } from "@/lib/utils";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { turnBarView, type TurnBarSlot } from "@/lib/views/turn-bar-view";
import { actionIcon } from "@/domains/play/action-icon";
import type { ActionGroup } from "@/lib/views/action-row-view";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { giveHelp } from "@/features/character/center/outcome-offer";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Icon, Tabs } from "@/ui";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { spells as allSpells } from "@/data/spells";
import { SpellArt } from "@/domains/spells/ui/SpellArt";

import { ActionIcon } from "./ActionIcon";
import { PlayAttuneRow } from "./PlayAttune";
import { PlayHelp } from "./PlayHelp";
import { PlayPrepare } from "./PlayPrepare";
import { PlayCompanions } from "./PlayCompanions";
import { PlayScrollPick } from "./PlayScrollPick";
import { PlaySpare } from "./PlaySpare";
import { PlayWeaponPick } from "./PlayWeaponPick";

type Filter = "all" | "attacks" | "actions" | "bonus" | "reactions" | "other" | "limited";
const FILTERS: Filter[] = [
  "all",
  "attacks",
  "actions",
  "bonus",
  "reactions",
  "other",
  "limited",
];
// Existing labels where the app already has them; the rest are Play's own.
const FILTER_KEY: Record<Filter, string> = {
  all: "play.filter.all",
  attacks: "combat.attacksPerAction",
  actions: "combat.action",
  bonus: "combat.bonus",
  reactions: "combat.reaction",
  other: "report.types.other",
  limited: "play.filter.limited",
};
const GROUP_KEY: Record<ActionGroup, string> = {
  actions: "combat.actions",
  bonus: "play.group.bonus",
  reactions: "combat.reactions",
  other: "report.types.other",
};
/** The action types' shapes (BG3): a filter or a group of that type shows its own. */
const SHAPE: Partial<Record<Filter | ActionGroup, string>> = {
  actions: "action",
  bonus: "bonus",
  reactions: "reaction",
};
const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

/** This turn as the combat store holds it, in the shape the button view reads. */
function usePlayTurn(doc: CharacterDoc): ActionTurnState {
  const selected = useCombatStore((s) => s.selected);
  const budget = useCombatStore((s) => s.budget);
  const attackBudget = useCombatStore((s) => s.attackBudget);
  const attacksUsed = useCombatStore((s) => s.attacksUsed);
  const attackSwings = useCombatStore((s) => s.attackSwings);
  const reactionUsed = useCombatStore((s) => s.reactionUsed);
  const reactionUsedId = useCombatStore((s) => s.reactionUsedId);
  const movementUsedFt = useCombatStore((s) => s.movementUsedFt);
  const warMagicMax = useMemo(
    () => maxReplaceAttackSpellLevel(resolveReplaceAttackWithCast(doc)),
    [doc]
  );
  return useMemo(
    () => ({
      selected,
      budget,
      attackBudget,
      attacksUsed,
      attackSwingIds: attackSwings.map((s) => s.actionId),
      reactionUsed,
      reactionUsedId,
      movementUsedFt,
      warMagicMax,
    }),
    [
      selected,
      budget,
      attackBudget,
      attacksUsed,
      attackSwings,
      reactionUsed,
      reactionUsedId,
      movementUsedFt,
      warMagicMax,
    ]
  );
}

export function PlayCentre({
  doc,
  locale,
  onShortRest,
}: {
  doc: CharacterDoc;
  locale: Locale;
  /** Opens the Short Rest (the advice line's «riposo breve»); absent read-only. */
  onShortRest?: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"actions" | "spells" | "inventory">("actions");
  const turn = usePlayTurn(doc);
  const spells = playSpellsView(doc, locale, turn);
  // A tab lands with its content: Spells only for a character with spells.
  const items = [
    { id: "actions" as const, label: t("combat.actions") },
    ...(spells.groups.length > 0
      ? [{ id: "spells" as const, label: t("character.tabs.spells") }]
      : []),
    { id: "inventory" as const, label: t("character.tabs.inventory") },
  ];
  const shown = items.some((i) => i.id === tab) ? tab : "actions";
  return (
    <section className="f-pn f-centre" data-c="act" aria-label={t("combat.actions")}>
      <Tabs label={t("combat.actions")} items={items} value={shown} onChange={setTab} />
      <div className="f-pnb f-stack">
        <TurnStrip doc={doc} locale={locale} />
        {shown === "actions" ? (
          <ActionsPane doc={doc} locale={locale} turn={turn} onShortRest={onShortRest} />
        ) : shown === "spells" ? (
          <SpellsPane doc={doc} view={spells} locale={locale} />
        ) : (
          <InventoryPane doc={doc} locale={locale} turn={turn} />
        )}
      </div>
    </section>
  );
}

const SPELL_SCHOOL = new Map(allSpells.map((s) => [s.id, s.school]));

function ActionsPane({
  doc,
  locale,
  turn,
  onShortRest,
}: {
  doc: CharacterDoc;
  locale: Locale;
  turn: ReturnType<typeof usePlayTurn>;
  onShortRest?: () => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const actions = playActionsView(doc, locale, turn);
  // BG3's hotbar on a wide screen: each group a run of square action slots (BG3-STYLE §2).
  const hotbar = useMediaQuery("(min-width: 1101px)");
  const keep = (group: ActionGroup, row: PlayActionRow) =>
    filter === "all" ||
    (filter === "attacks" && row.attack) ||
    (filter === "limited" && row.limited) ||
    filter === group;
  return (
    <>
      <Playbook doc={doc} locale={locale} onShortRest={onShortRest} />
      <div className="f-filters" role="group" aria-label={t("play.filterLabel")}>
        {FILTERS.filter((f) => actions.counts[f] > 0).map((f) => (
          <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>
            {SHAPE[f] && (
              <i className="f-shape" data-kind={SHAPE[f]} aria-hidden="true" />
            )}
            {t(FILTER_KEY[f])}
          </Chip>
        ))}
      </div>
      {!hotbar && <TableHead />}
      {actions.groups.map(({ group, rows }) => {
        const kept = rows.filter((r) => keep(group, r));
        if (kept.length === 0) return null;
        return (
          <section key={group} className="f-act-group" data-group={group}>
            <h3 className="f-act-gh">
              {SHAPE[group] && (
                <i className="f-shape" data-kind={SHAPE[group]} aria-hidden="true" />
              )}
              {t(GROUP_KEY[group])}
            </h3>
            {hotbar ? (
              <div className="f-slots-run f-hotbar">
                {kept.map((row) => (
                  <ActionLine key={row.id} row={row} locale={locale} slot />
                ))}
              </div>
            ) : (
              kept.map((row) => <ActionLine key={row.id} row={row} locale={locale} />)
            )}
          </section>
        );
      })}
      {(filter === "all" || filter === "attacks") && (
        <PlayCompanions doc={doc} locale={locale} />
      )}
    </>
  );
}

/** «Inventario» (prototype x-play-inv): weight, coins, then equipped, attuned and the
 *  pack, each item with its one line and «Usa» when the actions list has its use. */
function InventoryPane({
  doc,
  locale,
  turn,
}: {
  doc: CharacterDoc;
  locale: Locale;
  turn: ReturnType<typeof usePlayTurn>;
}) {
  const { t } = useTranslation();
  const { executeAction } = useTurnEconomy();
  const readonly = useSheetReadonly();
  const view = playInventoryView(doc, locale);
  const [scroll, setScroll] = useState<PlayItem["scroll"] | null>(null);
  const actions = new Map(
    playActionsView(doc, locale, turn)
      .groups.flatMap((g) => g.rows)
      .map((r) => [r.id, r])
  );
  const line = (i: PlayItem) => {
    const l = i.line;
    if (!l) return null;
    switch (l.kind) {
      case "damage":
        return `${l.dice} ${t(`srd.damage_${l.type}`)}`;
      case "ac":
        return t("play.inv.ac", { ac: l.base });
      case "ac-bonus":
        return t("play.inv.acBonus", { bonus: l.bonus });
      case "heal":
        // the dice and their unit stay on one line
        return t("play.healing", { amount: l.dice }).replace(/ /g, "\u00a0");
      case "charges":
        return t("play.inv.charges", { current: l.current, max: l.max });
    }
  };
  const groupTitle = (kind: PlayInventoryView["groups"][number]["kind"]) =>
    kind === "equipped"
      ? t("equipment.equipped")
      : kind === "attuned"
        ? t("play.inv.attuned")
        : t("play.inv.pack");
  const coins = (["pp", "gp", "ep", "sp", "cp"] as const).filter(
    (c) => view.coins[c] > 0
  );
  return (
    <>
      {view.weight && (
        <p className="f-spell-sum" data-over={view.weight.over || undefined}>
          {t("play.inv.weight", {
            carried: formatWeight(view.weight.carried, locale),
            capacity: formatWeight(view.weight.capacity, locale),
          })}
        </p>
      )}
      {coins.length > 0 && (
        <p className="f-coins">
          {coins.map((c) => (
            <span key={c} className="f-coin" data-c={c}>
              <b>{view.coins[c]}</b> {t(`equipment.currencyAbbr.${c}`)}
            </span>
          ))}
        </p>
      )}
      {view.formMerges && (
        <p className="f-note" data-c="res" role="status">
          {t("play.form.gearHint")}
        </p>
      )}
      {view.groups.map(({ kind, items }) => (
        <section key={kind} className="f-act-group" data-group="items">
          <h3 className="f-act-gh">
            {groupTitle(kind)}
            {kind === "attuned" && (
              <span className="f-gh-slots">
                {t("play.rest.slotsLeft", {
                  left: view.attunement.bonded,
                  total: view.attunement.cap,
                })}
              </span>
            )}
          </h3>
          {items.map((i) => {
            const use = i.useActionId ? actions.get(i.useActionId) : undefined;
            const sub = [
              line(i),
              i.scroll ? (i.scroll.spellName ?? t("play.scroll.none")) : null,
              i.stealthDisadvantage ? t("play.inv.stealth") : null,
              i.needsAttunement ? t("magicItems.attunementRequired") : null,
            ].filter(Boolean);
            return (
              <div key={i.key} className="f-act f-item">
                <div className="f-row-main">
                  <div className="f-row-t">
                    {/* the last two words together: a long name never ends on one alone */}
                    {i.name.replace(/ (\S+)$/, "\u00a0$1")}
                    {i.quantity > 1 && `\u00a0×\u2060${String(i.quantity)}`}
                  </div>
                  {sub.length > 0 && <div className="f-row-s">{sub.join(" · ")}</div>}
                  {/* Wild Shape merges gear: it works only if the table rules it worn. */}
                  {i.formGear && !readonly && (
                    <div className="f-chips">
                      <Chip
                        pressed={i.formGear.worn}
                        onClick={() => {
                          const gear = i.formGear;
                          if (!gear) return;
                          registerUndoableToast(
                            {
                              message: t(
                                gear.worn ? "play.form.gearMerged" : "play.form.gearWorn",
                                { name: i.name }
                              ),
                            },
                            () =>
                              useCharacterStore.getState().dispatch({
                                kind: "set-form-gear-worn",
                                key: gear.key,
                                worn: !gear.worn,
                              }),
                            { turnScoped: false }
                          );
                        }}
                      >
                        {t("play.form.worn")}
                      </Chip>
                    </div>
                  )}
                </div>
                <span className="f-act-c">
                  {formatWeight(i.weight * i.quantity, locale)}
                </span>
                {use && !readonly ? (
                  <Button
                    kind="ghost"
                    disabled={use.cta.state.disabled}
                    aria-label={`${t("common.use")}: ${i.name}`}
                    onClick={() => executeAction(use.action)}
                  >
                    {t("common.use")}
                  </Button>
                ) : i.scroll && !readonly ? (
                  <Button
                    kind="ghost"
                    aria-haspopup="dialog"
                    aria-label={`${t(i.scroll.spellId ? "common.edit" : "common.pick")}: ${i.name}`}
                    onClick={() => setScroll(i.scroll ?? null)}
                  >
                    {t(i.scroll.spellId ? "common.edit" : "common.pick")}
                  </Button>
                ) : (
                  <span />
                )}
                {i.attune && !readonly && (
                  <div className="f-attune">
                    <PlayAttuneRow attune={i.attune} name={i.name} locale={locale} />
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      {scroll && (
        <PlayScrollPick
          doc={doc}
          index={scroll.index}
          current={scroll.spellId}
          locale={locale}
          onClose={() => setScroll(null)}
        />
      )}
    </>
  );
}

function TableHead() {
  const { t } = useTranslation();
  return (
    <div className="f-act f-act-head" aria-hidden="true">
      <span />
      <span>{t("common.name")}</span>
      <span>{t("spells.range")}</span>
      <span>{t("play.table.hit")}</span>
      <span>{t("play.table.effect")}</span>
      <span />
    </div>
  );
}

type SpellFilter = "all" | number | "ritual" | "concentration";

/** «Incantesimi» (prototype x-play-spells): the casting numbers, the spells by level
 *  with each level's slots, the same rows and cast buttons as the actions. */
function SpellsPane({
  doc,
  view,
  locale,
}: {
  doc: CharacterDoc;
  view: PlaySpellsView;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const [managing, setManaging] = useState(false);
  const [filter, setFilter] = useState<SpellFilter>("all");
  const all = view.groups.flatMap((g) => g.spells);
  const filters: SpellFilter[] = [
    "all",
    ...view.groups.map((g) => g.level),
    ...(all.some((s) => s.row.ritual) ? (["ritual"] as const) : []),
    ...(all.some((s) => s.row.concentration) ? (["concentration"] as const) : []),
  ];
  const filterLabel = (f: SpellFilter) =>
    f === "all"
      ? t("play.filter.all")
      : f === "ritual"
        ? t("spells.ritual")
        : f === "concentration"
          ? t("spells.concentration")
          : f === 0
            ? t("spells.cantrips")
            : t("spells.level", { level: f });
  const keep = (level: number, spell: PlaySpell) =>
    filter === "all" ||
    filter === level ||
    (filter === "ritual" && spell.row.ritual) ||
    (filter === "concentration" && spell.row.concentration);
  const summary = view.summary;
  return (
    <>
      {summary && (
        <div className="f-spell-head">
          <p className="f-spell-sum">
            {[
              summary.saveDc !== null ? t("play.dc", { dc: summary.saveDc }) : null,
              summary.attack !== null
                ? t("play.spells.attack", { bonus: signed(summary.attack) })
                : null,
              summary.prepared
                ? t("play.spells.prepared", {
                    count: summary.prepared.count,
                    max: summary.prepared.max,
                  })
                : null,
            ]
              .filter(Boolean)
              .join("\u00a0· ")}
          </p>
          {summary.prepared && !readonly && (
            <Button aria-haspopup="dialog" onClick={() => setManaging(true)}>
              {t("play.spells.manage")}
            </Button>
          )}
        </div>
      )}
      {managing && (
        <PlayPrepare doc={doc} locale={locale} onClose={() => setManaging(false)} />
      )}
      <div className="f-filters" role="group" aria-label={t("play.filterLabel")}>
        {filters.map((f) => (
          <Chip key={String(f)} pressed={filter === f} onClick={() => setFilter(f)}>
            {filterLabel(f)}
          </Chip>
        ))}
      </div>
      <TableHead />
      {view.groups.map(({ level, slots, spells }) => {
        const kept = spells.filter((s) => keep(level, s));
        if (kept.length === 0) return null;
        return (
          <section key={level} className="f-act-group" data-group="spells">
            <h3 className="f-act-gh">
              {level === 0 ? t("spells.cantrips") : t("spells.level", { level })}
              {slots && (
                <span className="f-gh-slots">
                  <span className="f-pips" aria-hidden="true">
                    {Array.from({ length: slots.total }, (_, i) => (
                      <i key={i} data-on={i < slots.left || undefined} />
                    ))}
                  </span>
                  {t("play.rest.slotsLeft", { left: slots.left, total: slots.total })}
                </span>
              )}
            </h3>
            {kept.map((s) => (
              <ActionLine
                key={s.row.id}
                row={s.row}
                locale={locale}
                spell={{ prepared: s.prepared, ritual: s.ritual }}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}

function TurnStrip({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const markCountered = useMarkCountered(locale);
  const counterable = readonly ? [] : counterableCasts(doc.session.logEntries);
  const fight = useSheetCombat();
  const { round, phase, currentActorName } = useTurnState();
  const { handleEndTurn } = useTurnEconomy();
  const selected = useCombatStore((s) => s.selected);
  const budget = useCombatStore((s) => s.budget);
  const reactionUsed = useCombatStore((s) => s.reactionUsed);
  const movementUsedFt = useCombatStore((s) => s.movementUsedFt);
  const dashesThisTurn = useCombatStore((s) => s.dashesThisTurn);
  const extraMovementFt = useCombatStore((s) => s.extraMovementFt);
  // The turn's movement: Speed, once more per Dash, plus what a use added.
  const speedFt = turnMovementBudgetFt(sheetNumbers(doc).speed.total, {
    dashesThisTurn,
    extraMovementFt,
  });
  const slots = turnBarView({
    mode: fight ? "combat" : "exploration",
    selected,
    budget,
    reaction: { used: reactionUsed },
    movement: { usedFt: movementUsedFt, speedFt },
  });
  const title = !fight
    ? t("diary.explore")
    : [
        t("combatChronicle.round", { n: round }),
        phase === "my-turn" || phase === "solo"
          ? t("play.turnMine")
          : (currentActorName ?? ""),
      ]
        .filter(Boolean)
        .join(" · ");
  const slotLabel = (s: TurnBarSlot) =>
    s.kind === "move"
      ? localeDistance(Math.max(0, s.budget - s.used), locale)
      : t(`combat.${s.kind}`);
  return (
    <>
      <div className="f-turn" data-fight={fight ? "" : undefined}>
        <b className="f-turn-t">{title}</b>
        <ul className="f-turn-slots">
          {slots.map((s) => (
            <li
              key={s.kind}
              data-kind={s.kind}
              data-spent={s.state === "spent" || undefined}
            >
              <i aria-hidden="true" />
              {slotLabel(s)}
            </li>
          ))}
        </ul>
        {fight && (phase === "my-turn" || phase === "solo") && (
          <Button kind="primary" icon="u-next" onClick={handleEndTurn}>
            {t("play.endTurn")}
          </Button>
        )}
      </div>
      {/* A slot cast this turn may be marked countered: its slot comes back (M12). */}
      {counterable.map((cast) => {
        const name = localizeText(cast.action, locale);
        return (
          <div key={cast.entryId} className="f-countered" role="status">
            <span>{name}</span>
            <Button
              kind="quiet"
              aria-label={t("combat.counteredAria", { name, level: cast.level })}
              onClick={() => markCountered(cast)}
            >
              {t("combat.countered")}
            </Button>
          </div>
        );
      })}
    </>
  );
}

function Playbook({
  doc,
  locale,
  onShortRest,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onShortRest?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const fight = useSheetCombat();
  const { round } = useTurnState();
  // The engine's context builder is coming; for now the mode and the round.
  const view = playbookView(doc, locale, {
    mode: fight ? "combat" : "exploration",
    round,
  });
  const lines = open ? view.steps : view.plan;
  if (lines.length === 0) return null;
  return (
    <div className="f-playbook">
      <button
        type="button"
        className="f-playbook-h"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{t("play.playbookTitle")}</span>
        <Icon name="u-expand" />
      </button>
      <ul className="f-playbook-lines">
        {lines.map((l) => (
          <li key={l.stepId} data-status={l.status}>
            <span data-prose="">
              {l.before}
              {l.strong &&
                (l.opens === "short-rest" && onShortRest ? (
                  <button
                    type="button"
                    className="f-link"
                    aria-haspopup="dialog"
                    onClick={onShortRest}
                  >
                    {l.strong}
                  </button>
                ) : (
                  <b>{l.strong}</b>
                ))}
              {l.after}
            </span>
            {open && l.why && <span className="f-tl-by">{l.why}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const VERB_KEY: Record<ActionCtaVerb, string> = {
  attack: "combat.attack",
  cast: "spells.cast",
  use: "common.use",
  react: "play.react",
};

function ActionLine({
  row,
  locale,
  spell,
  slot,
}: {
  row: PlayActionRow;
  locale: Locale;
  /** On the Spells tab: an unprepared spell is not cast, or is cast as a Ritual. */
  spell?: { prepared: boolean; ritual: boolean };
  /** Drawn as a BG3 hotbar slot: the art, a tooltip at the icon, a click to use it. */
  slot?: boolean;
}) {
  const { t } = useTranslation();
  const { executeAction } = useTurnEconomy();
  const readonly = useSheetReadonly();
  const { cta } = row;
  const reason = cta.reason ? blockReasonLine(cta.reason, t, locale) : null;
  // A weapon-binding spell (Magic Weapon, Shillelagh) asks which weapon first.
  const doc = useCharacterStore((st) => st.character);
  const [picking, setPicking] = useState<WeaponPick[] | null>(null);
  // A zone that spares whom its caster designates (Spirit Guardians) asks whom.
  const [sparing, setSparing] = useState<SpareView | null>(null);
  // Help in a fight asks «Su chi?» then «Per chi?» (the effect needs the v0.26 rules).
  const [helping, setHelping] = useState<HelpView | null>(null);
  const cast = () => {
    const status = useCombatStatusStore.getState().status;
    if (row.action.id === "base-help" && combatEffectsV26On()) {
      const help =
        status && doc && status.characterId === doc.id
          ? helpView({ myId: status.myId, rows: status.view.rows })
          : null;
      if (help) {
        setHelping(help);
        return;
      }
    }
    const spare =
      row.spellId && status && doc && status.characterId === doc.id
        ? spareView(row.spellId, { myId: status.myId, rows: status.view.rows })
        : null;
    if (spare) {
      setSparing(spare);
      return;
    }
    const choices =
      doc && row.spellId ? weaponPickView(doc, row.spellId, row.level ?? 0, locale) : [];
    if (choices.length > 0) setPicking(choices);
    else executeAction(row.action);
  };
  const sub = [
    // On the Spells tab the level is the group's header: not said again per row.
    spell
      ? null
      : row.level === 0
        ? t("spells.cantrip")
        : row.level !== null
          ? t("play.spellLevel", { level: row.level })
          : null,
    row.concentration ? t("play.concentration") : null,
    spell && !spell.prepared ? t("play.unprepared") : null,
    row.uses
      ? t("play.uses", { current: row.uses.current, total: row.uses.total })
      : null,
  ].filter(Boolean);
  const hit =
    row.attackBonus !== undefined
      ? signed(row.attackBonus)
      : row.saveDc !== undefined
        ? [
            t("play.dc", { dc: row.saveDc }),
            row.saveAbility ? t(`abilities.${row.saveAbility}_short`) : null,
          ]
            .filter(Boolean)
            .join(" ")
        : "";
  // a dice expression never breaks at its minus («1d6‑1» keeps a non-breaking hyphen)
  const effect = row.damage
    ? [
        row.damage.replace(/-/g, "\u2011"),
        row.damageType ? t(`srd.damage_${row.damageType}`) : null,
      ]
        .filter(Boolean)
        .join(" ")
    : row.healing
      ? t("play.healing", { amount: row.healing })
      : "";
  const dialogs = (
    <>
      {helping && doc && (
        <PlayHelp
          view={helping}
          onClose={() => setHelping(null)}
          onHelp={(targetId) => {
            setHelping(null);
            executeAction(row.action);
            const undo = giveHelp(targetId, doc.id);
            const ally = helping.allies.find((a) => a.id === targetId);
            const name =
              ally?.name ?? helping.enemies.find((e) => e.id === targetId)?.name ?? "";
            if (undo) {
              useToastStore.getState().showToast({
                message: t(ally ? "play.help.givenAlly" : "play.help.given", { name }),
                duration: 6000,
                onUndo: undo,
              });
            }
          }}
        />
      )}
      {sparing && (
        <PlaySpare
          spellName={row.name}
          view={sparing}
          onClose={() => setSparing(null)}
          onCast={(spared) => {
            setSparing(null);
            executeAction(row.action, { spared });
          }}
        />
      )}
      {picking && (
        <PlayWeaponPick
          spellName={row.name}
          choices={picking}
          onClose={() => setPicking(null)}
          onCast={(pick, damageType) => {
            setPicking(null);
            executeAction(row.action, {
              weapon: pick.address,
              ...(damageType ? { damageType } : {}),
            });
          }}
        />
      )}
    </>
  );
  if (slot) {
    const school = row.spellId ? SPELL_SCHOOL.get(row.spellId) : undefined;
    const label = cta.state.spent ? t("combat.used") : t(VERB_KEY[cta.verb]);
    return (
      <>
        <button
          type="button"
          className="f-slot f-hotslot"
          data-dim={cta.state.disabled || cta.state.spent || undefined}
          data-live={cta.state.emphasis || undefined}
          aria-label={`${label}: ${row.name}`}
          disabled={readonly || cta.state.disabled}
          onClick={cast}
        >
          <span className="f-slot-art" aria-hidden="true">
            {school && row.spellId ? (
              <SpellArt id={row.spellId} school={school} size="fill" />
            ) : (
              <ActionIcon icon={actionIcon(row)} />
            )}
          </span>
          {row.uses && (
            <span className="f-slot-lv" aria-hidden="true">
              {row.uses.current}
            </span>
          )}
          <span className="f-slot-tip" aria-hidden="true">
            <b>{row.name}</b>
            {sub.length > 0 && <small>{sub.join(" · ")}</small>}
            {(hit || effect) && <em>{[hit, effect].filter(Boolean).join("\u00a0· ")}</em>}
            {row.range && <small>{row.range}</small>}
            {reason && !cta.state.spent && <small>{reason}</small>}
          </span>
        </button>
        {dialogs}
      </>
    );
  }
  return (
    <div className="f-act" data-blocked={row.blocked || undefined}>
      <ActionIcon icon={actionIcon(row)} />
      <div className="f-row-main">
        <div className="f-row-t">{row.name}</div>
        {sub.length > 0 && <div className="f-row-s">{sub.join(" · ")}</div>}
        {/* the phone reads the numbers under the name (D&D Beyond's phone row) */}
        {(hit || effect) && (
          <div className="f-row-s f-act-m">
            {[hit, effect].filter(Boolean).join("\u00a0· ")}
          </div>
        )}
        {reason && !cta.state.spent && <div className="f-row-s f-act-why">{reason}</div>}
      </div>
      {/* compact in the column («Sé · 4,5 m»), the catalogue's full text on hover */}
      <RangeCell range={row.range} />
      <span className="f-act-c">{hit}</span>
      <span className="f-act-c f-act-e">{effect}</span>
      {!readonly && spell && !spell.prepared ? (
        // not prepared: only a Ritual casts it (no slot), else nothing to cast
        <Button
          kind="ghost"
          disabled={!spell.ritual || cta.state.disabled}
          aria-label={`${t(spell.ritual ? "spells.castRitual" : VERB_KEY[cta.verb])}: ${row.name}`}
          onClick={() => executeAction(row.action, { ritual: true })}
        >
          {t(spell.ritual ? "spells.castRitual" : VERB_KEY[cta.verb])}
        </Button>
      ) : (
        !readonly && (
          <Button
            kind="ghost"
            disabled={cta.state.disabled}
            data-live={cta.state.emphasis || undefined}
            data-dim={cta.state.dimmed || undefined}
            title={
              cta.attacksLeft
                ? t("combat.attacksRemainingStatus", {
                    remaining: cta.attacksLeft.remaining,
                    total: cta.attacksLeft.total,
                  })
                : undefined
            }
            aria-label={`${cta.state.spent ? t("combat.used") : t(VERB_KEY[cta.verb])}: ${row.name}`}
            onClick={cast}
          >
            {cta.state.spent ? t("combat.used") : t(VERB_KEY[cta.verb])}
          </Button>
        )
      )}
      {dialogs}
    </div>
  );
}

/** The range column: compact («Sé · 4,5 m»), with the full text as the tooltip when it
 *  says more. */
function RangeCell({ range }: { range: string | undefined }) {
  const compact = range ? compactRange(range) : "";
  return (
    <span className="f-act-c" title={range && compact !== range ? range : undefined}>
      {/* a short range («1,5 m / 6/18 m») is one unit: it never wraps mid-way */}
      {compact.length <= 18 ? compact.replace(/ /g, "\u00a0") : compact}
    </span>
  );
}
